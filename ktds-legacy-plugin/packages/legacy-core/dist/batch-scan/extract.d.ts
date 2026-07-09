/**
 * W2 신규 배치 신호 추출 — spring-batch XML / Quartz Java API / 프로그램적 스케줄러 /
 * shell / crontab. 기존 batch.ts(@Scheduled·main·quartz XML·task:scheduled)를 보완한다.
 *
 * 관례: entryId `batch:<relPath>#<symbol>`, 증거 없는 엔트리 금지, 정렬은 호출측
 * (sortBatchEntries). Java 탐지는 W1 교훈 반영 — 동명 이타입 선언은 바인딩 포기(오탐 방지).
 */
import type { Node } from 'web-tree-sitter';
import type { BatchEntry } from '../domain-map/types.js';
/**
 * spring-batch XML `<job id>`(또는 `<batch:job>`) → 엔트리.
 * 네임스페이스 가드: 파일에 spring-batch 스키마 선언이 있을 때만(quartz/기타 `<job>` 오탐 방지).
 * handler = 첫 step 의 tasklet ref → 없으면 chunk reader ref(대표 1개, 나머지는 notes).
 */
export declare function extractSpringBatchXmlJobs(rawText: string, filePath: string): BatchEntry[];
/**
 * 단일 Java 파일에서 W2 신호(quartz-java/executor/timer)를 추출한다.
 * @param root 파싱된 program 노드(라우트 추출과 공유)
 */
export declare function extractJavaBatchEntriesW2(root: Node, filePath: string): BatchEntry[];
/** shell 스크립트에서 `java -jar x.jar` / `java -cp … MainClass` 라인 추출. */
export declare function extractShellBatchEntries(rawText: string, filePath: string): BatchEntry[];
/** crontab 형식 파일에서 5필드 cron 라인 추출(파일 선별은 호출측). */
export declare function extractCrontabEntries(rawText: string, filePath: string): BatchEntry[];
/** crontab 파일 여부(basename crontab* 또는 상위 디렉터리 cron.d). */
export declare function isCrontabPath(relPath: string): boolean;
//# sourceMappingURL=extract.d.ts.map