# 데이터 맵 개편 설계 (DATA_MAP_REDESIGN)

> 대상: 대시보드 `/data` 섹션(DataMapView) + 생산자 `legacy-core/db-schema`(extract) · `doc-generator/builders/crud-matrix`
> 배경: jpetstore-6 데모 검수에서 나온 4개 질문(미해결 13건, 테이블 스케일·검색, CRUD 신뢰도, 코드 탭 빈 영역)에 대한 답변 → 개편 ①~⑤ 확정.
> 원칙: 실데이터 바인딩(목업 금지) · 근거(file:line) 동반 · 침묵 누락 금지 · URL 단일 소스.

## 0. 문제 진단 요약 (2026-07-07 검수)

| # | 증상 | 원인 (근거) |
|---|------|-------------|
| ① | 미해결 항목 13건 경고 | 같은 13개 테이블이 `jpetstore-hsqldb-data.sql`·`jpetstore-hsqldb-schema.sql`에 중복 CREATE — 추출기가 동일/상이 구분 없이 전부 warn 성 unresolved 기록 (`extract.ts:111-118`) |
| ② | 테이블 다수 시 트리 스크롤 지옥·검색 불가 | TableTree 전량 나열, 검색·가상화 없음. 탭/선택이 useState라 딥링크 불가(URL 단일 소스 원칙 위반) |
| ③ | CRUD 21행 중 10행이 빈 행(노이즈), 신뢰도 "확정" 오독 | 빈 INFERRED 행 무접기. `CONFIRMED`는 기계 판정(SQL 근거 확보)인데 ConfBadge가 "확정"(사람 확정 함의)으로 렌더 (`crud-matrix.ts:130`, `DataMapView.tsx:83-88`) |
| ④ | 코드성 판정 근거 미표시 | `looksLikeCodeTable` 휴리스틱(`extract.ts:44-52`)이 boolean만 반환 — 사유가 JSON에 없음 |
| ⑤ | 코드 탭 오른쪽 빈 영역 | `lg:grid-cols-2` 고정 그리드에 코드 테이블 1개(CATEGORY)뿐 (`DataMapView.tsx:580`) |

## 1. 데이터 계약 변경 (legacy-core, 하위호환 additive)

`packages/legacy-core/src/db-schema/types.ts` — schemaVersion 1 유지, optional 필드 추가:

```ts
// unresolved 항목에 심각도 추가 (부재 시 'warn' 취급 = 기존 JSON 하위호환)
unresolved: z.array(z.object({
  ref: z.string(),
  reason: z.string(),
  severity: z.enum(['warn', 'info']).optional(),   // NEW
}))

// DbTableSchema 에 판정 사유 추가 (부재 시 null 취급)
isCodeTable: z.boolean(),
codeTableReason: z.string().nullable().optional(),  // NEW — 예: "테이블명 패턴 'category'" / "코드컬럼 'status_cd'+라벨컬럼 'status_nm'"
```

소비자(대시보드)는 필드 부재를 관대하게 처리(옛 산출물 그대로 동작). `crud-matrix.json` 계약은 **불변** — 신뢰도 라벨 정직화는 표시 계층에서만 수행(§4).

## 2. ① 스캐너 — 중복 CREATE 구조 diff (extract.ts)

패스 1에서 중복 CREATE TABLE 발견 시, 버리기 전에 **기존 채택 정의와 구조 비교**:

- 정규화 비교 대상: 컬럼(name·type·nullable·primaryKey·unique·default), primaryKey, uniques, foreignKeys(columns·refTable·refColumns), checks(expression), indexes(columns·unique). 이름은 소문자 정규화, 배열은 정렬 후 비교. line·relPath·comment 는 제외.
- **동일** → `{ reason: '중복 CREATE TABLE(동일 정의·첫 정의 유지)', severity: 'info' }` — 침묵 누락 금지 원칙에 따라 기록은 유지하되 경고 아님.
- **상이** → `{ reason: '중복 CREATE TABLE(정의 상이·첫 정의 유지) — <diff 요약>', severity: 'warn' }`. diff 요약은 최초 3건까지: `컬럼 추가 X` / `컬럼 누락 X` / `컬럼 상이 X(type VARCHAR(10)≠VARCHAR(20))` / `PK 상이` / `FK 상이` 등.
- 기존 다른 unresolved(파싱 실패, COMMENT 미발견 등)는 severity 미지정(=warn) 유지.

jpetstore 기대 결과: 13건 전부 `info` → 화면 경고 배너 소멸(참고 접이식으로 강등, §6).

테스트(`db-schema.test.ts`): 동일 중복→info, 타입 상이 중복→warn+diff 요약, 옛 JSON(severity 없음) 파싱 통과.

## 3. ④ 스캐너 — 코드성 판정 사유 (extract.ts)

`looksLikeCodeTable(t): boolean` → `codeTableReason(t): string | null` 로 교체:

- 테이블명 패턴 매치 → `테이블명 패턴 '<매치 토큰>'` (예: `테이블명 패턴 'category'`)
- 컬럼 조합 매치 → `코드컬럼 '<col>' + 라벨컬럼 '<col>'` (첫 매치 컬럼명 명시)
- 미매치 → null. `isCodeTable = reason !== null` (기존 판정 결과 불변 — 순수 표면화).

## 4. ③ CRUD 매트릭스 탭 개편 (DataMapView)

### 4a. 신뢰도 라벨 정직화 (표시 계층)
ConfBadge(확정/추정 — 사람 확정 함의) 사용 중단. CRUD 전용 매핑으로 교체:

| JSON 값 | 라벨 | 톤 | title 툴팁 |
|---------|------|----|-----------|
| CONFIRMED | `근거확보` | ok | "SQL 문 근거(file:line)가 호출그래프로 추적됨 — 기계 판정" |
| INFERRED | `추정` | warn | "DB 접근 미검출 또는 메서드명 추론 — 기계 판정" |
| UNVERIFIED | `확인 필요` | err | — |

범례 줄에 "신뢰도는 정적 분석 자동 판정(사람 확정 아님)" 명시. RTM·노드편집의 사람 확정(CONFIRMED/CONFIRMED_AI) 의미 체계와 분리. `crud-matrix.json` 값·md 산출물 `[확정]` 마커는 비범위(§9).

### 4b. 빈 행 접기
`cells[1..]` 전부 빈 문자열 && evidence 0건 → 본 매트릭스에서 제외하고 하단 접이식 "DB 접근 미검출 기능 N건" (기능명 나열, 기본 접힘). jpetstore: 21행 → 본표 11행 + 접힘 10건.

### 4c. 검색·필터·피벗
- **기능 검색** input(기능명 부분일치) — 본표 행 필터.
- **테이블 필터** select(전체 | 테이블명) — 선택 시 해당 테이블 열만 + 그 테이블에 접근하는 행만 표시. 테이블 탭 상세의 "CRUD 매트릭스에서 보기"가 이 필터를 미리 채워 진입(§5c URL).
- **전치 토글** "기능 기준 ↔ 테이블 기준": 테이블 기준은 행=테이블, 열=기능(접근 있는 기능만). 데이터는 클라이언트 transpose — 계약 불변.
- **sticky**: thead `position: sticky top:0`, 첫 열(기능/테이블명) `sticky left:0` — 대형 매트릭스 가로·세로 스크롤 시 축 유지.

### 4d. 근거 클릭 → 코드 뷰어
"근거 N건" hover 툴팁 → 클릭 popover(작은 카드)로 승격: file:line 목록, 각 항목 클릭 시 `openCodeViewerAt(filePath, line)`(store 기존 API). 경로가 allowlist 밖이면 뷰어가 기존 방식대로 안내(별도 처리 불요).

## 5. ② 테이블 탭 개편 (DataMapView)

### 5a. 검색(테이블+컬럼)
트리 상단 검색 input 1개 — 소문자 부분일치, 대상: 테이블명 · 테이블 comment · **컬럼명 · 컬럼 comment**. 컬럼만 매치된 테이블은 트리 항목에 보조 라벨(`컬럼: CUSTOMER_ID 외 2`)을 표기하고, 선택 시 상세 컬럼 표에서 매치 행을 배경 틴트로 하이라이트. 매치 0건 → "검색 결과 없음" 안내(그룹 유지).

### 5b. 스케일(무의존 가상화)
- 트리 컨테이너 `max-height`(뷰포트 기반) + `overflow-y: auto`.
- 항목에 `content-visibility: auto` + `contain-intrinsic-size` — 신규 의존성 없이 수천 테이블까지 렌더 비용 상수화.
- 그룹 fold(업무/코드성)는 유지 — 대형 시스템에서 코드성 선별에 유효.

### 5c. URL 동기화 (단일 소스 원칙 정합)
useState → `useSearchParams` 이관: `/data?tab=tables|crud|code&table=<name>&q=<검색어>` (+ CRUD 필터 `crudq=`, `crudTable=`, `pivot=table`). 딥링크·새로고침·뒤로가기 동작. 테이블 상세 "CRUD 매트릭스에서 보기" → `?tab=crud&crudTable=<name>` 링크로 교체.

### 5d. 상세 보강
- 행 데이터 실측 테이블(rowCount>0)이면 상세 하단에 **행 데이터 샘플 섹션**(최대 5행, 코드 탭과 동일 렌더) — 구조와 값을 한 화면에서.
- 코드성 테이블이면 헤더에 `코드성` 배지 + title=`codeTableReason`(④). 트리의 코드성 배지에도 동일 툴팁.

## 6. ① unresolved 배너 개편 (DataMapView)

- severity 분리 집계: `warn`(및 미지정) vs `info`.
- warn > 0 → 현행 경고 배너(주황 보더) "미해결 항목 N건" — reason별 그룹핑(동일 reason 접두는 묶고 ref 나열)으로 13줄 나열 방지.
- warn = 0 && info > 0 → 중립 접이식(회색 보더) "참고 N건 — 동일 정의 중복 등 무해 신호". 기본 접힘.
- 각 항목 ref는 Ev(file:table) 유지.

## 7. ⑤ 코드 테이블 탭 (하이브리드 유지 → **2026-07-10 제거**)

> **결정 뒤집음(2026-07-10, 사용자 검수)**: 탭 제거. "코드값 일람"의 고유 가치가
> §5 개편으로 테이블 탭에 전부 흡수됨(검색·코드성 그룹 fold·배지+판정 사유 툴팁·
> 상세 행 샘플). 스캐너 50행 컷 때문에 대형 코드 테이블(egov COMTCCMMNDETAILCODE
> 39만 행)은 어차피 일람이 불완전해 "값을 진지하게 찾는" 용도로는 원본 SQL/DB가
> 낫다는 판단. 남은 차별점("여러 코드 테이블을 클릭 없이 한 번에")은 접기·검색을
> 추가로 붙여야만 성립 = 테이블 탭 재구현이라 투자 대비 없음. 구 `?tab=code`
> 딥링크는 tables 폴백. 아래 원 설계는 이력용.

- ~~**탭 유지 근거**: 코드값 일람(여러 코드 테이블의 실측 행을 한 화면에 카드로)은 구조 뷰와 관점이 다름. 단 상세 통합(§5d)으로 "테이블 탭에서도 값이 보이는" 중복 해소.~~
- ~~레이아웃: `lg:grid-cols-2` → `grid-template-columns: repeat(auto-fit, minmax(360px, 1fr))` — 1개면 전폭 1장(빈 열 소멸), 다수면 자동 다열.~~
- ~~카드 헤더에 판정 사유 표기: `판정: 테이블명 패턴 'category'` (Ev 스타일, ④ 데이터). 폴백 모드(코드성 0건 → 행 실측 테이블 표시)는 기존 안내 유지.~~

## 8. 구현 단계

| 단계 | 내용 | 산출 |
|------|------|------|
| P1 | 스캐너: ① 중복 diff+severity, ④ codeTableReason + zod + 테스트 | legacy-core 빌드 green, `db-schema.test.ts` 추가 케이스 |
| P2 | jpetstore 재추출(`extractDbSchema` 1회 실행 스크립트) → `.spec/map/db-schema.json` 갱신 → `pnpm sync:demo` | 13건 전부 info 확인, CATEGORY 사유 필드 확인 |
| P3 | 테이블 탭: 검색·가상화·URL 동기화·행데이터 섹션·코드성 툴팁 (§5) | DataMapView |
| P4 | CRUD 탭: 라벨 정직화·빈행 접기·검색/필터/전치·sticky·근거 popover (§4) | DataMapView |
| P5 | unresolved 배너(§6) + 코드 탭(§7) + 시각 QA(playwright headless, 고정토큰 별도포트) + lint/build/test + 버전 범프(5파일 + legacy-core) | 커밋 |

P3~P4로 DataMapView가 커지면 `data-map/` 하위로 탭별 파일 분리(TablesTab/CrudTab/CodeTab/UnresolvedBanner).

## 9. 비범위 (후속)

- `crud-matrix.json`의 confidence 값 개명 및 md 산출물(`07_crud-matrix.md`) `[확정]` 마커 정직화 — 문서 파이프라인 전반에 파급, 별도 건.
- CRUD 사람 확정 워크플로(행 단위 검수 → CONFIRMED_BY_USER) — RTM 확정 모델 차용 후보.
- 테이블 수천 개 규모의 서버측 검색 인덱스 — 클라이언트 필터로 충분해질 때까지 보류.
- xlsx 내보내기(기존 보류 항목)와 이 개편은 독립.

## 10. 리스크

- **재추출 회귀**: P2에서 db-schema.json 재생성 시 기존 소비자(정책 신호, 도메인 정책서, 테이블정의서 md)가 additive 필드에 관대해야 함 — zod `.optional()`이므로 파싱 영향 없음. 정책서 재생성은 하지 않음(기존 산출물 그대로).
- **스캔 캐시**: sql-facts 캐시 salt(`SQL_FACTS_SALT`)는 파일 팩트 계층이라 diff 로직(추출 계층)과 무관 — 캐시 무효화 불요. 단 codeTableReason은 추출 계층 재계산이라 역시 캐시 영향 없음.
- **URL 이관 회귀**: 기존 `/data` 진입(파라미터 없음)은 기본값(tab=tables, 첫 테이블 선택)으로 동작 보존.

## 11. ERD 2차 (2026-07-11) — 컬럼 앵커 + crow's foot 카디널리티

3차(FK↔PK 관계색·추정 FK·보기 모드 4종) 위에 얹은 ERD 2차 잔여 2건.

- **컬럼 앵커**: 엣지가 테이블 박스가 아니라 자식 FK 컬럼 행 ↔ 부모 참조 컬럼 행에 직접
  붙는다. `ErdTableNode` 키 행마다 숨김 Handle 4방(`{s|t}:{소문자 컬럼명}:{l|r}`) 등록,
  좌/우는 ELK 배치 후 노드 상대 x로 엣지가 선택(복합 FK는 첫 컬럼 기준). 행이
  MAX_KEY_ROWS로 잘려 안 보이면 노드 레벨 폴백 — sourceHandle 미존재 시 엣지가 아예
  안 그려지는 React Flow 특성 때문에 존재 확인(`base.shownCols`) 필수.
- **crow's foot**: 스키마 제약에서 결정론 유도(`erd-cardinality.ts` + vitest 10케이스).
  자식 끝 0..N(원+까마귀발) / FK 유니크(단일 unique 또는 FK 집합==PK 집합)면 0..1,
  부모 끝 1(바) / FK 전부 nullable이면 0..1. **추정 FK는 제약 근거가 없으므로 카디널리티
  무표기 — 점선만**(2026-07-11 검수: 무주장 까마귀발도 과주장이라 제거). 마커는 SVG defs
  (`ErdMarkerDefs`)로 관계색 5색+기본색 × 3형 생성. 범례의 1/0..1/N 글리프도 같은 검수로
  제거(선언/추정 선 스타일만 유지) — 표기 자체가 표준 관례라 별도 설명 불요 판단.
- **함정(재발 방지)**: React Flow에 문자열 마커를 주면 `url('#…')`로 이중 래핑한다 —
  `markerStart: "erd-many-d"`처럼 **id만** 넘길 것. `url(#id)`를 넘기면 마커가 조용히
  사라진다(콘솔 에러 없음).
- **PNG 내보내기**: html-to-image `toPng`으로 `.react-flow__viewport` 캡처. **화면 줌 무관
  zoom=1(테이블 실측 크기) 고정 + pixelRatio 2** — 테이블이 많아도 축소되지 않고 이미지가
  커진다. 브라우저 캔버스 한 변 한계(16k)를 넘으면 pixelRatio만 자동 축소(레이아웃 불변,
  `erd-export.ts` 순수 함수 + vitest 5케이스). 마커 defs는 `ViewportPortal`로 뷰포트 내부
  렌더 — 캡처가 뷰포트 서브트리만 클론하므로 밖에 두면 url(#) 참조가 끊겨 마커만 사라진다.
  Controls/MiniMap/배경 점은 뷰포트 밖이라 자동 제외, 파일명 `erd-{view}.png`.
- ERD 2차 잔여 없음(컬럼 앵커·crow's foot·PNG 전부 완료).
