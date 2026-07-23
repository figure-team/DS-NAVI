---
runId: 7f5b371025e124c4d42d7081aa2835a7
service: checkout
createdAt: 2026-06-23T16:44:02+09:00
confidence: medium
baselineCommit: a8cb69101fa78178a0a1999bd748fda30902fe2f
---

# 코드 RCA 리포트 — checkout

## 근본 원인

SOP 버전을 '문자열'로 크기 비교해서, 리비전이 두 자리(10 이상)가 되면 최신 버전을 못 고른다.
위치: pkg/types/ruletypes/sop_document.go:340 (latestApprovedSOPDocumentByID), 같은 파일 311 (latestSOPDocumentByID), frontend/src/container/CreateAlertV2/CreateAlertHeader/sopMetadata.ts:30 (resolveSopBindingDocument)
- 버전 형식은 `날짜.리비전`(예: 2026-05-01.3)인데, 숫자가 아닌 글자 순서로 비교한다.
- 그래서 `...1.10` 이 `...1.9` 보다 작다고 판정된다(첫 글자 '1' < '9'). 즉 리비전 10이 9보다 옛날 것으로 처리됨.
- 결과: 승인된 최신 리비전이 있어도 한 단계 옛날 리비전이 자동 채움/바인딩에 선택될 수 있다(SOP 10개 이상 쌓인 SOP에서 발생).

## 수정 제안

버전 비교를 문자열 대신 '날짜+리비전 숫자' 기준으로 바꾼다.
1. sop_document.go:340 과 :311 — `doc.Version > latest.Version` 문자열 비교 대신, 버전을 `날짜`와 `리비전(정수)`로 분리해 (날짜, 리비전) 순으로 비교하는 공용 함수(compareSOPVersion 등)를 만들어 사용.
2. sopMetadata.ts:30 — 동일하게 `version`을 `.` 기준으로 쪼개 날짜는 문자열, 리비전은 `parseInt`로 숫자 비교하도록 변경(백엔드와 규칙 일치).
3. (권장) 형식이 깨진 버전 문자열에 대한 폴백 처리와, 두 자리 리비전 케이스 테스트를 sop_document_test.go / sopMetadata.test.ts 에 추가.
※ 본 제안은 참고용이며 자동 적용되지 않음.

## 한계

- 에러 시그니처/로그가 비어 있어, 방금 바뀐 코드의 잠재 결함을 근거로 추정함(실제 장애 재현 미확인).
- 운영 데이터에 두 자리 리비전 버전이 실제로 존재하는지, 버전 형식이 항상 `날짜.리비전`인지는 확인 못 함.
