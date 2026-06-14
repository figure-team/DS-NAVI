import { describe, expect, test } from "vitest";
import { scanJavaFile, extractAnnotations } from "./java-facts.js";

// java-facts.ts 의 동작 특성화(characterization) 테스트. scanJavaFile 은
// web-tree-sitter(WASM)로 Java 소스를 1회 파싱해 사실(facts)을 뽑아낸다.
// 실제 jPetStore/Spring/Stripes 스타일의 작은 인라인 소스로 추출 결과를 고정한다.

describe("scanJavaFile: package / imports", () => {
  test("패키지명과 일반/static/wildcard import 를 추출한다", async () => {
    const src = `
package com.example.order.web;

import java.util.List;
import com.example.order.OrderService;
import static org.springframework.util.Assert.notNull;
import com.example.order.model.*;

public class OrderController {}
`;
    const facts = await scanJavaFile(src);
    expect(facts.packageName).toBe("com.example.order.web");

    const byPath = new Map(facts.imports.map((i) => [i.path, i]));
    expect(byPath.get("java.util.List")).toMatchObject({
      wildcard: false,
      isStatic: false,
    });
    expect(byPath.get("org.springframework.util.Assert.notNull")).toMatchObject({
      isStatic: true,
    });
    // wildcard import: scoped_identifier 는 ".*" 를 빼고, wildcard 플래그가 선다.
    expect(byPath.get("com.example.order.model")).toMatchObject({
      wildcard: true,
    });
    // 모든 import 는 1-based 라인 anchor 를 가진다.
    for (const imp of facts.imports) {
      expect(imp.line).toBeGreaterThan(0);
    }
  });

  test("package 선언이 없으면 packageName 은 null", async () => {
    const facts = await scanJavaFile(`class Bare {}`);
    expect(facts.packageName).toBeNull();
    expect(facts.imports).toEqual([]);
  });
});

describe("scanJavaFile: class-level annotations", () => {
  test("@RestController(마커) 와 @RequestMapping(\"/orders\")(위치 인자) 를 파싱한다", async () => {
    const src = `
package web;

@RestController
@RequestMapping("/orders")
public class OrderController {}
`;
    const facts = await scanJavaFile(src);
    expect(facts.classes).toHaveLength(1);
    const cls = facts.classes[0];
    expect(cls.name).toBe("OrderController");
    expect(cls.kind).toBe("class");

    const byName = new Map(cls.annotations.map((a) => [a.name, a]));
    // 마커 애너테이션: args 는 비어있다.
    expect(byName.get("RestController")?.args).toEqual({});
    // 위치 인자 문자열: "value" 키에 strings 로 들어간다.
    expect(byName.get("RequestMapping")?.args.value).toEqual({
      strings: ["/orders"],
      refs: [],
    });
  });

  test("이름 붙은 인자(element_value_pair)와 상수 ref 를 구분한다", async () => {
    const src = `
@RequestMapping(value = "/orders", method = RequestMethod.GET)
public class C {}
`;
    const facts = await scanJavaFile(src);
    const ann = facts.classes[0].annotations.find(
      (a) => a.name === "RequestMapping",
    )!;
    expect(ann.args.value).toEqual({ strings: ["/orders"], refs: [] });
    // RequestMethod.GET 은 field_access → 해석되지 않은 ref.
    expect(ann.args.method).toEqual({ strings: [], refs: ["RequestMethod.GET"] });
  });

  test("FQN 애너테이션은 simpleName 으로 줄인다", async () => {
    const src = `
@org.springframework.web.bind.annotation.GetMapping("/x")
public class C {}
`;
    const facts = await scanJavaFile(src);
    expect(facts.classes[0].annotations[0].name).toBe("GetMapping");
  });

  test("배열 값과 문자열 리터럴 concat 을 펼쳐 strings 에 모은다", async () => {
    const src = `
@RequestMapping({"/a", "/b"})
class Arr {}

@RequestMapping("/api" + "/v1")
class Concat {}
`;
    const facts = await scanJavaFile(src);
    const arr = facts.classes.find((c) => c.name === "Arr")!;
    expect(arr.annotations[0].args.value.strings).toEqual(["/a", "/b"]);
    const concat = facts.classes.find((c) => c.name === "Concat")!;
    // 리터럴끼리의 + concat 은 접힌다(folded).
    expect(concat.annotations[0].args.value.strings).toEqual(["/api/v1"]);
  });
});

describe("scanJavaFile: methods", () => {
  test("메서드 애너테이션·반환타입·파라미터·static 플래그를 추출한다", async () => {
    const src = `
@RestController
public class OrderController {
  @GetMapping("/list")
  public List<Order> list(@RequestParam String q) {
    return service.find(q);
  }

  public static void main(String... args) {
  }
}
`;
    const facts = await scanJavaFile(src);
    const cls = facts.classes[0];
    const byName = new Map(cls.methods.map((m) => [m.name, m]));

    const list = byName.get("list")!;
    expect(list.returnType).toBe("List<Order>");
    expect(list.isStatic).toBe(false);
    expect(list.paramsText).toBe("(@RequestParam String q)");
    expect(list.annotations[0].name).toBe("GetMapping");
    expect(list.annotations[0].args.value.strings).toEqual(["/list"]);
    // bodyText 는 본문 소스를 그대로 담고, bodyLine 은 1-based.
    expect(list.bodyText).toContain("service.find(q)");
    expect(list.bodyLine).toBeGreaterThan(0);

    const main = byName.get("main")!;
    expect(main.isStatic).toBe(true);
    expect(main.returnType).toBe("void");
    // String... 가변인자는 paramsText 에 원문 그대로 보존된다.
    expect(main.paramsText).toBe("(String... args)");
  });

  test("인터페이스 메서드(본문 없음)는 bodyText='' / bodyLine=null", async () => {
    const src = `
public interface OrderDao {
  Order findById(int id);
}
`;
    const facts = await scanJavaFile(src);
    const cls = facts.classes[0];
    expect(cls.kind).toBe("interface");
    const m = cls.methods[0];
    expect(m.name).toBe("findById");
    expect(m.bodyText).toBe("");
    expect(m.bodyLine).toBeNull();
  });
});

describe("scanJavaFile: fields", () => {
  test("인스턴스 필드의 타입(제네릭 제거)·제네릭 인자·주입 플래그를 추출한다", async () => {
    const src = `
public class OrderService {
  @Autowired
  private OrderDao orderDao;

  private List<Order> orders;

  private Map<String, Order> byId;

  private static final String TABLE = "ORDERS";
}
`;
    const facts = await scanJavaFile(src);
    const cls = facts.classes[0];
    const byName = new Map(cls.fields.map((f) => [f.name, f]));

    // @Autowired 필드 → injected
    expect(byName.get("orderDao")).toMatchObject({
      typeName: "OrderDao",
      typeArgNames: [],
      injected: true,
    });
    // List<Order> → typeName 은 제네릭 제거, typeArgNames 에 Order
    expect(byName.get("orders")).toMatchObject({
      typeName: "List",
      typeArgNames: ["Order"],
      injected: false,
    });
    // Map<String, Order> → 제네릭 인자 둘 다
    expect(byName.get("byId")?.typeArgNames).toEqual(["String", "Order"]);

    // static final 필드는 협력자 배선이 아니므로 fields 에서 제외된다.
    expect(byName.has("TABLE")).toBe(false);
  });
});

describe("scanJavaFile: constants", () => {
  test("static final 문자열 상수를 이름·ClassName.이름 양쪽으로 등록한다", async () => {
    const src = `
public class Paths {
  public static final String BASE = "/orders";
  private static final String SUFFIX = "/list";
  public static final String FULL = "/orders" + "/list";
  private String mutable = "/no";
  public static final int COUNT = 3;
}
`;
    const facts = await scanJavaFile(src);
    expect(facts.constants.get("BASE")).toBe("/orders");
    expect(facts.constants.get("Paths.BASE")).toBe("/orders");
    expect(facts.constants.get("SUFFIX")).toBe("/list");
    // 리터럴 concat 상수도 접혀서 저장된다.
    expect(facts.constants.get("FULL")).toBe("/orders/list");
    // static final 이 아닌 필드는 상수가 아니다.
    expect(facts.constants.has("mutable")).toBe(false);
    // 문자열 리터럴이 아닌 값(int)은 상수 맵에 들어가지 않는다.
    expect(facts.constants.has("COUNT")).toBe(false);
  });

  test("인터페이스 상수는 암묵적 static final 이라 키워드 없이도 등록된다", async () => {
    const src = `
public interface Constants {
  String BASE_PATH = "/api";
}
`;
    const facts = await scanJavaFile(src);
    expect(facts.constants.get("BASE_PATH")).toBe("/api");
    expect(facts.constants.get("Constants.BASE_PATH")).toBe("/api");
  });
});

describe("scanJavaFile: superclass / interfaces", () => {
  test("extends 와 implements 를 라인 anchor 와 함께 추출한다", async () => {
    const src = `
package web;

public class OrderController extends BaseController implements Serializable, AuditAware {
}
`;
    const facts = await scanJavaFile(src);
    const cls = facts.classes[0];
    expect(cls.superclass).toBe("BaseController");
    expect(cls.superclassLine).toBeGreaterThan(0);
    expect(cls.interfaces.map((i) => i.name)).toEqual([
      "Serializable",
      "AuditAware",
    ]);
    for (const iface of cls.interfaces) {
      expect(iface.line).toBeGreaterThan(0);
    }
  });

  test("superclass/interface 가 없으면 null / 빈 배열", async () => {
    const facts = await scanJavaFile(`class Plain {}`);
    const cls = facts.classes[0];
    expect(cls.superclass).toBeNull();
    expect(cls.superclassLine).toBeNull();
    expect(cls.interfaces).toEqual([]);
  });

  test("제네릭이 붙은 인터페이스는 제네릭을 제거한 이름으로 기록한다", async () => {
    const src = `
public class OrderDaoImpl implements Dao<Order> {
}
`;
    const facts = await scanJavaFile(src);
    expect(facts.classes[0].interfaces[0].name).toBe("Dao");
  });
});

describe("scanJavaFile: constructor params", () => {
  test("생성자 형식 파라미터 타입과 제네릭 인자를 ctorParamTypes 로 펼친다", async () => {
    const src = `
public class OrderService {
  public OrderService(OrderDao dao, List<Handler> handlers) {
  }
}
`;
    const facts = await scanJavaFile(src);
    const types = facts.classes[0].ctorParamTypes.map((c) => c.typeName);
    // formal 타입(OrderDao), 그리고 List<Handler> → List + 제네릭 인자 Handler.
    expect(types).toContain("OrderDao");
    expect(types).toContain("List");
    expect(types).toContain("Handler");
    for (const c of facts.classes[0].ctorParamTypes) {
      expect(c.line).toBeGreaterThan(0);
    }
  });

  test("가변인자 생성자 파라미터(Handler... handlers)의 타입을 잡는다", async () => {
    const src = `
public class Dispatcher {
  public Dispatcher(Handler... handlers) {
  }
}
`;
    const facts = await scanJavaFile(src);
    const types = facts.classes[0].ctorParamTypes.map((c) => c.typeName);
    expect(types).toContain("Handler");
  });
});

describe("scanJavaFile: 다중/중첩 클래스, 종류, 추상", () => {
  test("한 파일의 여러 top-level 타입을 소스 순서로 모두 잡는다", async () => {
    const src = `
package m;

class A {}
interface B {}
enum C { X, Y }
@interface D {}
abstract class E {}
`;
    const facts = await scanJavaFile(src);
    const byName = new Map(facts.classes.map((c) => [c.name, c]));
    expect(byName.get("A")?.kind).toBe("class");
    expect(byName.get("B")?.kind).toBe("interface");
    expect(byName.get("C")?.kind).toBe("enum");
    expect(byName.get("D")?.kind).toBe("annotation");
    expect(byName.get("E")?.kind).toBe("class");
    expect(byName.get("E")?.isAbstract).toBe(true);
    expect(byName.get("A")?.isAbstract).toBe(false);
  });

  test("중첩 타입은 qualifiedName 에 부모.자식 체인을 담는다", async () => {
    const src = `
public class Outer {
  static class Inner {}
}
`;
    const facts = await scanJavaFile(src);
    const inner = facts.classes.find((c) => c.name === "Inner")!;
    expect(inner.qualifiedName).toBe("Outer.Inner");
    const outer = facts.classes.find((c) => c.name === "Outer")!;
    expect(outer.qualifiedName).toBe("Outer");
  });
});

describe("scanJavaFile: 엣지 케이스", () => {
  test("빈 소스는 클래스 없이 비어있는 facts 를 반환한다", async () => {
    const facts = await scanJavaFile("");
    expect(facts.classes).toEqual([]);
    expect(facts.imports).toEqual([]);
    expect(facts.packageName).toBeNull();
    expect(facts.constants.size).toBe(0);
  });

  test("최소 클래스는 빈 멤버 목록을 가진다", async () => {
    const facts = await scanJavaFile(`class M {}`);
    const cls = facts.classes[0];
    expect(cls.methods).toEqual([]);
    expect(cls.fields).toEqual([]);
    expect(cls.ctorParamTypes).toEqual([]);
    expect(cls.annotations).toEqual([]);
  });
});

describe("extractAnnotations (직접 호출)", () => {
  test("modifiers 노드에서 마커/인자 애너테이션을 모두 추출한다", async () => {
    // modifiers 노드를 직접 얻을 수는 없으니 scanJavaFile 경유로 동작을 고정하되,
    // extractAnnotations 가 named export 로 호출 가능함을 확인한다.
    expect(typeof extractAnnotations).toBe("function");
    const src = `
@Deprecated
@SuppressWarnings("unchecked")
public class Legacy {}
`;
    const facts = await scanJavaFile(src);
    const byName = new Map(
      facts.classes[0].annotations.map((a) => [a.name, a]),
    );
    expect(byName.get("Deprecated")?.args).toEqual({});
    expect(byName.get("SuppressWarnings")?.args.value.strings).toEqual([
      "unchecked",
    ]);
  });
});
