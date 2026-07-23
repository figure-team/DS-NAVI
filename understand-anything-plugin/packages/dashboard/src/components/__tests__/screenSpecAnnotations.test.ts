import { describe, it, expect } from "vitest";
import {
  commonChromeThreshold,
  commonNavThreshold,
  computeCommonChrome,
  computeCommonHrefs,
  displayLabel,
  isCommonChrome,
  isJunkLabel,
  labelFromHref,
} from "../screenSpecAnnotations";
import type { Annotation, Screen } from "../screenSpecAnnotations";

const ann = (over: Partial<Annotation> & { kind: Annotation["kind"] }): Annotation => ({
  no: 1,
  selector: "a",
  bbox: { x: 0, y: 0, width: 10, height: 10 },
  label: "a",
  eventType: "click",
  mechanical: { name: null, href: null, formAction: null, required: false },
  handler: null,
  description: null,
  note: null,
  ...over,
});

const link = (href: string, label = "a") => ann({ kind: "link", label, mechanical: { name: null, href, formAction: null, required: false } });

const screen = (id: string, annotations: Annotation[]): Screen => ({
  id,
  title: id,
  url: `/${id}`,
  jspFile: null,
  domain: null,
  scenario: null,
  openedFrom: null,
  graphNodeId: null,
  capture: { path: "x.png", width: 1280, height: 800, capturedAt: "" },
  summary: null,
  annotations,
});

describe("isJunkLabel", () => {
  it("태그명·아이콘 글리프·공백을 라벨 추출 실패로 본다", () => {
    for (const s of ["a", "A", " a ", "?", "img", "span", "div", "button", ""]) {
      expect(isJunkLabel(s)).toBe(true);
    }
  });

  it("실제 라벨은 건드리지 않는다", () => {
    for (const s of ["Sign In", "My Account", "www.mybatis.org", "장바구니", "Add to Cart"]) {
      expect(isJunkLabel(s)).toBe(false);
    }
  });
});

describe("labelFromHref", () => {
  it("값 없는 쿼리 파라미터를 이벤트 이름으로 읽는다", () => {
    expect(labelFromHref("/jpetstore/actions/Cart.action?viewCart=")).toBe("viewCart");
    expect(labelFromHref("/jpetstore/actions/Account.action?signoff=")).toBe("signoff");
  });

  it("값 있는 첫 파라미터를 인자로 덧붙인다", () => {
    expect(labelFromHref("/jpetstore/actions/Catalog.action?viewCategory=&categoryId=FISH")).toBe(
      "viewCategory (FISH)",
    );
  });

  it("퍼센트 인코딩된 인자를 디코드한다", () => {
    expect(labelFromHref("/a.action?search=&keyword=%EA%B0%9C")).toBe("search (개)");
  });

  it("깨진 인코딩은 원문으로 살린다 — 유도 자체를 포기하지 않는다", () => {
    expect(labelFromHref("/a.action?search=&keyword=%E0%A4%A")).toBe("search (%E0%A4%A)");
  });

  it("쿼리 없는 링크는 경로 끝(파일명·호스트)을 쓴다", () => {
    expect(labelFromHref("../help.html")).toBe("help.html");
    expect(labelFromHref("http://www.mybatis.org")).toBe("www.mybatis.org");
    expect(labelFromHref("/jpetstore/actions/Catalog.action")).toBe("Catalog.action");
  });

  it("jsessionid 를 이름에서 걷어낸다", () => {
    expect(labelFromHref("/jpetstore/actions/Catalog.action;jsessionid=A1B2C3")).toBe("Catalog.action");
  });

  it("유도할 게 없으면 null — 호출부가 원래 라벨을 쓴다", () => {
    expect(labelFromHref("")).toBeNull();
    expect(labelFromHref("   ")).toBeNull();
    expect(labelFromHref("/a.action?categoryId=FISH")).toBeNull(); // 이벤트 이름 없음
  });
});

describe("displayLabel", () => {
  const field = (label: string, name: string | null) =>
    ann({ kind: "field", label, mechanical: { name, href: null, formAction: null, required: false } });

  it("쓸모없는 링크 라벨을 href 유도값으로 대체하고 출처를 href 로 표시한다", () => {
    expect(displayLabel(link("/jpetstore/actions/Cart.action?viewCart="), undefined)).toEqual({
      text: "viewCart",
      source: "href",
    });
  });

  it("멀쩡한 파서 라벨은 그대로 둔다", () => {
    expect(displayLabel(link("/jpetstore/actions/Cart.action?viewCart=", "Sign In"), undefined)).toEqual({
      text: "Sign In",
      source: "parser",
    });
  });

  it("사람이 편집한 override 가 href 유도보다 우선한다", () => {
    expect(displayLabel(link("/jpetstore/actions/Cart.action?viewCart="), "장바구니 보기")).toEqual({
      text: "장바구니 보기",
      source: "override",
    });
  });

  it("빈 문자열 override 도 사람의 판단이므로 존중한다", () => {
    expect(displayLabel(link("/a.action?viewCart="), "")).toEqual({ text: "", source: "override" });
  });

  it("href 가 없어 유도 실패하면 원래 라벨을 남긴다 — 침묵 대체 없음", () => {
    expect(displayLabel(ann({ kind: "link", label: "a" }), undefined)).toEqual({ text: "a", source: "parser" });
  });

  // 입력 항목: 파서가 값("ABC")을 라벨로 올리므로 name 이 정식 항목명이다.
  it("입력 항목은 파서 라벨(=입력값)보다 name 을 앞세운다", () => {
    expect(displayLabel(field("ABC", "account.firstName"), undefined)).toEqual({
      text: "account.firstName",
      source: "name",
    });
    expect(displayLabel(field("true", "account.listOption"), undefined)).toEqual({
      text: "account.listOption",
      source: "name",
    });
    expect(displayLabel(field("FISH DOGS REPTILES", "account.favouriteCategoryId"), undefined)).toEqual({
      text: "account.favouriteCategoryId",
      source: "name",
    });
  });

  it("입력 항목의 override 는 name 보다 우선한다", () => {
    expect(displayLabel(field("ABC", "account.firstName"), "이름")).toEqual({ text: "이름", source: "override" });
  });

  it("name 없는 입력 항목은 파서 라벨로 폴백한다", () => {
    expect(displayLabel(field("검색어", null), undefined)).toEqual({ text: "검색어", source: "parser" });
  });

  it("입력이 아닌 영역(region)에는 name 우선을 적용하지 않는다", () => {
    const region = ann({
      kind: "region",
      label: "상품 목록",
      mechanical: { name: "grid", href: null, formAction: null, required: false },
    });
    expect(displayLabel(region, undefined)).toEqual({ text: "상품 목록", source: "parser" });
  });
});

describe("commonNavThreshold", () => {
  it("전체 화면의 25%, 최소 3화면", () => {
    expect(commonNavThreshold(22)).toBe(6);
    expect(commonNavThreshold(4)).toBe(3);
    expect(commonNavThreshold(1)).toBe(3);
    expect(commonNavThreshold(100)).toBe(25);
  });
});

describe("computeCommonHrefs", () => {
  const gnb = "/actions/Catalog.action?viewCategory=&categoryId=FISH";
  const unique = "/actions/Cart.action?removeItem=&id=EST-1";

  it("임계값 이상 화면에 반복되는 링크만 공통으로 판정한다", () => {
    const screens = Array.from({ length: 8 }, (_, i) => screen(`s${i}`, [link(gnb)]));
    screens[0].annotations.push(link(unique));
    const common = computeCommonHrefs(screens);
    expect(common.has(gnb)).toBe(true);
    expect(common.has(unique)).toBe(false);
  });

  it("같은 화면에 여러 번 나와도 화면 1개로 센다 — 반복 노출은 공통의 근거가 아니다", () => {
    const screens = [screen("s0", [link(gnb), link(gnb), link(gnb), link(gnb), link(gnb)])];
    expect(computeCommonHrefs(screens).has(gnb)).toBe(false);
  });

  it("링크에만 적용한다 — 입력·버튼은 반복돼도 화면 고유 사양", () => {
    const href = "/actions/Account.action?save=";
    const screens = Array.from({ length: 8 }, (_, i) =>
      screen(`s${i}`, [ann({ kind: "action", label: "저장", mechanical: { name: null, href, formAction: null, required: false } })]),
    );
    expect(computeCommonHrefs(screens).has(href)).toBe(false);
  });

  it("href 없는 링크는 무시한다", () => {
    const screens = Array.from({ length: 8 }, (_, i) => screen(`s${i}`, [ann({ kind: "link" })]));
    expect(computeCommonHrefs(screens).size).toBe(0);
  });

  it("빈 입력에 터지지 않는다", () => {
    expect(computeCommonHrefs([]).size).toBe(0);
  });
});

describe("commonChromeThreshold", () => {
  it("전체 화면의 80%, 최소 3화면(링크 25%보다 높다)", () => {
    expect(commonChromeThreshold(43)).toBe(35);
    expect(commonChromeThreshold(10)).toBe(8);
    expect(commonChromeThreshold(2)).toBe(3);
  });
});

describe("computeCommonChrome / isCommonChrome (결함 2)", () => {
  const navBtn = (label: string) =>
    ann({ kind: "action", label, mechanical: { name: null, href: null, formAction: null, required: false } });

  it("region 태그가 붙은 주석은 임계·빈도와 무관하게 공통 크롬(구조 신호 최우선)", () => {
    const solo = ann({ kind: "action", label: "로그아웃", region: "header" });
    const common = computeCommonChrome([screen("s0", [solo])]);
    expect(isCommonChrome(solo, common)).toBe(true);
  });

  it("region 없는 상태 버튼도 80% 이상 반복되면 공통으로 접는다(빈도 폴백)", () => {
    // 좌측 내비 버튼 "징수 등록" 이 10화면 중 9화면(90%)에 반복 → 공통.
    const screens = Array.from({ length: 10 }, (_, i) =>
      screen(`s${i}`, i < 9 ? [navBtn("징수 등록")] : [navBtn("고유 버튼")]),
    );
    const common = computeCommonChrome(screens);
    expect(isCommonChrome(navBtn("징수 등록"), common)).toBe(true);
    expect(isCommonChrome(navBtn("고유 버튼"), common)).toBe(false);
  });

  it("80% 미만 반복 버튼은 화면 고유 사양으로 남긴다(과잉 접기 방지)", () => {
    // "저장" 이 10화면 중 6화면(60% < 80%)에만 → 접지 않는다.
    const screens = Array.from({ length: 10 }, (_, i) => screen(`s${i}`, i < 6 ? [navBtn("저장")] : []));
    const common = computeCommonChrome(screens);
    expect(isCommonChrome(navBtn("저장"), common)).toBe(false);
  });

  it("공통 링크(href 25%)는 계속 접는다(기존 규약 유지)", () => {
    const gnb = "/actions/Catalog.action?viewCategory=&categoryId=FISH";
    const screens = Array.from({ length: 8 }, (_, i) => screen(`s${i}`, [link(gnb)]));
    const common = computeCommonChrome(screens);
    expect(isCommonChrome(link(gnb), common)).toBe(true);
  });
});
