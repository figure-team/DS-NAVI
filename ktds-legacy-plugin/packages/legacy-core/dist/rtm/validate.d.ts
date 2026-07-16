import type { RtmDiagnostic, RtmModel } from './types.js';
/**
 * 자연순 비교(M3) — "REQ-2" < "REQ-10"(숫자 구간은 수치로). 문자열 cmp 의 사전순 역전 버그 해소.
 * 현행 head(§1 불변규칙) 선택이 요구사항 순서에 의존하므로 정확한 순서가 필수다.
 */
export declare function natCmp(a: string, b: string): number;
/**
 * 조립된 모델 + 드롭된 요구사항 id 로 진단을 만든다. 결정론: 진단은 (level, code, ref) 정렬.
 * - error: 드롭(파싱 실패)·댕글링 changeset/AC fnId·중복 id·순환(supersede/dependsOn).
 * - warn:  AC.fnIds ⊄ changeset·동일 fnId 다중 버킷·댕글링 nfrScope/dependsOn/supersede·supersede 비대칭.
 */
export declare function computeDiagnostics(model: RtmModel, droppedReqIds?: string[]): RtmDiagnostic[];
/**
 * ⑥ 표면의 인벤토리 — **분석 산출물에서 읽은 "실재하는 것"의 목록**.
 *
 * `intake-types.ts` 의 `IntakeInventory` 와 같은 관례다: 이 파일은 순수 함수라 디스크를 읽지 않고,
 * 호출자(IO 경계 = `scripts/understand-rtm.mjs`)가 db-schema.json 에서 읽어 **주입**한다.
 * 미주입(undefined)이면 그 축의 대조를 **생략**한다(하위호환 — 인벤토리를 모르는 호출자의 동작 불변).
 */
export interface RtmCellInventory {
    /** db-schema.json `tables[].name` — 실존 테이블명 전량. */
    tables?: string[];
}
/**
 * ★ ⑥ 재bake 표면의 실재 대조(P1c) — `rtm-requirements.json` 이 투영된 기능 셀을 db-schema 와 대조.
 *
 * **왜 여기가 필요한가**: 실측 `OAUTH_ACCOUNT` 는 `identified.json` 을 거치지 않는다.
 * `project-intake.ts` 의 `intakeFnStub` 은 4축 셀을 전부 빈 값으로 만들므로, `functions[].data` 의
 * `"(제안) OAUTH_ACCOUNT(C) · …"` 는 **⑥ 이후 LLM 이 직접 쓴 것**이고 P1 게이트(`rtm-intake.mjs
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
export declare function checkCellGrounding(model: RtmModel, inventory?: RtmCellInventory): RtmDiagnostic[];
//# sourceMappingURL=validate.d.ts.map