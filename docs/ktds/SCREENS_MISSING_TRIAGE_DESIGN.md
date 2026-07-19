# 화면설계서 missing 트리아지 설계 — routes census 교차검증

> understand-screens Stage A 의 `missing[]`(도달실패)이 HTTP 코드 수준(`http-404` 등)에
> 머물러, "라우트 자체가 없는 죽은 메뉴"와 "라우트는 실존하는데 크롤 경로만 낡은 URL"을
> 구분하지 못한다. 엔진이 이미 보유한 결정론 라우트 census(`.spec/map/routes.json`)와
> 교차검증해 ① missing 사유를 자동 세분류하고 ② 회수 가능한 화면을 census 시드로
> 재시도해 커버리지를 회복한다.
>
> **선행 설계:** `ktds-legacy-plugin/skills/understand-screens/SKILL.md`(Stage A 계약),
> `PIPELINE_ORDER.md`(understand-map → screens 순서)
>
> **상태:** 제안 — 승인 전. 착수 전 §6 범위 합의 필요.

---

## 0. 배경 — 2026-07-18 egov 실측 (2026-07-19 census 전수 대조로 교정)

egov 공통컴포넌트 캡처(130화면, `screens.json` gitCommit `d9373e54`)의 missing 25건을
전수 검토한 결과, **엔진 오판(실제 도달했는데 실패 기록)은 0건**이었다. 그러나 25건의
성격은 크게 갈렸고, 현행 reason 으로는 구분이 불가능했다.

> ⚠️ **교정(2026-07-19)**: 초판의 "죽은 메뉴 15건"은 **구 URL leaf 문자열의 소스 grep**
> 만으로 판정한 과대 추정이었다. 파일이 옛 이름을 안 담고 있어도 같은 디렉터리에 개명
> 컨트롤러가 실존할 수 있다 — routes census 같은-디렉터리 전수 대조(§2.2 알고리즘 확정
> 후 실측)로 15건 중 10건이 stale-url(후보 실존)로 뒤집혔다. 이 오판 자체가 "grep 이
> 아니라 census 로 판정해야 한다"는 본 설계의 논거를 강화한다.

| 분류 | 건수(교정) | 실측 근거 | 진짜 도달 불가? |
|---|---|---|---|
| 낡은 메뉴 URL(stale-url, 라우트 실존) | **17** | 예: `QnaListInqire.do`→`selectQnaList.do`, `SelectBBSMasterInfs.do`→`selectBBSMasterInfs.do`(케이스 리네임), `selectScrapList.do`→`selectArticleScrapList.do` — 전 건 census 에 현행 후보 실존 | 아니오 — 현행 URL 로 회수 가능 |
| 죽은 메뉴(dead-menu, 라우트·후보 부재) | **5** | `cop/cmy·cop/com·uss/mpe·uss/olh/qnm·uss/umt` — 같은 디렉터리에 토큰 매칭 후보 없음(qnm 은 디렉터리 자체 소멸) | **예**(단 cmy/mpe 는 토큰 불일치 리네임 — 후속 화면은 census 시드가 별도 회수) |
| 필수 파라미터 400 | 1 | `selectDtaUseStatsList.do` 는 `@RequestParam` 필수, 정식 진입점 `...ListView.do` 는 미캡처 | 아니오 — 진입점 교정으로 회수 |
| 인증 게이트 redirect | 1 | `egovGpkiIssu.do` — 매핑·JSP 실존, `permitAllList` 누락으로 로그인 리다이렉트 | 아니오 — 세션/시나리오로 회수 가능성 |
| 서버 오류 500 | 1 | `SelectTrsmrcvLogList.do` — 매핑·JSP·DDL 실존, 런타임 원인 미확인 | 잠정 예(실기동 재검증 필요) |

핵심 관찰: **회수 가능 9건의 진짜 URL 이 전부 `.spec/map/routes.json`(1,223 라우트)에
이미 들어 있었다** (예: `route:ANY /uss/olh/qna/selectQnaList.do` → `EgovQnaController#selectQnaList`).
그런데 Stage A 는 routes.json 을 **주석 핸들러 조인(joinRoutes)에만** 쓰고, 크롤 시드는
루트+readyPath+seedUrls+앵커 링크뿐이라(`understand-screens-capture.mjs:318`) 앱 내
내비게이션(메뉴 DB)이 낡으면 실존 화면을 통째로 놓친다. 이 9건은 캡처본 130장에도 없다
— 순수 커버리지 공백.

---

## 1. 목표 / 비목표

**목표**
1. `missing[]` 사유 자동 세분류(트리아지) — 사람이 소스를 파지 않아도 "죽은 메뉴 vs
   낡은 URL vs 파라미터 vs 인증" 이 산출물에서 바로 읽힘. 전 과정 결정론.
2. census 기반 보조 시드 — 크롤 큐 소진 후 미방문 GET-safe 라우트를 재시도해 회수
   가능 화면을 캡처(egov 기준 기대 +7~9장).
3. 대시보드 화면설계서 탭에서 missing 을 분류 뱃지로 열람.

**비목표**
- 메뉴 DB(타깃 앱 데이터) 자체의 수리 — 그건 QA 소견으로 보고만 한다(깨진 링크는
  그 자체로 QA 근거, SKILL.md:159 원칙 유지).
- 500 원인 자동 진단(서버 로그 접근은 범위 밖 — reason 에 `server-error` 분류까지만).
- POST/폼 제출 크롤(비인증 GET-만 원칙 불변).

---

## 2. 설계 — T1 missing 트리아지 (결정론)

capture 종료 시(모든 크롤·시나리오 후) missing 각 항목을 routes.json 과 대조해
`triage` 필드를 부여한다. routes.json 부재 시 `triage: null`(현행 동작 유지).

```jsonc
// screens.json missing[] 항목 (확장)
{
  "url": "uss/olh/qna/QnaListInqire.do",
  "reason": "http-404",
  "triage": {
    "class": "stale-url",           // §2.1 분류표
    "routeExists": false,            // 요청 URL 자체가 census 에 있나
    "candidateRoute": {              // 유사 라우트 후보(§2.2), 없으면 null
      "path": "/uss/olh/qna/selectQnaList.do",
      "handler": "EgovQnaController#selectQnaList",
      "filePath": "src/main/java/.../EgovQnaController.java",
      "line": 105
    }
  }
}
```

### 2.1 분류 규칙 (위→아래 첫 매치, 전부 기계 판정)

| class | 조건 |
|---|---|
| `param-required` | `http-400` ∧ 요청 URL 이 census 에 존재 |
| `server-error` | `http-5xx` (routeExists 는 참고 정보로 병기) |
| `auth-gated` | `redirected-to:*` ∧ 최종 URL 이 config 의 로그인 경로(또는 readyPath) |
| `redirect-other` | 그 외 `redirected-to:*` |
| `stale-url` | `http-404` ∧ 요청 URL 은 census 부재 ∧ 유사 후보(§2.2) 존재 |
| `dead-menu` | `http-404` ∧ 요청 URL census 부재 ∧ 유사 후보 없음 |
| `route-missing-hit` | `http-404` ∧ 요청 URL 이 census 에 **존재**(배포 누락/프로파일 미활성 의심) |
| `unknown` | 그 외(`goto-failed` 등) |

### 2.2 유사 후보 매칭 (stale-url 판정용) — 구현 확정판(2026-07-19)

결정론 휴리스틱만 사용(LLM 없음), 구현 `triage.ts findCandidateRoute`:
1. **같은 디렉터리** 라우트만 후보군으로(교차 디렉터리 이동은 범위 밖 — qnm→qna 미제안).
2. leaf 토큰 매칭: camelCase/구분자 분해·소문자화·`egov` 브랜딩 토큰 제거 후,
   **재현율**(요청 토큰 대비 공통 비율) ≥ 0.5 이고 공통 토큰에 범용어(select/list/view/
   detail/inqire/info/manage/main/index 등) 아닌 **도메인 단어가 1개 이상**일 것
   (범용어만 겹치는 `EntrprsMberManage`→`EmplyrManage` 류 오매칭 차단).
3. 동률 타이브레이크: ① **정밀도**(후보 토큰 대비 공통 비율 — 잉여 토큰 적은 후보 우선,
   `selectQnaList` ≻ `selectQnaAnswerList`) ② 목록 진입점(leaf 가 List(View)로 끝남)
   우선. 그래도 동률이면 후보 제시 안 함(오매칭 방지 — fail-closed).

egov 실측: stale-url 17건 전부 유일 후보 확정(케이스 리네임 `selectBBSMasterInfs`,
접두 교체 `Egov*List`→`Select*List`, 중간 삽입 `selectArticleScrapList` 포함).
토큰이 붙어 쪼개지지 않는 리네임(`Indvdlpge` vs `IndvdlPge`)은 의도적으로 미제안 —
후속 화면 자체는 §3 census 시드가 회수한다.

---

## 3. 설계 — T2 census 보조 시드 (회수 크롤) — 구현 확정판(2026-07-19)

크롤·시나리오 완료 후 2차 패스(구현 `triage.ts selectCensusSeeds` + 러너 `censusSeedPass`):

1. 후보 = census 라우트 중 ① 미방문(`visitedKeys`/`usedIds` 기준) ② GET-safe
   ③ `exclude` 패턴 비해당 ④ 패턴 경로(`{}`·`*`·정규식) 제외, path ASC 결정론 정렬.
2. **GET-safe 게이트(fail-closed)**: `method` 가 GET/ANY 이고, leaf 토큰에
   `insert|update|delete|regist|action|save|modify|remove|login|logout` 이 **하나라도
   있으면 위치 무관 항상 제외**(ANY 매핑이 부작용을 가질 수 있음 — 비인증 GET-만
   원칙의 연장). 허용은 **목록성 진입점만**: leaf 가 `…List/…ListView/…Main/…Index`
   로 끝나는 것(상세·단건 화면은 필수 파라미터 400 소음이라 제외 — 초판의 "조회 프리픽스
   시작" 규칙을 접미 규칙으로 교체, egov 실측 후보 119건).
3. 예산: config `screens.censusSeed.maxPages`(기본 40, 0=비활성) — 크롤 `maxPages` 와
   **별도**(egov 는 크롤 20 상한을 시나리오 캡처가 이미 소진하므로 잔여분 방식은 예산 0
   이 되는 결함이 있었다). 초과분은 "미시도 N건" 으로 로그에 정직 보고(no silent caps).
   캡처 성공 화면은 `seededFrom: "routes-census"` 표기(메뉴 링크 없음 = 메뉴 정비 후보).
4. **인증 컨텍스트**: 로그인 필요 앱(egov 류)은 비인증 시드가 전부 로그인 리다이렉트로
   실패한다 — `censusSeed.scenarioId` 로 지정한 시나리오의 로그인 상태를 재사용해
   captureAfter 직후 같은 페이지 컨텍스트에서 수행한다. 미지정 시 크롤 직후 비인증
   컨텍스트(더미 인증 앱용).
5. 여기서도 실패하면 missing 에 남고 T1 트리아지가 함께 찍힌다(라우트 실존이므로
   `param-required`/`auth-gated`/`route-missing-hit` 로 정직 분류).

주의: 이 패스는 **메뉴로 도달 불가한 화면**(내비게이션 고아)을 캡처하므로, 화면 수가
크롤 대비 늘 수 있다 — status/validate 보고에 `seededFrom` 별 집계를 추가해 "실제 메뉴
도달 가능"과 "URL 직접 접근만 가능"을 구분 보고한다(후자도 화면설계서 대상이라는 게
이 설계의 입장 — 코드에 실존하는 화면이므로).

---

## 4. 스키마·게이트 영향

- `missing[]` 에 `triage`, 화면 레코드에 `seededFrom`(optional) 추가 — zod 스키마 확장.
- **mechanicalHash**: triage 는 Stage A 기계 사실이므로 해시 범위에 포함(Stage B 가
  변조 못 하게). `seededFrom` 도 동일.
- validate: `triage.class` enum 검사 + routes.json 존재 시 `triage: null` 금지(트리아지
  누락 감지). 기존 산출물(triage 필드 부재)은 스키마 버전으로 구제하지 않는다 —
  **재캡처가 정답**(생성물 불변 원칙, 손패치 금지).
- 대시보드 화면설계서 탭: missing 목록에 class 뱃지(색상: dead-menu 회색 / stale-url
  주황+후보 URL 표시 / auth-gated 보라 / server-error 빨강 / param-required 파랑),
  `seededFrom: routes-census` 화면에 "census 시드" 태그.

---

## 5. 구현 태스크

| # | 내용 | 파일 | 규모 |
|---|---|---|---|
| E1 | 트리아지 함수(`triageMissing(missing, routes, sc)`) + 유사 후보 매칭 — 순수 함수, 단위테스트 동반(egov 25건을 픽스처로) | `understand-screens-capture.mjs`(또는 분리 모듈) | 중 |
| E2 | census 보조 시드 2차 패스 + GET-safe 게이트 + `seededFrom` 표기 | `understand-screens-capture.mjs` (`crawl()` 후단) | 중 |
| E3 | 스키마·mechanicalHash·validate 확장 | `understand-screens.mjs`(validate 경로) | 소 |
| E4 | 대시보드 missing 뱃지 + seededFrom 태그 | dashboard 화면설계서 탭 | 소 |
| E5 | SKILL.md 갱신 — missing 계약(§산출물)에 triage 서술, GET-safe 게이트 명문화 | `skills/understand-screens/SKILL.md` | 소 |
| E6 | egov 재캡처 검증(§6 수용 기준) — 실기동 레시피는 `egov-screens-runtime-recipe` 메모리 참조(MySQL lctn=1 등) | — | 검증 |

의존: E1→E3→E5, E2→E3. E4 는 E3 스키마 확정 후. 병렬 가능: E1‖E2.

## 6. 수용 기준 (egov 재캡처로 판정 — 2026-07-19 실측 분류로 교정)

1. 원 missing 25건 해당분이 전부 `triage.class` 를 갖는다: **stale-url 17 / dead-menu 5 /
   param-required 1 / auth-gated 1 / server-error 1**(§0 교정표 — 단위테스트 픽스처로
   동결됨, `triage.test.ts`). census 시드가 새로 만든 도달 시도의 실패분은 missing 에
   추가될 수 있다(정직 보고 — 25건 고정 아님).
2. census 시드 패스로 **최소 +7화면** 캡처(stale-url 후보 17건 + `selectDtaUseStatsListView.do`
   가 모집단), 각 화면 `seededFrom: "routes-census"`.
3. 부작용 0: GET-safe 게이트로 인해 `insert|update|delete|regist|action|save|modify|remove|login|logout`
   토큰 URL 은 시드 시도에 나타나지 않는다(캡처 로그로 확인). DB 상태 변화 없음.
4. validate 통과 + 기존 130화면의 mechanical 투영 재현(트리아지 추가가 기존 화면
   레코드를 건드리지 않음 — 신규 화면 추가로 파일 해시 자체는 달라질 수 있음).
5. jpetstore 회귀: 기존 screens.json 이 새 엔진 validate 를 그대로 통과(2026-07-19
   실측 통과 — 구버전 산출물 해시 하위호환).

## 7. 열린 질문 (승인 시 결정)

- `route-missing-hit`(census 에 있는데 404) 가 egov 에는 0건이라 실측 검증 불가 —
  분류만 두고 검증은 차기 타깃에서.
- auth-gated 회수를 T2 에 포함할지: 시나리오(로그인 컨텍스트) 재시도가 필요해 비용이
  다름. 1차 범위는 **분류까지만**, 회수는 시나리오 설정 안내로 갈음하는 것을 권장.
- 내비게이션 고아 화면(census 시드로만 도달)의 화면설계서 포함 여부 — 본 설계는 포함
  입장(§3), 반대 시 `seededFrom` 필터로 제외 가능하게만 해 둠.
