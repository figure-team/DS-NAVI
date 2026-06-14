import { expect, test } from "vitest";
import { renderNote, renderWikiSkeleton, extractProse } from "./render.js";
import type { WikiNote } from "./types.js";

function note(extra: Partial<WikiNote> = {}): WikiNote {
  return {
    relPath: "feature/계정.md",
    layer: "feature",
    nodeUid: "domain:account",
    title: "계정",
    summary: "계정 도메인",
    frontmatter: { type: "domain", title: "계정" },
    claims: [
      { claim: "업무 도메인: 계정", confidence: "CONFIRMED_AI", evidence: [{ path: "A.java", line: 5 }], requires_human_review: false },
    ],
    links: [{ targetRelPath: "api/login", label: "로그인 API" }],
    ...extra,
  };
}

test("renderNote: frontmatter→H1→상태문→claims 펜스→관계", () => {
  const md = renderNote(note());
  expect(md.startsWith("---\ntype: domain\ntitle: 계정\n---")).toBe(true);
  expect(md).toContain("# 계정");
  expect(md).toContain("> ktds 위키 노트");
  expect(md).toContain("<!-- claims -->");
  expect(md).toContain("- [확정(AI)] 업무 도메인: 계정 — 근거: `A.java:5`");
  expect(md).toContain("<!-- /claims -->");
  expect(md).toContain("## 관계");
  expect(md).toContain("- [[api/login|로그인 API]]");
});

test("renderNote: 산문은 skeleton에서 제외, 주입 시 포함", () => {
  const skeleton = renderNote(note());
  expect(skeleton).not.toContain("산문 본문");
  const withProse = renderNote(note(), "산문 본문입니다.");
  expect(withProse).toContain("산문 본문입니다.");
  // 산문은 H1 다음, claims 펜스 앞
  expect(withProse.indexOf("산문 본문")).toBeLessThan(withProse.indexOf("<!-- claims -->"));
});

test("renderNote: 결정론(prose 없이 2회 동일)", () => {
  expect(renderNote(note())).toBe(renderNote(note()));
});

test("renderNote: claim 없으면 항목 없음, 링크 없으면 관계 절 생략", () => {
  const md = renderNote(note({ claims: [], links: [] }));
  expect(md).toContain("_(항목 없음)_");
  expect(md).not.toContain("## 관계");
  expect(md).not.toContain("<!-- claims -->");
});

test("extractProse: renderNote 역연산 (단문·다단락 round-trip)", () => {
  // 단문
  expect(extractProse(renderNote(note(), "한 줄 산문."))).toBe("한 줄 산문.");
  // 다단락 (claims 위 본문 전체 보존)
  const multi = "첫 문단입니다.\n\n둘째 문단입니다.";
  expect(extractProse(renderNote(note(), multi))).toBe(multi);
  // claim 없는 노트(_(항목 없음)_ 종료 마커)에서도 추출
  expect(extractProse(renderNote(note({ claims: [], links: [] }), "산문만."))).toBe("산문만.");
});

test("extractProse: 산문 속 단독 종료마커 줄은 잘림(의도된 한계, 수렴)", () => {
  // 단독 줄 '## 관계'에서 절단 (계약 위반 입력) — '## 관계 모델' 같은 헤딩은 안전(정확 일치).
  expect(extractProse(renderNote(note(), "본문\n## 관계\n뒤 산문"))).toBe("본문");
  expect(extractProse(renderNote(note(), "본문\n## 관계 모델\n이어짐"))).toBe("본문\n## 관계 모델\n이어짐");
  // 잘린 결과를 다시 주입해도 안정(중복·claims 누출 없음)
  const once = extractProse(renderNote(note(), "본문\n## 관계\n뒤"));
  expect(extractProse(renderNote(note(), once))).toBe(once);
});

test("extractProse: 산문 없으면 '' (skeleton 재주입 무해)", () => {
  expect(extractProse(renderNote(note()))).toBe("");
  // 상태문 없는 비-노트(5종 허브 등) → ''
  expect(extractProse("# 04_api-spec\n\n## 섹션\n\n내용\n")).toBe("");
});

test("renderWikiSkeleton: relPath→skeleton Map", () => {
  const m = renderWikiSkeleton([note(), note({ relPath: "api/login.md", layer: "api", nodeUid: "e1", title: "로그인 API", links: [] })]);
  expect([...m.keys()].sort()).toEqual(["api/login.md", "feature/계정.md"]);
  expect(m.get("feature/계정.md")).toBe(renderNote(note()));
});
