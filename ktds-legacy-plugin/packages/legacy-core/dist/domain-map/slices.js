/** 기본 BFS 깊이 상한. */
export const DEFAULT_DEPTH_CAP = 12;
/**
 * 도메인 시드로 부적격한 진입점/파일 판정 — 업무 도메인이 아닌 것.
 *
 * 도메인 맵은 **생산 애플리케이션**의 업무 구조를 그린다. 다음은 진입점으로
 * 잡히더라도 업무 도메인의 씨앗이 아니다:
 *  - **테스트 소스**(`src/test/`, `src/it/`, `__tests__/`): 프레임워크 자체 테스트·
 *    예제 코드. `main()`/JUnit 이 라우트·배치 스캐너에 진입점으로 잡혀 각자 도메인이
 *    되던 문제(예 eGov TestPingNetwork→ping, NullCheckTest→null)를 원천 차단.
 *  - **정적 뷰 자원**(.jsp/.jspx/.html/.htm/.css): 뷰/정적 파일이지 도메인 로직
 *    진입점이 아니다(예 code404.jsp, index.jsp). 컨트롤러(Java)가 실제 씨앗이다.
 *
 * package-by-layer 앱(jpetstore: src/main/java Java ActionBean)은 영향 없음.
 * .js/.ts 는 제외하지 않는다(JS 프로젝트에선 그게 코드다).
 */
export function isDomainIneligibleRoot(relPath) {
    const p = relPath.toLowerCase();
    if (/(^|\/)src\/(test|it)\//.test(p))
        return true;
    if (/(^|\/)__tests?__\//.test(p))
        return true;
    if (/\.(jsp|jspx|html?|css)$/.test(p))
        return true;
    return false;
}
function cmp(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
}
function sortUnique(values) {
    return [...new Set(values)].sort(cmp);
}
/** census/routes/edges 로 슬라이스/소유권을 만든다. */
export function buildSlices(census, routes, edges, depthCap = DEFAULT_DEPTH_CAP) {
    // 1) 루트 -> entryIds 수집(라우트 + 배치).
    const entriesByRoot = new Map();
    const addEntry = (relPath, entryId) => {
        // NOTE: 여기서 테스트/정적 진입점을 거르지 않는다 — slices 는 program-inventory·
        // risk-report 등도 소비하는 '전수 도달성'이라야 한다(테스트 프로그램 집계·JSP 화면
        // 도메인 귀속 보존). 도메인 '시드' 제외는 classify.buildCandidates 단계에서만 한다.
        let set = entriesByRoot.get(relPath);
        if (!set) {
            set = new Set();
            entriesByRoot.set(relPath, set);
        }
        set.add(entryId);
    };
    for (const r of routes.routes)
        addEntry(r.filePath, r.routeId);
    for (const b of routes.batchEntries) {
        addEntry(b.filePath, b.entryId);
        // W2: 해석된 잡 구현 파일도 루트로 — XML 엔트리의 filePath(XML)는 엣지가 없어
        // 잡 클래스가 미도달(데드코드)로 오판되던 것을 제거한다.
        if (b.handlerFile && b.handlerFile !== b.filePath)
            addEntry(b.handlerFile, b.entryId);
    }
    // 2) 인접 리스트(source -> target[]).
    const adj = new Map();
    for (const e of edges.edges) {
        let list = adj.get(e.source);
        if (!list) {
            list = [];
            adj.set(e.source, list);
        }
        list.push(e.target);
    }
    // 3) 각 루트에서 BFS(depthCap 까지). root 도 reached 에 포함.
    const roots = [...entriesByRoot.keys()].sort(cmp);
    const slices = [];
    for (const root of roots) {
        const reached = new Set([root]);
        let frontier = [root];
        let depth = 0;
        while (frontier.length > 0 && depth < depthCap) {
            const next = [];
            for (const node of frontier) {
                const targets = adj.get(node);
                if (!targets)
                    continue;
                for (const t of targets) {
                    if (!reached.has(t)) {
                        reached.add(t);
                        next.push(t);
                    }
                }
            }
            frontier = next;
            depth += 1;
        }
        slices.push({
            root,
            entryIds: sortUnique(entriesByRoot.get(root)),
            reached: sortUnique(reached),
        });
    }
    // 4) ownership — 각 census 파일을 도달하는 루트 집합.
    const ownersByFile = new Map();
    for (const slice of slices) {
        for (const f of slice.reached) {
            let set = ownersByFile.get(f);
            if (!set) {
                set = new Set();
                ownersByFile.set(f, set);
            }
            set.add(slice.root);
        }
    }
    const ownership = census.files
        .map((f) => {
        const owners = sortUnique(ownersByFile.get(f.relPath) ?? []);
        const status = owners.length === 0 ? 'unreached' : owners.length === 1 ? 'sole' : 'shared';
        return { relPath: f.relPath, status, owners };
    })
        .sort((a, b) => cmp(a.relPath, b.relPath));
    return {
        schemaVersion: 1,
        gitCommit: census.gitCommit,
        depthCap,
        slices: slices.sort((a, b) => cmp(a.root, b.root)),
        ownership,
    };
}
//# sourceMappingURL=slices.js.map