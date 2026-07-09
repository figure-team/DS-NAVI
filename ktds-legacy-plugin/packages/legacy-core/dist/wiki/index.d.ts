/**
 * wiki vault (P4.4) + 온보딩 가이드 (P4.5) 패키지 진입점.
 *
 * buildWikiVault: GeneratedDoc[] -> Obsidian 스타일 마크다운 vault(결정론).
 * writeWikiVault: `.spec/wiki/` 하위 안정 기록. buildOnboardingGuide: "여기부터" 진입 문서.
 */
export { buildWikiVault } from './wiki.js';
export type { WikiFile, WikiVault, MetaResolver } from './wiki.js';
export { writeWikiVault, specWikiDir } from './persist.js';
export { buildOnboardingGuide, tourOrder } from './onboarding.js';
export type { OnboardingInput, OnboardingStop } from './onboarding.js';
//# sourceMappingURL=index.d.ts.map