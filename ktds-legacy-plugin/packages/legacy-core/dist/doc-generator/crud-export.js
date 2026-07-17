/**
 * CRUD 매트릭스 구조화 산출(export) — 대시보드 "데이터" 화면용 `.spec/map/crud-matrix.json`.
 *
 * `07_crud-matrix.md` 와 **동일 빌더**(buildCrudMatrix)·동일 입력을 쓴다 — 두 산출물은
 * 항상 일치한다. md 렌더 전의 구조화 표 모델(columns/rows + 근거)만 뽑아 쓴다.
 *
 * 이 모듈이 생긴 이유: 예전엔 이 로직이 `scripts/export-crud-matrix.mjs` 안에만 있었고
 * **그 스크립트를 아무도 호출하지 않았다** — 어떤 스킬도 파이프라인도 부르지 않는 고아라,
 * 저장소의 crud-matrix.json 은 과거에 누가 수동 실행해 커밋한 산물이었다. 그래서 map 을
 * 재실행하면 대시보드 데이터 화면이 조용히 비었다. 엔진 함수로 올려 emit 이 부르게 하고,
 * 스크립트는 얇은 래퍼로 남긴다(로직 단일 소스 — 두 경로가 갈라지지 않는다).
 */
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { isSkippedSegment } from '../domain-map/census.js';
import { buildCrudMatrix } from './builders/index.js';
import { buildMyBatisModel, isMapperXmlDocument } from '../mybatis/index.js';
export const CRUD_MATRIX_FILENAME = 'crud-matrix.json';
/**
 * Mapper XML 전수 스캔 — 루트 요소로 판별, relPath 정렬(결정론).
 * 디렉터리 skip 은 census 의 `isSkippedSegment` 를 재사용한다 — 자체 SKIP 집합을 들고
 * 있던 시절엔 정확일치라 `.spec.bak-*` 같은 산출물 백업 안을 걸어 들어갔다.
 */
function findMapperXmls(root) {
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
            else if (e.name.endsWith('.xml')) {
                const p = join(dir, e.name);
                let content;
                try {
                    content = readFileSync(p, 'utf8');
                }
                catch {
                    continue;
                }
                if (isMapperXmlDocument(content))
                    out.push({ relPath: relative(root, p), content });
            }
        }
    };
    walk(root);
    return out.sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0));
}
/**
 * `.spec/map/crud-matrix.json` 을 쓴다. domain-graph.json 이 입력이므로 emit 이후에만
 * 의미가 있다 — 없으면 null(호출자가 정직하게 보고할 몫, 조용한 성공 금지).
 *
 * 표 섹션이 없으면(그래프에 flow 없음) null 을 돌려준다 — 빈 표를 쓰지 않는다.
 */
export function exportCrudMatrix(projectRoot) {
    const graphPath = join(projectRoot, '.understand-anything', 'domain-graph.json');
    if (!existsSync(graphPath))
        return null;
    const graph = JSON.parse(readFileSync(graphPath, 'utf8'));
    const mybatisModel = buildMyBatisModel(findMapperXmls(projectRoot));
    // 메서드 호출그래프(P3) — 있으면 흐름별 핸들러→매퍼 메서드 정밀 귀속, 없으면 파일 단위 폴백.
    let methodCallGraph = null;
    const mcgPath = join(projectRoot, '.spec', 'map', 'method-calls.json');
    if (existsSync(mcgPath)) {
        try {
            methodCallGraph = JSON.parse(readFileSync(mcgPath, 'utf8'));
        }
        catch {
            // 손상 시 null(빌더가 파일 단위 폴백).
        }
    }
    const doc = buildCrudMatrix({
        nodes: graph.nodes,
        edges: graph.edges,
        mybatisModel,
        methodCallGraph,
    });
    const section = doc.sections.find((s) => s.table);
    if (!section?.table)
        return null;
    // domain-graph.json 은 최상위 gitCommit 을 갖지 않는다 — 스탬프는 ktdsMap.generatedFromCommit
    // (emit 이 skeleton.gitCommit 에서 투영, 없으면 빈 문자열)과 project.gitCommitHash 에 있다.
    // `||` 인 이유: emit 이 `?? ''` 로 쓰므로 빈 문자열을 유효값으로 받으면 안 된다.
    const gitCommit = graph.ktdsMap?.generatedFromCommit || graph.project?.gitCommitHash || null;
    const out = {
        schemaVersion: 1,
        gitCommit,
        heading: section.heading,
        prose: section.prose ?? null,
        columns: section.table.columns,
        rows: section.table.rows,
    };
    const outDir = join(projectRoot, '.spec', 'map');
    mkdirSync(outDir, { recursive: true });
    const outPath = join(outDir, CRUD_MATRIX_FILENAME);
    writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n', 'utf8');
    return { outPath, columns: out.columns.length, rows: out.rows.length };
}
//# sourceMappingURL=crud-export.js.map