/**
 * BUNDLE 단계(S8 입력 조립) — 도메인별 LLM 채움 입력 묶음.
 *
 * 도메인 서브그래프(domain/flow/step 골격) + 각 step 대상 파일의 실제 소스 슬라이스
 * (인용 가능한 텍스트를 실제로 제공) + KG 존재 시 파일 summary/tags 기회 보강을
 * `.spec/map/bundle/<safeKey>.json` 으로 영속한다. 호스트(Claude)가 이 묶음만 읽고
 * file:line 인용이 달린 fill/<key>.json 을 작성한다(SKILL.md 채움 지시).
 *
 * 결정론: 모든 배열은 자연키로 정렬, stableJson 직렬화 → 동일 입력 byte-identical.
 * 크기 상한(charCap): 슬라이스가 예산을 넘으면 slice=null + sliceOmitted 로 보고한다
 * (조용한 누락 금지 — LLM 은 생략 파일에 인용 없는 주장을 만들 수 없고, S9 검증기가
 * 어차피 환각을 걸러낸다).
 */
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { specMapDir, stableJson } from './persist.js'
import { cmp } from '../utils/cmp.js'
import { DEFAULT_NODE_DETAIL_TEMPLATE, NodeDetailTemplateSchema } from './node-template.js'
import type { NodeDetailTemplate } from './node-template.js'
import { FlowLayerSchema } from './types.js'
import type { SkeletonReport } from './types.js'

/** `.spec/map/bundle/` 하위 디렉터리 이름. */
export const BUNDLE_DIR = 'bundle'
/** step 파일당 소스 슬라이스 라인 수 상한. */
export const DEFAULT_SLICE_LINES = 80
/** 번들 전체 소스 슬라이스 문자 수 상한 — LLM 컨텍스트 예산. */
export const DEFAULT_BUNDLE_CHAR_CAP = 120_000

export const SourceSliceSchema = z.object({
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  text: z.string(),
  /** 파일이 슬라이스 창보다 길거나 앵커 위로 잘렸으면 true. */
  truncated: z.boolean(),
})
export type SourceSlice = z.infer<typeof SourceSliceSchema>

export const BundleFileSchema = z.object({
  relPath: z.string(),
  className: z.string().nullable(),
  /** 주 앵커 라인 (skeleton stepSources 와 동일). */
  line: z.number().int().positive(),
  /** charCap 으로 슬라이스가 통째로 생략되면 null (sliceOmitted 에 보고). */
  slice: SourceSliceSchema.nullable(),
  /** KG 존재 시 파일 노드의 summary/tags (기회 보강, 없으면 null). */
  kgHint: z.object({ summary: z.string(), tags: z.array(z.string()) }).nullable(),
})
export type BundleFile = z.infer<typeof BundleFileSchema>

export const DomainBundleSchema = z.object({
  schemaVersion: z.literal(1),
  gitCommit: z.string().nullable(),
  domainId: z.string(),
  key: z.string(),
  name: z.string(),
  flows: z.array(
    z.object({
      flowId: z.string(),
      entryPoint: z.string(),
      entryType: z.string(),
      filePath: z.string(),
      line: z.number().int().positive(),
      /** flow 의 step 체인 (stepId, skeleton flow_step weight 순서). */
      stepIds: z.array(z.string()),
    }),
  ),
  /** P4: layer = 이 step 의 계층 — 호스트가 nodeDetailTemplate.byLayer[layer] 섹션을 채운다. */
  steps: z.array(z.object({ stepId: z.string(), relPath: z.string(), layer: FlowLayerSchema.optional() })),
  /** 소스 슬라이스 포함 파일 (도메인 내 유일, relPath 정렬). */
  files: z.array(BundleFileSchema),
  /** charCap 으로 슬라이스가 생략된 파일 (보고 — 조용한 누락 금지). */
  sliceOmitted: z.array(z.string()),
  /**
   * P2: step 상세 채움 템플릿. 호스트(Claude)가 steps[].detail 의 어떤 섹션을
   * (promptHint 지시대로) 채울지 안내한다. v1 = role 섹션 1개.
   */
  nodeDetailTemplate: NodeDetailTemplateSchema,
})
export type DomainBundle = z.infer<typeof DomainBundleSchema>

export interface BuildBundlesOptions {
  sliceLines?: number
  charCap?: number
  /**
   * P4: step 상세 채움 템플릿. 보통 .mjs 가 templates/node-detail-sections.md 를
   * 읽어 파싱해 주입한다(사람 편집 권위). 미지정이면 내장 기본(DEFAULT)으로 폴백.
   */
  nodeDetailTemplate?: NodeDetailTemplate
}

interface KgFileHint {
  summary: string
  tags: string[]
}

/**
 * 도메인 key → 파일명. 경로 구분자/특수문자를 `_` 로 치환하고, 경로 세그먼트·
 * 숨김·빈 이름은 거부(fail-closed) — `.spec/map/bundle` 밖 탈출 차단.
 */
export function safeKeyFilename(key: string): string {
  const safe = key.replace(/[^A-Za-z0-9._-]/g, '_')
  if (safe.length === 0 || safe.startsWith('.') || safe.includes('/') || safe.includes('\\')) {
    throw new Error(`잘못된 도메인 key: ${JSON.stringify(key)} — 안전한 파일명으로 변환 불가`)
  }
  return safe
}

/** `.spec/map/bundle/` 디렉터리 경로. */
export function bundleDir(projectRoot: string): string {
  return join(specMapDir(projectRoot), BUNDLE_DIR)
}

/** KG 파일 노드 → relPath 기준 힌트 인덱스 (KG 부재 시 빈 맵). */
async function loadKgHints(projectRoot: string): Promise<Map<string, KgFileHint>> {
  const hints = new Map<string, KgFileHint>()
  let raw: string
  try {
    raw = await readFile(join(projectRoot, '.understand-anything', 'knowledge-graph.json'), 'utf8')
  } catch {
    return hints
  }
  try {
    const graph = JSON.parse(raw) as {
      nodes?: Array<{ type?: string; filePath?: string; summary?: string; tags?: string[] }>
    }
    for (const node of graph.nodes ?? []) {
      if (node.type === 'file' && node.filePath && !hints.has(node.filePath)) {
        hints.set(node.filePath, { summary: node.summary ?? '', tags: node.tags ?? [] })
      }
    }
  } catch {
    // 손상된 KG 는 힌트 없이 진행 — 번들의 진실은 소스 슬라이스다.
  }
  return hints
}

async function sliceFile(
  projectRoot: string,
  relPath: string,
  anchorLine: number,
  sliceLines: number,
): Promise<SourceSlice | null> {
  let content: string
  try {
    content = await readFile(join(projectRoot, relPath), 'utf8')
  } catch {
    return null
  }
  const lines = content.split('\n')
  // 앵커 위 10줄부터 창을 연다 — 클래스 선언 직전 import/주석 문맥 포함.
  const startLine = Math.max(1, anchorLine - 10)
  const endLine = Math.min(lines.length, startLine + sliceLines - 1)
  return {
    startLine,
    endLine,
    text: lines.slice(startLine - 1, endLine).join('\n'),
    truncated: endLine < lines.length || startLine > 1,
  }
}

/**
 * skeleton 의 도메인별 번들을 조립해 `.spec/map/bundle/<safeKey>.json` 으로 영속한다.
 * 파일 슬라이스는 relPath 정렬 순서로 charCap 까지 채우고, 초과분은 slice=null +
 * sliceOmitted 에 보고한다. 반환값의 paths 는 기록한 파일들의 절대 경로다.
 */
export async function buildBundles(
  projectRoot: string,
  skeleton: SkeletonReport,
  options: BuildBundlesOptions = {},
): Promise<{ bundles: DomainBundle[]; paths: string[] }> {
  const sliceLines = options.sliceLines ?? DEFAULT_SLICE_LINES
  const charCap = options.charCap ?? DEFAULT_BUNDLE_CHAR_CAP
  const nodeDetailTemplate = options.nodeDetailTemplate ?? DEFAULT_NODE_DETAIL_TEMPLATE
  const kgHints = await loadKgHints(projectRoot)

  const domains = skeleton.nodes.filter((n) => n.type === 'domain')
  const flowsByDomain = new Map<string, string[]>()
  for (const e of skeleton.edges) {
    if (e.type !== 'contains_flow') continue
    const list = flowsByDomain.get(e.source)
    if (list) list.push(e.target)
    else flowsByDomain.set(e.source, [e.target])
  }
  const stepsByFlow = new Map<string, string[]>()
  for (const e of skeleton.edges) {
    if (e.type !== 'flow_step') continue
    // flow_step 은 weight 단조증가 순으로 정렬돼 있다(skeleton 정렬 계약).
    const list = stepsByFlow.get(e.source)
    if (list) list.push(e.target)
    else stepsByFlow.set(e.source, [e.target])
  }
  const nodeById = new Map(skeleton.nodes.map((n) => [n.id, n]))
  const sourceByStep = new Map(skeleton.stepSources.map((s) => [s.stepId, s]))

  const bundles: DomainBundle[] = []
  const paths: string[] = []
  const dir = bundleDir(projectRoot)
  await mkdir(dir, { recursive: true })

  for (const domain of domains) {
    const key = domain.id.slice('domain:'.length)
    const flowIds = (flowsByDomain.get(domain.id) ?? []).slice().sort(cmp)
    const flows: DomainBundle['flows'] = []
    const steps: DomainBundle['steps'] = []
    const fileAnchors = new Map<string, { line: number; className: string | null }>()

    for (const flowId of flowIds) {
      const flow = nodeById.get(flowId)
      if (!flow) continue
      const stepIds = stepsByFlow.get(flowId) ?? []
      flows.push({
        flowId,
        entryPoint: String(flow.domainMeta?.entryPoint ?? ''),
        entryType: String(flow.domainMeta?.entryType ?? ''),
        filePath: flow.filePath ?? '',
        line: flow.lineRange?.[0] ?? 1,
        stepIds,
      })
      for (const stepId of stepIds) {
        const src = sourceByStep.get(stepId)
        if (!src) continue
        const layer = nodeById.get(stepId)?.layer
        steps.push(layer ? { stepId, relPath: src.relPath, layer } : { stepId, relPath: src.relPath })
        if (!fileAnchors.has(src.relPath)) {
          fileAnchors.set(src.relPath, { line: src.line, className: src.className })
        }
      }
    }
    steps.sort((a, b) => cmp(a.stepId, b.stepId))

    const files: BundleFile[] = []
    const sliceOmitted: string[] = []
    let used = 0
    for (const relPath of [...fileAnchors.keys()].sort(cmp)) {
      const anchor = fileAnchors.get(relPath)!
      const hint = kgHints.get(relPath) ?? null
      let slice = await sliceFile(projectRoot, relPath, anchor.line, sliceLines)
      if (slice && used + slice.text.length > charCap) {
        slice = null
        sliceOmitted.push(relPath)
      }
      if (slice) used += slice.text.length
      files.push({ relPath, className: anchor.className, line: anchor.line, slice, kgHint: hint })
    }

    const bundle: DomainBundle = {
      schemaVersion: 1,
      gitCommit: skeleton.gitCommit,
      domainId: domain.id,
      key,
      name: domain.name,
      flows,
      steps,
      files,
      sliceOmitted,
      nodeDetailTemplate,
    }
    const filePath = join(dir, `${safeKeyFilename(key)}.json`)
    await writeFile(filePath, stableJson(DomainBundleSchema.parse(bundle)), 'utf8')
    bundles.push(bundle)
    paths.push(filePath)
  }
  return { bundles, paths }
}
