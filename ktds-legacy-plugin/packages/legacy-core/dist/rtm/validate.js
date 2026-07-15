import { confidenceTag } from '../doc-generator/claims.js';
import { extractTableRefs } from './intake-types.js';
/**
 * 자연순 비교(M3) — "REQ-2" < "REQ-10"(숫자 구간은 수치로). 문자열 cmp 의 사전순 역전 버그 해소.
 * 현행 head(§1 불변규칙) 선택이 요구사항 순서에 의존하므로 정확한 순서가 필수다.
 */
export function natCmp(a, b) {
    const ax = a.match(/(\d+|\D+)/g) ?? [a];
    const bx = b.match(/(\d+|\D+)/g) ?? [b];
    const n = Math.max(ax.length, bx.length);
    for (let i = 0; i < n; i++) {
        const aa = ax[i];
        const bb = bx[i];
        if (aa === undefined)
            return -1;
        if (bb === undefined)
            return 1;
        if (aa === bb)
            continue;
        const an = /^\d/.test(aa);
        const bn = /^\d/.test(bb);
        if (an && bn) {
            const d = parseInt(aa, 10) - parseInt(bb, 10);
            if (d !== 0)
                return d < 0 ? -1 : 1;
        }
        else {
            return aa < bb ? -1 : 1;
        }
    }
    return 0;
}
/** 첫 중복 원소(없으면 null) — id 중복 검출용. */
function firstDuplicate(ids) {
    const seen = new Set();
    for (const id of ids) {
        if (seen.has(id))
            return id;
        seen.add(id);
    }
    return null;
}
/** 방향 그래프 순환 검출(DFS) — supersede / dependsOn 체인 acyclicity. */
function hasCycle(edges) {
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map();
    const visit = (u) => {
        color.set(u, GRAY);
        for (const v of edges.get(u) ?? []) {
            const c = color.get(v) ?? WHITE;
            if (c === GRAY)
                return true;
            if (c === WHITE && visit(v))
                return true;
        }
        color.set(u, BLACK);
        return false;
    };
    for (const u of edges.keys())
        if ((color.get(u) ?? WHITE) === WHITE && visit(u))
            return true;
    return false;
}
/**
 * 조립된 모델 + 드롭된 요구사항 id 로 진단을 만든다. 결정론: 진단은 (level, code, ref) 정렬.
 * - error: 드롭(파싱 실패)·댕글링 changeset/AC fnId·중복 id·순환(supersede/dependsOn).
 * - warn:  AC.fnIds ⊄ changeset·동일 fnId 다중 버킷·댕글링 nfrScope/dependsOn/supersede·supersede 비대칭.
 */
export function computeDiagnostics(model, droppedReqIds = []) {
    const out = [];
    const add = (level, code, message, ref) => {
        out.push(ref === undefined ? { level, code, message } : { level, code, message, ref });
    };
    const fnIds = new Set(model.functions.map((f) => f.id));
    const domainIds = new Set(model.domains.map((d) => d.id));
    const reqIds = new Set(model.requirements.map((r) => r.id));
    const statusById = new Map(model.requirements.map((r) => [r.id, r.status]));
    for (const id of droppedReqIds)
        add('error', 'req-dropped', `요구사항 파싱 실패로 누락됨: ${id}`, id);
    const dupFn = firstDuplicate(model.functions.map((f) => f.id));
    if (dupFn)
        add('error', 'dup-function-id', `중복 기능 id: ${dupFn}`, dupFn);
    const dupReq = firstDuplicate(model.requirements.map((r) => r.id));
    if (dupReq)
        add('error', 'dup-requirement-id', `중복 요구사항 id: ${dupReq}`, dupReq);
    const supEdges = new Map();
    const depEdges = new Map();
    for (const r of model.requirements) {
        const buckets = [
            ['added', r.changeset.added],
            ['modified', r.changeset.modified],
            ['removed', r.changeset.removed],
            ['revived', r.changeset.revived],
        ];
        const csUnion = new Set();
        const seenInBucket = new Set();
        for (const [bucket, ids] of buckets) {
            for (const id of ids) {
                // ★ 왜 여전히 "기록만" 하고 차단하지 않는가(P1c 판단, 2026-07-16) — 승격을 검토했고 **기각**했다.
                //
                // 승격 이득은 "⑤에서 환각 fnId 를 실제로 막는다" 하나인데, 비용이 셋이다:
                //  1) **계약 위반** — 이 모듈은 설계상 진단기다(머리말: "강제 대신 진단"). 호출자가 4곳
                //     (build-rtm·apply-requirements·apply-overlay·test-scenarios)이고 그중 buildRtm 은
                //     요구사항이 아예 없는 순수 AS-IS 경로다. 여기서 throw 하면 넷의 계약이 함께 바뀐다.
                //  2) **폭발 반경** — understand-rtm.mjs 가 죽으면 rtm.json 이 통째로 안 나온다. 오버레이
                //     한 행의 오타로 기능 28행·커버리지·시나리오 전부를 잃는다. 게다가 fail-closed 가 아니라
                //     **fail-stale** 이다: 새 파일을 못 쓰면 낡은 rtm.json 이 디스크에 남아 대시보드가
                //     아무 신호 없이 구데이터를 보여준다 — 진단을 error 로 남기고 재생성하는 편이 엄격히 낫다.
                //  3) **층위 오류** — 차단은 생산자(`rtm-intake.mjs validate`, P1 게이트 = exit 2)의 몫이다.
                //     재bake 는 디스크 상태의 결정론 투영일 뿐이라, 쓴 쪽의 죄를 읽는 쪽에서 벌하는 꼴이 된다.
                //
                // 실측(jpetstore): REQ-001/002 의 changeset.modified 는 전부 실재 flow 라 이 진단이 안 뜬다
                // (rtm.json.diagnostics = []). 즉 승격해도 기준선에선 얻는 게 없고 위험만 는다.
                //
                // 다만 조용하진 않다: applyRequirements 는 댕글링 fnId 를 드롭하지 않고 그대로 두므로
                // coverage.byRequirement 의 targetsTotal 만 부풀고 targetsBuilt 는 안 는다. 그 조용한
                // 오계상을 error 진단이 표면화하는 것이 현재 이 줄의 역할이다.
                if (!fnIds.has(id))
                    add('error', 'dangling-changeset-fn', `요구 ${r.id} changeset.${bucket} 의 기능 id 없음: ${id}`, r.id);
                if (seenInBucket.has(id))
                    add('warn', 'fn-multiple-buckets', `요구 ${r.id} 의 기능 ${id} 이 changeset 여러 버킷에 중복`, r.id);
                seenInBucket.add(id);
                csUnion.add(id);
            }
        }
        for (const ac of r.acceptanceCriteria) {
            for (const id of ac.fnIds) {
                if (!fnIds.has(id))
                    add('error', 'dangling-ac-fn', `요구 ${r.id} ${ac.id} 의 기능 id 없음: ${id}`, `${r.id}/${ac.id}`);
                else if (!csUnion.has(id))
                    add('warn', 'ac-fn-not-in-changeset', `요구 ${r.id} ${ac.id} 의 기능 ${id} 이 changeset 에 없음`, `${r.id}/${ac.id}`);
            }
        }
        for (const id of r.nfrScope) {
            if (!fnIds.has(id) && !domainIds.has(id))
                add('warn', 'dangling-nfr-scope', `요구 ${r.id} nfrScope 의 기능/도메인 id 없음: ${id}`, r.id);
        }
        for (const id of r.dependsOn) {
            if (!reqIds.has(id))
                add('warn', 'dangling-depends-on', `요구 ${r.id} dependsOn 의 요구 id 없음: ${id}`, r.id);
            else if (r.status === 'ACTIVE' && statusById.get(id) === 'WITHDRAWN') {
                add('warn', 'depends-on-withdrawn', `유효 요구 ${r.id} 가 폐기된 요구 ${id} 에 의존(의존 끊김 — 재검토 필요)`, r.id);
            }
        }
        depEdges.set(r.id, r.dependsOn);
        if (r.supersedes !== null) {
            if (!reqIds.has(r.supersedes))
                add('warn', 'dangling-supersedes', `요구 ${r.id} supersedes 의 요구 id 없음: ${r.supersedes}`, r.id);
            else {
                supEdges.set(r.id, [r.supersedes]);
                const prev = model.requirements.find((x) => x.id === r.supersedes);
                if (prev && prev.supersededBy !== r.id)
                    add('warn', 'supersede-asymmetry', `요구 ${r.id} supersedes ${r.supersedes} 이나 역참조(supersededBy) 불일치`, r.id);
            }
        }
    }
    if (hasCycle(supEdges))
        add('error', 'supersede-cycle', 'supersede 체인에 순환이 있다(이력 타임라인 무한루프 위험)');
    if (hasCycle(depEdges))
        add('error', 'depends-on-cycle', 'dependsOn 에 순환이 있다');
    return out.sort((a, b) => natCmp(a.level, b.level) || natCmp(a.code, b.code) || natCmp(a.ref ?? '', b.ref ?? ''));
}
/** `[확정]` — CONFIRMED 표기 태그. claims.ts 단일 소스에서 받아 어휘를 복제하지 않는다. */
const CONFIRMED_TAG = confidenceTag('CONFIRMED');
/**
 * 이 셀이 **확정으로 단언**하는가 — 등급을 가르는 유일한 판정.
 * `intake-types.ts` 의 동명 private 헬퍼와 같은 규칙이다(구조 confidence 또는 본문 `[확정]` 태그).
 * 셀은 `confidence` 컬럼을 항상 가지므로 `Confidence | null` 이 아니라 `Confidence` 를 받는다.
 */
function assertsConfirmed(text, confidence) {
    return confidence === 'CONFIRMED' || text.includes(CONFIRMED_TAG);
}
/**
 * ★ ⑤ 재bake 표면의 실재 대조(P1c) — `rtm-requirements.json` 이 투영된 기능 셀을 db-schema 와 대조.
 *
 * **왜 여기가 필요한가**: 실측 `OAUTH_ACCOUNT` 는 `identified.json` 을 거치지 않는다.
 * `project-intake.ts` 의 `intakeFnStub` 은 4축 셀을 전부 빈 값으로 만들므로, `functions[].data` 의
 * `"(제안) OAUTH_ACCOUNT(C) · …"` 는 **⑤ 이후 LLM 이 직접 쓴 것**이고 P1 게이트(`rtm-intake.mjs
 * validate` → `checkIntakeGrounding`)가 보는 표면 **밖**이다. 같은 규칙을 이 표면에도 세운다.
 *
 * **규칙은 P1b 확정분 재사용**(새로 만들지 않는다 — `intake-types.ts` `checkIntakeGrounding` 참조):
 *  - 신규 테이블(db-schema 에 없음) 제안 자체는 **정당하다** — 카카오 로그인엔 OAuth 연동 저장소가
 *    필요하다. 그래서 기본은 표면화만(`warn`).
 *  - 단 `[확정]`/CONFIRMED 로 **단언**하면 `error` — impact 엔진 `supplement-a.ts` `checkCreationL1`
 *    의 "net-new CONFIRMED 금지"와 동일 철학(근거↔신뢰도 불변식의 귀결).
 *
 * ⚠ **P1b 의 `info` 가 여기선 `warn` 인 이유**: `RtmDiagnosticSchema.level` 의 어휘는
 * `error|warn` 뿐이다(`types.ts`). 둘 다 차단하지 않으므로("주의") `info` 의 의미
 * — *표면화하되 통과* — 는 그대로 보존되고, 보존해야 할 **등급 구분**(단언=error / 제안=warn)도 산다.
 *
 * ⚠ 이 함수는 **차단하지 않는다** — `computeDiagnostics` 와 같은 진단기다. 호출자는 결과를
 * `model.diagnostics` 에 병합만 한다. 차단을 안 하는 이유는 `dangling-changeset-fn`(위) 주석과 같다.
 * "db-schema 를 안 보고 제안했다"는 어차피 게이트로 검출 불가다 — P3 근거 번들·P2/P5 인용이 푼다.
 *
 * 대상 축은 `entryPoint`/`implementation`/`data` 3개다. `test` 는 시험 케이스명 자리라
 * 테이블 표기가 나올 자리가 아니다(실측 전건 UNVERIFIED).
 */
export function checkCellGrounding(model, inventory) {
    const tables = inventory?.tables ? new Set(inventory.tables) : null;
    if (!tables)
        return []; // 축 미주입 → 대조 생략(하위호환)
    const out = [];
    for (const f of model.functions) {
        const cells = [
            ['entryPoint', f.entryPoint],
            ['implementation', f.implementation],
            ['data', f.data],
        ];
        for (const [field, cell] of cells) {
            const confirmed = assertsConfirmed(cell.value, cell.confidence);
            const seen = new Set();
            // `extractTableRefs` 의 좁은 계약(`이름(CRUD)` 표기만) 재사용 — 산문 속 맨몸 대문자 토큰을
            // 테이블로 오인하지 않는다. 못 잡는 형태가 있음을 인정하고 좁게 간다(설계서 §7 C8).
            for (const t of extractTableRefs(cell.value)) {
                if (tables.has(t))
                    continue;
                if (seen.has(t))
                    continue;
                seen.add(t);
                out.push({
                    level: confirmed ? 'error' : 'warn',
                    code: 'unknown-table',
                    message: confirmed
                        ? `기능 ${f.id} ${field} 이 신규 테이블(db-schema.json 에 없음)을 ${CONFIRMED_TAG} 으로 단언 — net-new CONFIRMED 위반: ${t}`
                        : `기능 ${f.id} ${field} 의 테이블이 db-schema.json 에 없음(신규 제안 — 정당할 수 있음, db-schema 를 보고 제안했는지 검토): ${t}`,
                    ref: `${f.id}/${field}`,
                });
            }
        }
    }
    return out.sort((a, b) => natCmp(a.level, b.level) || natCmp(a.code, b.code) || natCmp(a.ref ?? '', b.ref ?? ''));
}
//# sourceMappingURL=validate.js.map