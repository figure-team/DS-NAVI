# 구조 탭 "영향도 분석" 버튼 설계 — 자연어 → `claude -p /understand-impact`

> 상태: 구현 완료 · jpetstore-6 실측 검증(overlay 생성 confirmed)
> 대상: `understand-anything-plugin/packages/dashboard`
> 테스트 환경: jpetstore-6 에 `ktds-legacy@understand-anything` 설치, `GRAPH_DIR=.../jpetstore-6 npx vite --host 127.0.0.1` (5173)
> 토큰 주의: `vite.config.ts` 편집 시 dev server 재시작으로 액세스 토큰이 회전한다. 반복 편집 시
> `UNDERSTAND_ACCESS_TOKEN=dev` 로 고정 실행 권장(`?token=dev` URL 고정).

## 1. 목표

구조 탭(structural viewMode)에 **"영향도 분석"** 버튼을 추가한다. 클릭하면 자연어 입력
모달이 뜨고, 입력을 제출하면 대시보드 dev server가 분석 대상 프로젝트에서
`claude -p "/understand-impact <자연어>"` 를 실행한다. 스킬이
`.understand-anything/impact-overlay.json` 을 갱신하면 대시보드가 이를 재로드하여
구조 그래프 위에 변경/영향 노드를 색칠한다(기존 impact 오버레이 채널 재사용).

```
[구조 탭: 영향도 분석 버튼]
   → 자연어 입력 모달
   → POST /impact-analyze?token=  { query }
   → vite dev server: detached spawn
        claude -p "/understand-impact <query>" --permission-mode bypassPermissions
        (cwd = GRAPH_DIR = 분석 대상 프로젝트 루트)
   → /understand-impact 스킬이 .understand-anything/impact-overlay.json 갱신
   → 프론트가 GET /impact-status 폴링 → done 시 impact-overlay.json 재fetch
   → setOverlayData('impact') → overlaySource='impact' + diffMode ON
   → 구조 그래프 변경/영향 색칠 + 완료 토스트
```

## 2. 결정 사항 (확정)

1. **실행 방식 = 완전 자동 (claude -p 단일 실행).** `/understand-impact` 의 원래
   "시드 매핑 → 사용자 승인 게이트 → analyze" 2단계 중 대화형 승인 게이트는
   헤드리스에서 불가하므로 생략하고, claude 가 시드 후보를 스스로 정해 analyze 까지
   자율 수행한다. 실제 SI 플로우에서 게이트가 의미 있으므로 "2단계(seeds→승인→analyze)"는
   **후속 옵션**으로 남긴다.
   - ⚠️ **게이트 오버라이드 필수(구현 교훈):** SKILL.md 33행이 "✋ 확인 게이트(생략 불가)
     … 절대 임의로 진행하지 말 것" 을 명시해, 단순히 `/understand-impact <query>` 만
     보내면 헤드리스 claude 가 시드 후보만 제시하고 **멈춰서 overlay 를 생성하지 않는다**
     (영향도 토글이 켜지지 않는 증상). 따라서 spawn 프롬프트에 **자율 지시**
     (`IMPACT_AUTONOMY_DIRECTIVE`: "승인은 이미 부여됨 — 멈추지 말고 analyze 까지 실행해
     impact-overlay.json 을 생성하라")를 덧붙인다. jpetstore 실측에서 이 지시 추가 후
     ~60초에 `impact-overlay.json`(changed 4 · affected 16) 정상 생성 확인.
2. **진행 UX = 헤더 전역 인디케이터 + 모달 자유 닫기 + 완료 토스트.** job 상태는 모달이
   아니라 Zustand 전역 스토어에 둔다. 입력 후 모달을 닫고 다른 탭을 봐도 상태가 유지되며,
   완료 시 토스트 + overlay 자동 리로드/토글 ON.

## 3. 근거 (현행 코드 확인)

- **서버 = vite dev server가 정식 경로.** `/understand-dashboard` 스킬이
  `GRAPH_DIR=<project> npx vite --host 127.0.0.1` 로 띄운다. dev/preview 구분 없음.
  토큰+allowlist 미들웨어는 `vite.config.ts` 의 `configureServer` 훅에만 존재
  (`configurePreviewServer` 없음). 새 엔드포인트를 여기 추가하면 실제 사용자 플로우에서 동작.
- **node 서버** → `child_process.spawn` 가능. `process.env.GRAPH_DIR` 로 분석 대상 루트를 안다.
  (`graphFileCandidates`/`projectRootFromGraphFile` 동일 유도 가능.)
- **기존 POST 패턴**: `POST /node-overrides`(`handleOverridePost`), `POST /doc`(`handleDocPost`)
  — 토큰 게이트 → `collectRequestBody` → `.understand-anything/` 기록 → `sendJson`.
- **impact 오버레이 채널 이미 존재**: `store.ts` `setOverlayData('impact', …)` /
  `toggleOverlay('impact')`, `OverlayChannelData { changed, affected, generatedAt }`,
  `impactOverlayData`. App.tsx 마운트 시 `impact-overlay.json` 로드(`loadOverlay`).
  파일 스키마: `{ changedNodeIds[], affectedNodeIds[], generatedAt, unresolved, ktdsImpact }`.
- **claude 플래그**: `claude` 는 셸에서 `--dangerously-skip-permissions` 별칭이지만 spawn 엔
  안 먹으므로 `--permission-mode bypassPermissions` 를 인자 배열로 명시한다.
- **모달 패턴**: `NodeDetailModal`/`PathFinderModal` (fixed inset-0, glass-heavy, ESC/바깥클릭
  닫기, lazy import). 영향도 입력 모달도 동형으로 작성.

## 4. 서버 설계 — `vite.config.ts` (`configureServer`)

인메모리 단일 job 레코드 + (선택) `.understand-anything/impact-job.log`.

```
// 모듈 스코프 단일 job 상태
let impactJob = {
  status: 'idle' | 'running' | 'done' | 'failed',
  jobId: string | null,
  query: string | null,
  startedAt: string | null,
  finishedAt: string | null,
  exitCode: number | null,
  tail: string,   // stdout/stderr 마지막 N KB (디버깅용)
};
```

### `POST /impact-analyze` (토큰 게이트)
- body `{ query: string }` — `collectRequestBody(req, MAX)` 로 수집, 비어있으면 400.
- `impactJob.status === 'running'` 이면 409 + 현재 job 반환(단일 job 가드).
- `projectRoot = process.env.GRAPH_DIR ?? projectRootFromGraphFile(findGraphFile('knowledge-graph.json'))`.
  없으면 400.
- `const child = spawn('claude', ['-p', \`/understand-impact ${query}\`, '--permission-mode', 'bypassPermissions'], { cwd: projectRoot, env: process.env })`
  — **args 배열**로 넘겨 셸 인젝션 차단. `detached` 불필요(서버 수명 동안만 추적).
- stdout/stderr → `impactJob.tail` 누적(상한). exit → `status='done'|'failed'`, `exitCode` 기록.
- 즉시 `{ jobId, status:'running' }` 응답(프로세스는 백그라운드 지속).

### `GET /impact-status` (토큰 게이트)
- `{ status, jobId, startedAt, finishedAt, exitCode, tail }` 반환. 프론트 폴링용.

### 미들웨어 등록
- `isProtectedEndpoint` 목록에 `/impact-analyze`, `/impact-status` 추가.
- 토큰 검사 후 분기(POST/GET) — 기존 `/node-overrides`/`/doc` 분기와 동일 위치.

리스크: 서버 PATH 에 `claude` 존재 필요(셸에서 띄웠으므로 OK 예상, 구현 시 1회 검증).
vite.config.ts 수정 → dev server 자동 재시작.

## 5. 프론트 설계

### store.ts
- 상태: `impactJob: { status, jobId?, query?, error? }`, `impactModalOpen: boolean`.
- 액션:
  - `openImpactModal()` / `closeImpactModal()`
  - `startImpactAnalysis(query)` → `POST /impact-analyze` → `impactJob.status='running'`
  - `setImpactJob(partial)`
  - `reloadImpactOverlay()` → `impact-overlay.json` 재fetch → `setOverlayData('impact', …)`
    → `overlaySource='impact'` + `diffMode=true` 강제(자동 활성 로직과 별개로 명시 토글).
- App.tsx 의 `loadOverlay` 로직을 재사용 가능하도록 헬퍼로 공유.

### UI 컴포넌트
- **버튼**: `App.tsx` 헤더 툴바(`viewMode !== 'wiki' && viewMode !== 'docs'` 블록, `DiffToggle` 옆)
  에 "영향도 분석" 버튼. 구조 뷰에서 노출. 클릭 → `openImpactModal()`.
- **`ImpactAnalysisModal.tsx`** (신규, lazy): textarea(자연어) + "분석 실행" + 취소.
  `NodeDetailModal` 패턴(ESC/바깥클릭 닫기). 제출 → `startImpactAnalysis(query)` → 모달 닫음.
  running 중에는 입력 비활성 또는 "이미 분석 중" 안내.
- **`ImpactJobIndicator.tsx`** (신규, 헤더 우측 액션 영역): `running` 스피너,
  `done`→토스트+`reloadImpactOverlay()`, `failed`→에러 토스트.
- **토스트**: 기존 토스트 시스템 없으면 에러배너 패턴 기반 미니 토스트 추가.
- **폴링**: App.tsx `useEffect` — `impactJob.status==='running'` 동안 `GET /impact-status`
  2~3s 간격. done/failed 시 인터벌 해제 + 후처리.
- **locales**: `ko.ts`/`en.ts` 에 버튼 라벨, placeholder, 진행/완료/실패 문구 추가.

## 6. 변경 파일

| 파일 | 내용 |
|---|---|
| `packages/dashboard/vite.config.ts` | `/impact-analyze`(POST)·`/impact-status`(GET) + job 러너 |
| `packages/dashboard/src/store.ts` | impactJob/modal 상태·액션, overlay 재로드 |
| `packages/dashboard/src/App.tsx` | 버튼 + 헤더 인디케이터 + 폴링 wiring + overlay 재로드 헬퍼 |
| `packages/dashboard/src/components/ImpactAnalysisModal.tsx` | 신규 입력 모달 |
| `packages/dashboard/src/components/ImpactJobIndicator.tsx` (+ 토스트) | 신규 |
| `packages/dashboard/src/locales/ko.ts`, `en.ts` | 문구 |

## 7. 검증

지금 떠 있는 dev server(jpetstore, 5173)에서 직접:
버튼 → 자연어 입력 → 헤더 스피너 → 완료 토스트 → 구조 그래프 색칠 + DiffToggle "영향도 ON".
vite.config.ts 변경 시 서버 자동 재시작, React 는 HMR.

## 8. 스코프 / 안전

- 권한: 로컬 dev 도구 한정 `--permission-mode bypassPermissions`. U-A 정식 경로가 로컬 vite
  dev server 이므로 프로덕션 배포 대상 아님.
- query 는 spawn args 배열로 전달(셸 미경유) → 셸 인젝션 없음. claude 가 프롬프트로 해석하는 것은 본질적 동작.
- 단일 job 가드(409)로 동시 실행 방지. 서버 재시작 시 인메모리 job 소실 — 허용(필요 시 파일 영속 후속).
