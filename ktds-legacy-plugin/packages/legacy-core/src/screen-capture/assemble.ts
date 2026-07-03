/**
 * ktds legacy-core — screens.json 조립/검증(순수 함수 + node:crypto).
 *
 * - buildScreensFile: 정렬·zod 검증·mechanicalHash 산출(결정론 — 동일 입력 = 동일 바이트).
 * - serializeScreens: stableJson 직렬화(2칸 들여쓰기 + 후행 개행, 키 재귀 정렬).
 * - validateScreensFile: Stage B 이후 게이트 — zod 재검증, mechanicalHash 불변,
 *   CONFIRMED ⇒ evidence ≥ 1(fail-closed), 채움률 통계.
 */
import { createHash } from 'node:crypto'
import { stableJson } from '../domain-map/persist.js'
import { reconcileJsps } from './discover.js'
import {
  ScreensFileSchema,
  type MissingScreen,
  type Screen,
  type ScreensFile,
} from './types.js'

/** mechanical 사실 투영 — Stage B 가 수정할 수 없는 부분만 추출. */
export function mechanicalProjection(
  screens: Screen[],
): Array<{ id: string; annotations: unknown[] }> {
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
  }))
}

/** mechanical 투영의 sha256 — Stage B 변조 기계검증 앵커. */
export function computeMechanicalHash(screens: Screen[]): string {
  return createHash('sha256').update(stableJson(mechanicalProjection(screens))).digest('hex')
}

export interface BuildScreensInput {
  generatedAt: string
  gitCommit: string | null
  baseUrl: string
  viewport: { width: number; height: number }
  screens: Screen[]
  fragments: string[]
  graphJsps: string[]
  missing: MissingScreen[]
}

/** screens.json 조립 — id ASC 정렬, unmatchedJsps 대조, zod 검증 후 반환. */
export function buildScreensFile(input: BuildScreensInput): ScreensFile {
  const screens = [...input.screens].sort((a, b) => a.id.localeCompare(b.id))
  const file: ScreensFile = {
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
  }
  return ScreensFileSchema.parse(file)
}

/** 안정 직렬화 — 파일 기록용(byte-identical 결정론). */
export function serializeScreens(file: ScreensFile): string {
  return stableJson(file)
}

export interface ScreensValidationIssue {
  screenId: string | null
  code:
    | 'schema'
    | 'mechanical-hash-mismatch'
    | 'confirmed-without-evidence'
    | 'duplicate-screen-id'
    | 'duplicate-annotation-key'
  message: string
}

export interface ScreensValidationStats {
  screenCount: number
  annotationCount: number
  /** action/link 주석 중 CONFIRMED handler 비율(0~1, 분모 0 이면 null). */
  confirmedActionRate: number | null
  /** description 채움률(전체 주석 대비, 분모 0 이면 null). */
  descriptionRate: number | null
  /** jspFile 매핑된 화면 비율(분모 0 이면 null). */
  jspMappedRate: number | null
  unmatchedJspCount: number
}

export interface ScreensValidationResult {
  ok: boolean
  issues: ScreensValidationIssue[]
  stats: ScreensValidationStats | null
}

/** Stage B 이후 게이트 검증 — 스키마/불변/근거 규칙 + 채움률 통계. */
export function validateScreensFile(raw: unknown): ScreensValidationResult {
  const parsed = ScreensFileSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({
        screenId: null,
        code: 'schema',
        message: `${i.path.join('.')}: ${i.message}`,
      })),
      stats: null,
    }
  }
  const file = parsed.data
  const issues: ScreensValidationIssue[] = []

  const expectedHash = computeMechanicalHash(file.screens)
  if (file.mechanicalHash !== expectedHash) {
    issues.push({
      screenId: null,
      code: 'mechanical-hash-mismatch',
      message: `mechanicalHash 불일치 — Stage A 기계 사실이 변조되었습니다 (기대 ${expectedHash.slice(0, 12)}…, 실제 ${file.mechanicalHash.slice(0, 12)}…)`,
    })
  }

  const seenIds = new Set<string>()
  let annotationCount = 0
  let actionable = 0
  let confirmedActions = 0
  let described = 0
  let jspMapped = 0
  for (const s of file.screens) {
    if (seenIds.has(s.id)) {
      issues.push({
        screenId: s.id,
        code: 'duplicate-screen-id',
        message: `화면 id 중복: ${s.id}`,
      })
    }
    seenIds.add(s.id)
    if (s.jspFile !== null) jspMapped++
    const seenKeys = new Set<string>()
    for (const a of s.annotations) {
      annotationCount++
      const key = `${a.kind}:${a.no}`
      if (seenKeys.has(key)) {
        issues.push({
          screenId: s.id,
          code: 'duplicate-annotation-key',
          message: `주석 키 중복: ${key}`,
        })
      }
      seenKeys.add(key)
      if (a.description !== null && a.description.trim() !== '') described++
      if (a.kind === 'action' || a.kind === 'link') {
        actionable++
        if (a.handler?.confidence === 'CONFIRMED') confirmedActions++
      }
      if (
        (a.handler?.confidence === 'CONFIRMED' || a.handler?.confidence === 'CONFIRMED_AI') &&
        a.handler.evidence.length === 0
      ) {
        issues.push({
          screenId: s.id,
          code: 'confirmed-without-evidence',
          message: `${key} (${a.label}): ${a.handler.confidence} 인데 evidence 가 비어 있음 — fail-closed`,
        })
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
  }
}
