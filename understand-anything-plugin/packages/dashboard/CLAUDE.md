# Dashboard (FRONT_REDESIGN — docs/ktds/FRONT_REDESIGN_DESIGN.md)

- **DS-NAVI light theme by default** (`ds-navi-light` preset): DS-APM palette — light backgrounds (#f4f5f7/#fcfcfd/#fff), red accent (#d81b2c), Pretendard typography. Dark presets remain selectable; mode-dependent component tokens (node/layer/diff/status/method colors) switch via `themes/theme-engine.ts` MODE_EXTRAS
- **react-router SPA** — URL is the single source of truth for navigation (no `viewMode` in the store). Shell = left NavRail + TopBar (`src/app/shell/`), section pages in `src/app/pages/`: 홈 `/`, 도메인 `/domains/:domainId?flow=`, 구조 `/structure?node=&level=&overlay=diff|impact|risk`, 추적표 `/rtm`, 산출물 `/deliverables`, 위키 `/wiki`, 지식그래프 `/knowledge`, 데이터 `/data`, 변경·영향 `/change`, 프로그램 `/programs`, 품질·위험 `/quality`, 보고서 `/report`, 정책서 `/policy`. 신설 6메뉴 데이터는 분석 프로젝트 `.spec/map/*.json`을 dev 엔드포인트(vite.config.ts SPEC_MAP_ENDPOINTS) + sync:demo로 서빙. Deep links, refresh, and back/forward all work
- Token gate is a root-layout guard (`src/app/Root.tsx`): `?token=` → sessionStorage → stripped from URL; deep-link paths survive the gate. Central token/dataUrl helpers in `src/shared/api/client.ts`
- Sidebar tabs (structure/knowledge/wiki workbench): `Info` (ProjectOverview → NodeInfo when selected → LearnPanel in Learn persona) and `Files` (FileExplorer)
- Code viewer: global shell layer (slide-up + modal), prism theme switches with mode (vsDark↔github). Source fetched from dev server `/file-content.json`, gated by access token + graph-derived path allowlist
- Schema validation on graph load with error banner
- QA affordances: `?onboard=skip|force` (onboarding), `?theme=<presetId>` (one-shot preset override, not persisted)
