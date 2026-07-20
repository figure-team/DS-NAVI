/**
 * 배치/스케줄 진입점 추출 — Kotlin(@Scheduled / top-level fun main).
 *
 * Java판(batch.ts)의 extractJavaBatchEntries 와 산출 형태(BatchEntry)·필드 규칙은
 * 동일하되, 어노테이션 인자는 kotlin-ast.ts 의 `collectDeclAnnotations`(분리형 미스파스
 * 치유 포함)를 소비한다.
 *
 * Kotlin: @Scheduled(cron=.. | fixedRate=.. | fixedDelay=..) -> trigger "scheduled"
 *         (어노테이션당 1엔트리, 중복 @Scheduled 도 각각 1엔트리 — 클래스 소속 메서드+
 *         top-level 함수 모두 스캔),
 *         top-level(=source_file 직속) `fun main` -> trigger "main"
 *         (Kotlin main 은 항상 top-level — Java 의 `public static` 판정에 대응하는
 *         개념이 없다. 클래스 소속 메서드는 main 트리거 대상에서 제외한다).
 * entryId = `batch:<relPath>#<symbol>`. 정렬은 호출측 sortBatchEntries 몫(Java판과 동형).
 */
import type { Node } from 'web-tree-sitter';
import type { BatchEntry } from '../types.js';
/**
 * 단일 Kotlin 파일에서 배치 진입점을 추출한다.
 * @param root 파싱된 source_file 노드
 * @param filePath census relPath
 */
export declare function extractKotlinBatchEntries(root: Node, filePath: string): BatchEntry[];
//# sourceMappingURL=batch-kotlin.d.ts.map