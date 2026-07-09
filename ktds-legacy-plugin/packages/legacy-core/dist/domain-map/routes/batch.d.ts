/**
 * 배치/스케줄 진입점 추출 — Java(@Scheduled / main) + XML(Quartz / task:scheduled).
 *
 * Java: @Scheduled(cron=.. | fixedRate=.. | fixedDelay=..) -> trigger "scheduled"
 *       (어노테이션당 1엔트리, 중복 @Scheduled 도 각각 1엔트리),
 *       public static void main(String[]) -> trigger "main".
 * XML : Spring CronTriggerFactoryBean 빈(중첩 list 포함) -> trigger "quartz"
 *       (handler = jobDetail ref 빈 id, schedule = cron=<cronExpression>),
 *       <task:scheduled .../> -> trigger "task-xml"
 *       (handler = ref#method, schedule = cron=<cron 속성>).
 *       MethodInvokingJobDetailFactoryBean(JobDetail 빈)은 트리거와 중복되므로 제외한다.
 * entryId = `batch:<relPath>#<symbol>`. 모든 산출은 호출측에서 sortBatchEntries 로 정렬한다.
 */
import type { Node } from 'web-tree-sitter';
import type { BatchEntry } from '../types.js';
/**
 * 단일 Java 파일에서 배치 진입점을 추출한다.
 * @param root 파싱된 program 노드
 * @param filePath census relPath
 */
export declare function extractJavaBatchEntries(root: Node, filePath: string): BatchEntry[];
/**
 * 단일 XML 파일에서 배치 진입점을 추출한다.
 * - CronTriggerFactoryBean 빈(중첩 포함) -> quartz
 * - <task:scheduled .../> -> task-xml
 */
export declare function extractXmlBatchEntries(rawText: string, filePath: string): BatchEntry[];
//# sourceMappingURL=batch.d.ts.map