# W3 설계 — 프로그램 목록 + 규모·공수(FP) 산정 기초

> 로드맵: `SI_EXPANSION_ROADMAP.md` P3 · 브랜치 `feat/si-expansion`
> 전제 조사(2026-07-04): as-built `06_program-list` 는 그래프 노드 기반(도메인 그래프 필요,
> PG-001 순번 id — 블루프린트 골든 영역이라 무수정). W3 은 **census 기반**(그래프 불요,
> 스캔만으로 산출) + 내용 파생 안정 id 로 별도 SI 문서를 만든다.
> jpetstore 실측: 라우트 22(form 21+servlet 1) — 화면설계서 22화면과 일치, 테이블 13(ddl+data).

## 1. 목표

1. **프로그램 목록**: 감리 필수 산출물 — 소스 프로그램 단위(파일) 전수 인벤토리
   (유형·계층·LOC·근거). W1(interfaces)·W2(batch-jobs) 결과를 유형 판별에 취합.
2. **FP 산정 기초**: 트랜잭션 기능 후보(라우트)·데이터 기능 후보(테이블/DB링크)를
   결정론 추출하고, 간이법(평균복잡도) 가중치로 **잠정 FP 총점**을 [추정] 산출 —
   견적·변경 정산에서 PM 이 쓰는 첫 숫자.

## 2. 프로그램 단위·유형 판별 (결정론)

프로그램 1건 = census 소스 파일(java·jsp·MyBatis 매퍼 XML). 유형 우선순위:

| 유형 | 판별 |
|---|---|
| 화면 | 파일에 kind page/form/servlet/jsp 라우트 존재(routes.json filePath 역인덱스) |
| API | 파일에 kind api 라우트 존재 |
| 배치 | batch-jobs 의 handlerFile(또는 java 엔트리 filePath) |
| 서비스 / DAO / DB | `deriveStepLayer`(기존 AC-2 신호 + JPA) — service/dao/db |
| SQL매퍼 | xml 이면서 `<mapper` + `namespace` 포함(내용 판독) |
| 공통/기타 | 위 어디에도 안 걸림(layer unknown) |

- 우선순위: 화면 > API > 배치 > 계층 > 공통 (한 파일 다중 역할 시 상위 1개 + notes 에 나머지).
- LOC = 파일 라인 수(결정론 규모 근거). 업무명은 정적 분석 불가 — 문서에서 [미확인] 사람 채움(W2 교훈).
- id: `PGM-<유형태그>-<sha256 8hex>`(filePath 시드) — 재스캔 안정(W1/W2 교훈).

## 3. FP 후보 추출 (전부 [추정] 마킹 — 사람 재분류 전제)

- **트랜잭션 기능(라우트 1건=1후보)**: method GET/HEAD → EQ, 그 외(POST/PUT/DELETE/PATCH/ANY)
  → EI. **EO(파생 출력)는 정적 판별 불가 — 후보 없음이 아니라 "EQ/EI 로 잠정 분류됨"을
  문서에 명시**(사람이 리포트성 화면을 EO 로 재분류).
- **데이터 기능**: db-schema 테이블 → ILF, W1 db-link 항목(링크명 dedupe) → EIF.
- **잠정 FP(간이법 평균복잡도, [추정])**: ILF 7.5 · EIF 5.4 · EI 4.0 · EO 5.2 · EQ 3.9.
  가중치 출처·"보정 전 미조정(unadjusted) 잠정치"임을 문서에 명시.

## 4. 산출물 — `.spec/map/program-inventory.json`

```jsonc
{
  "schemaVersion": 1,
  "gitCommit": "<sha>",
  "programs": [
    { "id": "PGM-SCR-3fa2…", "name": "CartAction", "filePath": "src/…/CartAction.java",
      "type": "screen", "layer": "api", "loc": 182, "notes": ["route:R-012", "also:api"] }
  ],
  "fp": {
    "transactions": [{ "kind": "EQ", "routeId": "R-001", "method": "GET", "path": "/…",
                        "evidence": { "file": "…", "line": 12 } }],
    "dataFunctions": [{ "kind": "ILF", "name": "ORDERS", "evidence": { "file": "…", "line": 3 } },
                      { "kind": "EIF", "name": "ERP_LINK", "evidence": { "file": "…", "line": 6 } }],
    "summary": { "ei": 14, "eo": 0, "eq": 8, "unclassified": 0, "ilf": 13, "eif": 1, "unadjustedFp": 190.1 }
  },
  "stats": { "total": 45, "byType": [{ "type": "screen", "count": 20 }] }
}
```

정렬: programs (type, filePath) / transactions (routeId) / dataFunctions (kind, name).
0건도 기록. coverage 에 `programs {total, byType}` optional 통합 + runScan 한 줄.

## 5. SI 문서 — `si-프로그램목록` (5번째)

- 템플릿 `templates/doc/program-inventory.md`, 섹션 2개.
- §1 프로그램 목록 `{#program-list-si}`:
  `PGM_ID | 프로그램명 | 업무명 | 유형 | 계층 | LOC` — 업무명 [미확인](사람 채움),
  프로그램명 = 파일 basename(사실, 확정). 행 근거 = filePath:1.
- §2 규모산정(FP) 기초 `{#fp-basis}`:
  트랜잭션/데이터 후보 표(`구분[추정] | 대상 | 상세`) + 집계 표(EI/EO/EQ/ILF/EIF/잠정FP).
  범례: 간이법 가중치·EO 재분류 안내·미조정 잠정치.

## 6. 검증

- **픽스처** `fixtures/program-inventory/mini/`: spring 컨트롤러(GET+POST)+서비스+DAO+JSP+
  매퍼XML(dblink 포함)+DDL(2테이블)+@Scheduled 배치 — 유형 전 분기 + FP 집계 골든.
- **jpetstore 실측(수용 기준)**: 화면 유형 프로그램의 라우트 합=22(form21+servlet1),
  ILF=13(db-schema 테이블 수 일치), byte-diff=0.
- 적대적 리뷰 2종(비평+코드) 후 반영.

## 7. 단계

| 단계 | 내용 |
|---|---|
| P3-a | program-inventory 모듈(유형 판별+FP 후보+집계) + 파이프라인·coverage 통합 |
| P3-b | si-프로그램목록 문서(2섹션)+템플릿 |
| P3-c | 픽스처 골든 + jpetstore 실측 + 결정론 |
| P3-d | 적대적 리뷰 + 반영 |

## 8. 진행 현황

| 단계 | 상태 | 커밋 | 비고 |
|---|---|---|---|
| 설계 | ✅ | | |
| P3-a~c | ✅ | fd3940e, 7b35a83 | 수용 기준 통과(화면 22·ILF 13), 814 green |
| P3-d | ✅ | (본 커밋) | 적대적 리뷰 2종 반영 — §10 |

## 9. 실측 결과 (2026-07-04, 리뷰 반영 후)

- **jpetstore**: 프로그램 74본(도메인 조인 63/74), 화면 라우트 22 ✓, ILF 13 ✓,
  **미분류 트랜잭션 22건(전 라우트 ANY)·EI 0 → 잠정 FP 하한 97.5** — ANY 를 EI 로
  뭉개던 초기 산출(185.5)의 체계적 왜곡이 제거된 정직한 하한.
- excluded 표면화: configXml 8, 기타 언어(gif/png/css 등) 64건 — total=74 의 "전수" 오독 차단.
- 전 파이프라인 byte-diff=0.

## 10. 적대적 리뷰 반영 (2026-07-04)

### 설계 비평(critic) — 6건 전부 처리
1. [치명] *ANY→EI 뭉개기로 FP가 라우트×4+테이블×7.5*(EO·EQ·EIF 구조적 0) →
   **UNCLASSIFIED 버킷** 신설(합산 제외·문서 '미분류' 표기), 집계에 미분류 수 노출.
2. [높음] *단일 스칼라 정밀 착시* → 집계 셀을 **"잠정 FP ≥ N (미조정 하한 — 재분류 시 상향)"**
   으로 — 숫자만 복사돼도 경고가 따라감.
3. [높음] *candidates.json 도메인 조인 누락* → `programs[].domain/domainVia` +
   문서 '소속도메인' 열(reachability=무마킹, directory/prefix/모호=[추정], 공용 표기).
   candidate roots 도 조인(root 파일이 files[] 에 없는 갭 발견·수정).
4. [중] *common 38% 매몰* → 도메인 조인으로 절반 완화 + 범례에 "계층 신호 없음
   (미분류 아님)" 명시. domain/util 유형 세분은 백로그.
5. [중] *suspect/제외 표면화 부재* → `stats.excluded{configXml, otherLang[], unreadable}`.
6. [낮음] *라우트≠기본 프로세스* → 범례 명시.

### 코드 리뷰(reviewer) — CRITICAL/HIGH 0건
- M1(LOC +1 과대·오라클 라벨 부정직): 선수정 7b35a83 에서 해소 확인.
- M2(ANY/OPTIONS→EI)·M3(제외 침묵): 위 비평 1·5와 동일 — 반영 확인.
- L1(이중 컨트롤러 api routeId 유실) → notes 에 api routeId 보존.
- L2(EIF dedupe 대소문자) → 대문자 정규화.
- L4(id 유형태그의 재분류 시 변경) → 트레이드오프 주석 명시(육안 카테고리 스캔 우선).
- L3(web.xml=screen 의미론)·L5(집계행 P4 xlsx 특수처리) → 백로그.
- 설계문서 예시 산술 오류(158.2→190.1) 정정.

### 백로그
- common 세분(domain/util/config), git 작성자·최종변경일 열(P7 실적요약 계열과 묶음),
  web.xml 프로그램 의미론, P4 xlsx 집계행 특수처리, EO 재분류 보조(리포트성 화면 힌트).
