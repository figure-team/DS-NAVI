/**
 * ktds legacy-core — 화면 요소 분류/번호 부여(순수 함수, IO·브라우저 없음).
 *
 * 캡처 러너가 추출한 RawElement 를 화면설계서 주석(Annotation)으로 변환한다.
 * - 가시성/크기 필터 + selector 중복 제거.
 * - kind 분류: field(입력) / action(이벤트) / link(내비게이션).
 * - 읽기 순서 정렬(y 8px 양자화 → x) 후 kind 그룹별 카운터로 번호 부여
 *   (field·region = ①②③, action·link = ⓐⓑⓒ — 렌더러가 글리프 결정).
 */
import type { Annotation, AnnotationKind, EventType, RawElement } from './types.js';
/**
 * 배지 글리프 — 대시보드/문서 렌더 공용. 종류별 3계열 분리(카운터도 3분할):
 * - 입력 필드(field/region) → 동그라미 숫자 ①②③
 * - 버튼·이벤트(action)      → 동그라미 소문자 ⓐⓑⓒ
 * - 링크·이동(link)          → 동그라미 대문자 ⒶⒷⒸ
 * 각 계열 범위(50/26/26) 초과 시 렌더러가 "(n)" 폴백.
 */
export declare const CIRCLED_DIGITS = "\u2460\u2461\u2462\u2463\u2464\u2465\u2466\u2467\u2468\u2469\u246A\u246B\u246C\u246D\u246E\u246F\u2470\u2471\u2472\u2473\u3251\u3252\u3253\u3254\u3255\u3256\u3257\u3258\u3259\u325A\u325B\u325C\u325D\u325E\u325F\u32B1\u32B2\u32B3\u32B4\u32B5\u32B6\u32B7\u32B8\u32B9\u32BA\u32BB\u32BC\u32BD\u32BE\u32BF";
export declare const CIRCLED_LETTERS = "\u24D0\u24D1\u24D2\u24D3\u24D4\u24D5\u24D6\u24D7\u24D8\u24D9\u24DA\u24DB\u24DC\u24DD\u24DE\u24DF\u24E0\u24E1\u24E2\u24E3\u24E4\u24E5\u24E6\u24E7\u24E8\u24E9";
export declare const CIRCLED_UPPER = "\u24B6\u24B7\u24B8\u24B9\u24BA\u24BB\u24BC\u24BD\u24BE\u24BF\u24C0\u24C1\u24C2\u24C3\u24C4\u24C5\u24C6\u24C7\u24C8\u24C9\u24CA\u24CB\u24CC\u24CD\u24CE\u24CF";
/** kind+no → 표시 글리프(범위 초과 시 "(n)" 폴백). */
export declare function badgeGlyph(kind: AnnotationKind, no: number): string;
interface Classified {
    kind: AnnotationKind;
    eventType: EventType;
}
/** 요소 1건의 kind/eventType 분류. 주석 대상이 아니면 null. */
export declare function classifyKind(e: RawElement): Classified | null;
/** 표시 라벨 선택: text → value → alt → placeholder → name → domId → tag. */
export declare function pickLabel(e: RawElement): string;
/**
 * RawElement[] → Annotation[] (handler/description/note 는 null — 이후 단계가 채움).
 * 결정론: 동일 입력이면 동일 출력(정렬·번호 안정).
 */
export declare function classifyElements(elements: RawElement[]): Annotation[];
export {};
//# sourceMappingURL=classify.d.ts.map