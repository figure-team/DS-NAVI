/**
 * xlsx 라이터(W7) — 의존성 0·결정론. html.ts(P4.4)와 동일 철학:
 * 새 패키지 없이(폐쇄망 SI·vendor-deps 무증가) 최소 OOXML(SpreadsheetML)을 손으로 쓴다.
 *
 * - ZIP: STORE(무압축) + 수제 CRC32 + 고정 DOS 타임스탬프(1980-01-01) —
 *   동일 입력 → byte-identical(레포 결정론 불변식).
 * - 시트: inlineStr 문자열(sharedStrings 생략), 숫자 패턴은 숫자 셀.
 * - 스타일: 기본 / 헤더(굵게+회색) / 강조행(굵게) 3종만.
 * - 시트명: 엑셀 금지문자 제거·31자 절단·중복 연번(정제 규칙 결정론).
 */
export interface XlsxRow {
    cells: string[];
    /** header = 굵게+회색 채움, bold = 굵게(집계 행 등). 기본은 일반. */
    style?: 'header' | 'bold';
}
export interface XlsxSheet {
    name: string;
    rows: XlsxRow[];
}
/**
 * 시트명 정제 — 금지문자 제거, 선행/후행 작은따옴표 제거·예약명(History) 회피(리뷰 F7),
 * 31자 절단, 빈 이름 폴백, 중복 연번(연번 부여 결과가 기존 이름과 재충돌하면 증가 —
 * 리뷰 F4: `['같음','같음','같음 (2)']` 류 입력에서 중복 시트명이 나오면 워크북 손상).
 */
export declare function sanitizeSheetNames(names: string[]): string[];
/** 시트들을 xlsx(zip) 버퍼로 만든다 — 동일 입력 → byte-identical. */
export declare function buildXlsxWorkbook(sheets: XlsxSheet[]): Buffer;
//# sourceMappingURL=xlsx.d.ts.map