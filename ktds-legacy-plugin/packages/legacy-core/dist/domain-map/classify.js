import { isDomainIneligibleRoot } from './slices.js';
/** 구조/패키지 루트 세그먼트 — 도메인 의미 없음, 토큰 탐색에서 건너뜀. */
const STRUCTURE_SEGMENTS = new Set([
    'src',
    'main',
    'java',
    'test',
    'resources',
    'webapp',
    'com',
    'org',
    'net',
    'io',
]);
/** 레이어/기술 계층 세그먼트 — 도메인 토큰이 될 수 없음. */
const LAYER_SEGMENTS = new Set([
    'controller',
    'service',
    'dao',
    'repository',
    'mapper',
    'model',
    'domain',
    'dto',
    'vo',
    'entity',
    'util',
    'config',
    'web',
    'api',
    'common',
]);
/** 파일명 토큰 중 도메인 의미가 없는 접미/계층 토큰(prefix 폴백용). */
const STOP_TOKENS = new Set([
    'impl',
    'abstract',
    'base',
    'default',
    'controller',
    'service',
    'dao',
    'repository',
    'mapper',
    'manager',
    'helper',
    'util',
    'test',
    'action',
    'bean',
    'handler',
    'listener',
    'filter',
    'interceptor',
    'exception',
    'dto',
    'vo',
    'bo',
    'form',
    'view',
    'page',
    'config',
    'factory',
    'builder',
    'provider',
    'resolver',
    'validator',
    'converter',
]);
function cmp(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
}
/** 구조/레이어/단일 문자 세그먼트인가 — 도메인 토큰 후보에서 제외. */
function isStructureOrLayer(seg) {
    return (STRUCTURE_SEGMENTS.has(seg) ||
        LAYER_SEGMENTS.has(seg) ||
        seg.length === 1 ||
        /^\d+$/.test(seg));
}
/**
 * 과반 하강: 루트에서 시작해 한 자식 디렉토리가 전체 파일의 >50%를 담는 동안
 * 내려간다. 멈춘 지점(prefix 안정화) 이후 첫 비-구조·비-레이어 세그먼트가 그 파일의
 * 도메인 토큰이다. 퇴화(클러스터 <2 또는 단일 클러스터가 전체의 >50% 집중) 시
 * degenerate 를 세팅하고 호출측이 prefix 로 폴백한다.
 */
export function classifyByDirectory(relPaths) {
    const dirSegs = relPaths.map((p) => {
        const segs = p.split('/');
        segs.pop(); // 파일명 제거
        return segs.map((s) => s.toLowerCase());
    });
    // 과반 하강으로 공통 prefix 깊이 결정(소수 이탈 파일이 prefix 를 끊어도 다수 경로를 따른다).
    let depth = 0;
    for (;;) {
        const counts = new Map();
        for (const segs of dirSegs) {
            if (segs.length > depth) {
                counts.set(segs[depth], (counts.get(segs[depth]) ?? 0) + 1);
            }
        }
        let top = null;
        let topCount = 0;
        for (const [seg, count] of [...counts.entries()].sort((a, b) => cmp(a[0], b[0]))) {
            if (count > topCount) {
                top = seg;
                topCount = count;
            }
        }
        if (top === null || topCount * 2 <= relPaths.length)
            break;
        depth++;
    }
    // 통과 네임스페이스 세그먼트 동적 감지(브랜치 상대): 같은 부모 경로를 공유하는 파일들
    // 안에서 한 세그먼트 값이 NAMESPACE_SHARE 이상을 덮으면(예 src/main/java 밑에서
    // `egovframework` 가 사실상 전부) 도메인 신호가 아니라 벤더/패키지 네임스페이스이므로
    // 토큰 후보에서 건너뛴다. 전역이 아니라 브랜치 상대라야 webapp/resources 형제에
    // 희석되지 않고 java 서브트리의 네임스페이스를 잡는다. STRUCTURE_SEGMENTS 하드코딩을
    // 프로젝트 고유 패키지 루트로 일반화 → com/<org>/<feature> 의 <feature>(uss/sym/cop)
    // 까지 내려간다. 도메인 분기(소수값)는 덮지 못하므로 보존된다.
    const NAMESPACE_SHARE = 0.9;
    const branchCounts = new Map(); // 부모경로 → (세그먼트값 → 수)
    for (const segs of dirSegs) {
        for (let d = 0; d < segs.length; d++) {
            const parent = segs.slice(0, d).join('/');
            let m = branchCounts.get(parent);
            if (!m)
                branchCounts.set(parent, (m = new Map()));
            m.set(segs[d], (m.get(segs[d]) ?? 0) + 1);
        }
    }
    const isNamespaceSeg = (segs, d) => {
        const m = branchCounts.get(segs.slice(0, d).join('/'));
        if (!m)
            return false;
        let total = 0;
        for (const c of m.values())
            total += c;
        return total > 0 && (m.get(segs[d]) ?? 0) / total >= NAMESPACE_SHARE;
    };
    const tokenByFile = new Map();
    for (let i = 0; i < relPaths.length; i++) {
        const segs = dirSegs[i];
        for (let d = depth; d < segs.length; d++) {
            const seg = segs[d];
            if (isStructureOrLayer(seg) || isNamespaceSeg(segs, d))
                continue;
            tokenByFile.set(relPaths[i], seg);
            break;
        }
    }
    // 퇴화 감지: 서로 다른 토큰 <2(분리 불능) 또는 최대 클러스터가 전체의 >50% 집중.
    const clusterSizes = new Map();
    for (const token of tokenByFile.values()) {
        clusterSizes.set(token, (clusterSizes.get(token) ?? 0) + 1);
    }
    let degenerate = null;
    if (clusterSizes.size < 2) {
        degenerate = { reason: 'too-few-clusters' };
    }
    else {
        const top = Math.max(...clusterSizes.values());
        if (top * 2 > relPaths.length) {
            degenerate = { reason: 'single-cluster-concentration' };
        }
    }
    return { tokenByFile, degenerate };
}
// ── 파일명 prefix 폴백 ──────────────────────────────────────────────────────
/** "AccountActionBean.java" → ["account","action","bean"], "line_item.sql" → ["line","item"]. */
export function tokenizeBasename(relPath) {
    const base = relPath.split('/').pop() ?? '';
    const stem = base.replace(/\.[^.]+$/, '');
    return stem
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
        .split(/[\s_\-.]+/)
        .map((t) => t.toLowerCase().replace(/[[\]()@{}]/g, ''))
        .filter((t) => t.length > 0);
}
/** 첫 비-STOP 토큰 = prefix. 전부 STOP 이면 null(도메인 신호 없음). */
export function prefixToken(relPath) {
    for (const token of tokenizeBasename(relPath)) {
        if (!STOP_TOKENS.has(token) && !/^\d+$/.test(token))
            return token;
    }
    return null;
}
// ── 신호 통합 ───────────────────────────────────────────────────────────────
/** census/routes/slices 로 도메인 후보(candidates.json)를 만든다. */
export function buildCandidates(census, routes, slices) {
    const allFiles = census.files.map((f) => f.relPath);
    const directory = classifyByDirectory(allFiles);
    const dirToken = (p) => directory.degenerate ? null : (directory.tokenByFile.get(p) ?? null);
    // 도메인 시드 = 루트(엔트리 파일). 루트 key 는 루트 파일에서 파생한 자연키:
    // 디렉토리 토큰이 그 루트를 '유일하게' 식별할 때만 디렉토리 토큰을 key 로 쓴다.
    // package-by-layer(모든 컨트롤러가 한 디렉토리: 예 …/web/actions/*ActionBean)에서는
    // 여러 루트가 같은 디렉토리 토큰(예 'mybatis')을 공유해 도메인이 하나로 붕괴하므로,
    // 공유 토큰인 루트는 파일명 prefix(Account→account 등)로 분리한다. 전역 boolean 으로
    // 판정하면 단 하나의 이질 루트(예 WEB-INF/web.xml)가 나머지를 통째로 붕괴시킨다.
    // 각 디렉토리 토큰이 담는 파일명 prefix 의 분포 — 조직 스타일 판정용.
    // prefix 가 그 토큰 그룹을 실제로 '분할'하면(여러 prefix 가 고르게 = package-by-layer,
    // 예 jpetstore …/web/actions/{Account,Order}ActionBean) → prefix 로 분리한다.
    // 한 prefix 가 지배하면(package-by-feature + 벤더 접두어, 예 uss/ 밑 대부분 Egov*
    // → 'egov' 지배, 소수 이질 루트 존재) → 디렉토리 토큰(=feature 패키지 uss/sym/cop)을
    // key 로. **지배율 기반**이라 단 하나의 이질 루트가 서브패키지를 통째로 붕괴시키지 않는다.
    const PREFIX_PARTITION_MAX = 0.7; // 최다 prefix 점유율이 이 미만이어야 prefix 가 도메인을 가른다고 본다
    const prefixDistByDirToken = new Map();
    for (const slice of slices.slices) {
        if (isDomainIneligibleRoot(slice.root))
            continue; // 시드 부적격 루트는 분포에서 제외
        const t = dirToken(slice.root);
        if (t === null)
            continue;
        const p = prefixToken(slice.root);
        if (p === null)
            continue;
        let m = prefixDistByDirToken.get(t);
        if (!m)
            prefixDistByDirToken.set(t, (m = new Map()));
        m.set(p, (m.get(p) ?? 0) + 1);
    }
    const prefixPartitions = (t) => {
        const m = prefixDistByDirToken.get(t);
        if (!m || m.size < 2)
            return false;
        let total = 0;
        let max = 0;
        for (const c of m.values()) {
            total += c;
            if (c > max)
                max = c;
        }
        return total > 0 && max / total < PREFIX_PARTITION_MAX;
    };
    const rootKey = new Map();
    for (const slice of slices.slices) {
        // 도메인 '시드' 제외 — 테스트/정적 진입점(예 src/test/**, code404.jsp)은 자기
        // 도메인을 만들지 않는다. slices 도달성은 유지되므로(program-inventory·risk-report
        // 소비), 이 루트가 도달한 파일은 아래 ownership 에서 실제 생산 도메인 멤버로 합류한다.
        if (isDomainIneligibleRoot(slice.root))
            continue;
        const t = dirToken(slice.root);
        // t 가 유일(1루트)이면 분포 크기 1 → prefixPartitions=false → 디렉토리 토큰 채택
        // (기존 '유일 토큰' 동작 보존).
        const useDir = t !== null && !prefixPartitions(t);
        const key = (useDir ? t : null) ??
            prefixToken(slice.root) ??
            (slice.root.split('/').pop() ?? slice.root).replace(/\.[^.]+$/, '').toLowerCase();
        rootKey.set(slice.root, key);
    }
    // 각 후보의 entryCount = 그 후보의 루트들이 선언한 라우트/배치 entryId 수.
    const entryCountByRoot = new Map();
    for (const slice of slices.slices) {
        entryCountByRoot.set(slice.root, slice.entryIds.length);
    }
    const byKey = new Map();
    const candidateOf = (key) => {
        let c = byKey.get(key);
        if (!c) {
            c = { roots: [], files: [] };
            byKey.set(key, c);
        }
        return c;
    };
    for (const [root, key] of [...rootKey.entries()].sort((a, b) => cmp(a[0], b[0]))) {
        candidateOf(key).roots.push(root);
    }
    const common = [];
    const ambiguous = [];
    const unresolved = [];
    for (const own of slices.ownership) {
        // NOTE: 테스트/정적 파일을 도메인 '멤버'에서까지 빼면 안 된다 — 예 order 컨트롤러가
        // forward 하는 list.jsp 는 order 도메인의 화면 멤버다(program-inventory 가 domain 을
        // 참조). 제외는 도메인 '시드'(slices.addEntry 의 isDomainIneligibleRoot)에서만 하고,
        // 실제 생산 도메인이 도달한 파일은 그 도메인 멤버로 유지한다.
        const isRoot = rootKey.has(own.relPath);
        if (own.status === 'shared') {
            // 루트 자신이 다른 루트의 슬라이스에 들어가도 루트는 자기 도메인의 닻이다.
            if (!isRoot)
                common.push({ relPath: own.relPath, owners: own.owners });
            continue;
        }
        if (own.status === 'sole') {
            if (isRoot)
                continue; // 루트는 이미 등재
            const ownerKey = rootKey.get(own.owners[0]);
            if (ownerKey !== undefined) {
                const dKey = dirToken(own.relPath);
                if (dKey !== null && byKey.has(dKey) && dKey !== ownerKey) {
                    // 도달성 vs 디렉토리 충돌 → 모호 큐(어느 쪽에도 배정하지 않음, 사람 게이트行).
                    ambiguous.push({ relPath: own.relPath, reachKey: ownerKey, directoryKey: dKey });
                }
                else {
                    candidateOf(ownerKey).files.push({ relPath: own.relPath, via: 'reachability' });
                }
                continue;
            }
            // owner 가 시드 부적격(테스트/정적 진입점)이라 도메인 key 가 없음 → 아래 디렉토리/
            // prefix 폴백으로 실제 생산 도메인에 멤버로 합류 시도(예 order/list.jsp → order).
        }
        // unreached(또는 시드 부적격 owner) → 디렉토리 > prefix 폴백, 기존 도메인 key 에만 합류.
        const dKey = dirToken(own.relPath);
        if (dKey !== null && byKey.has(dKey)) {
            candidateOf(dKey).files.push({ relPath: own.relPath, via: 'directory' });
            continue;
        }
        const pKey = prefixToken(own.relPath);
        if (pKey !== null && byKey.has(pKey)) {
            candidateOf(pKey).files.push({ relPath: own.relPath, via: 'prefix' });
            continue;
        }
        unresolved.push(own.relPath);
    }
    const candidates = [...byKey.entries()]
        .sort(([a], [b]) => cmp(a, b))
        .map(([key, c]) => ({
        key,
        roots: [...c.roots].sort(cmp),
        entryCount: c.roots.reduce((n, r) => n + (entryCountByRoot.get(r) ?? 0), 0),
        files: [...c.files].sort((x, y) => cmp(x.relPath, y.relPath)),
    }));
    return {
        schemaVersion: 1,
        gitCommit: census.gitCommit,
        directoryDegenerate: directory.degenerate,
        candidates,
        common: common.sort((a, b) => cmp(a.relPath, b.relPath)),
        ambiguous: ambiguous.sort((a, b) => cmp(a.relPath, b.relPath)),
        unresolved: unresolved.sort(cmp),
    };
}
//# sourceMappingURL=classify.js.map