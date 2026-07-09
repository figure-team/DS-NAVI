import type { CensusReport } from '../domain-map/types.js';
export interface BeanDef {
    id: string;
    className: string | null;
    file: string;
    line: number;
    /** property name → { value, ref } (첫 출현). */
    properties: Map<string, {
        value: string | null;
        ref: string | null;
    }>;
}
export type BeanIndex = Map<string, BeanDef>;
/**
 * 여는 태그 위치에서 깊이 추적으로 "그 빈 자신의" 본문 범위를 구한다.
 * 첫 `</bean>` 근사는 중첩 빈에서 ①외부 property 유실 ②중첩 빈 property 가 외부에
 * 오귀속되는 "틀린 값" 경로를 만든다(실증) — 깊이 카운트로 정확한 닫힘을 찾는다.
 */
export declare function beanBodyRange(text: string, openEnd: number): {
    end: number;
};
/** 본문에서 중첩 빈 구간을 공백으로 지운다(속성 오귀속 방지, 오프셋 보존). */
export declare function blankNestedBeans(body: string): string;
/** 단일 XML 텍스트에서 빈 정의를 수집해 인덱스에 누적한다(첫 출현 승리). */
export declare function collectBeans(rawText: string, relPath: string, out: BeanIndex): void;
/** census 의 전 XML 파일에서 빈 인덱스를 만든다. */
export declare function buildSpringBeanIndex(projectRoot: string, census: CensusReport): BeanIndex;
/**
 * 클래스 FQN → census java 파일 해석.
 * 1) 패키지 경로 접미 일치(…/com/foo/Bar.java) 2) 단순명 유일 일치.
 * 0건/다중(모호) → null — 틀린 확정값보다 [미확인]이 낫다.
 */
export declare function classFqnToFile(fqn: string, census: CensusReport): string | null;
//# sourceMappingURL=bean-index.d.ts.map