# MVP 기획안 — Legacy AI 문서 자동화

> 상위 문서: [`01_전체기획안.md`](./01_전체기획안.md) · 발표 자료: [`03_MVP발표.md`](./03_MVP발표.md)

> 📌 **통합 모델(확정):** ktds는 U-A repo를 **fork**해 격리 확장(별도 plugin·`packages/legacy-core/*`)으로 올리고 **단일 Claude 플러그인 마켓플레이스**로 배포한다(npm/별도 CLI 아님). fork는 **upstream main 추종(follow-main)**, v2.7.3는 테스트 fixture 기준선. U-A `.understand-anything/knowledge-graph.json`(버전 필드 `version`)의 on-disk 계약을 kg-reader로 읽으며, golden snapshot은 **결정론 skeleton**만 대상(LLM prose 본문 제외)으로 한다. 승인자 실명/사번은 MVP 미저장, `outputLanguage`는 MVP **ko 단일**.

---

## 0. MVP 한 줄 목표

> **개방형(유형3 — Claude Code 기준선) 단일 경로에서, 비민감 샘플 프로젝트 2종(Java/Spring/MyBatis/Oracle)을 대상으로 — 근거 붙은 5종 문서를 자동 생성하고, DRAFT→APPROVED 검토·승인·감사 흐름까지 재현한다.**

MVP는 신기능을 넓히는 단계가 아니라, **제품 핵심 축이 실제로 동작하는지 검증**하는 단계다.

| 축 | MVP | 검증할 것 / 합격선 |
| --- | :---: | --- |
| ① 근거 기반 문서 자동화 | ✅ | 코드 근거로만 문서를 쓰는가 — `[확정(AI)]` 문장 95% 이상 파일 경로 근거 |
| ② 보안 게이트(데이터 보호) | ⏭ Phase 2 | MVP 검증 대상 아님. 실고객 적용 전 선행(§9) |
| ③ 신뢰성 체계(검토·승인·감사) | ✅ | 검토·승인·감사가 되는가 — DRAFT→APPROVED 전이 + 감사 로그 재현 |

> ⚠️ **MVP 운영 제약**: 보안 게이트가 없으므로 MVP는 **명시적으로 비민감한 샘플/픽스처 프로젝트에만** 실행한다. **실제 고객 코드에는 사용하지 않는다.** 고객 적용은 Phase 2(보안 게이트) 완료 후.

---

## 1. MVP 범위 컷라인

핵심 가설 검증에 필요한 기능만 포함한다. **필수 MVP**만 1차 릴리즈 완료 조건이며, 나머지는 MVP+ 또는 후속/Phase 2로 분리한다.

| 구분 | 포함 항목 | 완료 기준 |
| --- | --- | --- |
| **필수 MVP** | Claude Code 기준선, `/understand-init`, `/understand-docs`(5종+근거), 검토/승인/감사(DRAFT/UNDER_REVIEW/APPROVED/RETURNED), `/understand-export`(HTML) | 비민감 샘플 2종에서 `[확정(AI)]` 근거율 95% 이상, 승인 플로우 재현 |
| **MVP+** | `/understand-impact`, `/understand-history`, `/understand-custom-dashboard`, `/understand-export` PPT/Word 추가 포맷 | 필수 MVP 안정화 후 동일 fixture로 별도 acceptance test |
| **Phase 2 (보안·실고객)** | 보안 게이트 전체(입력 검사·출력 재검증·중계 검사), PII/secret 탐지, prompt injection 방어, Transfer Manifest, `/understand-security`, 유형1·2(폐쇄망/중계) | 실고객 적용 전 선행. secret/PII fixture 0건 유출 |
| **후속 제외** | 운영 DB 접속, 유형2 실제 중계 운영, API Gateway, API key direct adapter, 분산 락, COBOL/PB 확장 | 고객사 보안/계약/운영 책임 확정 후 별도 트랙 |

> **범위 축소 우선순위**: 일정/품질 리스크 발생 시 **MVP+ 후보부터 제외**한다. 필수 MVP의 **근거 스키마 · 검토/승인 흐름은 축소 대상이 아니다.**

### 1.1 명시적 비범위 (혼동 방지)

- 독립 실행 CLI 배포 — 각 AI CLI adapter로만 노출
- **보안 게이트 / 민감정보 마스킹 — Phase 2** (그래서 MVP는 비민감 샘플 한정)
- **유형1·2(폐쇄망/중계) 실제 동작 — Phase 2** (보안 게이트에 의존)
- API key 기반 LLM 직접 호출, 운영 DB 직접 접속, 자동 코드 수정 — 범위 밖

---

## 2. 대상 환경

MVP는 **유형3(개방형) 단일 경로**만 다룬다. 유형1·2는 보안 게이트에 의존하므로 Phase 2로 분리한다.

| 유형 | MVP | 비고 |
| --- | :---: | --- |
| **유형3 개방형 (기준선)** | ✅ 완전 구현 | 벤더 CLI(Claude Code)의 모델로 분석. 모든 품질 기준의 측정 대상 |
| 유형1 완전 로컬 | ⏭ Phase 2 | OpenCode + 로컬 LLM. 폐쇄망용 — 보안 게이트와 함께 도입 |
| 유형2 자사 중계 | ⏭ Phase 2 | MCP 중계 + 중계 검사 — 보안 게이트와 함께 도입 |

- ktds 패키지는 OAuth token/API key를 저장하지 않는다(전 단계 공통 원칙).
- MVP는 비민감 샘플만 다루므로, 외부 전송 데이터 마스킹(sanitized payload)은 Phase 2에서 추가된다.

---

## 3. MVP 기능 상세

### 3.1 `/understand-init` — 프로젝트 초기화

최초 1회 실행으로 프로젝트를 분석 가능 상태로 만든다.

```
/understand-init
  ├ VCS 환경 감지 (Git / SVN / 없음)
  ├ networkType 선택 (MVP 기본 3; 유형1·2는 Phase 2)
  ├ understanding.config.json 생성 (networkType, scan profile, 임계값)
  │   └ relay 블록·유형 선언 로직은 Phase 2 (상세 01 §9.1)
  ├ .spec/ 디렉터리 + 00_MASTER.md (문서 생성 규칙)
  └ docs/README.md 생성
```

**idempotent 재실행**: (기본) 기존 보존·신규만 / `--merge` 백업 후 병합 / `--force` 강제 덮어쓰기. 재실행은 `INIT_RERUN` 감사 기록.

산출물: `understanding.config.json`, `.spec/00_MASTER.md`, `.spec/templates/*.md`, `docs/README.md`.

### 3.2 `/understand-docs` — 근거 기반 5종 문서 생성

```
/understand-docs
  ├ .understand-anything/knowledge-graph.json 로드 (U-A /understand 산출, 버전 필드 version)
  ├ kg-reader 변환기 → ktds 표준 모델 (01 §2.2.1)
  ├ [라우팅] networkType=3 → host CLI(Claude) 벤더 모델로 분석
  ├ [병렬] 문서 생성 (staging 디렉터리에 기록)
  │   ├ 기술스택 / 아키텍처 / 기능명세 / API명세 / DB명세
  │   └ LLM 오류 시: staging 폐기 + RUN_ABORTED + lock 해제
  ├ 근거 스키마 검증 (CONFIRMED_AI에 evidence 없으면 RETURNED)
  ├ [추정] 비율 확인 (warn 0.3 / block 0.6 초과 시 RUN_ABORTED)
  ├ docs/**/*.md 저장 (DRAFT, staging → atomic publish)
  └ 감사 로그 기록

  // (Phase 2) 입력 검사·출력 재검증·Transfer Manifest가 이 흐름 앞뒤에 삽입된다
```

**5종 문서 + 최소 포함 항목**

| 문서 | 최소 포함 |
| --- | --- |
| `01_tech-stack.md` | 언어/프레임워크/빌드도구/런타임/주요 라이브러리 + 각 근거 |
| `02_architecture.md` | 레이어, 모듈, 의존 방향, 순환 의존 후보 |
| `03_feature-spec.md` | 업무 기능, 진입점, 처리 흐름, 관련 API/DB |
| `04_api-spec.md` | method/path/controller/handler/request/response/인증 추정 여부 |
| `05_db-spec.md` | table/view/column/key/index/mapper SQL 참조, DDL 부재 시 fallback 근거 |

**근거 계약** (모든 claim 필수)

```json
{
  "claim": "LoginController는 /login 요청을 처리한다.",
  "confidence": "CONFIRMED_AI",
  "evidence": [{ "path": "src/main/java/.../LoginController.java", "symbol": "login", "line": 42 }],
  "requires_human_review": false
}
```

| `confidence` | 태그 | 의미 |
| --- | --- | --- |
| `CONFIRMED_AI` | `[확정(AI)]` | 코드에서 직접 확인 (evidence 최소 1개 필수) |
| `CONFIRMED_HUMAN` | `[확정(담당자)]` | 담당자 확정 |
| `INFERRED` | `[추정]` | 추론 기반, 검토 권장 |
| `NEEDS_REVIEW` | `[확인 필요]` | 동적 코드 등 자동 판단 불가 |

`CONFIRMED_AI`인데 evidence가 없으면 저장 중단 → `RETURNED`. (산출물 secret/PII 재검증은 Phase 2)

**대용량 파일**: 파일 라인 수 기준 <500줄 단일 / 500~2,000줄 AST 경계 분할(오버랩 20줄) / >2,000줄 구조 요약만 + `[확인 필요]`. (Phase 2에서 sanitized payload 기준으로 전환)

### 3.3 검토/승인/감사

```
DRAFT ──► UNDER_REVIEW ──► APPROVED
  ▲            │
  └─ RETURNED ◄┘
```

```
/understand-docs review --list                       # DRAFT 목록 + [추정]/[확인 필요] 수
/understand-docs review --doc 04_api-spec.md          # [추정] 인터랙티브 확정 → [확정(이름)], DRAFT→UNDER_REVIEW
/understand-docs approve --doc 04_api-spec.md --by "홍길동"  # UNDER_REVIEW→APPROVED, approvals.json 기록
/understand-docs audit --list | --date <d> | --export outputs/
```

감사 로그(`.spec/audit/YYYY-MM-DD.jsonl`) 기록 이벤트: `LLM_REQUEST`, `DOC_GENERATED`, `DOC_ITEM_CONFIRMED`, `DOC_APPROVED`, `RUN_ABORTED`, `INIT_RERUN`, `STALE_LOCK_REMOVED`. (보안 관련 이벤트 `SECURITY_CLASSIFY`/`TRANSFER_MANIFEST_CREATED`/`SENSITIVITY_DOWNGRADE`/`NETWORK_TYPE_CHANGED`는 Phase 2)

### 3.4 `/understand-export` — HTML 내보내기

```
/understand-export            # HTML 생성 (기본값)
```

- 독립 실행 — CDN 없음(JS/CSS 인라인 번들, 폐쇄망 배포 가능), 카테고리별 사이드바 TOC
- PPT/Word 등 추가 포맷은 MVP+. export 결과물 output 재검증은 Phase 2.

### 3.5 동시 실행·복구 안전장치

- 분석 시작 시 `.spec/.analysis.lock`(PID·시각) 생성, 완료/실패 시 삭제. stale lock은 PID 생존 확인 후 제거 + 경고 + 감사.
- 산출물은 `.spec/runs/{run_id}/staging/`에 먼저 쓰고, 검증 통과 후 atomic publish. 중간 실패 시 기존 산출물 불변.
- **MVP lock은 단일 워크스테이션/단일 파일시스템 전용.**

---

## 4. AI CLI Adapter

"별도 CLI를 만들지 않는다"는 원칙을 위해 모든 기능은 공통 패키지(`packages/legacy-core/*`)를 호출하고, 사용자에게는 각 AI CLI의 skill/plugin 명령으로만 노출한다. (ktds는 U-A fork의 격리 plugin으로 배포됨 — 본문 상단 통합 모델 참조)

| 계약 | MVP 필수 조건 |
| --- | --- |
| 공통 엔진 | 모든 기능은 `packages/legacy-core/*` 공통 패키지 호출, CLI는 입력 파싱·모델 호출·결과 표시만 |
| 인증 보관 | OAuth token/API key 미저장, host CLI의 기존 인증 세션만 호출 |
| 감사 로그 | 실행 시작/종료, provider, network_type, 오류 코드 기록 |
| 실패 시 | LLM 오류·근거 검증 실패 시 저장 중단 → `RETURNED`/`RUN_ABORTED` |

> **Phase 2에서 추가되는 보안 계약**: 파일은 Security Gate API만 경유(직접 read 금지), `--raw`/`--no-security` 우회 옵션 금지, LLM에는 sanitized payload만 전달.

---

## 5. MVP 성공 기준

| 기준 | 목표 |
| --- | --- |
| 샘플 프로젝트 | **비민감** Java/Spring/MyBatis/Oracle SQL 샘플 2개 이상 분석 |
| 문서 근거율 | `[확정(AI)]` 문장 95% 이상 파일 경로 근거 포함 |
| 성능 | 아래 분리 측정 (PoC 목표) |
| · static 분석 | 50K LOC 1분 이내 |
| · LLM generation(5종) | 50K LOC 3분 이내 |
| · E2E(init~저장) | 50K LOC 5분 / 200K LOC 20분 이내 |
| · incremental(변경 10파일) | 1분 이내 |
| 재실행 | 변경 없는 2회 연속 실행 시 **skeleton diff=0** (uid/근거/태그/구조; LLM prose 본문 제외) |
| 승인 흐름 | DRAFT/UNDER_REVIEW/APPROVED 전이 + 감사 로그 재현 |

> 민감정보 0건·security gate 성능 등 보안 기준은 Phase 2 성공 기준(01 §12.1)으로 측정한다.

---

## 6. 테스트 계획

| 테스트 | 대상 | 기준 |
| --- | --- | --- |
| Unit | evidence validator, DocStateMachine, kg-reader 변환 | 주요 분기 80% 이상 |
| Golden snapshot | kg-reader 변환 + 문서 **결정론 skeleton**(uid/근거/태그/구조) | skeleton diff=0 (LLM prose 본문은 근거율·태그로 검증, diff 제외) |
| Integration | init / docs / export E2E | 샘플 프로젝트 end-to-end 통과 |
| Adapter smoke | Claude, Codex, Antigravity/Gemini, OpenCode | 설치/명령/결과 파일 생성 |
| Performance | 50K/200K LOC fixture | §5 목표 측정 |
| Offline | fork clone + `/plugin` 설치 (내부 저장소) | 외부 CDN/API 의존 없이 설치 |

> Security regression / prompt injection 테스트는 Phase 2 테스트 계획(01 §6.8, §12)으로 이관.

---

## 7. MVP 릴리즈 게이트 (전부 충족)

- U-A 원본 수정 없음(있으면 ADR + merge 영향 분석)
- U-A schema fixture + `kg-reader` golden snapshot 통과
- `[확정(AI)]` 근거 누락 5% 이하, 전 문서 신뢰도 태그·근거 표기
- DRAFT/UNDER_REVIEW/APPROVED/RETURNED 전이 테스트 통과
- 50K LOC 성능 게이트 통과 또는 병목/완화계획 release note 기록
- Claude 기준선 성공, Codex/Antigravity/OpenCode smoke 기록
- HTML export 동작
- 설치 가이드·운영자 매뉴얼·장애 대응 가이드 초안 검토 완료

> 보안 항목(secret/PII 0건, prompt injection, adapter 보안 계약 negative test, 하향 override 만료)은 **Phase 2 릴리즈 게이트**(01 §12.2)로 적용한다.

---

## 8. MVP 일정

| 단계 | 기간(2026) | 영업일 | 산출물 | 완료 기준 |
| --- | --- | --- | --- | --- |
| 1. fork 셋업 + Core 골격 | 06-08 ~ 06-19 | 10 | U-A fork·`packages/legacy-core/*`, config schema, kg-reader/evidence mapper, UA_BASELINE | U-A 코드 무수정(매니페스트 additive)·빌드/테스트 |
| 2. 문서 생성 MVP | 06-22 ~ 07-03 | 10 | doc generator, templates, evidence validator | 근거율/태그 충족 |
| 3. 검토/승인/감사 | 07-06 ~ 07-17 | 10 | DocStateMachine, ApprovalWorkflow, audit | DRAFT→APPROVED 재현 |
| 4. Export/안정화 | 07-20 ~ 07-28 | 7 | HTML export, perf/smoke report | export 동작, 성능 게이트 통과 |
| 5. 매뉴얼/검토 | 07-29 ~ 08-05 | 6 | 설치/운영/장애 대응 매뉴얼 | 운영자 관점 검토 완료 |
| (MVP+) 영향도/이력 | 별도 | — | `/understand-impact`, `/understand-history` | 필수 MVP 안정화 후 |
| (Phase 2) 보안 게이트 | MVP 후 | 15 | 입력/출력/중계 검사, PII/secret 탐지, injection, manifest | secret/PII fixture 0건 |

> Discovery(05-25~06-05)는 완료 전제. 일정 리스크 시 MVP+부터 축소한다.

---

## 9. MVP 이후

| 트랙 | 항목 |
| --- | --- |
| **MVP+** | `/understand-impact`(변경 영향도), `/understand-history`(버전 이력), `/understand-custom-dashboard`, `/understand-export` PPT/Word 추가 포맷 |
| **Phase 2 (보안·실고객)** | 보안 게이트 전체(입력·출력·중계 검사), PII/secret 탐지, prompt injection 방어, Transfer Manifest, 유형1·2(폐쇄망/중계), 보안 심의 패키지 — **실고객 적용 전 선행** |
| **후속** | 유형2 실제 중계 운영, API Gateway, 운영 DB 메타데이터, COBOL/PB 등 레거시 확장, 분산 락, LSP/codegraph 심볼 보강 |

---

> 미해결 결정 사항(임계값 기본값, 보안 오류 공개 수준 등)은 [`01_전체기획안.md` §14](./01_전체기획안.md) 참조.
