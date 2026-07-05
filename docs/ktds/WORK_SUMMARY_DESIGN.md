# W6 주간/월간 실적 요약 설계 — /understand-report

> 작성: 2026-07-05 · 브랜치: `feat/si-expansion` · 로드맵: `SI_EXPANSION_ROADMAP.md` §W6 (P7)
> 배경: PM 주간/월간 보고의 "지난 기간 무엇이 되었나"를 수작업 회고 없이 산출.
> `next-weekly-review.md` 흐름(외부 관행)의 일반화 — 레포 내 선행 구현은 없음(로드맵이 유일 스펙).

## 1. 목표 · 수용 기준

기간(git 범위) 내 **작업 실적·변경 모듈·RTM/문서 진척(추정→확정 전환 수)** 을 결정론
수집하고, 사람 말 요약이 붙은 SI 문서(si-실적요약보고서)로 산출한다.

수용 기준(로드맵 §W6):
- 이 레포(code-2) 자체의 최근 1주로 실측.
- **날조 0** — 요약의 모든 서술은 수집된 사실(커밋·파일·원장 이벤트)만 인용.
- 동일 HEAD + 동일 인자 재실행 시 work-summary.json byte-diff=0(결정론 관례).

날조 0 의 구조적 보장: 사람 말 요약 문장은 **LLM 이 아니라 수집 데이터에서 결정론
템플릿으로 조립**한다(§3.5). LLM 자유 서술은 스킬 레인의 선택 보강으로 한정하며
[추정] 마킹 + 문서 편집·확정 플로우(사람 게이트)를 그대로 태운다 — 엔진 산출물에는
LLM 산문이 섞이지 않는다.

## 2. 입력 (전부 기존 산출물/원장 재사용)

| 입력 | 위치 | 없을 때 |
|---|---|---|
| git 이력 | `git log --numstat` (projectRoot) | null → 전 섹션 [미확인] (침묵 누락 금지) |
| 프로그램 목록(W3) | `.spec/map/program-inventory.json` | 모듈 귀속을 최상위 디렉터리 버킷으로 폴백 |
| RTM 확정 원장 | `.understand-anything/rtm-overrides.json` | RTM 진척 = 원장 없음 [미확인] (0 과 구분) |
| 문서 확정 원장 | `.spec/docs/*.state.json` | 문서 진척 = 원장 없음 [미확인] |

새 스캔은 없다. UA-core(understand-anything-plugin)는 수정하지 않는다 —
`/understand-diff` 확장안은 UA-core 불변 원칙 위반이라 기각, **ktds-legacy-plugin 에
신규 스킬 `/understand-report`** 로 간다(패턴 참조만: diff-overlay 의 git 범위 수집).

## 3. 수집·계산 근거 (결정론)

### 3.1 기간 해석 — 벽시계 금지

엔진은 `Date.now()`/`new Date()` 를 호출하지 않는다(전 모듈 관례). 기간은 두 방식:

- **명시 범위** `--range <from>..<to>`: `git rev-list from..to` 집합 그대로(날짜 무관).
  to 생략 시 HEAD. 동일 레포 상태 ⇒ 동일 집합. **시각 윈도가 없으므로 원장(RTM/문서)
  진척은 [미확인]으로 degrade** — 커밋 집합으로 시각 범위를 지어내지 않는다(날조 금지).
- **상대 기간** `--weeks N`(기본 1) / `--month YYYY-MM`: 앵커 = **HEAD(=to) 커밋의
  committer date**. 윈도 = 반개구간 `(anchor − N×7일, anchor]`, month 는
  `[YYYY-MM-01T00:00:00Z, 익월 1일)` 반개구간. 벽시계가 아닌 커밋 시각 앵커라서
  같은 HEAD 면 언제 실행해도 같은 결과.

meta 에 해석 결과를 박제한다: `{mode, rawArg, fromIso|fromSha, toIso|toSha, anchorSha}`.

### 3.2 git 수집 — churn.ts(W4) 관례의 일반화

`collectWorkLog(projectRoot, spec)` — 주입식 수집기(픽스처 테스트는 고정 WorkLog 주입):

- `execFileSync git -C <root> -c core.quotepath=false` + `stdio pipe` + 256MB 상한(churn 동일).
- **shallow 감지 → null**: 잘린 이력은 같은 커밋에서도 클론마다 달라 결정론을 깬다(W4 R1).
- **좌표계**: `rev-parse --show-prefix` 로 접두어를 벗겨 census relPath 좌표계로(모노레포
  vendored 실측 케이스 동일).
- 1회 실행: `git log --numstat --no-renames --format=<구분자 커스텀>` 으로 커밋 헤더
  (sha·committer date `%cI`·author name `%an`·subject `%s`)와 numstat 행을 동시 파싱.
  이메일은 수집하지 않는다(PII 최소화).
- **날짜 축 = committer date**: cherry-pick/rebase 후에도 "이번 주에 랜딩됐다"가 기준
  (author date 는 원 작성 시점이라 실적 주간과 어긋남). merge 커밋은 목록에 포함하되
  `isMerge` 플래그(numstat 무발행 → 파일 통계에 자연 제외).
- **정렬을 git 출력에 의존하지 않는다**: 코드에서 committer date DESC, sha ASC
  tie-break 로 재정렬(byte 결정론).

### 3.3 모듈 귀속

변경 파일 → 모듈 매핑, 우선순위:
1. `program-inventory.json` 이 있으면 프로그램의 relPath 로 조인 → 프로그램/도메인 단위 집계.
2. 없으면(이 레포 실측 케이스) 최상위 디렉터리 버킷(`docs/`, `ktds-legacy-plugin/…` 1~2단).
미귀속 파일은 `[미확인]` 버킷 — 침묵 누락 금지.

### 3.4 RTM·문서 진척 — 원장 audit[] 스캔

시점 합계(coverage.confirmed)는 윈도 내 **전환 수**를 주지 못한다 — 타임스탬프가 있는
원장만이 근거다:

- RTM: `rtm-overrides.json` 의 기능(fnId 최상위)·`_scenarios`·`_requirements` 오버레이가
  각각 `audit[]{event,by,at}` 보유. **확정 이벤트 = `CONFIRMED` | `CONFIRMED_NO_EDIT`**
  (기록처: 대시보드 dev 서버), 편집 = `EDITED`. 전환 수 = **엔티티별 최초 확정 이벤트의
  at 이 윈도 안**인 엔티티 수(재확정 중복 집계 방지). 부가로 윈도 내 이벤트 총수(확정/편집)
  도 집계.
- 문서: `.spec/docs/*.state.json` audit 의 `SUBMITTED`/`APPROVED`/`RETURNED` 윈도 내 건수
  + APPROVED 전환 문서 목록.
- at 은 ISO 문자열 — 파싱 실패 항목은 드롭하지 않고 `unparsableAt` 카운트로 표면화.
- 원장 파일 자체가 없으면 null(0 과 구분, [미확인] 표기). zod 파싱은 기존 스키마 재사용.

주의: 원장 audit 은 git 이력이 아니라 **작업트리의 현재 상태**다 — 과거 시점의 원장
스냅샷 복원은 하지 않는다(git 에 커밋되지 않는 파일). 문서에 이 한계를 명기한다(§5).

### 3.5 사람 말 요약 — 결정론 템플릿 문장

하이라이트 절은 수집 수치를 고정 한국어 문형에 끼운다. 예:
"기간 {from}~{to} 에 커밋 {n}건({m}명), 파일 {f}개 변경(+{a}/−{d}). 변경 상위 모듈:
{top3 목록}. RTM 확정 전환 {r}건(기능 {x}·시나리오 {y}·요구사항 {z}), 문서 승인 {w}건."
수치가 null([미확인])인 절은 문장을 생략하는 대신 "{항목}: 원장 없음 [미확인]" 으로
치환(침묵 누락 금지). 모든 표 행은 confidence + 근거(커밋 sha 또는 원장 키) 열 보유.

## 4. 산출물 — `.spec/map/work-summary.json`

`WORK_SUMMARY_FILENAME = 'work-summary.json'`, 호출자가 writeMapArtifact(risk-report 관례).

```jsonc
{
  "schemaVersion": 1,
  "gitCommit": "<HEAD sha|null>",            // 앵커(결정론 선언)
  "range": { "mode": "weeks|month|range", "rawArg": "1", "fromIso": "...", "toIso": "...", "anchorSha": "..." },
  "commits": [ { "sha": "...", "dateIso": "...", "author": "...", "subject": "...", "isMerge": false,
                 "files": [{ "path": "...", "added": 3, "deleted": 1 }] } ],   // date DESC, sha ASC
  "totals": { "commits": 0, "mergeCommits": 0, "authors": 0, "files": 0, "added": 0, "deleted": 0 },
  "modules": [ { "key": "...", "source": "program-inventory|dir", "commits": 0, "files": 0,
                 "linesChanged": 0, "topFiles": ["..."] } ],                   // linesChanged DESC, key ASC
  "rtmProgress": null | { "functionsConfirmed": 0, "scenariosConfirmed": 0, "requirementsConfirmed": 0,
                          "confirmEvents": 0, "editEvents": 0, "auditlessEntities": 0, "unparsableAt": 0 },
  "docProgress": null | { "submitted": 0, "approved": 0, "returned": 0,
                          "approvedDocs": ["<docId>"], "unparsableAt": 0 },
  "meta": { "gitAvailable": true, "gitStatus": "ok|no-git|shallow", "prefix": "", "moduleSource": "program-inventory|dir" }
}
```

구현 조정(설계 대비): `unresolved` 버킷은 없다 — 디렉터리 폴백이 전 파일을 귀속하므로
미귀속이 발생하지 않는다(루트 파일은 `(root)`). `topFiles`(모듈당 변경 상위 3파일)는
문서 행의 file 근거 승계용 — 없으면 모듈 표가 전행 무근거 INFERRED 가 되어 문서
승인 게이트(INFERRED>0.6)에 조직적으로 걸린다(jpetstore 실측 31%→54% 개선).
`auditlessEntities` = audit[] 없는 구원장 엔티티의 at 폴백 집계 표면화(최초/재확정
구분 불가 한계를 수치로 노출).

git 불가/shallow → `commits:[]` + `meta.gitAvailable=false`(또는 shallow=true) — 문서는
전 섹션 [미확인]. 배열 전부 명시 정렬(byte 결정론).

## 5. SI 문서 — si-실적요약보고서 (14종째)

- `DOC_SET` 에 `{ docId: 'si-실적요약보고서', templateFile: 'work-summary.md', build: buildSiWorkSummary }` 추가.
- `DocInput.workSummary?: WorkSummaryReport | null` 추가(shared.ts) — understand-docs.mjs 가
  `.spec/map/work-summary.json` 로드(다른 W 산출물과 동일 관례, 손상/부재 시 null → 0행 아닌
  [미확인] 현황 행).
- 섹션: 문서정보 → §1 실적 하이라이트(§3.5 템플릿 문장) → §2 기간·산정 기준(committer date
  축·반개구간·원장은 현재 상태라는 한계 명기) → §3 커밋 이력 표(sha 8자·날짜·작성자·제목)
  → §4 모듈별 변경 표 → §5 RTM/문서 진척 표.
- confidence: git/원장 실측 행 = CONFIRMED(근거: sha·원장 키), 디렉터리 폴백 모듈 귀속 행 =
  INFERRED([추정]), 원장 없음 = [미확인].
- xlsx 병기는 docToSheets 로 무배선 무료(W7). 템플릿 `templates/doc/work-summary.md`
  (사람 편집 가능, 프로젝트 override 관례 동일).
- **stale 주의**: 문서 기간은 생성 시점 range 를 박제 — understand-docs 재실행 시 이전
  work-summary.json 의 기간이 그대로 재렌더된다(§2 에 기간 명시로 가시화, 자동 재수집은 백로그).

## 6. 스킬/스크립트 배선 — /understand-report

- `skills/understand-report/SKILL.md`(신규): 사용법 3형
  `[projectRoot] [--weeks N | --month YYYY-MM | --range A..B]`. 기존 스킬 관례(한국어,
  "확정은 사람이 대시보드에서", 헤드리스 노트) 준수.
- `scripts/understand-report.mjs`(신규): ①수집(collectWorkLog + 원장 스캔) →
  ②`.spec/map/work-summary.json` 기록 → ③si-실적요약보고서 **단독 빌드**(템플릿 로드 →
  renderMarkdown → doc-output/…md + xlsx). **domain-graph.json 을 요구하지 않는다** —
  DocInput 은 `{nodes:[], edges:[], workSummary, programInventory}` 최소 구성. 근거: 수용
  기준의 실측 대상(이 레포)은 그래프가 없다. 그래프가 있는 타깃에서 understand-docs 를
  다시 돌리면 전체 세트에 자연 편입.
- LLM 레인(선택): 스킬 md 가 생성된 문서를 읽고 경영진 관점 보강 서술을 [추정] 마킹으로
  제안 → 기존 문서 편집·확정 플로우로만 반영(엔진 산출물 불가침).

## 7. 검증

- **픽스처** `fixtures/work-summary/`: tmp 디렉터리 `git init` + `GIT_AUTHOR_DATE`/
  `GIT_COMMITTER_DATE` 고정 스크립트 커밋(churn 테스트 관례) — 윈도 필터(반개구간 경계
  커밋 포함/제외)·머지 플래그·prefix 벗기기·정렬 검증. git 없는 디렉터리 → null,
  shallow → null.
- **원장 픽스처**: rtm-overrides.json/state.json 고정 JSON — 최초 확정 vs 재확정 중복
  방지, 윈도 밖 이벤트 제외, unparsableAt 표면화, 원장 부재 = null(≠0).
- **빌더**: 고정 WorkSummaryReport → 문서 스냅샷, 2회 실행 byte-diff=0. DOC_SET 13→14
  회귀. null 입력 → [미확인] 현황 행.
- **실측(수용 기준)**: 이 레포 최근 1주(`--weeks 1`) — 커밋 목록이 `git log` 실물과 일치,
  문서의 모든 수치·문장이 work-summary.json 사실에서만 유도됨을 확인. 재실행 byte-diff=0.

## 8. 단계

- P7-a 설계문서(본 문서) ✅
- P7-b `legacy-core/src/work-summary/` — 기간 해석 + collectWorkLog + 원장 스캔 + buildWorkSummary(+테스트)
- P7-c buildSiWorkSummary + 템플릿 + DOC_SET/DocInput 배선(+테스트)
- P7-d `/understand-report` 스킬 + understand-report.mjs 단독 빌드 경로
- P7-e 실측(이 레포 1주) + 적대적 리뷰 2종(critic/code-reviewer) + disposition

## 9. 백로그

- 대시보드 산출물 탭에서 기간 선택 재수집 버튼(현재는 CLI 재실행)
- work-summary stale 자동 감지(생성 앵커 sha ≠ HEAD 경고 — xlsxStale 패턴) + 원장
  파일 해시 앵커 병기(진척 수치의 재현 경계 명시 — 리뷰 C2 후속)
- **작성자별 실적 분해는 제공하지 않는다(정책 확정, 리뷰 C5)** — 커밋 표의 작성자
  열은 이력 투명성 목적(git 공개 정보)으로만 노출하고 문서 §2 에 명기. 집계·분해
  기능을 추가하려면 민감도 재검토 선행.
- 다주 추이(직전 기간 대비 증감) — 기간 2개 수집 비교(리뷰 지적: 주간보고 최대
  가치 축, work-summary.json 2개 비교로 구현 가능 — 차기 우선 후보)
- RTM 원장의 git 이력 추적(원장을 커밋하는 운영 관례 도입 시 과거 시점 복원 가능)
- 생성물 패턴 프로젝트 커스텀 seam(현재 고정 목록 GENERATED_PATH_PATTERNS — 리뷰 C1 후속)
- month 경계 타임존 옵션(현재 UTC 고정, 문서 명기 — 리뷰 R5: KST 월경계 수요 시)
- 커밋 제목 RS 제어문자·경로 제어문자 인용 파싱(리뷰 R7/R8 — 실무 미발생 판단, churn R7 동일)

## 10. 진행 현황 (ledger)

| 단계 | 상태 | 커밋 | 비고 |
|---|---|---|---|
| P7-a 설계 | ✅ | c0501fc | 본 문서 |
| P7-b 수집·리포트 모듈 | ✅ | a8bcbee | work-summary/(collect+집계), 테스트 17건 |
| P7-c SI 문서·배선 | ✅ | b2a743c | si-실적요약보고서(14종째)+템플릿+DOC_SET/DocInput |
| P7-d 스킬·스크립트 | ✅ | 499198d | /understand-report, 그래프 무관 단독 빌드, topFiles 근거 |
| P7-e 실측·리뷰 | ✅ | 06d29f9 | §11 실측 + 적대적 리뷰 2종 반영(§12 disposition) |

## 11. 실측 결과 (2026-07-05)

- **이 레포(수용 기준) `--weeks 1`**: HEAD b2a743c 기준 윈도 (2026-06-28T10:10:57Z ~
  2026-07-05T10:10:57Z] — 커밋 87건(머지 1) · 파일 326개(+43272/−8333). `git log
  --since/--until` 실물 87건과 **정확 일치**. 재실행 md5 동일(byte-diff=0). 상위 모듈
  examples/ktds-legacy-plugin/understand-anything-plugin(디렉터리 버킷). RTM/문서 진척은
  원장 부재로 [미확인](이 레포는 분석 대상이 아니라 개발 레포 — 정직한 degrade).
  근거율 78%.
- **jpetstore(vendored 하위 디렉터리) `--weeks 2`**: prefix `examples/jpetstore-6/` 벗김
  정상, program-inventory 도메인 조인(order/account/web-inf) + dir 폴백 혼합. 커밋 12건
  · 파일 212개. 근거율 54%(topFiles 근거 승계 전 31% — 승인 게이트 차단선 아래였음).
- **`--range 2572453..HEAD`**: rev-list 집합 35건, 진척 [미확인](시각 윈도 없음) 정상.
- 테스트: legacy-core 903 green(work-summary 17 + si-work-summary 8 포함), 골든
  스냅샷(si-실적요약보고서 스켈레톤) 1건 추가.
- **리뷰 반영 후 재실측(06d29f9)**: 이 레포 1주 = 커밋 88건 · 실적 파일 275개
  (+26776/−6210) · **생성물 별도 53개(+16784/−2140)** — 상위 모듈이 examples(벤더링
  잡음)에서 ktds-legacy-plugin·understand-anything-plugin·opencode-plugin(실작업)으로
  교정(C1 해소 실증). 재실행 md5 동일. jpetstore 근거율 51%. 테스트 910 green.
  주의: `git log --since/--until` 대조는 근사 검증(경계 포함성 상이 가능) — 반개구간
  포함성 자체는 report.test 의 경계 케이스가 직접 단언(리뷰 C8).

## 12. 적대적 리뷰 반영 (2026-07-05, 06d29f9)

설계 비평(critic, REVISE — 중대 5·경미 3) + 코드 리뷰(code-reviewer, COMMENT — M4·L5·OQ1).

**설계 비평 disposition**
- C1(중대, 반영): 헤드라인 churn 이 기계 생성물에 오염(screens.json 13,230줄이 상위
  파일 1위 — 실증). → `GENERATED_PATH_PATTERNS` 분리 집계(totals.generated, 모듈
  귀속 제외, meta 에 패턴 박제, §2 기준 행). 재실측: 상위 모듈 examples(±17,279)
  → ktds-legacy-plugin(±16,649) 등 실작업으로 교정, 생성물 53개(±18.9k) 별도 표기.
- C2(중대, 반영): "byte 동일" 재현 주장이 원장(작업트리 현재 상태) 변동과 내부 모순.
  → §2 재현 행을 "git 실적은 byte 동일 / 진척은 원장 현재 상태 기준(재현 경계)"으로
  조건화. 원장 해시 앵커는 백로그.
- C3(중대, 반영): weeks/month 가 전체 이력 수집 → 대형 레포 256MB 절벽 + no-git 오진단.
  → 스크립트가 해석 윈도 −1일 여유로 `--since` 바운드 전달(결정론 불변, 테스트 고정),
  수집기는 maxBuffer/ENOBUFS 를 gitStatus 'too-large' 로 구분 표면화.
- C4(중대, 반영): RTM 진척 count-only(문서 진척 approvedDocs 와 입도 비대칭).
  → `*ConfirmedIds`(ASC, 상한 20 + "외 N건") 병기, 문서 비고에 나열.
- C5(중대, 정책 명문화): 작성자 노출 vs "작성자별 분해 기본 비활성" 백로그 모순.
  → (b)안 채택 — 커밋 표 작성자 열은 이력 투명성 목적 유지, **집계·분해는 제공하지
  않음**을 §2 산정 기준 행 + §9 백로그에 정책으로 확정.
- C6(경미, 문구 정확화): auditless at 폴백은 "최초/재확정 구분 불가"가 아니라 **확정
  여부 자체 구분 불가**(편집만 된 구원장도 전환 계상 가능) — 코드 주석·문서 비고 교정.
- C7(경미, 반영): 하위 디렉터리 모드 머지 과소 — §2 에 조건부 캐비엇 행 자동 추가.
- C8(경미, 백로그+검증 보완): 반개구간 방향 비대칭은 §2 문서화 유지. §11 의
  `--since/--until` 대조는 근사 검증임을 명기(경계 포함성은 단위테스트가 직접 단언).

**코드 리뷰 disposition**
- R1(M, 반영): weeks/month 불량 인자 uncaught throw → 스크립트 사전 검증 + try/catch(exit 2).
- R2(M, 반영): collectWorkLog 공개 API 의 git 옵션 인젝션 → `-` 시작 revRange/sinceIso
  거부(throw) + 테스트.
- R3(M, 반영): 최초 확정 at 손상 시 윈도 안 재확정이 전환으로 오계상 → 확정 이벤트
  at 파싱 실패 엔티티는 전환에서 보수적 제외 + `suspectEntities` 표면화 + 테스트.
- R4(M, 반영): 모듈 key 충돌(도메인명=디렉터리명) 동점 정렬 비결정 → source tie-break
  명시 + 테스트.
- R5(OQ, 문서화+백로그): month UTC 경계의 tz 오귀속(월초 ±9h) — §2 에 UTC 경계 명기,
  tz 옵션은 백로그(결정론 우선).
- R6(L, 반영): `A...B` 3점 → 전용 안내 메시지. R7/R8(L, 백로그): RS 제어문자·경로
  인용 — collect.ts 주석 명기(실무 미발생). R9(L, 주석): `_` 접두 예약 관례 의존 명기.
  R10(L, 반영): 배열형 최상위 오버레이 값 가드 + 테스트.

반영 후: 910 테스트 green(신규 8), 골든 스냅샷 갱신 1(문구 변경 의도분), 재실측
byte-diff=0 유지, jpetstore 근거율 51%(승인 차단선 0.6 미만 유지).
