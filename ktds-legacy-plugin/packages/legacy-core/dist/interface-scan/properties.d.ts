import type { CensusReport } from '../domain-map/types.js';
export interface PropertyEntry {
    value: string;
    file: string;
    line: number;
}
export type PropertyIndex = Map<string, PropertyEntry>;
/** census 에서 설정 파일(lang=properties|yaml)을 골라 프로퍼티 인덱스를 만든다. */
export declare function buildPropertyIndex(projectRoot: string, census: CensusReport): PropertyIndex;
/**
 * raw 문자열의 `${...}` 를 프로퍼티 인덱스로 해석한다.
 * - 플레이스홀더 없음 → { resolved: raw, resolvedFrom: null }
 * - 전부 해석(또는 default 존재) → 치환 결과 + 첫 해석 근거 "file:line"
 * - 하나라도 실패 → { resolved: null, resolvedFrom: null } (호출측 unresolved 처리)
 */
export declare function resolvePlaceholders(raw: string, props: PropertyIndex): {
    resolved: string | null;
    resolvedFrom: string | null;
};
//# sourceMappingURL=properties.d.ts.map