/**
 * 화면 도메인 배정(결정론) — screens[].domain 을 LLM 채움이 아니라 엔진이 채운다.
 *
 * 배경(2026-07-18): SKILL 의 "domain(뷰 폴더)" 채움 계약이 팬아웃 경로에서 구조적으로
 * 누락돼(조각 스키마·병합 모두 domain 부재) jpetstore 22·egov 130 화면 전부가
 * 화면설계서 "기타" 그룹에 뭉치는 결함이 재현됐다. domain 은 본질적으로 결정론
 * 파생값이라 LLM 계약에서 제외하고 이 모듈이 소유한다(재발 원천 차단).
 *
 * 우선순위 체인(화면 1장):
 *  ⓪ 뷰 폴더 = 플랜 키 직접 일치 — jspFile 폴더 파생값이 확정 도메인 key 와 그대로
 *     일치하면 최우선(화면의 소속은 "무엇을 보여주나"다 — jpetstore 상품 상세가
 *     "장바구니 담기" 버튼 표 때문에 cart 로 가던 오배정 교정).
 *  ① 핸들러 근거 조인 — 주석 handler.evidence[].file 을 확정 플랜(domain-plan.confirmed)
 *     roots 에 직접 대조, 불일치분만 slices.ownership(파일→진입 루트) 경유. 직접 일치
 *     표가 하나라도 있으면 그것만 쓴다(공유 유틸의 소유권 조인은 대규모에서 소음).
 *     전 화면 반복 크롬(GNB 링크·공통 폼)의 표는 제외. 다수결(득표율 ≥50%),
 *     동률은 표 수 → 키 사전순(결정론 tie-break).
 *  ② jspFile/graphNodeId 경로를 같은 방식으로 대조.
 *  ③ 뷰 폴더 파생(플랜 없는 프로젝트 폴백) — 전 화면 jspFile 의 공통 디렉터리 접두를
 *     걷어낸 첫 세그먼트. 그룹 폭발 상한 = max(24, 플랜 도메인 수) — 초과하면 접두를
 *     한 단계씩 되물려 재시도, 끝내 못 맞추면 파생하지 않는다.
 *  ④ 화면 id 경로("screen:<url경로>")에 ③ 과 동일 규칙.
 *  ⑤ 전부 실패 = null("기타") — 지어내지 않는다(fail-open).
 *
 * domain 은 mechanicalProjection 밖(채움 필드)이라 배정은 mechanicalHash 를 바꾸지
 * 않는다. 순수 함수 + 멱등 — confirm 재확정 후 assign-domains 재실행으로 재정합한다.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { readMapArtifact, stableJson, CONFIRMED_PLAN_FILENAME, SLICES_FILENAME, } from '../domain-map/persist.js';
import { ConfirmedPlanSchema, SlicesReportSchema } from '../domain-map/types.js';
import { ScreensFileSchema, SCREENS_FILENAME } from './types.js';
/**
 * 화면→도메인 결정론 힌트 파일(결함 3, 축 D) — `.spec/map/` 아래. SPA 처럼 서버 렌더 신호가
 * 없어 ⓪①②③④ 가 전부 0표인 화면을, 사람이 화면 id → 확정 플랜 도메인 키로 직접 매핑한다.
 * assign 이 이걸 *최우선* 축으로 소비하므로 재실행해도 보존된다(과거엔 수동 screens[].domain 을
 * assign 이 미배정으로 덮어써, 우회가 산출물에만 남고 도구엔 안 남는 결함이 있었다).
 * 형식: { "screen:...": "domainKey", ... } — 키는 확정 플랜 도메인 key 여야 의미가 있다(강제 아님).
 */
export const SCREEN_DOMAIN_MAP_FILENAME = 'screen-domain-map.json';
export const ScreenDomainMapSchema = z.record(z.string(), z.string());
/** `.spec/map/` 의 확정 플랜·슬라이스에서 조인 컨텍스트를 만든다(부재는 빈 맵). */
export function loadDomainAssignContext(projectRoot) {
    const plan = readMapArtifact(projectRoot, CONFIRMED_PLAN_FILENAME, ConfirmedPlanSchema);
    const slices = readMapArtifact(projectRoot, SLICES_FILENAME, SlicesReportSchema);
    const domainByRoot = new Map();
    for (const d of plan?.domains ?? []) {
        for (const r of d.roots)
            domainByRoot.set(r, d.key);
    }
    const ownersByFile = new Map();
    for (const o of slices?.ownership ?? []) {
        if (o.owners.length > 0)
            ownersByFile.set(o.relPath, o.owners);
    }
    const overrideRec = readMapArtifact(projectRoot, SCREEN_DOMAIN_MAP_FILENAME, ScreenDomainMapSchema);
    const domainOverrides = new Map(Object.entries(overrideRec ?? {}));
    return {
        domainByRoot,
        ownersByFile,
        planDomainCount: plan?.domains.length ?? 0,
        domainOverrides,
    };
}
// ──────────────────────────────────────────────────────────────────────────
// 다수결(①②)
// ──────────────────────────────────────────────────────────────────────────
/** 소유권 조인 모호성 상한 — 이보다 많은 도메인이 공유하는 파일은 소음으로 버린다. */
const OWNERSHIP_AMBIGUITY_CAP = 3;
/** 파생 그룹 수 기본 상한(플랜 도메인 수가 더 크면 그 값). */
const DERIVED_GROUP_CAP = 24;
function bump(votes, key) {
    votes.set(key, (votes.get(key) ?? 0) + 1);
}
/** 파일 1개 → 도메인 표. 직접 일치가 최우선, 소유권 경유는 모호성 상한 안에서만. */
function voteForFile(file, ctx, direct, viaOwners) {
    const d = ctx.domainByRoot.get(file);
    if (d) {
        bump(direct, d);
        return;
    }
    const owners = ctx.ownersByFile.get(file);
    if (!owners)
        return;
    const keys = [...new Set(owners.map((o) => ctx.domainByRoot.get(o)).filter((k) => !!k))];
    if (keys.length === 0 || keys.length > OWNERSHIP_AMBIGUITY_CAP)
        return;
    for (const k of keys)
        bump(viaOwners, k);
}
/** 다수결 — 최다 득표가 총표의 절반 이상일 때만 채택(동률은 표 수 → 키 사전순). */
function majority(votes) {
    let total = 0;
    for (const v of votes.values())
        total += v;
    if (total === 0)
        return null;
    const [key, top] = [...votes.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
    return top * 2 >= total ? key : null;
}
/**
 * 공통 크롬(GNB·푸터·상단 검색폼) 판정 — 같은 href/formAction 이 전체 화면의 25%
 * 이상(최소 3화면)에 반복되면 화면 고유 신호가 아니다. 대시보드 화면설계서의
 * 링크 접기 규칙(screenSpecAnnotations.commonNavThreshold)과 동일 상수 — 어긋나면
 * "표에서는 접힌 링크가 도메인 표는 낸다"는 비대칭이 생긴다.
 *
 * jpetstore 실측 교훈: 이 제외 없이는 헤더의 카탈로그 링크 표가 화면 고유 핸들러를
 * 압도해 22화면 중 20장이 catalog 로 쏠렸다(계정/주문 화면 포함).
 */
function computeCommonChromeKeys(screens) {
    const byKey = new Map();
    for (const s of screens) {
        for (const a of s.annotations) {
            const key = a.mechanical.href ?? a.mechanical.formAction;
            if (!key)
                continue;
            let ids = byKey.get(key);
            if (!ids)
                byKey.set(key, (ids = new Set()));
            ids.add(s.id);
        }
    }
    const threshold = Math.max(3, Math.ceil(screens.length * 0.25));
    const common = new Set();
    for (const [k, ids] of byKey)
        if (ids.size >= threshold)
            common.add(k);
    return common;
}
/** ① 핸들러 근거 조인 — 공통 크롬을 제외한 주석들의 evidence 파일 다수결. */
function domainFromHandlers(s, ctx, commonChrome) {
    const direct = new Map();
    const viaOwners = new Map();
    for (const a of s.annotations) {
        const chromeKey = a.mechanical.href ?? a.mechanical.formAction;
        if (chromeKey && commonChrome.has(chromeKey))
            continue;
        for (const ev of a.handler?.evidence ?? []) {
            voteForFile(ev.file, ctx, direct, viaOwners);
        }
    }
    return majority(direct.size > 0 ? direct : viaOwners);
}
/** ② 뷰 파일 조인 — jspFile/graphNodeId 경로 대조. */
function domainFromViewFiles(s, ctx) {
    const direct = new Map();
    const viaOwners = new Map();
    const files = [s.jspFile, s.graphNodeId?.replace(/^file:/, '') ?? null];
    for (const f of files) {
        if (f)
            voteForFile(f, ctx, direct, viaOwners);
    }
    return majority(direct.size > 0 ? direct : viaOwners);
}
// ──────────────────────────────────────────────────────────────────────────
// 폴더 파생(③④)
// ──────────────────────────────────────────────────────────────────────────
/**
 * 경로 목록에서 화면별 그룹 세그먼트를 파생한다(전 화면 공통 컨텍스트 필요 —
 * 화면 1장 단위가 아니라 목록 단위 순수 함수).
 *
 * 공통 디렉터리 접두(LCP)를 걷어낸 "첫 디렉터리 세그먼트"가 후보다. 후보 그룹 수가
 * cap 을 넘거나(폭발) 후보를 받는 화면이 절반 미만이면(접두가 의미 세그먼트를 먹음)
 * 접두를 한 단계씩 되물려 재시도한다. 어떤 접두 길이에서도 못 맞추면 전부 null.
 */
export function deriveFolderGroups(paths, cap) {
    const segs = paths.map((p) => (p ? p.split('/').filter(Boolean) : null));
    // 디렉터리 세그먼트만(마지막 = 파일/뷰 이름은 후보에서 제외).
    const dirs = segs.map((sg) => (sg && sg.length >= 2 ? sg.slice(0, -1) : null));
    const nonNull = dirs.filter((d) => d !== null);
    if (nonNull.length === 0)
        return paths.map(() => null);
    // 공통 디렉터리 접두 길이 — 얕은 이탈 경로(웹루트 정적 파일 등) 하나가 전체 접두를
    // 무너뜨려 의미 없는 세그먼트("WEB-INF" 등)가 그룹이 되는 것을 막는다: 과반이 접두
    // 너머로 이어지는데 일부가 접두에서 끝나면, 그 과반만으로 접두를 다시 계산한다.
    // 접두에서 끝난 이탈 경로는 후보 없음(null)으로 남아 다음 축(④ URL 파생)에 맡긴다.
    let pool = nonNull;
    let lcp = 0;
    for (;;) {
        lcp = pool[0].length;
        for (const d of pool) {
            let i = 0;
            while (i < lcp && i < d.length && d[i] === pool[0][i])
                i++;
            lcp = Math.min(lcp, i);
        }
        const deeper = pool.filter((d) => d.length > lcp);
        if (deeper.length < pool.length && deeper.length * 2 >= nonNull.length) {
            pool = deeper;
            continue;
        }
        break;
    }
    for (let p = lcp; p >= 0; p--) {
        const cands = dirs.map((d) => (d && d.length > p ? d[p] : null));
        const named = cands.filter((c) => c !== null);
        if (named.length === 0)
            continue;
        const distinct = new Set(named).size;
        // 후보 수용률 절반 이상 + 그룹 폭발 상한 안쪽일 때만 채택.
        if (distinct <= cap && named.length * 2 >= nonNull.length)
            return cands;
    }
    return paths.map(() => null);
}
/** 화면 id → 파생용 경로("screen:" 접두·"__변형" 접미 제거). 경로꼴이 아니면 null. */
function idPath(screenId) {
    const raw = screenId.replace(/^screen:/, '').split('__')[0];
    if (!raw || raw === '(root)')
        return null;
    return raw;
}
/**
 * 경로 디렉터리 세그먼트 윈도우를 "."-조인해 플랜 도메인 키와 일치를 찾는다 —
 * egov 류 모듈 경로(URL `sym/tbm/tbr/xxx.do`·JSP `…/jsp/egovframework/com/uss/umt/X.jsp`
 * ↔ 도메인 키 `sym.tbm.tbr`/`uss.umt`)의 결정론 조인. 가장 이른 시작 위치에서
 * 가장 긴 일치를 채택(결정론). 일치가 없으면 null(일반 폴더 파생으로 폴백).
 */
function planKeyFromPath(path, planKeys) {
    if (!path || planKeys.size === 0)
        return null;
    const dirs = path.split('/').filter(Boolean).slice(0, -1);
    for (let start = 0; start < dirs.length; start++) {
        for (let end = dirs.length; end > start; end--) {
            const cand = dirs.slice(start, end).join('.');
            if (planKeys.has(cand))
                return cand;
        }
    }
    return null;
}
/**
 * 시나리오 접미 토큰 → 플랜 키(결함 3, 축 C) — SPA 는 URL 이 항상 `(root)` 라 ④ URL 축이
 * 무력하고, 화면 구분이 시나리오 id 접미(`screen:(root)__s_trust-register`)에만 남는다.
 * 시나리오 id/화면 id 접미를 토큰화(`-_./` 분리)해 확정 플랜 키와 대조한다:
 *   "trust-register" → [trust, register] → planKey "trust"
 *   "royalty.settlement" → planKey "royalty" (또는 "royalty.settlement" 창 일치)
 * 가장 긴 토큰 창을 가장 이른 시작에서 채택(결정론). 일치가 없으면 null.
 */
function planKeyFromScenario(scenario, screenId, planKeys) {
    if (planKeys.size === 0)
        return null;
    // 후보 출처: scenario 필드 + 화면 id 의 `__s_`/`__` 접미(둘 다 시나리오 유래).
    const suffix = screenId.includes('__') ? screenId.split('__').slice(1).join('__') : '';
    const sources = [scenario ?? '', suffix.replace(/^s_/, '')];
    for (const src of sources) {
        const tokens = src.split(/[-_./]+/).filter(Boolean);
        if (tokens.length === 0)
            continue;
        for (let start = 0; start < tokens.length; start++) {
            for (let end = tokens.length; end > start; end--) {
                const cand = tokens.slice(start, end).join('.');
                if (planKeys.has(cand))
                    return cand;
            }
        }
    }
    return null;
}
/**
 * 전 화면 domain 재배정(순수·멱등) — 기존 domain 값은 보지 않고 항상 새로 계산한다
 * (과거 실행·수동 편집의 낡은 값이 남지 않게. 사람 편집은 *-overrides 소관).
 */
export function assignScreenDomains(screens, ctx) {
    const cap = Math.max(DERIVED_GROUP_CAP, ctx.planDomainCount);
    const byMethod = {
        override: 0,
        handlerJoin: 0,
        viewFileJoin: 0,
        viewFolder: 0,
        urlFolder: 0,
        scenarioToken: 0,
        unassigned: 0,
    };
    const commonChrome = computeCommonChromeKeys(screens);
    const planKeys = new Set(ctx.domainByRoot.values());
    // ③ 파생 축(전 화면 jspFile)은 ⓪ 플랜 키 일치 판정에도 쓰므로 먼저 계산한다.
    const viewFolder = deriveFolderGroups(screens.map((s) => s.jspFile), cap);
    // 축 D + ⓪①② — 화면 단위 조인.
    const joined = screens.map((s, i) => {
        // 축 D — screen-domain-map.json 결정론 힌트가 최우선(재실행 보존). 다른 축을 건너뛴다.
        const override = ctx.domainOverrides.get(s.id);
        if (override) {
            byMethod.override++;
            return override;
        }
        // ⓪ 뷰 경로 → 플랜 키: 파생 폴더 단일 일치 or 경로 윈도우 "."-조인 일치.
        const folder = viewFolder[i];
        if (folder && planKeys.has(folder)) {
            byMethod.viewFolder++;
            return folder;
        }
        const jspPlanKey = planKeyFromPath(s.jspFile, planKeys);
        if (jspPlanKey) {
            byMethod.viewFolder++;
            return jspPlanKey;
        }
        const h = domainFromHandlers(s, ctx, commonChrome);
        if (h) {
            byMethod.handlerJoin++;
            return h;
        }
        const v = domainFromViewFiles(s, ctx);
        if (v)
            byMethod.viewFileJoin++;
        return v;
    });
    // ④ id(URL 경로) 파생.
    const urlFolder = deriveFolderGroups(screens.map((s) => idPath(s.id)), cap);
    const out = screens.map((s, i) => {
        let domain = joined[i];
        if (!domain && viewFolder[i]) {
            domain = viewFolder[i];
            byMethod.viewFolder++;
        }
        if (!domain) {
            // URL 경로 → 플랜 키 일치가 일반 폴더 파생보다 우선(실제 도메인 정합).
            const planMatch = planKeyFromPath(idPath(s.id), planKeys);
            if (planMatch) {
                domain = planMatch;
                byMethod.urlFolder++;
            }
            else if (urlFolder[i]) {
                domain = urlFolder[i];
                byMethod.urlFolder++;
            }
        }
        // 축 C — 시나리오 접미 토큰 → 플랜 키(SPA 폴백: URL 이 (root) 하나라 ④ 가 무력할 때).
        if (!domain) {
            const scn = planKeyFromScenario(s.scenario, s.id, planKeys);
            if (scn) {
                domain = scn;
                byMethod.scenarioToken++;
            }
        }
        if (!domain)
            byMethod.unassigned++;
        return domain === s.domain ? s : { ...s, domain };
    });
    return {
        screens: out,
        summary: { total: screens.length, assigned: screens.length - byMethod.unassigned, byMethod },
    };
}
/** screens.json 을 읽어 재배정 후 기록한다(단독 op — 백필·confirm 재확정 후 재정합). */
export function assignScreenDomainsOnDisk(projectRoot) {
    const path = join(projectRoot, '.understand-anything', SCREENS_FILENAME);
    const file = ScreensFileSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
    const { screens, summary } = assignScreenDomains(file.screens, loadDomainAssignContext(projectRoot));
    const next = ScreensFileSchema.parse({ ...file, screens });
    writeFileSync(path, stableJson(next), 'utf8');
    return { screensPath: path, summary };
}
//# sourceMappingURL=domain-assign.js.map