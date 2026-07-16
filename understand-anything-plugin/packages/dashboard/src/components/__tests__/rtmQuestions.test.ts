/**
 * A1/A5: ① `[확인필요]` 질문 정규화·답변 원장 — 화면쪽 순수 함수.
 * 설계: docs/ktds/RTM_INTAKE_ANSWER_DESIGN.md §3.1·§3.2
 *
 * ★ 이 테스트의 존재 이유는 **legacy-core 와의 계약**이다. `normalizeQuestions` 는 legacy-core
 * `intake-types.ts` 의 `QuestionsField` preprocess 규칙을 **복제**한다(대시보드는 legacy-core 를
 * import 하지 않는다 — 별 패키지·브라우저 번들). 두 규칙이 갈리면 화면이 매긴 `qid` 와 산출의 id 가
 * 어긋나 **답변 POST 가 엉뚱한 질문에 붙는다**. 그래서 규칙을 여기 고정한다.
 */
import { describe, expect, it } from "vitest";
import { latestAnswers, normalizeQuestions } from "../rtm/types";
import type { Identified, QaHistory } from "../rtm/types";

describe("normalizeQuestions — legacy-core QuestionsField 와 같은 규칙", () => {
  it("★ 구형 문자열 배열을 인덱스 기반 Q-N 으로 정규화한다(legacy-core 와 동일)", () => {
    expect(normalizeQuestions(["첫 질문", "둘째 질문"])).toEqual([
      { id: "Q-1", text: "첫 질문", answer: null, answeredAt: null },
      { id: "Q-2", text: "둘째 질문", answer: null, answeredAt: null },
    ]);
  });

  it("★ 이미 id 가 있는 객체는 인덱스로 덮지 않는다 — 답을 붙잡는 안정 키다", () => {
    const out = normalizeQuestions([
      { id: "Q-7", text: "일곱", answer: "답" },
      { id: "Q-9", text: "아홉" },
    ])!;
    expect(out.map((q) => q.id)).toEqual(["Q-7", "Q-9"]); // Q-1/Q-2 로 재발번하면 답이 날아간다
    expect(out[0].answer).toBe("답");
  });

  it("id 없는/빈 객체는 인덱스로 합성한다", () => {
    const out = normalizeQuestions([{ text: "id 없음" }, { id: "", text: "id 빈문자" }])!;
    expect(out.map((q) => q.id)).toEqual(["Q-1", "Q-2"]);
  });

  it("문자열/객체 혼합도 순서대로 처리한다", () => {
    const out = normalizeQuestions(["구형", { id: "Q-9", text: "신형" }]);
    expect(out).toEqual([
      { id: "Q-1", text: "구형", answer: null, answeredAt: null },
      { id: "Q-9", text: "신형" },
    ]);
  });

  it("부재·빈 배열은 빈 배열이다(질문 없음 = 정직한 empty)", () => {
    expect(normalizeQuestions(undefined)).toEqual([]);
    expect(normalizeQuestions([])).toEqual([]);
  });

  it("★ 배열이 아니면 null 이다 — []('모호함 없음')로 위장하면 안 된다", () => {
    // []에는 "인터뷰 블록 숨기고 통과"라는 의미가 있다(§6). 손상을 []로 뭉개면 질문이 있는데도
    // 없는 것처럼 보이고 사용자는 물어볼 게 없다고 읽는다("없음 vs 못 봄").
    expect(normalizeQuestions("nope" as unknown as Identified["questions"])).toBeNull();
    expect(normalizeQuestions(7 as unknown as Identified["questions"])).toBeNull();
  });

  it("★ 정규화가 멱등이다 — 두 번 돌려도 id 가 흔들리지 않는다", () => {
    const once = normalizeQuestions(["a", "b"])!;
    expect(normalizeQuestions(once)).toEqual(once);
  });
});

describe("latestAnswers — 원장에서 qid → 최신 답", () => {
  const h = (revisions: QaHistory["revisions"]): QaHistory => ({ revisions });

  it("revision 을 가로질러 qid 별 답을 모은다", () => {
    const m = latestAnswers(
      h([
        { rev: 1, answeredAt: "t1", qas: [{ qid: "Q-1", question: "q1", answer: "a1" }] },
        { rev: 2, answeredAt: "t2", qas: [{ qid: "Q-2", question: "q2", answer: "a2" }] },
      ]),
    );
    expect(m.get("Q-1")?.answer).toBe("a1");
    expect(m.get("Q-2")?.answer).toBe("a2");
  });

  it("★ 같은 질문에 다시 답하면 마지막이 이긴다(원장은 append-only 지만 현재값은 최신)", () => {
    const m = latestAnswers(
      h([
        { rev: 1, answeredAt: "t1", qas: [{ qid: "Q-1", question: "q", answer: "옛 답" }] },
        { rev: 2, answeredAt: "t2", qas: [{ qid: "Q-1", question: "q", answer: "새 답" }] },
      ]),
    );
    expect(m.get("Q-1")?.answer).toBe("새 답");
  });

  it("빈·부재 원장은 빈 맵이다", () => {
    expect(latestAnswers(null).size).toBe(0);
    expect(latestAnswers({}).size).toBe(0);
    expect(latestAnswers(h([])).size).toBe(0);
  });

  it("손상 항목(qid 없음)은 건너뛴다", () => {
    const m = latestAnswers({
      revisions: [
        { rev: 1, answeredAt: "t", qas: [{ qid: "", question: "q", answer: "a" }] },
      ] as QaHistory["revisions"],
    });
    expect(m.size).toBe(0);
  });
});
