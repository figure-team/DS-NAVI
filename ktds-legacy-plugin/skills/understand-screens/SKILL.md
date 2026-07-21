---
name: understand-screens
description: 화면설계서 생성 — 실제 앱 기동·캡처(Stage A) 후 이벤트별 동작을 근거 기반으로 채움(Stage B), 대시보드 화면설계서 탭 데이터
argument-hint: ["[projectRoot]", "[scaffold|capture|fill-prep|fill-audit|fill-merge|resolve-views|assign-domains|validate|status]"]
---

# /understand-screens

> 🌐 **언어:** 사용자에게 보여주는 모든 설명·요약·진행 안내는 **한국어**로 한다(config `outputLanguage`, 기본값 `ko`).
> 🖋 **문체:** Stage B 채움이 쓰는 모든 title·summary·description·note 는 **문체 규약**을 로드해 따른다 — 프로젝트 override `.understand-anything/templates/style/ko-prose.md` → 없으면 `${CLAUDE_PLUGIN_ROOT}/templates/style/ko-prose.md`(팬아웃 경로는 에이전트가 직접 로드). **용어 기준:** `.understand-anything/templates/style/ko-terms.md`(사용자 확정, 최우선) → `doc-output/policy-glossary.md`(코드 유래) 순 — 표기 기준일 뿐 인용 근거가 아니다.

분석 대상 웹앱의 **화면설계서**(캡처 + ①②③/ⓐⓑⓒ 번호 배지 + 항목별 설명 범례)를 생성한다.
2단 파이프라인: **Stage A**(결정론 캡처 — 앱 기동/크롤/시나리오/routes 조인)는 스크립트가,
**Stage B**(의미 채움 — JSP 매핑/한국어 설명/호출 체인)는 호스트(Claude)가 수행한다.

## 실행

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/understand-screens.mjs <projectRoot> scaffold    # screens 설정 초안(--force 재생성)
node ${CLAUDE_PLUGIN_ROOT}/scripts/understand-screens.mjs <projectRoot> capture     # Stage A
# → Stage B: 규모 게이트에 따라 인라인 채움 또는 팬아웃(아래 "Stage B 채움 계약")
node ${CLAUDE_PLUGIN_ROOT}/scripts/understand-screens.mjs <projectRoot> fill-prep    # 팬아웃 청크 준비
node ${CLAUDE_PLUGIN_ROOT}/scripts/understand-screens.mjs <projectRoot> fill-audit   # 조각 감사(JSON)
node ${CLAUDE_PLUGIN_ROOT}/scripts/understand-screens.mjs <projectRoot> fill-merge   # 조각 병합(+뷰 해석·도메인 배정)
node ${CLAUDE_PLUGIN_ROOT}/scripts/understand-screens.mjs <projectRoot> resolve-views  # ViewResolver 해석(Spring 뷰 이름→JSP 실경로, 백필용)
node ${CLAUDE_PLUGIN_ROOT}/scripts/understand-screens.mjs <projectRoot> assign-domains # 도메인 재배정(백필·confirm 재확정 후)
node ${CLAUDE_PLUGIN_ROOT}/scripts/understand-screens.mjs <projectRoot> validate     # 게이트
node ${CLAUDE_PLUGIN_ROOT}/scripts/understand-screens.mjs <projectRoot> status       # 요약
```

- 선행: `understanding.config.json` 의 `screens` 섹션(baseUrl, startCommand, scenarios 등).
  없으면 capture 가 **routes census 로 초안을 자동 생성**(scaffold)하고 확인 정지한다 —
  baseUrl(contextPath 추정)·startCommand(pom/gradle 플러그인 감지)·seedUrls(GET-safe 목록성
  라우트)는 자동, **로그인 계정·셀렉터는 코드에서 유추 불가**하므로 scenarios 는 빈 채로
  남는다. 사용자가 초안의 "확인 필요" 항목을 채운 뒤 capture 를 재실행한다(추정값으로
  말없이 진행하지 않는다). 초안 재생성은 `scaffold --force`. 로그인/권한 화면은
  **시나리오**(테스트 계정 포함)로 도달한다 — 계정 정보는 도구가 유추할 수 없으므로
  사용자에게 요청한다(첫 capture 의 auth-gated 트리아지가 대상 화면을 알려준다).
- 선행(권장): `.spec/map/routes.json`(understand-map 스캔) — 있으면 이벤트→핸들러가
  결정론 `[확정]`(file:line)으로 선기입된다. `.understand-anything/knowledge-graph.json` 이
  있으면 JSP 전수 대조(unmatchedJsps)가 활성화된다.

## 실행 가능성 판정 게이트 (capture 전 필수)

> **원칙: 부재 ≠ 불가.** "앱을 못 띄운다 / 계정을 모른다 / 캡처 불가"라는 **부정 결론은
> 미검증 상태로 단정하지 않는다.** 관찰한 부재 신호(로컬 DB 미기동·`mvnw` 없음·Security
> 인증 등)는 "실행 불가"의 증거가 아니라 "아직 확인 안 한 것"이다. 단정 전 아래 반증을
> **먼저 확인**하고, 못 했으면 "미검증 — 다음에 X 확인"으로만 보고한다.

`screens` 설정이나 실행 중인 앱이 없어 capture 가 멈출 때, "이 앱은 못 띄운다"로 결론내기
전에 이 순서로 반증을 확인한다(대부분 리포 안에 실행 근거가 있다):

1. **런북**: `README`/`README.md`/`docs`의 "구동/실행/설치" 절 — 실행 방법이 대개 명시돼 있다.
2. **CI 워크플로**(`.github/workflows/*.yml` 등): CI 가 빌드/실행하면 **실행 가능이 증명된
   것**이고, 워크플로에 JDK 버전·빌드 명령·서비스 컨테이너(DB)가 그대로 적혀 있다.
3. **스키마·시드**: `script/`·`db/`·`sql/`의 DDL/DML — 전체 스키마+시드 데이터(계정 포함)가
   동봉된 경우가 많다(예: eGovFrame `script/{ddl,dml,comment}/<db>/`).
4. **인증 우회·시드 계정·공개 로그인정보**: 데모 인증 모드(예 `Globals.Auth=dummy`),
   DML 에 INSERT 된 테스트 계정, README 가 링크하는 공개 로그인정보 — **계정은 유추 대상이
   아니라 문서화된 표준값**일 수 있다. 이걸 확인한 뒤에만 "계정을 사용자에게 요청"한다.
5. **환경 프로브는 음성 결과에서 한 겹 더**: `command -v X` 실패 = "도구 없음"이 아니라
   데몬 미기동(예 Docker Desktop 미실행)·버전 매니저(sdkman/brew) 경로·미설치 뿐일 수
   있다. 다음 계층까지 확인하고 결론낸다.

**두 질문을 분리해 보고한다**: ① 이 앱이 **설계상 실행되게 만들어졌나**(런북/CI 로 판정)
② **이 머신에 셋업돼 있나**(DB·빌드도구 프로브). ②의 공백은 **"셋업 단계"**로 보고하지
"막다른 길"로 보고하지 않는다. **사용자 결정에 영향을 주는 부정 결론(예 "제외 권장")은
검증을 마친 뒤에만** AskUserQuestion 선택지로 만든다 — 미검증 전제를 선택지에 넣지 않는다.

## 산출물

- `.understand-anything/screens.json` — 화면·주석(annotation)·근거. **생성물 불변**:
  사람 편집은 `screen-overrides.json`(대시보드 탭)만.
- `.understand-anything/screens/*.png` — fullPage 캡처(주석은 bbox 좌표로 저장, PNG 에
  굽지 않음 — 대시보드가 오버레이 렌더).
- `missing[]` — 도달 실패 정직 보고(`http-*`/`redirected-to:*`/`scenario-failed` 등).
  조용한 누락 금지. `unmatchedJsps[]` 가 비어야 전수 커버.
  routes census(`.spec/map/routes.json`)가 있으면 각 건에 **트리아지**(`triage.class`)가
  결정론 부여된다(SCREENS_MISSING_TRIAGE_DESIGN §2): `dead-menu`(라우트 자체 부재 —
  진짜 도달 불가) / `stale-url`(같은 디렉터리에 현행 후보 라우트 실존 — `candidateRoute`
  로 제시) / `param-required`(400+라우트 실존) / `auth-gated`(로그인 리다이렉트) /
  `server-error` / `route-missing-hit`(라우트 실존인데 404 — 배포 누락 의심) 등.
  트리아지·`seededFrom` 은 Stage A 기계 사실이라 mechanicalHash 봉인 대상이다.

## Stage B 채움 계약 (호스트 수행)

입력: `screens.json` + `.spec/map/{routes,method-calls}.json` + 컨트롤러/ActionBean 소스.
**수정 금지**: `annotations[].{no,kind,selector,bbox,eventType,mechanical}` — mechanicalHash
로 기계 검증되며 변조 시 validate 실패.

### 규모 게이트 — 인라인 vs 팬아웃

- **화면 ≤ 10 이고 주석 총수 ≤ 60**: 인라인 채움(호스트가 screens.json 을 직접 읽고
  아래 채움 필드 계약대로 채운다 — 현행 절차). 소규모는 이 경로가 가장 단순하다.
- **초과**(대규모): **팬아웃 경로**를 쓴다 — screens.json 전체를 메인 세션이 읽지
  않도록 청크로 쪼개 청크당 에이전트가 조각을 쓰고 결정론 병합한다(컨텍스트 폭증 방지).
  `fill-prep` 출력의 화면·주석 수로 게이트를 판정한다(jpetstore: 22화면·369주석 → 팬아웃).

채울 필드(양 경로 공통):

1. **화면 단위**: `jspFile`(핸들러 메서드의 ForwardResolution/뷰 반환을 코드로 확인 —
   근거 file:line 을 `summary.text` 에 포함), `graphNodeId`(`file:<jspFile>`, KG 에 실존할
   때만), `title`(한국어), `summary{text,confidence}`.
   Spring ViewResolver 프로젝트(egov 류)는 뷰 이름만 적어도 된다 — fill-merge 의
   `resolve-views` 단계가 prefix/suffix 설정을 읽어 repo 실경로로 결정론 확정한다
   (라우트→메서드 리터럴로 미채움분도 자동 채움, 분기 뷰는 보류).
   `domain` 은 **채우지 않는다** — 엔진 결정론 배정 소관(fill-merge 가 자동 수행,
   단독 재배정은 `assign-domains`). 확정 플랜 조인(뷰 폴더=플랜 키 → 핸들러 근거
   다수결, 공통 크롬 제외) → 뷰 폴더/URL 파생 폴백 순. 2026-07-18 이전엔 LLM 채움
   필드였으나 팬아웃 계약 누락으로 전 화면이 "기타"로 뭉치는 결함이 있었다.
   서버측 forward 로 다른 화면이 렌더된 경우(비로그인 → 로그인 폼 등, `contentSignature`
   별칭 의심 참조) **실제 렌더된 JSP** 를 적고 summary 에 forward 사유를 명기한다.
2. **주석 단위**: `description`(범례 문장 — 필드는 용도, 액션/링크는 수행 동작),
   `note`("※ …" 비고, 필요 시), `handler.chain`(ActionBean→Service→Mapper —
   method-calls.json 우선, 코드 확인 보조), 미조인 `handler` 채움.
3. **신뢰도 규율(fail-closed)**: `CONFIRMED`/`CONFIRMED_AI` 주장은 `evidence`(file:line)
   ≥ 1 필수. 코드 근거 없는 유추는 `INFERRED`, 못 찾으면 `UNVERIFIED`. 지어내기 금지.
4. 같은 핸들러/필드가 여러 화면에 반복되므로 **핸들러→설명 표를 먼저 작성**하고 일괄
   적용하는 방식을 권장(멱등 — 실패 항목만 재작성). 인앱 핸들러가 없는 링크(외부/앵커/
   정적 페이지)는 handler 를 **null 로 유지**하고 설명만 기재한다(근거 없는 신뢰도 태깅 금지).
5. jspFile 매핑 후 `unmatchedJsps` 를 재계산해 기록한다(엔진 `reconcileJsps` +
   `listJspFilesFromGraph`). validate 가 KG 기준 재계산과 대조해 낡은 값을 실패 처리한다.
   (팬아웃 경로에서는 `fill-merge` 가 이 재계산을 자동 수행한다.)

### 팬아웃 경로 절차 (대규모)

1. `fill-prep` — screens.json 을 화면 N개 자립 청크로 분해한다(도메인 우선 그룹핑,
   화면 단위로만 자름 — 주석은 화면에서 분리하지 않는다). 각 청크에 **핸들러 사전**
   (routes/method-calls 결정론 조인의 pre-cite: file:line + verbatim 스니펫), **뷰 상수
   사전**(`viewConstants[]` — 앵커 파일+상속 부모 전 범위에서 `.jsp` 리터럴 선언을 스캔,
   상수명→원문→repo 실경로 해결까지 동봉 — 슬라이스 창 밖 상단 상수로 jspFile 이 비는
   갭 방지), 컨트롤러/서비스 소스 슬라이스를 동봉한다. 산출:
   `.spec/map/screens-fill-prep/<chunkId>.json` + `index.json`(청크 id 목록 `chunks[].chunkId`).
2. **모델 질문**(아래 공통 문안) 후 Workflow 도구로 `scripts/screens-fill-fanout.workflow.js`
   실행 — 인자 `{ projectRoot, cliScript: understand-screens.mjs 절대경로, chunkIds, model, effort:"low" }`.
   청크당 fill-writer 에이전트가 `screens-fill-frag/<chunkId>.json` 을 쓴다(멱등 skip 가드:
   에이전트가 먼저 `fill-audit --chunk <id>` 로 완료 여부 확인 후 skip). 인용은 에이전트가
   **생산하지 않고** 청크의 pre-cite 를 verbatim 복사한다(근거율 보증). 봉인 필드는 조각에
   담지 않는다(병합이 본체 유지).
3. `fill-audit` — 조각 완결성 감사(존재 ∧ 스키마 ∧ 화면·주석 커버리지 ∧ CONFIRMED⇒
   evidence≥1). Workflow 가 초기 감사 + 최대 2회 재디스패치 후 잔여 미완결을 `failed[]` 로
   표면화한다(조용한 누락 없음). 감사 뒤 **문체 검수 라운드**가 자동 수행된다 — 문체 규약
   위반 산문(title/summary/description/note)만 재작성(봉인 필드·핸들러·근거 불변), 재작성 수는
   반환값 `styleRevised` 로 보고(끄려면 args `stylePass: false`). 요약을 사용자에게 보고한다.
4. `fill-merge` — 조각의 **채움 필드만** screens.json 본체에 병합한다(봉인 필드는 본체 값
   유지, 선언 밖 화면/주석 id 는 버리고 보고). 병합 시 **표기 통일 렉시콘**(`templates/style/
   ko-lexicon.md`, 프로젝트 override 우선)이 산문 필드에 결정론 치환으로 자동 적용된다
   (evidence 불변 — 치환 수는 🔤 로 보고). 병합 후 `unmatchedJsps` 재계산 +
   mechanicalHash 재검증 + `validateScreensFile` 게이트를 자동 실행한다.
5. `validate` — 최종 게이트 재확인 후 결과를 한국어로 보고한다.

### 모델 질문 (공통 규약)

팬아웃 디스패치 전, fill-writer 모델을 사용자에게 묻는다(비대화형/헤드리스면 묻지 말고
**세션 모델**로 진행). effort 는 항상 `low`(pre-cite 슬라이스 위 템플릿 유도 판단이라
개방형 분석이 아니다 — map fill 과 동일).

1순위 **세션 모델 (권장·기본)** — 품질 최우선, 현재 세션과 동일 모델 → `model:"inherit"`
2순위 **sonnet** — 품질·비용 균형(map fill 에서 egov 1,255흐름 근거율 100% 실증) → `model:"sonnet"`
3순위 **haiku** — 최대 절감, verbatim 준수 위험은 감사 재디스패치로 보정 → `model:"haiku"`

## 검증 게이트 (validate)

- zod 스키마 + `mechanicalHash` 불변(Stage A 기계 사실 변조 감지).
- `CONFIRMED ⇒ evidence ≥ 1`, 화면 id/주석 키 중복 금지.
- 채움률 보고: description ≥ 90%, `unmatchedJsps = ∅`(비-fragment 뷰 전수 매핑)를
  목표로 하고 미달 시 시나리오/채움 보강 후 재실행.

## 다양한 상황 대응 (Stage A 가 자동 처리)

- **로그인/권한**: config scenarios(계정별 독립 브라우저 컨텍스트, role 별 시나리오).
- **선행 상태 화면**(장바구니→주문서 등): 시나리오 steps 의 `capture` 액션으로 중간 캡처.
- **리다이렉트/서버측 forward**: missing 보고 + contentSignature 별칭 의심.
- **팝업/새창**: window.open → 별도 화면(`openedFrom`); alert/confirm → 기본 dismiss
  (스텝 `dialog: accept` 로 변경).
- **HTTP 오류**: 캡처 대신 `http-<status>` 보고 — 깨진 링크는 그 자체로 QA 근거.
- **census 보조 시드**(config `screens.censusSeed`, 기본 활성): 크롤·시나리오가 끝난 뒤
  routes census 의 **미방문 GET-safe 라우트**(목록성 leaf `…List/…ListView/…Main/…Index`
  만, `insert|update|delete|regist|action|save|modify|remove|login|logout` 토큰은 항상
  제외 — 비인증 GET-만 원칙의 연장)를 재시도해 메뉴가 낡아 놓친 실존 화면을 회수한다.
  회수 화면은 `seededFrom: "routes-census"` 로 표기(메뉴 링크 없음 = 메뉴 정비 후보).
  로그인 필요 앱은 `censusSeed.scenarioId` 로 해당 시나리오의 인증 컨텍스트에서 수행.
  예산은 `censusSeed.maxPages`(기본 40, 0=비활성) — 초과분은 로그로 정직 보고.

## 출력 해석

화면 수·주석 수·핸들러 확정율·설명 채움률·미매핑 JSP·도달 실패를 한국어로 보고하고,
대시보드 **화면설계서 탭**(`/understand-dashboard`)에서 열람·편집·확정함을 안내한다.
