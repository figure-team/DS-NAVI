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
import type { BatchEntry, CensusReport } from '../domain-map/types.js'
import { classFqnToFile, type BeanIndex } from './bean-index.js'

/** filePath 가 자명한 핸들러인 Java 계열 트리거(quartz-java 는 잡 클래스 해석이 별도). */
const JAVA_TRIGGERS = new Set(['scheduled', 'main', 'executor', 'timer'])

/** 빈 id → 잡 클래스 FQN(quartz jobDetail 계열 규칙). */
function beanToJobClass(beanId: string, beans: BeanIndex): string | null {
  const bean = beans.get(beanId)
  if (!bean) return null
  const cls = bean.className ?? ''
  if (/MethodInvokingJobDetailFactoryBean$/.test(cls)) {
    const target = bean.properties.get('targetObject')?.ref
    if (!target) return null
    return beans.get(target)?.className ?? null
  }
  if (/JobDetail(?:FactoryBean|Bean)$/.test(cls)) {
    return bean.properties.get('jobClass')?.value ?? null
  }
  return bean.className
}

/**
 * batchEntries 의 handlerFile 을 채운 새 배열을 반환한다(원본 불변).
 * handler 표기 자체는 기존 골든과의 등가를 위해 변경하지 않는다.
 */
export function resolveBatchHandlers(
  entries: BatchEntry[],
  beans: BeanIndex,
  census: CensusReport,
): BatchEntry[] {
  return entries.map((e) => {
    if (JAVA_TRIGGERS.has(e.trigger)) return { ...e, handlerFile: e.filePath }
    if (e.trigger === 'quartz-java') {
      // newJob(X.class) — 잡 클래스 파일로 해석, 실패 시 등록 지점 파일(자명 근거) 폴백.
      const byClass = e.handler ? classFqnToFile(e.handler, census) : null
      return { ...e, handlerFile: byClass ?? e.filePath }
    }
    if (e.trigger === 'quartz' || e.trigger === 'task-xml' || e.trigger === 'spring-batch') {
      const beanId = (e.handler ?? '').split('#')[0]
      if (!beanId) return { ...e, handlerFile: null }
      const fqn = beanToJobClass(beanId, beans)
      return { ...e, handlerFile: fqn ? classFqnToFile(fqn, census) : null }
    }
    return { ...e, handlerFile: null }
  })
}
