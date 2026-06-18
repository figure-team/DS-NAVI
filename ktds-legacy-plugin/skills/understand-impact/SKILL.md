---
name: understand-impact
description: 변경 영향도 + 생성예측 — 시드에서 역/정 도달성으로 API/DB/업무흐름/연관모듈 영향을 결정론 산출 + 인용 검증. 신규 기능은 선례검색으로 [변경]/[생성]/[영향] 3분류. 자연어→시드 매핑은 host 역할(확인 게이트).
argument-hint: ["[projectRoot]", "[seeds | precedents | analyze]"]
---

# /understand-impact

> ⚠️ 비민감 샘플 전용 (보안 게이트는 Phase 2).
> 🌐 **언어:** 사용자에게 보여주는 모든 설명·질문·요약·진행 안내는 **한국어**로 한다(config `outputLanguage`, 기본값 `ko`). 영어로 답하지 말 것.

"이 파일/기능을 바꾸면 어디까지 영향이 갈까?" 그리고 "이 기능을 새로 만들려면 무엇을 손대야 하나?"를 **결정론 정적분석 + 선례검색**으로 답한다. `/understand-map` 이 만든 `.spec/map/` 산출물(census·routes·edges·slices·skeleton) 위에서 **재스캔 없이** 계산한다:

- **상류(upstream, 역방향)** = 시드를 바꾸면 깨질 수 있는 **호출자** → API·진입점·업무 흐름 영향.
- **하류(downstream, 정방향)** = 시드가 의존하는 **협력자** → DB·영속성(매퍼) 영향.

모든 사실 주장에 `파일:라인` 인용이 붙고 기계 검증(경로 실존→라인→텍스트 일치)을 통과한다. 출력 `docs/09_release/change-impact-analysis.md`는 **읽기전용 분석 산출물**(검토·승인 상태기계 밖)이다.

신뢰도 태그: `[확정]`(기존 코드 기계검증) · `[확정(AI)]`(AI 합성+근거 앵커) · `[추정]`(구조/관례 추론) · `[확인 필요]`(근거 미확보). **net-new(`[생성]`)는 절대 `[확정]`을 받지 못한다 — 최대 `[추정]`**(존재하지 않는 파일은 기계검증 대상 아님).

## 0) 전제
`/understand-map scan` 이 `.spec/map/` 산출물을 만들어둬야 한다. 없으면 엔진이 안내하며 멈춘다(fail-closed). **생성예측(선례검색)은 `confirm` 까지 끝나 있어야 한다**(F3 precondition) — 아니면 임의 진행 없이 멈춘다. 도메인 흐름 영향까지 보려면 `confirm` 필요(아니면 흐름/도메인은 `[확인 필요]`로 강등).

## 1) 시드 매핑 — host(=너)의 역할
엔진은 **자연어를 받지 않는다.** 파일 경로 집합(`--path`)만 입력이다. 자연어 변경요청을 시드 파일로 옮기는 것은 host 의 일이다:

1. 카탈로그를 받는다:
   ```
   node ${CLAUDE_PLUGIN_ROOT}/scripts/understand-impact.mjs <projectRoot> seeds
   ```
   라우트(routeId→handler→파일)·도메인·파일 인벤토리가 나온다.
2. 사용자의 자연어("로그인에 카카오 로그인 추가")를 카탈로그로 **후보 파일**에 매핑한다.
3. **✋ 확인 게이트 (생략 불가):** 후보 파일을 사용자에게 한국어로 제시하고 *"이 파일들을 변경 시드로 보고 영향을 분석할까요?"* 확인을 받는다. **절대 임의로 진행하지 말 것.** 다의적/매핑 불가면 정확한 파일 지정을 요청한다.

## 2) 영향도 분석
확정된 시드로:
```
node ${CLAUDE_PLUGIN_ROOT}/scripts/understand-impact.mjs <projectRoot> analyze --path <파일> [--path <파일2> ...]
```
산출: `.spec/map/impact.json`(결정론) + `impact-verify-report.json`(근거율) + `docs/09_release/change-impact-analysis.md`(읽기전용) + **영향 규모 집계**(도메인×상류/하류, 언어×상류/하류 — 공수 산정 입력). 한국어 요약(상류 N·API M·DB K·흐름 J·검토필요·근거율)을 사용자에게 보고한다.

> ⚠️ `--path` 없이 호출하면 엔진은 임의 분석을 하지 않고 안내만 낸다(fail-closed). 반드시 시드를 지정하라.

## 3) 생성예측 — `[변경]`/`[생성]`/`[영향]` 3분류 (보완 A)
"신규 기능 추가"는 **유사 기존 흐름을 본떠** 제안한다. net-new 는 *실제 선례 파일의 `file:line` 앵커*로 grounding 한다(예측=`[추정]`, 근거=실존 선례).

1. **선례검색 (F1):** 의도에서 신호(도메인 힌트·엔티티·연산)를 뽑아 엔진에 넘긴다:
   ```
   node ${CLAUDE_PLUGIN_ROOT}/scripts/understand-impact.mjs <projectRoot> precedents --domain <힌트> [--entity <명사>] [--op <연산>] [--top N]
   ```
   도메인/흐름명 매칭 우선(퍼지 폴백), top-N 후보를 score·why-matched·계층별 파일셋과 함께 낸다.
2. **✋ 선례 선택 (F2, 생략 불가):** 최고점 자동채택 금지. top-N 을 사용자에게 제시하고 **사용자가 선례를 선택**한 뒤에만 `[생성]` 제안을 진행한다(잘못된 유추 방지).
3. **3분류 발행:** 선택된 선례 + 변경 대상 기존 파일로:
   ```
   node ${CLAUDE_PLUGIN_ROOT}/scripts/understand-impact.mjs <projectRoot> analyze \
     --path <영향 시드> --precedent <선택 flowId> --entity <신규명> [--op <연산>] \
     --change <기존파일:라인> [--change <기존파일2:라인> ...]
   ```
   - **`[변경]`**(기존 파일·심볼): 앵커 실존 검증 통과 시 `[확정]`. 예: "SecurityConfig:line 에 OAuth2 필터 등록".
   - **`[생성]`**(신규 파일·심볼 + 선례 앵커): `[추정]`. 예: "신규 `KakaoLoginController.callback()` ← 선례 `AccountController.java:18`".
   - **`[영향]`**(reachability): 역/정 도달성 결과.
   엔진이 **L1 하드게이트**를 건다(3버킷·선례앵커 실존·net-new CONFIRMED 0건·선례없음 강등). 위반 시 발행을 차단한다.

### 선례 강도별 강등 (T1)
| 선례 강도 | 출력 | 신뢰 |
|---|---|---|
| **강**(유사 흐름 존재) | 구체 파일·심볼 + 선례 `file:line` 앵커 | `[추정]` |
| **부분**(관련 패턴 일부) | 구체 파일 + "부분 유사" + 관례 앵커 | `[추정]` |
| **없음**(완전 신규) | **역할 단위 스캐폴드**("인증 컨트롤러·OAuth 서비스") + 프로젝트 관례 앵커. **구체 파일명을 지어내지 않음** | `[확인 필요]` |

## 4) DB 테이블/컬럼 보강 — host 의 역할
엔진은 **영향 매퍼 XML까지만** 결정론으로 산출하고, `tableCandidateSlots` 에 각 매퍼의 SQL 슬라이스 위치를 닻으로 남긴다. host 는 그 슬라이스의 SQL 본문을 읽어 **건드리는 테이블/컬럼을 인용 의무로 추출**(`citations` ≥1)하고, `kgTableCatalog`(KG table 노드)와 매칭해 DDL 근거를 붙인다. 동적 SQL(`${}`·`<include>`)로 모호하면 `[확인 필요]`로 둔다.

## 5) 결과 해석 (사용자에게)
- **상류 vs 하류** 구분: 상류=내 변경에 영향받는 호출자, 하류=시드가 함께 봐야 할 협력자.
- **API confidence:** `both`(ownership+reverse 일치)=`[확정(AI)]`, 단일 신호=교차검증 불일치(`[추정]`/`[확인 필요]`).
- **과도전파 투명 보고:** `overEdges.hubNodes`(공용 유틸/예외 경유)·`crossCheckDiff`·`needsReview`를 "영향이 과대 추정될 수 있는 지점"으로 그대로 보여준다.
- **흐름/도메인은 `[추정]`:** step 입도가 라우트-선언-파일 단위라 '실 호출'이 아닌 '체인 내 도달'이다.
- **비-Java 시드(JSP/TS/web.xml):** edges 가 java 기반이라 역방향이 빈약 → `[확인 필요]` 강등, host 보강 권장.
- **`[생성]`은 절대 `[확정]`이 아니다:** 존재하지 않는 코드는 기계검증 대상이 아니다. 선례 앵커만 실존 근거다.
