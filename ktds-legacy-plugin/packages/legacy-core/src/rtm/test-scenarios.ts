/**
 * buildTestScenarios(W5) — 기능 행별 단위테스트 시나리오 초안 결정론 생성.
 * 설계: docs/ktds/RTM_TEST_SCENARIO_DESIGN.md §2~3.
 *
 * LLM 불요: 행의 결정론 시드(진입점 라우트·구현 파일·데이터 CRUD·rules 의 예외 AC)를
 * 템플릿에 인스턴스화한다. 시나리오는 검증 전 초안이므로 **전부 INFERRED**([추정]),
 * 근거는 원천 셀(진입점→구현 순) evidence 승계. 확정(CONFIRMED 승격)은 오버레이
 * `_scenarios` 몫(apply-overlay.ts).
 *
 * 침묵 누락 금지: 시드가 없어도 행당 정상/예외/경계 3종을 **축소형으로 생성**하고
 * 사유를 notes `[미확인]` 으로 표기한다(0건 행 없음 — 수용 기준 ①).
 * 결정론: 기능 행 순서(모델 정렬) × 종류(N→E→B) × rules acId ASC. Date.now/난수 없음.
 */
import type { RtmFunctionRow, RtmModel, RtmTestScenario } from './types.js'
import { computeCoverage } from './coverage.js'
import { computeDiagnostics } from './validate.js'

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** 행의 호출(When) 문구 — 진입점 > 구현 파일 > 미상 순 폴백. */
function whenOf(f: RtmFunctionRow): { when: string; degraded: boolean } {
  if (f.entryPoint.value.trim().length > 0) {
    return { when: `\`${f.entryPoint.value}\` 호출`, degraded: false }
  }
  if (f.implementation.value.trim().length > 0) {
    return { when: `핵심 메서드 직접 호출(구현: ${f.implementation.value})`, degraded: true }
  }
  return { when: '기능 실행(진입 경로 미상)', degraded: true }
}

/** 한 기능 행의 시나리오 3종+ 생성. */
function scenariosOf(f: RtmFunctionRow): RtmTestScenario[] {
  const out: RtmTestScenario[] = []
  const { when, degraded } = whenOf(f)
  const baseNotes = degraded ? ['[미확인] 진입점 없음 — 호출 절차는 사람 보강'] : []
  const evidence = f.entryPoint.evidence.length > 0 ? f.entryPoint.evidence : f.implementation.evidence
  const hasData = f.data.value.trim().length > 0

  out.push({
    id: `TS-${f.featureId}-N1`,
    fnId: f.id,
    reqId: null,
    acId: null,
    kind: 'normal',
    title: `${f.name} 정상 처리`,
    given: '유효한 입력과 선행 상태가 준비됨',
    when,
    then: hasData
      ? `정상 완료(오류 없음) + 데이터 반영 확인: ${f.data.value}`
      : '정상 완료(오류 없음) + 응답/결과 확인',
    confidence: 'INFERRED',
    evidence,
    notes: [...baseNotes],
  })

  // 예외 — rules 의 exception AC(요구↔AC 추적선 보존). 없으면 일반형 1건.
  const exceptions = [...f.rules.filter((r) => r.kind === 'exception')].sort(
    (a, b) => cmp(a.acId, b.acId) || cmp(a.reqId, b.reqId),
  )
  if (exceptions.length > 0) {
    exceptions.forEach((r, i) => {
      out.push({
        id: `TS-${f.featureId}-E${i + 1}`,
        fnId: f.id,
        reqId: r.reqId,
        acId: r.acId,
        kind: 'exception',
        title: `${f.name} 예외 처리 ${i + 1}`,
        given: `예외 조건 성립: ${r.text}`,
        when,
        then: '오류를 안전하게 처리(비정상 종료·데이터 오염 없음) + AC 기준의 오류 응답 확인',
        confidence: 'INFERRED',
        evidence,
        notes: [...baseNotes],
      })
    })
  } else {
    out.push({
      id: `TS-${f.featureId}-E1`,
      fnId: f.id,
      reqId: null,
      acId: null,
      kind: 'exception',
      title: `${f.name} 예외 처리`,
      given: '필수 입력 누락 또는 부적합한 입력',
      when,
      then: '오류를 안전하게 처리(비정상 종료·데이터 오염 없음) + 명확한 오류 응답 확인',
      confidence: 'INFERRED',
      evidence,
      notes: [...baseNotes, '[미확인] 예외 AC 없음 — 일반형 초안(사람 보강)'],
    })
  }

  out.push({
    id: `TS-${f.featureId}-B1`,
    fnId: f.id,
    reqId: null,
    acId: null,
    kind: 'boundary',
    title: `${f.name} 경계 조건`,
    given: hasData
      ? `경계 데이터 상태(대상 0건·최대치): ${f.data.value}`
      : '경계 입력(빈 값·최대 길이·한계치)',
    when,
    then: '경계에서도 일관 동작(오류 없이 처리 또는 명확한 거부)',
    confidence: 'INFERRED',
    evidence,
    notes: hasData ? [...baseNotes] : [...baseNotes, '[미확인] 데이터 근거 없음 — 경계값은 사람 특정'],
  })

  return out
}

/** 전 기능 행의 시나리오 초안(순수·결정론 — 행 순서 × N→E→B). */
export function buildTestScenarios(model: RtmModel): RtmTestScenario[] {
  return (model.functions ?? []).flatMap(scenariosOf)
}

/**
 * 시나리오를 모델에 부착하고 coverage/diagnostics 재계산(understand-rtm 파이프라인:
 * applyRequirements 뒤·applyOverlay 앞 — rules(AC 역참조)가 채워진 뒤여야 예외 AC 시드 유효).
 */
export function attachTestScenarios(model: RtmModel): RtmModel {
  const withTs: RtmModel = { ...model, testScenarios: buildTestScenarios(model) }
  return { ...withTs, coverage: computeCoverage(withTs), diagnostics: computeDiagnostics(withTs) }
}
