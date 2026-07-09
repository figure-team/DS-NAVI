/**
 * 순환복잡도 근사(java) — tree-sitter AST 결정 포인트 카운트(W4).
 *
 * 파일 복잡도 = 메서드/생성자 수 + 결정 포인트 총수
 * (= Σ 메서드별 McCabe(1 + 결정포인트) 근사 — 필드 초기화의 삼항 등 메서드 밖
 * 결정포인트도 계상된다. 파일 단위 위험 랭킹 용도라 메서드 귀속 정밀도는 요구하지
 * 않으며, 메서드 0개인 인터페이스/상수 클래스는 자연히 0).
 * 결정 포인트: if / for / enhanced-for / while / do / catch / 삼항 /
 * switch case 라벨(default 제외) / && / ||.
 *
 * 비 java 파일(jsp/kotlin/xml/sql)은 문법 미탑재로 **미측정(null)** — 호출자
 * (buildRiskReport)가 notes `[미확인]` + stats.measured 로 표면화한다(침묵 누락 금지).
 */
import type { Node } from 'web-tree-sitter';
/** 파싱된 java 루트 노드에서 파일 복잡도를 센다(순수·결정론). */
export declare function countJavaComplexity(root: Node): number;
/** java 소스 → 파일 복잡도. 파싱 실패는 throw(호출자가 [미확인] 처리). */
export declare function measureJavaComplexity(source: string): Promise<number>;
//# sourceMappingURL=complexity.d.ts.map