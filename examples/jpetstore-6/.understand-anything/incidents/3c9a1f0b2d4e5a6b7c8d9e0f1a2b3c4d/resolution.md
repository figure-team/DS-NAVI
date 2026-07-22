# 장애 해결방안서 — 장바구니 수량 변경 시 NullPointerException

> **confidence: high** — DS-APM RCA 리포트의 confidence 를 승계한다.
>
> - runId: `3c9a1f0b2d4e5a6b7c8d9e0f1a2b3c4d` · 서비스: jpetstore
> - 기준 커밋: `fa8982d327ea2f93d694c4d7d44deb0fe9c5d1dd`
> - 시드(사용자 확정): `src/main/java/org/mybatis/jpetstore/domain/Cart.java:110` · `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:125`

## 1. 원인 요약

장바구니에 없는 상품 ID 로 수량 변경 요청이 들어오면 널 체크 없이 그대로 사용해 NullPointerException 이 난다.

- 수량 변경 진입 지점(`src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:125`)은 폼으로 넘어온 상품 ID 를 검증 없이 도메인 계층에 전달한다.
- 장바구니 도메인(`src/main/java/org/mybatis/jpetstore/domain/Cart.java:110`)은 내부 맵 조회 결과를 널 체크 없이 바로 수량 설정에 사용한다. 수량 증가 경로(`src/main/java/org/mybatis/jpetstore/domain/Cart.java:105`)도 같은 패턴이다.
- 세션 만료 후 재제출이나 다른 탭에서 이미 삭제된 상품이면 조회 결과가 null 이라 즉시 예외가 난다.
- 그 결과 수량 변경 제출이 500 오류로 실패한다. 같은 폼을 재제출하는 한 장바구니 갱신이 계속 막힌다.

## 2. 즉시 조치

- [추정] 오류를 만난 사용자에게는 장바구니 화면을 다시 조회한 뒤 최신 상태에서 수량을 변경하도록 안내한다.
- [추정] 수량 변경 요청의 NullPointerException 발생 건수를 로그로 집계해 확산 여부를 지켜본다.

코드 수정 없이 끝나는 조치는 없다 — 근본 해결이 반영되기 전까지는 같은 조건에서 재발한다.

## 3. 근본 해결

아래 1~3 은 **DS-APM RCA 제안**을 승계한 것이다(※ 본 제안은 참고용이며 자동 적용되지 않음).

1. `src/main/java/org/mybatis/jpetstore/domain/Cart.java:110` 과 `src/main/java/org/mybatis/jpetstore/domain/Cart.java:105` — 맵 조회 결과가 null 이면 무시(또는 로그 후 스킵)하도록 널 가드를 추가한다.
2. `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:125` — 제출된 상품 ID 의 장바구니 존재 여부를 선검증한 뒤에만 수량 변경을 호출한다(도메인과 웹 계층의 규칙 일치).
3. (권장) 만료 세션 재제출·타 탭 삭제 케이스의 단위 테스트를 장바구니 테스트(CartTest)에 추가한다.

- [추정] 수정 후 회귀 확인 지점: 기존 장바구니 액션 테스트(`src/test/java/org/mybatis/jpetstore/web/actions/CartActionBeanTest.java:34`)가 시드의 유일한 상류 참조 파일이므로, 이 테스트가 널 가드 추가 후에도 통과하는지 함께 확인한다.

## 4. 영향 업무·데이터

아래 서술은 전부 영향 분석 엔진 산출(impact, 근거율 100%)의 인용이다.

### 영향 도메인 2개 (신뢰도 INFERRED)

| 도메인 | 키 |
|---|---|
| 장바구니 | cart |
| 주문 | order |

### 상류 API 5개 (신뢰도 CONFIRMED_AI)

수정 대상 코드를 거치는 진입점 전부다 — 수정 시 회귀 시험 범위가 된다.

| 진입점 | 처리 지점 |
|---|---|
| 장바구니 담기 | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:68` |
| 장바구니 상품 삭제 | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:94` |
| 수량 변경(장애 지점) | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:116` |
| 장바구니 보기 | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:137` |
| 체크아웃 | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:141` |

### 영향 업무 흐름 7개 (신뢰도 INFERRED)

- 장바구니 도메인 5개: 담기 · 상품 삭제 · 수량 변경 · 장바구니 보기 · 체크아웃
- 주문 도메인 2개: 신규 주문 폼 · 신규 주문 — 장바구니를 딛고 주문이 시작되므로, 시드 수정이 주문 진입 흐름까지 닿는다.

### 하류 파일 8개

- `src/main/java/org/mybatis/jpetstore/service/CatalogService.java` — 진입 빈이 참조한다(`src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:45`).
- `src/main/java/org/mybatis/jpetstore/web/actions/AbstractActionBean.java` — 진입 빈의 상위 클래스다(`src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:37`).
- 매퍼 인터페이스 3종(CategoryMapper · ItemMapper · ProductMapper) — 카탈로그 서비스가 참조한다(`src/main/java/org/mybatis/jpetstore/service/CatalogService.java:34`).
- 매퍼 XML 3종(CategoryMapper.xml · ItemMapper.xml · ProductMapper.xml) — 위 인터페이스의 SQL 정의다.

### 영향 데이터(테이블)

매퍼 XML 의 SQL 기준으로 도달 가능한 테이블은 4개다. 전부 조회이고, 재고 차감 1건만 갱신이다.

| 테이블 | 근거 | 접근 |
|---|---|---|
| CATEGORY | `src/main/resources/org/mybatis/jpetstore/mapper/CategoryMapper.xml:31` | 조회 |
| ITEM · PRODUCT | `src/main/resources/org/mybatis/jpetstore/mapper/ItemMapper.xml:42` | 조회 |
| INVENTORY | `src/main/resources/org/mybatis/jpetstore/mapper/ItemMapper.xml:64` | 조회 |
| INVENTORY | `src/main/resources/org/mybatis/jpetstore/mapper/ItemMapper.xml:77` | 갱신(재고 차감) |
| PRODUCT | `src/main/resources/org/mybatis/jpetstore/mapper/ProductMapper.xml:32` | 조회 |

- [추정] 이번 장애는 도메인 객체 내부의 널 참조라서 위 테이블 데이터가 오염됐을 가능성은 낮다 — 예외가 저장 이전 단계에서 난다.

## 5. 재발 방지 후보

전부 [추정] — 영향 분석 산출 밖의 제안이며 채택은 사람 몫이다.

- [추정] 도메인 계층의 맵 조회 전반에 널 가드 관례를 적용한다(같은 패턴 재발 차단).
- [추정] 존재하지 않는 상품 ID 제출은 500 이 아니라 사용자 안내(400 또는 화면 메시지)로 처리하는 오류 응답 규칙을 정한다.
- [추정] RCA 한계에 언급된 장바구니 내부 이중 자료구조(itemMap/itemList) 동기화 점검을 별건 과제로 등록한다.
- [추정] 만료 세션 재제출·멀티탭 시나리오를 회귀 테스트 묶음에 상시 편입한다.

## 한계

본 문서의 한계:

- 영향 업무 흐름·도메인 매핑의 신뢰도는 INFERRED 다 — 엔진 추론이며 사람 검증 전이다.
- SQL 파일은 콜체인 간선에 등장하지 않아 도달성 밖이다(census 인벤토리로만 후보화) — 영향 데이터 표는 매퍼 XML 슬라이스 인용으로 한정했다.

DS-APM RCA 리포트의 한계(그대로 승계):

- 발생 지점은 코드로 확정이나, 운영에서 카트에 없는 itemId 가 제출되는 실제 경로(멀티탭 동시 조작인지 세션 만료 재제출인지)는 로그만으로 특정하지 못함.
- 동일 클래스의 itemMap/itemList 이중 자료구조 동기화 문제는 이번 장애 범위 밖이라 다루지 않음.
