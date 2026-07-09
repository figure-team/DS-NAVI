/**
 * ktds legacy-core — screens.json 조립/검증(순수 함수 + node:crypto).
 *
 * - buildScreensFile: 정렬·zod 검증·mechanicalHash 산출(결정론 — 동일 입력 = 동일 바이트).
 * - serializeScreens: stableJson 직렬화(2칸 들여쓰기 + 후행 개행, 키 재귀 정렬).
 * - validateScreensFile: Stage B 이후 게이트 — zod 재검증, mechanicalHash 불변,
 *   CONFIRMED ⇒ evidence ≥ 1(fail-closed), 채움률 통계.
 */
import { createHash } from 'node:crypto';
import { stableJson } from '../domain-map/persist.js';
import { reconcileJsps } from './discover.js';
import { ScreensFileSchema, } from './types.js';
/**
 * 관측 콘텐츠 시그니처 — 서버측 forward(다른 URL, 같은 렌더) 감지용.
 * title/헤딩만으로는 판별력이 없어(전 페이지 title 동일한 레거시 흔함)
 * 주석의 기계 사실(kind|name|href/formAction|label) 집합을 함께 해시한다.
 */
export function computeContentSignature(input) {
    const keys = [
        ...new Set(input.annotations.map((a) => `${a.kind}|${a.mechanical.name ?? ''}|${a.mechanical.href ?? a.mechanical.formAction ?? ''}|${a.label}`)),
    ].sort();
    return createHash('sha256')
        .update(stableJson({ title: input.title, headings: input.headings, keys }))
        .digest('hex');
}
/** mechanical 사실 투영 — Stage B 가 수정할 수 없는 부분만 추출. */
export function mechanicalProjection(screens) {
    return screens.map((s) => ({
        id: s.id,
        annotations: s.annotations.map((a) => ({
            kind: a.kind,
            no: a.no,
            selector: a.selector,
            bbox: a.bbox,
            eventType: a.eventType,
            mechanical: a.mechanical,
        })),
    }));
}
/** mechanical 투영의 sha256 — Stage B 변조 기계검증 앵커. */
export function computeMechanicalHash(screens) {
    return createHash('sha256').update(stableJson(mechanicalProjection(screens))).digest('hex');
}
/** screens.json 조립 — id ASC 정렬, unmatchedJsps 대조, zod 검증 후 반환. */
export function buildScreensFile(input) {
    const screens = [...input.screens].sort((a, b) => a.id.localeCompare(b.id));
    const file = {
        schemaVersion: 1,
        generatedAt: input.generatedAt,
        gitCommit: input.gitCommit,
        baseUrl: input.baseUrl,
        viewport: input.viewport,
        screens,
        unmatchedJsps: reconcileJsps(input.graphJsps, screens, input.fragments),
        fragments: [...input.fragments].sort(),
        missing: [...input.missing].sort((a, b) => a.url.localeCompare(b.url)),
        mechanicalHash: computeMechanicalHash(screens),
    };
    return ScreensFileSchema.parse(file);
}
/** 안정 직렬화 — 파일 기록용(byte-identical 결정론). */
export function serializeScreens(file) {
    return stableJson(file);
}
/** Stage B 이후 게이트 검증 — 스키마/불변/근거 규칙 + 채움률 통계. */
export function validateScreensFile(raw) {
    const parsed = ScreensFileSchema.safeParse(raw);
    if (!parsed.success) {
        return {
            ok: false,
            issues: parsed.error.issues.map((i) => ({
                screenId: null,
                code: 'schema',
                message: `${i.path.join('.')}: ${i.message}`,
            })),
            stats: null,
        };
    }
    const file = parsed.data;
    const issues = [];
    const expectedHash = computeMechanicalHash(file.screens);
    if (file.mechanicalHash !== expectedHash) {
        issues.push({
            screenId: null,
            code: 'mechanical-hash-mismatch',
            message: `mechanicalHash 불일치 — Stage A 기계 사실이 변조되었습니다 (기대 ${expectedHash.slice(0, 12)}…, 실제 ${file.mechanicalHash.slice(0, 12)}…)`,
        });
    }
    const seenIds = new Set();
    let annotationCount = 0;
    let actionable = 0;
    let confirmedActions = 0;
    let described = 0;
    let jspMapped = 0;
    for (const s of file.screens) {
        if (seenIds.has(s.id)) {
            issues.push({
                screenId: s.id,
                code: 'duplicate-screen-id',
                message: `화면 id 중복: ${s.id}`,
            });
        }
        seenIds.add(s.id);
        if (s.jspFile !== null)
            jspMapped++;
        const seenKeys = new Set();
        for (const a of s.annotations) {
            annotationCount++;
            const key = `${a.kind}:${a.no}`;
            if (seenKeys.has(key)) {
                issues.push({
                    screenId: s.id,
                    code: 'duplicate-annotation-key',
                    message: `주석 키 중복: ${key}`,
                });
            }
            seenKeys.add(key);
            if (a.description !== null && a.description.trim() !== '')
                described++;
            if (a.kind === 'action' || a.kind === 'link') {
                actionable++;
                if (a.handler?.confidence === 'CONFIRMED')
                    confirmedActions++;
            }
            if ((a.handler?.confidence === 'CONFIRMED' || a.handler?.confidence === 'CONFIRMED_AI') &&
                a.handler.evidence.length === 0) {
                issues.push({
                    screenId: s.id,
                    code: 'confirmed-without-evidence',
                    message: `${key} (${a.label}): ${a.handler.confidence} 인데 evidence 가 비어 있음 — fail-closed`,
                });
            }
        }
    }
    return {
        ok: issues.length === 0,
        issues,
        stats: {
            screenCount: file.screens.length,
            annotationCount,
            confirmedActionRate: actionable > 0 ? confirmedActions / actionable : null,
            descriptionRate: annotationCount > 0 ? described / annotationCount : null,
            jspMappedRate: file.screens.length > 0 ? jspMapped / file.screens.length : null,
            unmatchedJspCount: file.unmatchedJsps.length,
        },
    };
}
//# sourceMappingURL=assemble.js.map