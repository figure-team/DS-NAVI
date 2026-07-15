/**
 * 추적표 flow(기능 id) → 코드영향 시드 — **결정론 조인(LLM 불필요)**.
 *
 * 설계: docs/ktds/RTM_IMPACT_GATE_DESIGN.md §6.3 · §9 P6.
 *
 * 인테이크 ①식별이 낸 `changeset.modified`(flow id)가 **실제로 어떤 파일에 번지는지**를
 * `rtm.json` 의 CONFIRMED 근거로 되짚는다. `/change` 의 현재 방식(LLM 이 시드 카탈로그를 읽고
 * 경로를 추측 → 사람 승인 게이트)보다 **근거가 강하다** — 추측이 아니라 조인이다(§6.3).
 * 그래서 §7 C9 의 승인 이중화도 여기서 풀린다: 시드가 결정론이면 승인할 "추측"이 없다.
 *
 * ★ 시드 범위 정책 = **`entryPoint` 만**. `implementation`·`data` 축은 **제외**한다.
 *
 * 근거(§7 C4 "시드 폭발" — 2026-07-16 jpetstore 실측):
 *
 * 1. **역할 중복 + 거짓 양성.** `implementation` 셀은 flow 노드 + `flow_step` 엣지로 딸린 step
 *    파일들이다(`rtm/build-rtm.ts:167-181`) — 즉 **이미 계산된 하류 슬라이스**다. impact 엔진의
 *    본업이 바로 시드→하류 BFS 확장(`reach.ts`)이므로 하류를 시드로 도로 먹이면 이중 계산이고,
 *    더 나쁘게는 **그 하류의 상류(= 다른 모든 호출자)가 "영향받음"으로 딸려온다.**
 * 2. **실측(REQ-001 "카카오 로그인 추가", modified 3건):**
 *
 *    | 시드 축 | 시드 | 상류 파일 | API | 흐름 | 도메인 |
 *    |---|---|---|---|---|---|
 *    | `entryPoint` | **1** | 0 | 7 | 10 | **2** (account·order) |
 *    | `implementation` | **6** | 7 | 17 | **21** | **4** (+cart·catalog) |
 *
 *    `implementation` 은 `CatalogService.java`·`ProductMapper.java` 를 시드로 끌어온다 — 로그인
 *    성공 후 카탈로그로 포워드하는 **협력자**이지 변경 대상이 아니다. 그 결과 **cart·catalog
 *    도메인이 "영향받음"으로 점등**된다(카카오 로그인을 추가해도 장바구니는 안 바뀐다 = 거짓 양성).
 *    흐름은 22개 중 **21개(95%)** 가 영향으로 뜬다 — "전부 영향"은 정보가 0인 보고서다.
 * 3. **전역 실측:** 28개 기능의 `entryPoint` 근거 파일은 **5개**(액션빈 4 + web.xml)인 반면
 *    `implementation` 은 **20개 = 자바 소스 24개의 83%**. 후자를 시드로 쓰면 modified 몇 건만으로
 *    사실상 **프로젝트 전체가 시드**가 되고 depth 12·fanIn 24 에서 상·하류가 전부 켜진다.
 * 4. **의미 정합:** `entryPointCell`(`build-rtm.ts:151`)은 flow ↔ 라우트 1:1 매칭이다.
 *    "이 flow 를 바꾼다"의 파일 표현은 정확히 entryPoint 다.
 * 5. **커버리지 확인:** AS-IS 22개 기능은 **전부** entryPoint 근거를 갖는다(CONFIRMED).
 *    근거 0건은 `to-be:` 스텁 6건뿐인데 그건 애초에 제외 대상이다.
 *
 * 하류가 필요하면 엔진이 계산한다 — 실측에서 entryPoint 시드 1개가 하류 12파일·매퍼 4를 냈다.
 * **시드는 "무엇을 바꾸나"이지 "무엇이 딸려오나"가 아니다.**
 */
import { cmp } from '../utils/cmp.js';
import { CONFIDENCE_VALUES } from '../types.js';
/** 신규(TO-BE) 기능 id 접두 — 아직 파일이 없으므로 시드가 될 수 없다(§9 P6). */
export const TO_BE_FN_PREFIX = 'to-be:';
/** 신뢰도 강도 순위(작을수록 강함) — CONFIDENCE_VALUES 가 이미 강→약 정렬이다. */
const confRank = (c) => {
    const i = CONFIDENCE_VALUES.indexOf(c);
    return i < 0 ? CONFIDENCE_VALUES.length : i;
};
/**
 * `fnIds`(= `changeset.modified`) → 시드 파일 집합. 순수 함수 — IO·정렬 불안정성 없음.
 * 동일 입력이면 동일 출력(결정론): 전 배열이 명시 키 정렬, Date/랜덤 미사용.
 */
export function resolveFlowSeeds(functions, fnIds) {
    const byId = new Map(functions.map((f) => [f.id, f]));
    /** relPath → 시드. 여러 flow 가 같은 파일을 가리키면 **가장 강한 신뢰도**를 남긴다(강등 금지). */
    const seedByPath = new Map();
    const bySource = [];
    const skippedToBe = [];
    const unknownFnIds = [];
    const ungroundedFnIds = [];
    for (const fnId of [...new Set(fnIds)].sort(cmp)) {
        if (fnId.startsWith(TO_BE_FN_PREFIX)) {
            skippedToBe.push(fnId);
            continue;
        }
        const fn = byId.get(fnId);
        if (!fn) {
            unknownFnIds.push(fnId);
            continue;
        }
        const relPaths = [...new Set(fn.entryPoint.evidence.map((e) => e.file))].sort(cmp);
        if (relPaths.length === 0) {
            ungroundedFnIds.push(fnId);
            continue;
        }
        bySource.push({ fnId, relPaths });
        for (const relPath of relPaths) {
            const prior = seedByPath.get(relPath);
            if (!prior || confRank(fn.entryPoint.confidence) < confRank(prior.confidence)) {
                seedByPath.set(relPath, { relPath, origin: 'route', confidence: fn.entryPoint.confidence });
            }
        }
    }
    return {
        seeds: [...seedByPath.values()].sort((a, b) => cmp(a.relPath, b.relPath)),
        bySource,
        skippedToBe,
        unknownFnIds,
        ungroundedFnIds,
    };
}
//# sourceMappingURL=rtm-seeds.js.map