/**
 * 배치 핸들러 해석(W2 P2-a) — XML 배치 엔트리의 빈 ref 를 잡 클래스 파일로 푼다.
 *
 * - quartz: handler(=jobDetail 빈 id) → 빈 정의:
 *     · MethodInvokingJobDetailFactoryBean → targetObject(ref) 빈의 class (+targetMethod 노트)
 *     · JobDetailFactoryBean / JobDetailBean → jobClass property 의 FQN
 *     · 그 외 class 보유 빈 → 그 class (사용자 정의 JobDetail 서브클래스)
 * - task-xml: handler(`ref#method`) 의 ref 빈 → class
 * - spring-batch: handler(=tasklet/reader 빈 id) → class
 * - Java 계열(scheduled/main/quartz-java/executor/timer): handlerFile = filePath(자명)
 * - shell/crontab: 프로젝트 내 파일 매핑이 없어 null
 *
 * 해석 실패(빈 없음·class 없음·파일 매핑 모호)는 handlerFile=null — [미확인] 표면화.
 */
import type { BatchEntry, CensusReport } from '../domain-map/types.js';
import { type BeanIndex } from './bean-index.js';
/**
 * batchEntries 의 handlerFile 을 채운 새 배열을 반환한다(원본 불변).
 * handler 표기 자체는 기존 골든과의 등가를 위해 변경하지 않는다.
 */
export declare function resolveBatchHandlers(entries: BatchEntry[], beans: BeanIndex, census: CensusReport): BatchEntry[];
//# sourceMappingURL=resolve.d.ts.map