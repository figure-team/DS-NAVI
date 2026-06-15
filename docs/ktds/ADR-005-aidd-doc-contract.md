# ADR-005: AIDD 문서 계약 — 방법론 플러그형 참조/작업 2프로파일

- 상태: **Accepted** (설계 확정) — 방법론 검토(BMad-Method 외 4종) + impact 위임구현 기능 전제 + SI 감리 정합 후, **방법론 교체 가능한 AIDD 문서 계약**으로 설계. 작성·확정 2026-06-15. 단 구현 범위는 아래 스코프 구분을 따른다(프로파일 W/D5/D6은 신설 기능 착수 시 구현).
- **스코프 구분 (2026-06-15 사용자 지시):** 근시일 = **공통 계약 + 프로파일 R(`/understand-docs` 참조 샤드) + 방법론 모듈 시스템(Layer 1·2, D1~D4, D7, §2-A)**. **보류 = AIDD 위임구현 기능 = 프로파일 W(변경 스토리) + 위임구현 게이트(D5) + 출처 기반 근거 게이트(D6) + 출처 각인·STALE 게이트·W 생성 위치(D8)** — 신설 기능 착수 시점에 진행. 본 ADR은 보류분의 설계 기록을 미리 확정해 둔다(통일 계약이 R/W를 함께 규정해야 일관되므로).
- 관련: ADR-001(도메인/흐름/step 원천), ADR-002(/understand-impact — 영향 결정론·근거검증·컨텍스트 선별), ADR-004(위키 샤딩 = 본 ADR의 referenceProfile 원형), `SKILL.md`(근거·태그·검토/승인 계약)

---

## 1. 배경 (Context)

### 1.1 진짜 동기 — impact 위에 "AI 위임구현" 기능

`/understand-impact`는 변경 영향도를 결정론으로 산출한다(ADR-002). 그 위에 **신설 기능**: 변경요청 + 영향분석을 받아 **AI 에이전트가 실제 코드를 구현**한다(AIDD = AI-Driven Development). AI가 정확히 구현하려면 **구현 컨텍스트로 쓸 수 있는 문서**가 필요한데, 그 문서가 기존 `/understand-docs` 산출물과 구조가 다르면 안 된다 → **하나의 계약으로 통일**해야 한다.

### 1.2 BMad 매핑 — 우리가 이미 BMad 골격을 갖고 있다

[BMad-Method](https://github.com/bmad-code-org/bmad-method)(46.7k★)는 forward SDD지만, 그 **다운스트림 소비자가 AI dev 에이전트**라는 점에서 우리와 정확히 대응한다:

| BMad | KT DS 도구 | 역할 |
|---|---|---|
| Architecture doc (sharded) | `/understand-docs` (as-built 참조) | AI가 로드하는 컨텍스트 원천 |
| `shard` (epic별 분할) | 위키 4계층 샤드(domain/flow/endpoint/table, ADR-004) | 컨텍스트 윈도우 최적화 — **이미 보유** |
| Story (`{epic}.{story}.title.story.md`, ~8k토큰 자기완결) | 신설 AIDD 기능 산출(변경 스토리) | AI가 구현하는 작업 명세 |
| Scrum Master(스토리 생성) | `/understand-impact` | 변경→컨텍스트 선별. **BMad는 수동, 우리는 결정론+근거검증** |
| Dev agent | 신설 위임구현 기능 | 스토리 읽고 코드 생성 |

BMad story 섹션: Status · Story statement · Acceptance Criteria(번호) · Tasks/Subtasks(`(AC:#)` 연결) · Dev Notes(임베드 아키텍처 컨텍스트) · Testing · Source citations · Dependency map · Dev Agent Record · Change Log · File List.

### 1.3 핵심 통찰 — "통일"은 단일 문서가 아니라 단일 계약

BMad도 architecture(참조)와 story(작업)를 **하나로 만들지 않는다** — 역할이 다르되 **같은 규약**을 공유한다. 또한 PL 요구는 "방법론을 모듈처럼 교체 가능하게"다. 따라서:

- **통일 = 하나의 공통 계약**(frontmatter·근거·신뢰도태그·섹션 문법)을 **두 프로파일(참조 R / 작업 W)이 공유**.
- **방법론은 교체 가능한 모듈** — BMad를 기본으로 쓰되 Spec Kit·SI-표준·커스텀으로 갈아끼울 수 있어야 한다.

---

## 2. 결정 (Decision) — 3계층 + 2프로파일

```
CanonicalGraph + impact
   │  ── Layer 1: 불변 코어 (방법론 무관, KT DS 영속 자산)
   ▼
[ AIDD IR — 방법론 중립 중간표현 ]
   ▼  ── Layer 2: 방법론 모듈 (config로 선택, swap 가능 / 기본=bmad)
[ MethodologyModule.render(IR) ]  ──swap──▶  speckit · si-standard · custom
   ▼  ── Layer 3: 산출 (둘 다 SI 감리 frontmatter 탑재)
참조 샤드(R)  +  변경 스토리(W)
```

### D1 — Layer 1 불변 코어 (방법론 교체해도 보존)

방법론과 무관하게 **항상** 보장되는 KT DS 영속 계약:

- 근거(`파일:라인`) + 기계검증(경로실존→라인→텍스트일치) · 신뢰도 4태그(`[확정(AI)]/[확정(담당자)]/[추정]/[확인 필요]`)
- impact 결정론 컨텍스트 선별(ADR-002) · 결정론 경계(skeleton=엔진 / prose=host)
- doc-state 상태기계 · 감사 로그
- **SI 감리 필수 frontmatter** — `산출물ID`·`개발단계`·`표준근거`·`RTM연계`. 방법론 선택과 무관한 **KT DS 납품/감리 비즈니스 요구**라 모든 산출물에 항상 붙는다(이전 "하이브리드(SI매핑+RTM)" 결정이 여기로 승격).

### D2 — Layer 1.5 AIDD IR (방법론 중립 중간표현)

불변 코어가 산출하는 **방법론-중립 사실 모델**. 모든 방법론 모듈은 이 IR만 입력받는다(그래프·impact 직접 접근 금지 → 모듈은 순수 렌더러).

- **ReferenceIR**(단위별: domain/flow/endpoint/table): `{ 계약(시그니처/스키마), 불변식, 의존(상류/하류+근거), 변경주의(hazards), 근거, 신뢰도, 관계([[링크]]) }` — 전부 그래프+impact 엔진에서 역산.
- **WorkIR**(변경당): `{ 변경범위, 영향집합(impact: 상류/API/DB/흐름+근거율), 인수후보, 컨텍스트단위(impact 선별 R샤드 참조), 대상파일(시드∪상류), 변경주의 }`.

### D3 — Layer 2 방법론 모듈 (교체 가능, 기본 = bmad)

`understanding.config.json`에 `methodology: "bmad"`(기본) 추가. 모듈은 IR → 마크다운 **순수 렌더러**로, 다음만 정의한다:

```ts
interface MethodologyModule {
  id: "bmad" | "speckit" | "si-standard" | string;
  referenceProfile: ProfileSpec;  // 참조 샤드: 섹션문법·샤딩입도·네이밍·배치
  workProfile: ProfileSpec;       // 작업 스토리: 섹션문법·AC↔Task규약·네이밍
  renderReference(ir: ReferenceIR): MarkdownDoc;
  renderWork(ir: WorkIR): MarkdownDoc;
  // 코어가 강제하는 불변(근거 cite·신뢰도 태그·SI frontmatter·결정론 경계)은
  // 모듈이 우회·제거 불가 — 모듈은 본문 모양만 결정한다.
}
```

모듈이 **정하는 것**: 섹션 순서/헤딩, 본문 문법, 샤딩 입도, AC·Task 연결 규약, 파일명/배치, 산문 스타일.
모듈이 **못 바꾸는 것(코어 강제)**: 근거 검증, 신뢰도 4태그, SI frontmatter, doc-state 게이트, 결정론 경계.

### D4 — Layer 3 두 프로파일 산출

**프로파일 R — 참조 샤드** (`/understand-docs`, as-built). 현재 위키 샤드 + AIDD 컨텍스트 4필드(계약·불변식·의존·변경주의). dev 에이전트가 로드하는 컨텍스트.

**프로파일 W — 변경 스토리** (신설 기능, 변경당 1건). `변경요청(NL) + impact + 선별 R샤드`로 생성. BMad 모듈 기준 본문:
- 변경 개요 · 인수기준(AC, 번호·테스트가능·태그) · 작업항목(각 `(AC:#)`) · 컨텍스트(impact 선별 R샤드 임베드) · 영향범위(impact 산출) · 변경주의/리스크 · 테스트기준 · 구현기록(Dev Agent Record, 구현시 채움) · 추적/감사(RTM·승인자)
- frontmatter: `스토리ID·SR연계·상태·영향근거(impact.json)·대상파일·근거율` + D1 SI 필수필드.

### D5 — 위임구현 게이트 (사용자 확정)

변경 스토리는 **읽기전용이 아니라 doc-state 상태기계에 편입**된다(impact 분석물과 다른 점):

```
DRAFT  →  (사람) APPROVED  →  AI 구현(구현중)  →  완료
```

AI 에이전트는 **APPROVED 이후에만** 코드를 생성한다. 감리·레거시 맥락에서 미승인 변경이 코드에 선반영되지 않도록 사람 승인을 강제(승인자=핸들/이니셜, 감사 기록). 기존 doc-state·approval·audit 그대로 재사용.

### D6 — 변경 스토리 근거 게이트 = 출처 기반(provenance-aware) (사용자 확정)

변경 스토리는 **AI가 실제 코드를 구현**하므로 정확도 민감도가 최고다. 5종의 전역 근거율(block 0.6)도, impact의 측정-only도 그대로 안 맞는다 — 주장 출처가 이질적이기 때문. 따라서 **출처별로 다른 게이트**를 적용한다:

| 주장 부류 | 게이트 | 근거 |
|---|---|---|
| **구현-임계** (대상파일·컨텍스트 단위 계약·보존 불변식) | **건별 이진 하드차단** — 근거 있음 **또는** 사람 확인 없으면 승인 차단(fail-closed) | AI가 검증된 사실만 보고 코딩 보장. "91% 검증"도 9%를 눈감고 코딩 → 비율 아닌 건별 |
| **추정** (영향범위 blast radius·hazards) | **측정·표면화만**(impact 정책) | 추정은 정당(역도달성). 승인자가 위험 표면 인지 후 책임 인수 |
| **사람 저작** (변경 의도·인수기준) | 사람 저작 + D5 승인 게이트 | 미래 상태 의도 — 근거율 무의미 |

흐름: 엔진이 구현-임계 미검증 주장 하드차단 → 추정 위험표면을 승인자에게 제시 → 사람이 APPROVED로 책임 인수 → 그 후에만 AI 구현(D5). `--force` 우회는 기존 approve와 동일하게 감사에 `forced` 표기. 이는 5종 비율 모델의 **개선**이다 — 구현-임계는 비율보다 강하게(건별), 추정은 약하게(측정만), 0.6 중간값을 출처 기반으로 대체.

### D7 — 정직한 경계 (pluggability 한계)

모듈은 **문서의 모양**을 바꾸지 **사용 가능한 사실의 양**을 늘리지 않는다 — 사실은 그래프+impact 역산 범위로 한정. forward 전용 산출물(시장 PRFAQ·의도 기반 PRD 등 코드에서 역산 불가)을 요구하는 방법론은 완전 충족 불가. 모듈 시스템은 **IR 위에 표현 가능한 방법론 집합**(BMad·Spec Kit·SI-표준·커스텀) 안에서 교체된다.

### D8 — 출처 각인 + 신선도(STALE) 게이트 + W 생성 위치 (사용자 확정)

변경 스토리(W)는 impact 분석 시점(T1)·스토리 생성 시점(T2)·구현 시점(T3)이 벌어지면 **시간 skew로 코드와 어긋날 수 있다.** "동시 생성"으로는 T1→T2만 막고 T2→T3(승인 지연 후 구현)은 못 막는다. 따라서 타이밍이 아니라 **출처 각인 + 소비 시점 재검증**으로 보증한다(version+fingerprint 가드·git commit 앵커·결정론 재생성 재사용):

1. **출처 각인:** W frontmatter `생성근거`를 확장 — `map fingerprint + git commit + graph version`을 스탬프. 스토리가 "어느 코드 상태에서 만들어졌는지" 박힌다.
2. **스토리 생성 = 항상 신선한 impact 위에서:** 스토리 생성 시 impact를 그 자리에서 재검증/재실행해 둘이 **한 스냅샷 공유** → T1→T2 skew 구조적 제거("분석 따로, 한참 뒤 스토리 따로" 불가).
3. **구현 시점 STALE 게이트:** AI 구현 직전, 스토리 스탬프를 **현재 코드 상태와 대조**(`/understand-review`의 "git diff vs 마지막 map 스캔 commit" 앵커 재사용). 드리프트 → 스토리 **STALE + 구현 차단(fail-closed) + 재생성 요구** → T2→T3 skew 제거.

**W 생성 위치 (locus) = 구현 커맨드 (Option A, 신선도 조건부):** `/understand-impact`는 읽기전용 분석물로 유지(ADR-002 계약 불변 — 영향만 보려는 경우 스토리 노이즈 없음). **구현 커맨드의 1단계 = impact 신선도 재검증 + 스토리(W, DRAFT) 생성** → 사람 승인(D5) → AI 구현(D6 게이트 + 위 STALE 게이트) → 완료. "스토리는 항상 신선한 impact 위에서만 생성"이 강제되므로 분석↔스토리↔구현 불일치가 설계로 차단된다. (impact가 둘 다 생성하는 대안도 STALE 게이트가 진짜 보증이라 가능하나, 읽기전용 계약 보존 위해 A 채택.)

---

## 2-A. Layer 2 상세 — 방법론 모듈 시스템 (선언형 전용)

> 사용자 모듈 저작 형식 = **선언형 전용**(데이터, 코드 실행 없음) 확정. 근거: 결정론·근거검증·골든스냅샷 보존, 불변 코어 우회 불가, 보안, 저작 난이도(↓). 내장 모듈도 동일 선언형으로 표현(복잡 시 코드 escape는 Phase 2 후보, §6).

### A1. 교체 메커니즘 (registry + config)

```
understanding.config.json → { "methodology": "bmad" }   # 이 한 줄로 교체

해석 순서(resolution):
  1. 사용자 모듈   .spec/methodologies/<id>/manifest.yaml   (있으면 우선 = override)
  2. 내장 모듈     legacy-core 동봉 (bmad 기본, si-standard/speckit 후속)
  3. 미발견 → fail-closed: "methodology '<id>' 없음. 사용 가능: …" 출력 후 중단
```

- **레지스트리:** 부팅 시 내장 + 사용자 디렉터리 스캔 → `id→ModuleSpec`. 같은 id면 사용자 것이 내장 override(커스터마이즈 경로).
- **검증 게이트:** 로드 시 manifest zod 검증 + 필수 바인딩 존재 확인. 깨지면 그 모듈로 생성 **중단**(조용한 폴백 금지 — 프로젝트 규율).
- **결정론:** 모듈은 IR만 입력받는 순수 렌더러 → 같은 IR+모듈 = byte-diff=0. **모듈별 골든 스냅샷**.

### A2. 엔진 소유 vs 모듈 소유 경계

| 영역 | 엔진 소유(모듈 불가침) | 모듈 소유(사용자 정의) |
|---|---|---|
| frontmatter | SI 필수필드·상태·근거율·추정비율·생성근거 | **추가** 필드(superset) |
| 근거 | `파일:라인` 렌더 + 기계검증 | (관여 불가) |
| 신뢰도 | 4태그 어휘 + "모든 사실주장에 태그" 규칙 | (관여 불가) |
| 재흡수 | `<!-- claims -->` 펜스 | (관여 불가) |
| doc-state | DRAFT→승인→구현→완료 | (관여 불가) |
| 본문 | — | 섹션 목록·순서·헤딩 |
| 샤딩 | — | 입도(어느 IR 단위를 별 파일로) |
| 배치 | — | 파일명·디렉터리 |
| 연결규약 | — | AC↔Task 표기(`(AC:#)` 등) |
| 매핑 | — | 어느 IR 필드를 어느 섹션에 |

### A3. manifest 스키마 (사용자가 넣는 것)

`.spec/methodologies/<id>/manifest.yaml` 하나(+선택 템플릿 조각):

1. **메타:** `id`, `displayName`, `contractVersion`, `extends?`(내장 상속)
2. **프로파일 R/W 각각:** `frontmatterExtra?` · `sharding`(R: unit kind→별 파일/입도) · `fileName`(패턴) · `sections[]`: `{ key, heading, bind(IR 바인딩), template, required? }`
3. **locale?**(헤딩/라벨 다국어)

**넣을 수 없는(=넣을 필요 없는) 것:** 근거 추출·태그 로직·검증·상태기계 — 전부 엔진 주입. 사용자는 **본문 모양만**.

### A4. 템플릿 바인딩 (= IR 데이터 사전)

```
ReferenceIR(unit): kind, name, contract, invariants[],
                   dependencies.upstream[]/downstream[], hazards[], relations[]
WorkIR:           changeScope, impact.{upstream,api,db,flow,evidenceRatio},
                   acceptance[], contextUnits[], targetFiles[], hazards[]
엔진 빌트인:       {{cite x}}(근거+검증)  {{tag x}}(신뢰도)  {{claimsFence}}
```
제한 템플릿 언어(결정론·안전): 컬렉션 순회(`{{#each}}`)·필드 보간·존재 조건부만. 임의 로직 없음. `{{cite}}`/`{{tag}}`/`{{claimsFence}}`는 엔진 빌트인이라 모듈이 우회 불가 → 불변 코어 강제.

### A5. 최소 커스텀 모듈 예시 (bmad 상속 → 변경분만)

```yaml
# .spec/methodologies/si-light/manifest.yaml
id: si-light
displayName: "SI 경량 (BMad 본문 + SI 명칭)"
contractVersion: 1
extends: bmad          # bmad 전부 상속, 아래만 override
work:
  fileName: "{산출물ID}_변경명세_{slug}.md"
  sections:
    - key: acceptance
      heading: "검사 기준"          # bmad "인수기준" → SI "검사 기준"
      bind: acceptance
      template: |
        {{#each acceptance as ac}}
        {{ac.index}}. {{ac.text}} {{tag ac.confidence}}
        {{/each}}
    # 나머지 섹션은 bmad 그대로 상속
```
`methodology: "si-light"`로 바꾸면 같은 IR·근거·승인 흐름 위에서 명칭/파일명만 다르게 렌더. **상속(extends) 덕에 사용자는 바꿀 것만** 작성.

### A6. 검증·결정론·버전

- **manifest 검증:** zod 스키마 + 모든 `bind`가 IR 바인딩에 실존 + required 섹션 누락 없음 → 위반 시 fail-closed.
- **골든:** 내장·사용자 모듈 각각 IR 픽스처 → 산출 골든 스냅샷(byte-diff=0)으로 회귀 방어.
- **버전:** `contractVersion`을 엔진 지원 범위와 대조. 불일치 시 경고 + 중단(스키마 드리프트 방지, fingerprint 가드와 동일 철학).

---

## 3. 통일 이득 (Consequences — 얻는 것)

- **한 문법 → 한 렌더러(`doc-generator` 확장)·한 검증(`verify.ts`)·한 상태기계.** dev 에이전트가 R/W를 동일하게 소비.
- **BMad보다 나은 컨텍스트 선별:** BMad SM은 사람이 수동 큐레이션하나, 우리는 impact가 영향 R샤드를 **결정론+근거검증**으로 선별 → 환각 없는 self-contained 스토리.
- **방법론 락인 회피:** "더 좋은 방법론" 논쟁을 아키텍처로 해소 — 갈아끼우면 됨. BMad 지금, SI-표준/Spec Kit/커스텀 나중.
- **감리·AIDD 양립:** 본문은 방법론(AIDD-ready), frontmatter는 SI 감리(산출물ID·RTM) — 동시 충족.

## 4. 감수/불변

- **감수:** 모듈 추상화 1겹 추가(IR 경계) → 초기 설계비용. 단 R프로파일은 ADR-004 위키 샤드가 원형이라 증분 작다.
- **불변:** `/understand`(U-A 4종)·`/understand-map`·`/understand-impact` 산출물 계약 — 본 ADR은 그 위에서 소비/렌더만. U-A 원본 무수정 유지.

## 5. 기각 대안

| 대안 | 기각 사유 |
|---|---|
| 단일 템플릿(참조=작업 한 문서) | as-built 참조(1회 생성)와 변경당 작업(건별)이 역할 충돌. BMad도 architecture/story 분리 |
| 어댑터 분리(understand-docs 불변 + 구현시 변환) | 두 문서가 여전히 다른 형식 → "통일" 요구와 모순 |
| 방법론 하드코딩(BMad 고정) | PL의 "모듈 교체" 요구 위배. 방법론 락인 |
| 모듈이 그래프/impact 직접 접근 | 모듈마다 결정론·근거검증 재구현 → 드리프트. IR 경계로 순수 렌더러 강제 |
| 변경 스토리를 읽기전용(impact처럼) | AI가 미승인 변경을 구현 → 감리 위반. doc-state 승인 게이트 필수(D5) |

## 6. 미결 (Open Questions)

1. `ProfileSpec`을 선언적(스키마+템플릿)으로 둘지, 코드 렌더러로 둘지 — 기본 bmad는 코드, 선언형은 커스텀 모듈 용이성 위해 Phase 2 평가.
2. SI-표준을 별도 모듈로 제공할지, D1 frontmatter overlay로 충분한지 — 화면정의서 등 본문 형태가 필요해지면 모듈로 승격.
3. 구현기록(Dev Agent Record) ↔ `/understand-review` 실측 채널 연계 — 구현 완료 후 영향 대조 루프.
4. ~~변경 스토리 근거율 게이트~~ — **해소: D6 출처 기반 게이트로 확정**(구현-임계 건별 하드차단 / 추정 측정-only / 의도·AC 사람 승인).
