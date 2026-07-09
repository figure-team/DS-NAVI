import type { DocInput } from '../builders/index.js';
import type { GeneratedDoc } from '../types.js';
import type { MethodologyModule } from './types.js';
/**
 * si-기능명세서 — 도메인별 섹션. 각 도메인 노드 1개 = 표 1행(§3.2).
 * 설명=summary, 진입점=domainMeta.entryPoint, 업무규칙=domainMeta.businessRules.
 * 관련 API/테이블은 현 그래프 모델에 도메인↔라우트/테이블 연결 종류가 없어 `[추정]`
 * (합성 금지, grounding 보존). 컬럼 enrichment 는 P6 확장 지점.
 */
declare function buildSiFeatureSpec(input: DocInput): GeneratedDoc;
/**
 * si-프로그램목록(W3) — program-inventory.json 승계.
 * §1 프로그램 목록: 파일·유형·계층·LOC 는 결정론 사실 → CONFIRMED(filePath:1 근거).
 *   업무명은 정적 분석 불가 — [미확인] 사람 채움(W2 교훈: 생략 대신 표면화).
 * §2 규모산정(FP) 기초: 후보 구분(EI/EQ/ILF/EIF)은 method/출처 기반 잠정 → 셀에 [추정].
 *   집계 행(잠정 FP)은 간이법 평균복잡도 미조정치 — 범례에 가중치·EO 재분류 안내.
 */
declare function buildSiProgramList(input: DocInput): GeneratedDoc;
/**
 * si-배치정의서(W2) — batch-jobs.json 승계. 탐지·스케줄·핸들러·도달범위는 결정론 사실
 * → CONFIRMED(evidence file:line). 배치명은 초안 [추정](사람이 업무명으로 교체).
 * 운영 축 4열(데이터대상·선행/후행·수행서버·재기동)은 정적 분석 불가 — [미확인]으로
 * 표면화해 사람이 운영 지식으로 채운다(생략하면 그 필드가 기대된다는 것조차 안 보인다).
 * '해석' = 잡 구현 파일 해석 여부(해석됨/[미확인]) — shell/crontab 은 프로젝트 밖이라 '외부'.
 * 도달범위는 미해석 행에서 [미확인](루트=XML 인 카운트 1 이 "사소한 배치"로 오독되는 것 방지).
 */
declare function buildSiBatchSpec(input: DocInput): GeneratedDoc;
declare function buildSiInterfaceSpec(input: DocInput): GeneratedDoc;
declare function buildSiTableSpec(input: DocInput): GeneratedDoc;
/**
 * si-위험모듈리포트(W4) — risk-report.json 승계.
 * §1 산정 기준: 지표 정의·가중치·정규화/등급 규칙(방법론 서술 — INFERRED, 근거 없음).
 * §2 위험 Top N: 전 지표 측정 행만 CONFIRMED, 미측정 지표 포함 행은 INFERRED(설계 §5,
 *   리뷰 C4). 미측정 셀은 [미확인]. 점수는 백분위 가중 합산 — **프로젝트 내 상대
 *   순위**이지 절대 품질 판정이 아님(§1 에 명시, 오독 방지). 미도달은 비점수 플래그.
 * §3 지표 커버리지: 측정/미측정(언어별 분해)·무분산·등급 분포·제외 카운트 표면화
 *   (침묵 누락 금지, W3 대칭 + 리뷰 C1/C2/C8).
 * 행 단위 사람 재분류(override 원장)는 범위 외 — 문서 편집·확정(D3)으로 커버, 백로그.
 */
declare function buildSiRiskReport(input: DocInput): GeneratedDoc;
/**
 * si-단위테스트시나리오(W5) — rtm.json testScenarios[] 승계(결정론 템플릿 생성 초안).
 * §1 작성 기준: 종류별 생성 규칙 + 초안/확정 지위 + TestRef(수행 기록) 연결 안내(INFERRED).
 * §2 원장: 시나리오 confidence 그대로 승계(초안 INFERRED [추정] / 대시보드 확정 CONFIRMED),
 *   근거는 원천 셀 evidence 승계분. 미확정 셀 텍스트에 상태 표기(오독 방지).
 * §3 커버리지: 종류별/확정/축소 생성([미확인] 노트 보유) 카운트 표면화.
 */
declare function buildSiTestScenarios(input: DocInput): GeneratedDoc;
/**
 * si-실적요약보고서(W6) — work-summary.json 승계(결정론 수집·집계).
 * §1 하이라이트: 수집 수치를 고정 문형에 끼운 사람 말 요약 — LLM 산문 불개입(날조 0 의
 *   구조적 보장). 수치 재배열 서술이라 INFERRED 로 두되 원천 표(§3~§5)가 확정을 진다.
 * §3 커밋 이력: 파일 근거 보유 행 CONFIRMED(변경 파일 상위 3개 승계), 머지 등 파일
 *   근거 없는 행은 INFERRED(file:line 근거 체계의 한계 — §2 명기, 날조 대신 강등).
 * §4 모듈: 집계 행(단일 file:line 없음) — inventory 조인은 도메인 근거, dir 폴백은 [추정].
 * §5 진척: 원장 파일 자체를 근거로 승계(수치의 원천). 원장 없음/기간 축 없음(range)은
 *   [미확인] — 0(이벤트 없음)과 구분.
 */
declare function buildSiWorkSummary(input: DocInput): GeneratedDoc;
export { buildSiFeatureSpec, buildSiInterfaceSpec, buildSiTableSpec, buildSiBatchSpec, buildSiProgramList, buildSiRiskReport, buildSiTestScenarios, buildSiWorkSummary };
/** si-standard 모듈 — SI 정형 문서를 docId 순서로 산출(기능 → 인터페이스 → 테이블 → 배치 → 프로그램 → 위험 → 시나리오 → 실적). */
export declare const siStandardMethodology: MethodologyModule;
//# sourceMappingURL=si-standard.d.ts.map