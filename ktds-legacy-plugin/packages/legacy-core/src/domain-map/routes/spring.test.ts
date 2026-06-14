import { describe, expect, test } from "vitest";
import { buildSpringIndexes, extractSpringRoutes } from "./spring.js";
import { scanJavaFile } from "../java-facts.js";
// Helper: build an empty indexes object for tests that don't need cross-file indexes
function emptyIndexes() {
  return buildSpringIndexes(new Map());
}

// ── @RestController / @GetMapping / @PostMapping ──────────────────────────────

describe("extractSpringRoutes — basic verb mappings", () => {
  test("@RestController + @GetMapping → GET, kind=api", async () => {
    const source = `
package com.example;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/orders")
public class OrderController {
  @GetMapping("/list")
  public List<Order> list() { return null; }
}`;
    const facts = await scanJavaFile(source);
    const routes = extractSpringRoutes("src/OrderController.java", facts, emptyIndexes());
    expect(routes).toHaveLength(1);
    const r = routes[0];
    expect(r.method).toBe("GET");
    expect(r.path).toBe("/orders/list");
    expect(r.kind).toBe("api");
    expect(r.framework).toBe("spring");
    expect(r.handler).toBe("OrderController#list");
    expect(r.filePath).toBe("src/OrderController.java");
    expect(r.line).toBeGreaterThan(0);
  });

  test("@Controller + @PostMapping → POST, kind=form (non-REST)", async () => {
    const source = `
@Controller
@RequestMapping("/account")
public class AccountController {
  @PostMapping("/save")
  public String save() { return "redirect:/account"; }
}`;
    const facts = await scanJavaFile(source);
    const routes = extractSpringRoutes("src/AccountController.java", facts, emptyIndexes());
    expect(routes).toHaveLength(1);
    expect(routes[0].method).toBe("POST");
    expect(routes[0].kind).toBe("form");
  });

  test("@PutMapping → PUT", async () => {
    const source = `
@RestController
public class ItemController {
  @PutMapping("/items/{id}")
  public Item update() { return null; }
}`;
    const facts = await scanJavaFile(source);
    const routes = extractSpringRoutes("src/ItemController.java", facts, emptyIndexes());
    expect(routes[0].method).toBe("PUT");
    expect(routes[0].path).toBe("/items/{id}");
  });

  test("@DeleteMapping → DELETE", async () => {
    const source = `
@RestController
public class ItemController {
  @DeleteMapping("/items/{id}")
  public void delete() {}
}`;
    const facts = await scanJavaFile(source);
    const routes = extractSpringRoutes("src/ItemController.java", facts, emptyIndexes());
    expect(routes[0].method).toBe("DELETE");
  });

  test("@PatchMapping → PATCH", async () => {
    const source = `
@RestController
public class ItemController {
  @PatchMapping("/items/{id}")
  public Item patch() { return null; }
}`;
    const facts = await scanJavaFile(source);
    const routes = extractSpringRoutes("src/ItemController.java", facts, emptyIndexes());
    expect(routes[0].method).toBe("PATCH");
  });
});

// ── @RequestMapping ───────────────────────────────────────────────────────────

describe("extractSpringRoutes — @RequestMapping", () => {
  test("method 없음 → ANY", async () => {
    const source = `
@Controller
public class SearchController {
  @RequestMapping("/search")
  public String search() { return "search"; }
}`;
    const facts = await scanJavaFile(source);
    const routes = extractSpringRoutes("src/SearchController.java", facts, emptyIndexes());
    expect(routes).toHaveLength(1);
    expect(routes[0].method).toBe("ANY");
    expect(routes[0].path).toBe("/search");
  });

  test("method=GET → GET", async () => {
    const source = `
@Controller
public class HomeController {
  @RequestMapping(value = "/home", method = RequestMethod.GET)
  public String home() { return "home"; }
}`;
    const facts = await scanJavaFile(source);
    const routes = extractSpringRoutes("src/HomeController.java", facts, emptyIndexes());
    expect(routes[0].method).toBe("GET");
  });

  test("class-level @RequestMapping prefix 조합", async () => {
    const source = `
@RestController
@RequestMapping("/api/v1")
public class ApiController {
  @GetMapping("/users")
  public List<User> users() { return null; }
  @PostMapping("/users")
  public User create() { return null; }
}`;
    const facts = await scanJavaFile(source);
    const routes = extractSpringRoutes("src/ApiController.java", facts, emptyIndexes());
    const paths = routes.map((r) => r.path).sort();
    expect(paths).toContain("/api/v1/users");
    expect(routes.map((r) => r.method).sort()).toEqual(["GET", "POST"]);
  });
});

// ── ResponseEntity / @ResponseBody → api kind ─────────────────────────────────

describe("extractSpringRoutes — api/form kind detection", () => {
  test("ResponseEntity 반환 → api", async () => {
    const source = `
@Controller
public class PayController {
  @PostMapping("/pay")
  public ResponseEntity<String> pay() { return ResponseEntity.ok("ok"); }
}`;
    const facts = await scanJavaFile(source);
    const routes = extractSpringRoutes("src/PayController.java", facts, emptyIndexes());
    expect(routes[0].kind).toBe("api");
  });

  test("@ResponseBody → api", async () => {
    const source = `
@Controller
public class DataController {
  @GetMapping("/data")
  @ResponseBody
  public String data() { return "{}"; }
}`;
    const facts = await scanJavaFile(source);
    const routes = extractSpringRoutes("src/DataController.java", facts, emptyIndexes());
    expect(routes[0].kind).toBe("api");
  });
});

// ── Controller 없으면 라우트 없음 ─────────────────────────────────────────────

describe("extractSpringRoutes — non-controller classes", () => {
  test("@Service 클래스 → 라우트 없음", async () => {
    const source = `
@Service
public class OrderService {
  @GetMapping("/should-not-be-a-route")
  public void process() {}
}`;
    const facts = await scanJavaFile(source);
    const routes = extractSpringRoutes("src/OrderService.java", facts, emptyIndexes());
    expect(routes).toHaveLength(0);
  });

  test("어노테이션 없는 클래스 → 라우트 없음", async () => {
    const source = `
public class PlainClass {
  @GetMapping("/nope")
  public void nope() {}
}`;
    const facts = await scanJavaFile(source);
    const routes = extractSpringRoutes("src/PlainClass.java", facts, emptyIndexes());
    expect(routes).toHaveLength(0);
  });
});

// ── buildSpringIndexes ────────────────────────────────────────────────────────

describe("buildSpringIndexes — constants", () => {
  test("static final String 상수 → constants map에 등록", async () => {
    const source = `
public class Routes {
  public static final String BASE = "/api";
}`;
    const facts = await scanJavaFile(source);
    const indexes = buildSpringIndexes(new Map([["Routes.java", facts]]));
    expect(indexes.constants.get("Routes.BASE")).toBe("/api");
  });

  test("상수 경로 resolvePath 적용 (constant: 노트)", async () => {
    const source = `
public class Routes {
  public static final String BASE = "/api";
}
@RestController
class MyController {
  @GetMapping(Routes.BASE)
  public String handle() { return ""; }
}`;
    const facts = await scanJavaFile(source);
    const indexes = buildSpringIndexes(new Map([["MyController.java", facts]]));
    const routes = extractSpringRoutes("MyController.java", facts, indexes);
    expect(routes).toHaveLength(1);
    expect(routes[0].path).toBe("/api");
    expect(routes[0].notes.some((n) => n.startsWith("constant:"))).toBe(true);
  });
});

describe("buildSpringIndexes — composed stereotypes", () => {
  test("@interface meta-annotated with @RestController → composedStereotypes", async () => {
    const source = `
import org.springframework.web.bind.annotation.RestController;
@RestController
public @interface ApiController {}
`;
    const facts = await scanJavaFile(source);
    const indexes = buildSpringIndexes(new Map([["ApiController.java", facts]]));
    expect(indexes.composedStereotypes.has("ApiController")).toBe(true);
    expect(indexes.composedStereotypes.get("ApiController")!.isRest).toBe(true);
  });

  test("composed stereotype으로 표시된 클래스 → 라우트 추출", async () => {
    const annoSource = `
import org.springframework.web.bind.annotation.RestController;
@RestController
public @interface ApiController {}
`;
    const ctrlSource = `
@ApiController
public class UserController {
  @GetMapping("/users")
  public List<User> list() { return null; }
}`;
    const annoFacts = await scanJavaFile(annoSource);
    const ctrlFacts = await scanJavaFile(ctrlSource);
    const indexes = buildSpringIndexes(
      new Map([["ApiController.java", annoFacts], ["UserController.java", ctrlFacts]]),
    );
    const routes = extractSpringRoutes("UserController.java", ctrlFacts, indexes);
    expect(routes).toHaveLength(1);
    expect(routes[0].method).toBe("GET");
    expect(routes[0].notes.some((n) => n.startsWith("composed:"))).toBe(true);
  });
});

// ── 경로 정규화 ───────────────────────────────────────────────────────────────

describe("extractSpringRoutes — path normalization", () => {
  test("이중 슬래시 제거", async () => {
    const source = `
@RestController
@RequestMapping("/api/")
public class SlashCtrl {
  @GetMapping("/users")
  public List<User> users() { return null; }
}`;
    const facts = await scanJavaFile(source);
    const routes = extractSpringRoutes("src/SlashCtrl.java", facts, emptyIndexes());
    expect(routes[0].path).not.toContain("//");
    expect(routes[0].path).toBe("/api/users");
  });

  test("class-level /* 접미 제거", async () => {
    const source = `
@Controller
@RequestMapping("/app/*")
public class WildCtrl {
  @GetMapping("/page")
  public String page() { return "page"; }
}`;
    const facts = await scanJavaFile(source);
    const routes = extractSpringRoutes("src/WildCtrl.java", facts, emptyIndexes());
    expect(routes[0].path).toBe("/app/page");
  });

  test("method-level 빈 path → class-level path만", async () => {
    const source = `
@RestController
@RequestMapping("/status")
public class StatusCtrl {
  @GetMapping
  public String status() { return "ok"; }
}`;
    const facts = await scanJavaFile(source);
    const routes = extractSpringRoutes("src/StatusCtrl.java", facts, emptyIndexes());
    expect(routes[0].path).toBe("/status");
  });
});

// ── unresolved constant ───────────────────────────────────────────────────────

describe("extractSpringRoutes — unresolved constants", () => {
  test("미해소 상수 → /__unresolved__/<ref> 경로 + unresolved-constant 노트", async () => {
    const source = `
@RestController
public class MissingConstCtrl {
  @GetMapping(SomeConstants.BASE)
  public String handle() { return ""; }
}`;
    const facts = await scanJavaFile(source);
    const routes = extractSpringRoutes("src/MissingConstCtrl.java", facts, emptyIndexes());
    expect(routes).toHaveLength(1);
    expect(routes[0].path).toContain("__unresolved__");
    expect(routes[0].notes.some((n) => n.startsWith("unresolved-constant:"))).toBe(true);
  });
});
