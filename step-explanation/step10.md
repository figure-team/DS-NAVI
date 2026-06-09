# Step 10 — 첫 실행 자동 빌드 (다른 PC 플러그인 설치 대응)

> 날짜: 2026-06-09 · 브랜치 `ktds/mvp-stage1`
> 다른 컴퓨터에서 `/plugin install`만으로 동작하도록 — 수동 빌드 제거

---

## 0. 문제

ktds 엔진은 TypeScript라 `dist/`가 필요한데, `dist`·`node_modules`는 git 미포함(gitignore). 그래서 다른 PC에서 `/plugin install`(git 기반)로 받으면 빌드 산출물이 없어 스크립트가 깨진다. (U-A도 같은 문제 → U-A는 스킬이 첫 실행 때 자동 빌드)

## 1. 해결 — 스크립트 자체가 자동 빌드

`scripts/ensure-built.mjs`: `packages/legacy-core/dist/index.js`가 없으면 **standalone으로 `pnpm/npm install` + `tsc build`** 후 진입점 URL 반환. 있으면 즉시 반환.

3개 진입 스크립트(`understand-init/docs/export.mjs`)를 정적 import → **`ensureBuilt()` 후 동적 import**로 변경:
```js
const { runDocsPipeline, ... } = await import(await ensureBuilt());
```
- legacy-core는 **U-A 의존성 0**, 런타임 의존은 zod뿐이라 standalone 빌드가 깔끔(워크스페이스 불필요).
- 모델 지시에 의존하지 않고 스크립트가 보장 → 견고.

## 2. 검증 (fresh 설치 시뮬레이션)

`node_modules`·`dist` 제외하고 플러그인 복사 → `/tmp/fresh-plugin`:
```
understand-init → [ktds] 최초 1회 엔진 빌드 중 (pnpm)... (zod/typescript, 5.6s) → tsc → dist 생성 → init 성공
2번째 실행(docs/review/approve/export) → 빌드 메시지 없음(즉시), 전체 흐름 정상
```
기존 repo 실행도 dist 재사용으로 즉시(회귀 없음). **테스트 115 통과.**

## 3. 다른 컴퓨터 설치 (이제)

```
# fork를 GitHub에 push 후 (또는 폴더 복사)
/plugin marketplace add <owner>/<repo>     # 또는 /abs/local/path
/plugin install understand-anything@understand-anything
/plugin install ktds-legacy@understand-anything
# 바로:
/understand <proj> → /understand-init <proj> → /understand-docs <proj> → review/approve → /understand-export
```
첫 ktds 명령에서 엔진 자동 빌드(1회). **수동 빌드 불필요.**
- 전제: Node 22+, pnpm 또는 npm, 최초 의존성 설치용 네트워크(또는 사내 레지스트리).

## 4. 문서 갱신

- 3개 SKILL.md: "최초 실행 시 자동 빌드 1회" 명시.
- `INSTALL.md`: 플러그인 설치 시 수동 빌드 불필요, 로컬/GitHub 양쪽 설치, `@understand-anything` 접미사, 다른 PC 이전 안내.

## 5. 한계 / 주의

- **실제 `/plugin install`로 끝까지 돌려본 검증은 아직**(스크립트 직접 실행 + fresh 복사로 검증). 실제 설치 시 CLAUDE_PLUGIN_ROOT 경로·심볼릭 등 디테일이 한두 개 나올 수 있음 → **다른 PC에서 실제 설치해 보며 잡는 것이 최종 확인**.
- esbuild build script 무시 경고는 무해(vitest 의존, 빌드/런타임 영향 없음).

## 다음(예정)

다른 PC 실제 `/plugin install` 검증(사용자) → 깨지는 부분 수정 · 성능 측정 → step11.md.
