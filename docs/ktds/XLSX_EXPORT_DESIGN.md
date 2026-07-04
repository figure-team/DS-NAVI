# W7 설계 — xlsx 내보내기 (P4)

> 로드맵: `SI_EXPANSION_ROADMAP.md` P4 · 브랜치 `feat/si-expansion`
> 전제 조사(2026-07-05): `legacy-core/src/export/html.ts` 가 이미 "의존성 0·결정론·
> GeneratedDoc 입력" 관례를 확립 — xlsx 도 동일 철학. exceljs 류 의존성을 추가하지 않는다
> (vendor-deps 무증가, 폐쇄망 SI 환경 정합). 대시보드 문서 서빙은 라이브 dev 전용
> (doc-list/doc-content 미들웨어)이므로 xlsx 다운로드도 같은 레인에 붙인다.

## 1. 목표

발주처 제출용 xlsx — **RTM(요구사항 추적표)·인터페이스정의서·배치정의서·프로그램목록·
테이블정의서**를 xlsx 로. md 와 동일 데이터(빌더 산출 GeneratedDoc + rtm.json)에서
생성하며, 열 구성은 md 표와 1:1(도메인 열 + 신뢰도 + 근거) — 문서·엑셀 간 불일치 금지.

## 2. zero-dep xlsx 라이터 — `export/xlsx.ts`

- **ZIP**: STORE(무압축) + 수제 CRC32 + 고정 DOS 타임스탬프(1980-01-01) —
  동일 입력 → byte-identical(기존 결정론 불변식 유지).
- **SpreadsheetML 최소 구성**: `[Content_Types].xml`, `_rels/.rels`, `xl/workbook.xml`,
  `xl/_rels/workbook.xml.rels`, `xl/styles.xml`, `xl/worksheets/sheetN.xml`.
  문자열은 inlineStr(sharedStrings 생략 — 단순성 우선), 숫자 패턴(`^-?\d+(\.\d+)?$`)은
  숫자 셀로. 스타일 3종: 기본 / 헤더(굵게+회색 채움) / 강조행(굵게).
- **API**: `buildXlsxWorkbook(sheets: XlsxSheet[]): Buffer`,
  `XlsxSheet { name, rows: { cells: string[]; style?: 'header'|'bold' }[] }`.
  시트명 정제(금지문자 `\/:*?[]` 제거·31자 절단·중복 시 연번), 열너비 = 셀 최대
  길이 기반 [8..60] 결정론 산출.

## 3. 변환 — `export/xlsx-docs.ts`

- `docToSheets(doc: GeneratedDoc)`: 섹션 1개(표 보유) = 시트 1개.
  헤더 = `columns + 신뢰도 + 근거`(render.ts 규약 공유 — confidenceTag/evidence 셀
  헬퍼를 render 에서 export 해 단일 소스), 데이터 행 = cells + 태그 + `f:l` 나열.
  **집계 행 특수처리(W3 리뷰 L5)**: `confidence=INFERRED && cells[0] '집계' 시작` →
  강조행 스타일(P4 xlsx 에서 데이터 행과 시각 구분).
- `rtmToSheets(rtm)`: §1 요구사항 원장(REQ_ID·요구사항·유형·NFR·우선순위·수명주기·
  상태·선행요구·출처·수용기준 수), §2 기능 매핑(coverage 존재 시: 요구↔기능).
- 0행 시트도 헤더는 출력(스캔했고 없음의 증거 — 침묵 누락 금지).

## 4. 배선

- **understand-docs.mjs**: md 기록 직후 동일 GeneratedDoc 으로
  `doc-output/<docId>.xlsx` 병기 + `rtm.json` 존재 시 `doc-output/rtm.xlsx`.
- **dev 서버(vite.config.ts)**: `/doc-xlsx?docId=` — doc-output 의 xlsx 를
  올바른 MIME 으로 서빙(토큰 게이트 동일). `/doc-list.json` 에 `hasXlsx` 플래그.
- **DocsView**: 선택 문서에 xlsx 있으면 "xlsx 다운로드" 버튼(blob 다운로드 —
  ExportMenu 의 downloadBlob 관례).

## 5. 검증

- 라이터 단위: ZIP 시그니처/EOCD/엔트리 수, 시트 XML 내용, 시트명 정제, 숫자/문자
  셀 분기, **결정론(2회 byte-equal)**.
- **라운드트립(실측)**: 환경에 LibreOffice 부재 — python3 stdlib(zipfile+ElementTree)로
  압축 무결성+XML 정합+셀 값 재판독 검증(수용 기준의 "열림 확인" 대체는 §7 비고에 명시,
  사용자 환경 엑셀 열람은 후속 수동 확인).
- jpetstore 실측: 문서 11종+rtm → xlsx 생성, 셀 수 = md 표 행수 일치.
- 적대적 리뷰 2종 후 반영.

## 6. 단계

| 단계 | 내용 |
|---|---|
| P4-a | zero-dep xlsx 라이터 + 단위 테스트 |
| P4-b | GeneratedDoc/RTM → 시트 변환 + understand-docs.mjs 병기 |
| P4-c | dev 서버 /doc-xlsx + DocsView 버튼 + jpetstore 실측(라운드트립) |
| P4-d | 적대적 리뷰 + 반영 |

## 7. 진행 현황

| 단계 | 상태 | 커밋 | 비고 |
|---|---|---|---|
| 설계 | ✅ | | LibreOffice 부재로 열림 확인은 python 라운드트립 대체 |
| P4-a | ✅ | (본 커밋) | 라이터+15테스트, 결정론 byte-equal·python CRC/재판독 통과 |
| P4-b | ✅ | (본 커밋) | understand-docs 병기(문서 9종+rtm.xlsx), md 재생성 byte-diff=0 |
| P4-c | ✅ | (본 커밋) | /doc-xlsx(토큰 403·traversal 404)+hasXlsx+DocsView 버튼(시각 확인), examples xlsx 커밋 |
| P4-d | ✅ | (본 커밋) | 적대적 리뷰 2종 반영 — §9 |

## 9. 적대적 리뷰 반영 (2026-07-05)

### 설계 비평(critic) — 4건 전부 처리
1. *[심각] 확정 오버레이 미반영 다운로드(자기 불변식 위반)* → **정직성 배선**으로 대응:
   doc-list `xlsxStale`(확정 오버레이 존재 ‖ md 가 xlsx 보다 새로움 — mtime), DocsView 버튼이
   stale 시 앰버 경고 라벨("스냅샷 · 미반영 편집 있음")+안내 툴팁. **오버레이-병합 재생성은
   백로그**(md 가 진실이라는 지위를 문서정보 시트·툴팁에 명시). 설계 §1 문구도
   "빌더 산출 스냅샷" 으로 정정(하단 §1 주 참조).
2. *[심각] RTM 검증 스파인·현황 부재* → 요구 원장에 **검수(signoff)** 열, 기능 원장에
   **시험(test)** 열, **커버리지 현황 시트**(coverage 평탄화 — 추적표 '현황' 뷰 대응) 추가.
3. *[심각] 제출 서식 부적합* → **문서정보 표지 시트**(문서명·방법론·소스커밋·작성자
   [미확인] 사람-채움·본 파일의 지위·신뢰도 태그 의미 — "[확정]=정적 근거, 사인오프 아님"
   오독 방지) + **틀고정·자동필터**. 지위는 "원천 데이터(복붙 소재)" 로 명시.
4. *[심각] 신선도 미표시* → xlsxStale + 문서정보 소스커밋(타임스탬프 대신 — 결정론 유지).
   RTM 인테이크 후 rtm.xlsx 낡음은 rtm-overrides/후속 job 재생성과 묶어 백로그.

### 코드 리뷰(reviewer) — 8건: 2건 선수정 확인, 4건 수정, 2건 수용/백로그
- F1(불법 제어문자 → 파일 거부)·F3(stale xlsx 잔존): 선수정 완료를 리뷰어가 교차 확인.
- F2(rtm.xlsx UI 배선 부재 — 고아 산출물) → RtmView 헤더에 다운로드 버튼(+지위 툴팁).
- F4(시트명 dedupe 재충돌 → 워크북 손상) → 유일해질 때까지 연번 증가 루프.
- F6(15자리 초과 숫자 정밀도 손상) → 유효자리 15 초과는 문자열 유지.
- F7(시트명 따옴표/History 예약명) → 정제 규칙 추가. F8(다시트 EOCD 테스트) → 케이스 추가.
- F5(웹 확정 후 미재생성)는 비평 1 과 동일 — stale 경고로 표면화, 병합 백로그.

### 백로그
- 확정 오버레이(문서 md·RTM 행단위) 병합 xlsx 재생성(다운로드 시점 on-the-fly —
  md 표 파싱 경로), 셀 병합(표지 미관), 발주처 커스텀 서식 템플릿.

### §1 주(정정)
"md 와 동일 데이터에서 생성"의 정확한 의미: **빌더 산출 스냅샷 기준 동일**. 생성 이후의
사람 확정 편집(doc-overrides/rtm-overrides)은 md/탭에만 반영되며, xlsx 는 stale 경고로
그 사실을 표면화한다(침묵 불일치 금지).

## 8. 실측 결과 (2026-07-05)

- jpetstore: 문서 9종 + rtm.xlsx — 프로그램목록 2시트(75/37행), rtm 2시트(3/29행),
  테이블정의서 13시트, 0행 음성 시트(대외 연계·배치)는 헤더만(침묵 누락 금지).
- python zipfile 라운드트립: 전 파일 CRC OK, 셀 값 재판독 일치(escape·한글·숫자/선행0·공백).
- dev 서버: hasXlsx 플래그, MIME/RFC5987 파일명, 무토큰 403, 화이트리스트 밖 docId 404.
- 대시보드 빌드(tsc+vite) 통과, legacy-core 822 green.
