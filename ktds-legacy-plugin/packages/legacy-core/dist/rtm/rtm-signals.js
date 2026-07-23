/**
 * RTM 데이터·테스트 축 신호 수집(비-MyBatis Kotlin/JDBC 대응) — 디스크 IO + 순수 조립.
 *
 * build-rtm 의 data/test 셀이 소비할 두 모델을 프로젝트에서 결정론으로 뽑는다:
 *  - rawSqlModel: 흐름이 도달하는 step 소스 파일의 코드 SQL → 테이블×CRUD(db-schema 로 필터).
 *    crud-matrix 의 raw-sql 데이터축과 동일 신호(단일 소스 재사용).
 *  - testLinks: 테스트 파일이 참조하는 프로덕션 클래스 basename → test↔기능 링크.
 *
 * 정직성: db-schema 부재/테스트 부재 시 빈 모델(합성 금지). 진단(diag)으로 왜 비었는지 보고.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { isSkippedSegment } from '../domain-map/census.js';
import { DB_SCHEMA_FILENAME } from '../db-schema/types.js';
import { buildRawSqlModel } from '../doc-generator/raw-sql.js';
import { buildTestLinkModel, isTestFile } from './test-links.js';
const SOURCE_EXT_RE = /\.(kt|java|scala|groovy)$/;
/** db-schema.json 의 테이블명 집합(소문자). 부재/손상은 빈 집합. */
function loadKnownTables(projectRoot) {
    const p = join(projectRoot, '.spec', 'map', DB_SCHEMA_FILENAME);
    if (!existsSync(p))
        return new Set();
    try {
        const schema = JSON.parse(readFileSync(p, 'utf8'));
        return new Set((schema.tables ?? []).map((t) => (t.name ?? '').toLowerCase()).filter(Boolean));
    }
    catch {
        return new Set();
    }
}
function baseNameNoExt(relPath) {
    return (relPath.split('/').pop() ?? relPath).replace(/\.[^.]+$/, '');
}
/** 프로젝트 전수 walk 로 테스트 소스 파일(relPath, content) 수집. skip 은 census 규약. */
function collectTestFiles(projectRoot) {
    const out = [];
    const walk = (dir) => {
        let entries;
        try {
            entries = readdirSync(dir, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const e of entries) {
            if (e.isDirectory()) {
                if (!isSkippedSegment(e.name))
                    walk(join(dir, e.name));
            }
            else if (SOURCE_EXT_RE.test(e.name)) {
                const abs = join(dir, e.name);
                const relPath = relative(projectRoot, abs);
                if (!isTestFile(relPath))
                    continue;
                try {
                    out.push({ relPath, content: readFileSync(abs, 'utf8') });
                }
                catch {
                    // 읽기 실패는 건너뜀(정직: 없는 근거 지어내지 않음).
                }
            }
        }
    };
    walk(projectRoot);
    return out.sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0));
}
/**
 * 데이터·테스트 축 신호를 수집한다. nodes 는 도메인 그래프의 노드(도달 step·프로덕션 클래스 유래).
 * MyBatis 프로젝트면 rawSqlModel 은 비어도 무방(build-rtm 이 MyBatis 경로를 우선한다).
 */
export function collectRtmSignals(projectRoot, nodes) {
    const knownTables = loadKnownTables(projectRoot);
    // 데이터축: 흐름이 도달하는 step 소스 파일의 코드 SQL.
    const stepRelPaths = new Set();
    for (const n of nodes) {
        if (n.type === 'step' && typeof n.filePath === 'string' && SOURCE_EXT_RE.test(n.filePath)) {
            stepRelPaths.add(n.filePath);
        }
    }
    const sqlSources = [];
    for (const relPath of [...stepRelPaths].sort()) {
        const abs = join(projectRoot, relPath);
        try {
            sqlSources.push({ relPath, content: readFileSync(abs, 'utf8') });
        }
        catch {
            /* 없는 파일 건너뜀 */
        }
    }
    const rawSqlModel = buildRawSqlModel(sqlSources, knownTables);
    // 테스트축: 그래프의 프로덕션 클래스(테스트 제외) basename ↔ 테스트 파일 참조.
    const prodClasses = new Set();
    for (const n of nodes) {
        if ((n.type === 'flow' || n.type === 'step') && typeof n.filePath === 'string' && !isTestFile(n.filePath)) {
            prodClasses.add(baseNameNoExt(n.filePath));
        }
    }
    const testFiles = collectTestFiles(projectRoot);
    const testLinks = buildTestLinkModel(testFiles, prodClasses);
    return {
        rawSqlModel,
        testLinks,
        diag: {
            knownTables: knownTables.size,
            sqlLinkedFiles: Object.keys(rawSqlModel.byFile).length,
            testFiles: testFiles.length,
            prodClasses: prodClasses.size,
        },
    };
}
//# sourceMappingURL=rtm-signals.js.map