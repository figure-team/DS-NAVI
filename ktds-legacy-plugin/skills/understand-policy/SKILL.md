---
name: understand-policy
description: 정책서(.md) 생성 — 코드/DB 신호에서 정책 앵커 추출 후 LLM 보강. 카테고리 4종(용어/데이터/검증/권한) + 도메인별 정책서(흐름·조건 분기), 모든 행 file:line 근거
argument-hint: ["[projectRoot]", "[domain|fill-prep|fill-audit|fill-merge]"]
---

# /understand-policy

> ⚠️ 비민감 샘플 전용.
> 🌐 **언어:** 사용자에게 보여주는 모든 설명·요약·진행 안내는 **한국어**로 한다.
> 🖋 **문체:** LLM 보강이 쓰는 모든 규범 진술·산문은 **문체 규약**을 로드해 따른다 — 프로젝트 override `.understand-anything/templates/style/ko-prose.md` → 없으면 `${CLAUDE_PLUGIN_ROOT}/templates/style/ko-prose.md`(팬아웃 경로는 에이전트가 직접 로드). **용어 기준:** `.understand-anything/templates/style/ko-terms.md`(사용자 확정, 최우선) → `doc-output/policy-glossary.md`(코드 유래) 순 — 표기 기준일 뿐 인용 근거가 아니다.

레거시 코드와 DB(.sql)에서 **정책서**를 생성한다. 기존 9종 산출물(코드 100% 추출)과 달리
정책서는 **규범 문서**라 코드만으로 도출되지 않는다. 2단계로 만든다:

1. **결정론 추출(스크립트)** — 정책의 **앵커(file:line)** 만 표로 싣는다. 합성 금지.
2. **LLM 보강(이 스킬)** — 앵커 소스를 읽어 규범 진술·값을 채우고 `[추정]` 표기한다.

두 갈래의 정책서를 만든다:

- **카테고리 정책서** — 코드/DB 신호를 종류별로: 용어/도메인 사전 · 데이터 정책 · 업무규칙(Validation) · 권한 정책.
- **도메인 정책서**(`domain` 모드) — 한 업무 도메인(정책 토픽)을 **SI 정책 정의서 양식(§0~§8)**으로. 핵심은 **의사결정 테이블(조건 IF→처리 THEN)**. 아래 "도메인 정책서" 절 참조.

## 1단계 — 결정론 추출(스크립트 실행)

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/understand-policy.mjs <projectRoot>
```

- domain-graph 없이 **raw 소스**에서 동작: census → db-schema(.sql 3-Tier) → policy-signals → 정책서.
- **PA3(신호는 map 소유)**: `/understand-map scan` 이 `.spec/map/policy-signals.json` 을 이미
  산출했으면 **그대로 로드**한다(재스캔 0 — db-schema PA2 동형). 맵 미실행 시에만 자체 생성
  (단독성 보존). 이 스킬의 고유 몫은 **정책서 문서 생성**(md 앵커 표 + LLM 보강)이다.
- 산출:
  - `.understand-anything/doc-output/policy-{glossary,data,validation,authz}.md` — 앵커 표(신뢰도/근거 열 포함).
  - `.spec/map/db-schema.json`, `.spec/map/policy-signals.json` — 중간 신호(재사용).
- DB 자산 게이팅: `tier=ddl+data`(상태/요율 행까지) / `ddl`(구조만) / `code-only`(.sql 없음 → 코드역추론 폴백).
- **db-schema 소스**: `/understand-map scan` 이 산출한 `.spec/map/db-schema.json` 을 있으면 로드(맵 미실행 시만 자체 생성). DDL 의 컬럼/PK/FK/CHECK 는 DB 명세서(`si-테이블정의서`/`05_db-spec`)에도 함께 쓰인다.
- **라이브 DB 게이트(PA-gate)**: 빌드/설정에서 **외부** 라이브 DB(JDBC 드라이버·datasource URL)가 감지되면(내장형 h2/hsqldb 제외) — `.sql` 유무와 무관하게 사용자에게 **"권위 스키마를 .sql 로 덤프해 넣기"를 권장**한다(라이브 직접 연결은 미지원). 기존 `.sql` 로 진행해도 무방.

## 2단계 — LLM 보강

스크립트가 만든 각 `policy-*.md` 와 `.spec/map/policy-signals.json` 을 읽고, **각 행의 앵커
(`file:line`)를 직접 열어** 결정론이 담지 못한 규범 내용을 채운다. 각 정책서 섹션 아래에
"정책 진술" 산문을 덧붙이거나 설명 셀을 채운다.

### 규모 게이트 — 인라인 vs 팬아웃

채움 대상 **행 총수**(카테고리 4종 표 행 + 도메인 §4 의사결정 테이블 분기 행)로 판정한다:

- **≤ 60행**(소규모): 아래 인라인 절차를 그대로 쓴다 — 메인 세션이 각 앵커를 직접 열어
  `policy-*.md` 를 보강한다.
- **> 60행**(대규모): **팬아웃 경로**(아래 "팬아웃 절차")를 쓴다 — 메인 세션이 전 신호를
  통째로 읽지 않고, 청크당 에이전트가 pre-cite 를 실어 채운다. `fill-prep` 출력의 문서·행
  수로 게이트를 판정한다.

### 팬아웃 절차 (대규모)

1. `fill-prep` — 신호를 문서(docId)별 자립 청크로 분해한다(문서 우선, 문서 내 행이 상한을
   넘으면 행 수로 분할). 각 행에 앵커 pre-cite(±40라인 verbatim, 검증 통과 보장)와 소스
   슬라이스를 동봉한다. 병합 대상 md 가 없는 문서는 제외·보고(1단계 생성 선행 필요).

   ```
   node ${CLAUDE_PLUGIN_ROOT}/scripts/understand-policy.mjs <projectRoot> fill-prep            # 카테고리 모드
   node ${CLAUDE_PLUGIN_ROOT}/scripts/understand-policy.mjs <projectRoot> fill-prep --mode domain   # 도메인 모드
   ```
   산출: `.spec/map/policy-fill-prep/<chunkId>.json` + `index.json`(청크 id 목록 = `chunks[].chunkId`).

2. **모델 질문**(아래 공통 문안) 후 Workflow 도구로 `scripts/policy-fill-fanout.workflow.js`
   실행 — 인자 `{ projectRoot, cliScript: understand-policy.mjs 절대경로, chunkIds, mode, model, effort:"low" }`.
   각 에이전트는 청크 1개를 읽고 `policy-fill-frag/<chunkId>.json` 에 행 단위 채움
   ({rowKey, statement, confidence, citations[]})만 쓴다(앵커 표는 안 건드린다).

3. `fill-audit` — 조각 완결성 감사(존재 ∧ 스키마 ∧ 커버리지 ∧ `[확정]`⇒인용≥1). Workflow 가
   초기 감사 + 최대 2회 재디스패치 후 잔여 미완결을 `failed[]` 로 보고한다(조용히 버리지 않음).
   감사 뒤 **문체 검수 라운드**가 자동 수행된다 — 문체 규약 위반 진술만 재작성(rowKey·인용·신뢰도
   불변), 재작성 수는 반환값 `styleRevised` 로 보고(끄려면 args `stylePass: false`).

4. `fill-merge` — 완결 조각을 각 `policy-*.md` 에 **`## 규범 진술` 섹션으로 덧붙인다**. 병합 시
   **표기 통일 렉시콘**(`templates/style/ko-lexicon.md`, 프로젝트 override 우선)이 진술에 결정론
   치환으로 자동 적용된다(인용 불변 — 치환 수는 🔤 로 보고). 기존
   결정론 앵커 표는 **불변**(센티넬 `<!-- policy-fill -->` 사이만 재생성 → 재실행 멱등).
   **기계 검증기가 fill-merge 에서 `[확정]` 인용을 실파일 대조 — 불일치 인용은 제거하고 근거
   0 이 된 `[확정]`은 `[추정]`으로 강등한다**(fail-closed). 미완결 문서 행은 부분 병합으로 보고.

   ```
   node ${CLAUDE_PLUGIN_ROOT}/scripts/understand-policy.mjs <projectRoot> fill-audit    # 순수 JSON 1줄
   node ${CLAUDE_PLUGIN_ROOT}/scripts/understand-policy.mjs <projectRoot> fill-merge
   ```

#### 모델 질문 (공통 규약)

팬아웃 디스패치 전, fill-writer 모델을 사용자에게 묻는다(비대화형/헤드리스면 묻지 말고
**세션 모델**로 진행). effort 는 항상 `low`(pre-cite 슬라이스 위 템플릿 유도 판단이라
개방형 분석이 아니다 — map/screens fill 과 동일).

1순위 **세션 모델 (권장·기본)** — 품질 최우선, 현재 세션과 동일 모델 → `model:"inherit"`
2순위 **sonnet** — 품질·비용 균형(map fill 에서 egov 1,255흐름 근거율 100% 실증) → `model:"sonnet"`
3순위 **haiku** — 최대 절감, verbatim 준수 위험은 감사 재디스패치로 보정 → `model:"haiku"`

> 팬아웃도 인라인과 **동일한 신뢰도 3단 규칙·"앵커 보존—보강은 덧붙이기" 규약**을 따른다
> (아래 "보강 규약"). 차이는 산출 경로뿐 — 채움을 md 직접 수정이 아니라 조각(frag) 경유로 쓴다.

### 인라인 절차 (소규모)

카테고리별 보강 지침:

- **권한(authz)**: 앵커의 어노테이션 **인자**(예 `@PreAuthorize("hasRole('ADMIN')")`)를 읽어
  "ADMIN 권한 필요"처럼 명문화. 표현식 원문은 근거 보유 → `[확정]`, 업무적 의미 해석은 `[추정]`.
  권한 어노테이션이 **없는** 엔트리포인트는 `.spec/map/routes.json` 과 대조해 "통제 누락 후보"로
  `[확인 필요]` 표기(있을 때).
- **검증(validation)**: 어노테이션 인자(`@Size(min=8)` 등)를 읽어 "비밀번호 최소 8자" 같은 규칙으로.
  값은 근거 보유 → `[확정]`, 금액/한도 같은 코드 내 분기 규칙은 소스를 읽어 `[추정]`.
- **데이터(data)**: CHECK 식·FK 의미를 명문화. DDL 밖 정책(보존기간 등)은 `[추정]`.
- **용어(glossary)**: 컬럼 주석을 정의로 그대로(`[확정]`). 주석이 없으면 사용처를 보고 의미를 `[추정]`.

### 보강 규약 (필수)

- **근거 강제**: `[확정]`은 반드시 `file:line` 근거를 동반한다. 근거 없이 단정하지 않는다.
- **합성 금지**: 소스에 없는 정책을 지어내지 않는다. 불명은 `[추정]`/`[확인 필요]`로 남긴다.
- **앵커 보존**: 스크립트가 만든 표의 행·근거를 지우지 않는다(보강은 덧붙이기).
- 재실행 시 1단계는 앵커를 갱신(보강분 덮어씀)하므로, 보강은 1단계 후 다시 적용한다.

## 도메인 정책서 (`domain` 모드) — SI 정책 정의서

한 업무 도메인(=정책 토픽)을 **SI 정책 정의서 양식(§0~§8)**으로 만든다. 핵심은 **"조건(IF) →
처리(THEN)"를 의사결정 테이블(§4)로 빠짐없이 명세**하는 것. 코드에서 결정론 시드를 뽑고, 규범
부분은 스캐폴드(`《 》`)·`[추정]`·`[확인 필요]`로 남겨 보강한다.

> 전제: `/understand-map scan`(+ 가능하면 `confirm`→`emit`) 완료(`candidates.json` 필요,
> 흐름·표시명은 emit 된 `domain-graph.json`).

**표기 규약(스캐폴드):**
- `《 》` = 순수 빈칸(도구가 제안할 근거 없음 → 사람 입력). `《YYYY-MM-DD》` 처럼 형식만 안내하기도.
- **제안값**(도구/LLM 해석)은 `《 》` 없이 일반 텍스트 + 신뢰도 `[추정]` 로 쓴다(빈칸과 섞지 말 것).
- `[확정]` = file:line 근거 동반. 보강 시 코드 원문은 IF/THEN 이 아니라 **근거 칸**에 둔다.

### 1단계 — 결정론 추출

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/understand-policy.mjs <projectRoot> domain
```

- 도메인(토픽)별 1문서: `.understand-anything/doc-output/policy-domain-<key>.md` (§0~§8 양식).
- **§4 의사결정 테이블(★)**: 분기 → `정책 ID(PL-001..) | 정책명 | 적용 조건(IF) | 처리 내용(THEN) | 우선순위 | 예외/비고`.
  **IF(조건식)·THEN(분기 본문)·근거(file:line)는 `[확정]`**, 정책명·우선순위·예외는 스캐폴드.
- **§6 처리 흐름**: 메서드별 `IF 조건 → THEN` 의사코드(근거 동반).
- §2 용어·§3 상태값은 코드/DB 신호 있으면 채움, 없으면 스캐폴드 + `[확인 필요]`(§8 미결에 자동 시드).
- 분기 0이면 §4 에 "무조건 처리(조건부 정책 부재)"를 코드 근거로 단정.

### 2단계 — LLM 보강 (시드 → 정책 정의서)

**§4 의사결정 테이블이 중심.** 각 PL 행의 앵커(`file:line`)와 THEN 본문을 직접 열어 다음을 채운다
(IF·THEN 원문·근거는 `[확정]` 유지, 아래 보강은 `[추정]`):

- **정책명**: 그 분기의 업무 의미로 명명. 분류 — 권한(`!isAuthenticated()`→"미인증 차단")·
  상태(`shippingAddressRequired`→"배송지 입력 단계")·**계산**(삼항 `amount>100000?0:2500`→"10만원 초과 무료배송")·검증.
- **처리 내용(THEN)**: 코드 시드(`return ForwardResolution(...)`)를 업무 언어로("로그인 화면으로 차단").
- **우선순위**: if/else-if 는 순서가 우선순위(시드 제공). switch/독립 분기는 업무 판단으로 재정렬.
- **예외/비고**: 엣지 케이스·중첩 적용 여부.
- **충돌 처리 규칙(필수)**: 표 아래에 여러 정책 동시 만족 시 처리(예 "배타적 if/else-if → 먼저 맞는 1개만",
  "도서산간 추가배송비는 무료배송과 중첩")를 명시. 의사결정 테이블 정확성의 핵심.

**다른 섹션:**
- **§3 상태값**: 비었으면 분기 조건이 쓰는 상태값(코드 테이블/enum/하드코딩 문자열)을 코드그룹으로 명문화.
- **§2 용어**: 도메인 핵심 용어를 DB 주석·코드에서.
- **§0 문서정보·§1 개요**: 목적은 **서비스 전략과 연결**(`[추정]`), 적용 범위는 멤버 클래스 기반.
- **§5 예외·§7 검증**: §4 정책 ID 별 엣지 케이스·테스트 케이스(IF 조합 빠짐없이).
- **§8 미결**: 코드로 못 정한 것(상태값 코드 미정의, 데이터 주도 정책 의심 등)을 `[확인 필요]`로.

**계산 조건부 판정(핵심)**: "상품 종류/권한/금액에 따라 처리가 달라지는가?"는 §4 에 **해당 분기가 있으면**
정책으로 명문화하고, **없으면** "조건부 처리 없음 — 전 건 동일 규칙"을 계산식 위치(예 `Cart.getSubTotal`
단순 합산) 근거로 단정(합성 금지). 데이터 주도 정책(요율 테이블 등 `if` 없는 분기)은 `[확인 필요]`.

## 기존 정책서 대조 (있을 때)

`.understand-anything/policy-input/<category>.md`(예: `glossary.md`, `authz.md`)에 기존 정책서가
있으면 1단계 스크립트가 자동으로 ingest·대조해 `.spec/map/policy-reconcile.json` 을 만든다:

- **준수**: 문서 항목 ↔ 코드/DB 신호 모두 존재(category+subject 매칭).
- **미정의**: 코드/DB 엔 있으나 문서에 없음(문서 누락).
- **문서에만**: 문서엔 있으나 코드/DB 신호 없음(미구현 후보).
- **위반**(값 모순): 결정론으로는 부여하지 않는다 — 신호에 인자값이 없기 때문. **이 스킬의 보강
  단계에서** `문서에만`/`준수` 항목의 앵커 소스를 열어 문서가 명시한 값과 코드 값을 비교해
  `위반`을 판정한다(예: 문서 "최소 6자" vs 코드 `@Size(min=8)`). 근거 동반 필수.

대조 결과를 정책서에 "대조" 섹션으로 덧붙이거나 항목별 상태 배지로 표기한다.

## 산출물 / 출력 해석

- `.understand-anything/doc-output/policy-*.md` — 편집·확정 가능(기존 doc-output 흐름 재사용).
- DB tier·정책 신호 건수·정책서 종류·근거율을 **한국어**로 보고한다.
