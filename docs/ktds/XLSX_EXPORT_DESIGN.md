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
| P4-d | ⬜ | | 적대적 리뷰 대기 |

## 8. 실측 결과 (2026-07-05)

- jpetstore: 문서 9종 + rtm.xlsx — 프로그램목록 2시트(75/37행), rtm 2시트(3/29행),
  테이블정의서 13시트, 0행 음성 시트(대외 연계·배치)는 헤더만(침묵 누락 금지).
- python zipfile 라운드트립: 전 파일 CRC OK, 셀 값 재판독 일치(escape·한글·숫자/선행0·공백).
- dev 서버: hasXlsx 플래그, MIME/RFC5987 파일명, 무토큰 403, 화이트리스트 밖 docId 404.
- 대시보드 빌드(tsc+vite) 통과, legacy-core 822 green.
