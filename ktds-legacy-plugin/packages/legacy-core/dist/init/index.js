/**
 * `/understand-init` 의 결정론 엔진 — config + `.spec/` 스캐폴드.
 *
 * 멱등(idempotent): 이미 존재하는 파일은 보존하고, 없는 것만 생성한다.
 * 생성/보존 내역을 구조화해 반환(호스트 스킬이 한국어로 보고).
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_FILENAME, configPath, defaultConfig, writeConfig } from '../config/index.js';
/** `.spec/` 디렉터리명 — ktds 산출물 작업영역(UA cleanup 대상 아님). */
export const SPEC_DIR = '.spec';
/** `.spec/00_MASTER.md` — 분석 진행/산출물 인덱스. */
export const SPEC_MASTER = '00_MASTER.md';
function specMasterTemplate() {
    return [
        '# 분석 마스터 인덱스',
        '',
        '> `/understand-init` 가 생성한 분석 작업영역. 산출물은 `.spec/` 하위에 누적된다.',
        '',
        '## 진행 상태',
        '',
        '- [ ] 도메인 지도 스캔 (`/understand-map scan`)',
        '- [ ] 도메인 경계 확정 (`/understand-map confirm`)',
        '- [ ] 산출물 생성 (`/understand-docs`)',
        '',
        '## 산출물',
        '',
        '_아직 없음._',
        '',
    ].join('\n');
}
/**
 * 프로젝트를 초기화한다.
 * @param projectRoot 대상 프로젝트 루트(절대경로 권장).
 */
export function initProject(projectRoot) {
    const created = [];
    const preserved = [];
    // 1) understanding.config.json (보존 우선)
    if (existsSync(configPath(projectRoot))) {
        preserved.push(CONFIG_FILENAME);
    }
    else {
        writeConfig(projectRoot, defaultConfig());
        created.push(CONFIG_FILENAME);
    }
    // 2) .spec/ 디렉터리
    const specDir = join(projectRoot, SPEC_DIR);
    if (!existsSync(specDir)) {
        mkdirSync(specDir, { recursive: true });
        created.push(SPEC_DIR + '/');
    }
    else {
        preserved.push(SPEC_DIR + '/');
    }
    // 3) .spec/00_MASTER.md (보존 우선)
    const masterRel = `${SPEC_DIR}/${SPEC_MASTER}`;
    const masterPath = join(specDir, SPEC_MASTER);
    if (existsSync(masterPath)) {
        preserved.push(masterRel);
    }
    else {
        writeFileSync(masterPath, specMasterTemplate(), 'utf8');
        created.push(masterRel);
    }
    return { created, preserved };
}
//# sourceMappingURL=index.js.map