/**
 * DS-APM 장애 RCA 리포트 파서 + 시드 판정 — 순수 결정론(IO 없음).
 *
 * 계약: docs/ktds/INCIDENT_DROP_CONTRACT.md (실물 예시 `2026-06-23_rca_checkout.md` 실측 고정).
 * 형식 = YAML frontmatter(runId/service/createdAt/confidence/baselineCommit) +
 * 한국어 h2 섹션(근본 원인[필수]/수정 제안/한계). file:line 근거는 산문 인라인이라
 * 여기서 결정론 추출한다. IO(드롭 폴더·census 로드)는 scripts/incident.mjs 가 담당.
 */
/** 수용 게이트 통과에 필요한 본문 섹션(h2 정확일치). */
export const INCIDENT_SECTION_ROOT_CAUSE = '근본 원인';
export const INCIDENT_SECTION_FIX = '수정 제안';
export const INCIDENT_SECTION_LIMITS = '한계';
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
/**
 * 산문 인라인 file:line — `경로.확장자:줄번호`. 확장자 강제라 시각(16:44)·해시는 안 잡힌다.
 * URL(`https://…`)은 추출 후 별도 제외. 한글 경로 세그먼트 허용(드롭 폴더 관례).
 */
const FILE_LINE_RE = /([A-Za-z0-9_가-힣][A-Za-z0-9_가-힣.\-/]*\.[A-Za-z][A-Za-z0-9]{0,5}):(\d{1,6})/g;
function clampConfidence(raw) {
    const c = (raw ?? '').trim().toLowerCase();
    return c === 'high' || c === 'medium' ? c : 'low';
}
/** frontmatter 블록을 `key: value` 라인 단위로 파싱(여분 키 무시 — 전방 호환). */
function parseFrontmatter(raw) {
    const m = FRONTMATTER_RE.exec(raw);
    if (!m)
        return null;
    const out = {};
    for (const line of m[1].split(/\r?\n/)) {
        const idx = line.indexOf(':');
        if (idx <= 0)
            continue;
        out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
    return out;
}
/**
 * h2(`## 제목`) 단위로 본문을 자른다. 같은 제목 중복 시 첫 섹션이 정본.
 * ★ 코드펜스(``` / ~~~) 안의 `## ` 는 섹션 경계로 보지 않는다 — 근본 원인 본문의 펜스에
 * 주석/샘플로 `## foo` 가 있으면 거기서 섹션이 잘려 뒷부분 file:line 근거가 통째로 누락되기
 * 때문(fail-closed 라 조용히 시드 0). 헤딩 인식·경계 판정을 한 줄 스캔으로 통일해
 * `##\t제목`(탭/다중공백) 이 헤딩과 경계에서 다르게 해석되던 불일치도 함께 제거한다.
 */
function splitSections(raw) {
    const body = raw.replace(FRONTMATTER_RE, '');
    const out = {};
    const H2 = /^##\s+(.+?)\s*$/;
    const FENCE = /^\s*(```|~~~)/;
    let curTitle = null;
    let buf = [];
    let inFence = false;
    const flush = () => {
        if (curTitle !== null && !(curTitle in out))
            out[curTitle] = buf.join('\n').trim();
    };
    for (const line of body.split('\n')) {
        if (FENCE.test(line))
            inFence = !inFence;
        const m = inFence ? null : H2.exec(line);
        if (m) {
            flush();
            curTitle = m[1];
            buf = [];
        }
        else if (curTitle !== null) {
            buf.push(line);
        }
    }
    flush();
    return out;
}
/**
 * 임의 텍스트에서 file:line 후보를 추출한다(섹션 무관 — resolution.md 인용 검증 등
 * 문서 전체를 훑어야 하는 소비처용). URL 내 경로는 제외, 중복 제거·출현 순.
 */
export function extractFileLineRefs(text) {
    const out = [];
    const seen = new Set();
    for (const m of text.matchAll(FILE_LINE_RE)) {
        // URL 경로(`https://host/a.ts:3` 류) 제외 — 매치 직전 문맥에 `://` 가 붙어 있으면 스킵.
        const before = text.slice(Math.max(0, (m.index ?? 0) - 3), m.index ?? 0);
        if (before.includes('://'))
            continue;
        const path = m[1].replace(/^\.\//, '');
        const line = Number(m[2]);
        const key = `${path}:${line}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push({ path, line });
    }
    return out;
}
function extractRefs(sections) {
    const out = [];
    const seen = new Set();
    for (const section of [INCIDENT_SECTION_ROOT_CAUSE, INCIDENT_SECTION_FIX]) {
        const text = sections[section];
        if (!text)
            continue;
        for (const ref of extractFileLineRefs(text)) {
            const key = `${ref.path}:${ref.line}`;
            if (seen.has(key))
                continue;
            seen.add(key);
            out.push({ ...ref, section });
        }
    }
    return out;
}
/**
 * 드롭 파일 원문 → 구조화 파싱 + 수용 게이트 판정.
 * 불합격이어도 throw 하지 않는다 — 호출자가 unparseable 로 원장 기록(원문 보존)한다.
 */
export function parseIncidentReport(raw) {
    const fmRaw = parseFrontmatter(raw);
    const sections = splitSections(raw);
    const reasons = [];
    if (!fmRaw)
        reasons.push('frontmatter(---) 블록이 없습니다');
    if (fmRaw && !fmRaw.runId)
        reasons.push('frontmatter 에 runId 가 없습니다');
    if (fmRaw && !fmRaw.service)
        reasons.push('frontmatter 에 service 가 없습니다');
    if (!(INCIDENT_SECTION_ROOT_CAUSE in sections))
        reasons.push('`## 근본 원인` 섹션이 없습니다');
    const parseable = reasons.length === 0;
    const frontmatter = fmRaw
        ? {
            runId: fmRaw.runId ?? '',
            service: fmRaw.service ?? '',
            createdAt: fmRaw.createdAt ?? null,
            confidence: clampConfidence(fmRaw.confidence),
            baselineCommit: fmRaw.baselineCommit ?? null,
        }
        : null;
    const rootCause = sections[INCIDENT_SECTION_ROOT_CAUSE] ?? '';
    const title = rootCause.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? null;
    return { parseable, reasons, frontmatter, sections, title, refs: extractRefs(sections) };
}
/**
 * 추출 후보를 census 실존 파일과 대조한다(fail-closed — LLM 추측 시드 없음).
 * 실물 리포트의 `수정 제안`은 basename 축약 표기를 쓴다(P1 픽스처 검증 실측) —
 * basename 이 census 에서 유일하면 해소, 다의면 ambiguous.
 */
export function resolveIncidentSeeds(refs, censusRelPaths) {
    const pathSet = new Set(censusRelPaths);
    const byBasename = new Map();
    for (const p of censusRelPaths) {
        const base = p.slice(p.lastIndexOf('/') + 1);
        const list = byBasename.get(base);
        if (list)
            list.push(p);
        else
            byBasename.set(base, [p]);
    }
    const resolutions = refs.map((ref) => {
        if (pathSet.has(ref.path))
            return { ref, verdict: 'matched', relPath: ref.path, via: 'path', candidates: [] };
        const base = ref.path.slice(ref.path.lastIndexOf('/') + 1);
        // 축약 표기(basename 단독)만 basename 해소 대상 — 디렉터리가 붙은 오경로를
        // basename 으로 "구조"하면 타 프로젝트 리포트 감지(전량 not-in-project)가 무너진다.
        if (ref.path === base) {
            const candidates = byBasename.get(base) ?? [];
            if (candidates.length === 1) {
                return { ref, verdict: 'matched', relPath: candidates[0], via: 'basename', candidates };
            }
            if (candidates.length > 1)
                return { ref, verdict: 'ambiguous', relPath: null, via: null, candidates };
        }
        return { ref, verdict: 'not-in-project', relPath: null, via: null, candidates: [] };
    });
    const seeds = [];
    for (const r of resolutions) {
        if (r.verdict === 'matched' && r.relPath && !seeds.includes(r.relPath))
            seeds.push(r.relPath);
    }
    return {
        resolutions,
        seeds,
        allNotInProject: resolutions.length > 0 && resolutions.every((r) => r.verdict === 'not-in-project'),
    };
}
//# sourceMappingURL=incident-report.js.map