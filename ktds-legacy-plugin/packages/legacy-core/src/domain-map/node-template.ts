/**
 * NODE DETAIL 템플릿 (P2 도입, P4 계층별 분리) — step 노드 상세 섹션 정의.
 *
 * 플러그인 탑재 + 사람 편집 가능(방법론 템플릿과 동형). 템플릿이 **계층(FlowLayer)별로**
 * 상세 섹션을 정의하면 bundle 이 각 step 의 계층에 맞는 섹션(promptHint)을 호스트(Claude)
 * 에게 전달하고, 호스트는 섹션별 의미 주장을 근거(slice)와 함께 fill steps[].detail 에
 * 작성한다. verify/emit 은 섹션 주장을 도메인 주장과 동일하게 인용 기계검증한다.
 *
 * P4: api/service/dao/db/other(=unknown) 계층마다 다른 섹션 세트. role(역할)은 전 계층
 * 공통이되 promptHint 가 계층별로 다르고, 계층마다 시그니처 섹션 1개를 더 둔다.
 * 메서드·호출관계는 결정론(엔진이 calls 엣지로 보유)이라 템플릿 섹션이 아니다.
 */
import { z } from 'zod'
import { FlowLayerSchema, type FlowLayer } from './types.js'

export const NodeDetailSectionSchema = z.object({
  /** 섹션 id — fill steps[].detail 의 key 이자 ktdsClaims kind 의 'detail:<id>' 접미. */
  id: z.string().min(1),
  /** 표시명(대시보드 모달 섹션 헤더). */
  label: z.string().min(1),
  /** LLM 채움 지시 — 번들 slice 근거로 작성하게 안내. */
  promptHint: z.string().min(1),
})
export type NodeDetailSection = z.infer<typeof NodeDetailSectionSchema>

export const NodeDetailTemplateSchema = z.object({
  version: z.literal(2),
  /**
   * 계층(FlowLayer)별 상세 섹션 세트. 각 계층 키는 선택 — 정의 안 된 계층은
   * sectionsForLayer 에서 unknown(other) 으로 폴백한다(부분 템플릿 허용).
   */
  byLayer: z.object({
    api: z.array(NodeDetailSectionSchema).optional(),
    service: z.array(NodeDetailSectionSchema).optional(),
    dao: z.array(NodeDetailSectionSchema).optional(),
    db: z.array(NodeDetailSectionSchema).optional(),
    unknown: z.array(NodeDetailSectionSchema).optional(),
  }),
})
export type NodeDetailTemplate = z.infer<typeof NodeDetailTemplateSchema>

/** 공통 role 섹션 빌더 — 계층별 promptHint 만 갈아끼운다. */
function roleSection(promptHint: string): NodeDetailSection {
  return { id: 'role', label: '역할', promptHint }
}

/**
 * v2 기본 템플릿 — 계층별 [role + 시그니처 섹션 1개]. 추후 사용자 커스텀 가능.
 * 각 섹션은 호스트가 step slice 를 근거로 채우는 의미 주장(인용 의무).
 */
export const DEFAULT_NODE_DETAIL_TEMPLATE: NodeDetailTemplate = {
  version: 2,
  byLayer: {
    api: [
      roleSection('이 흐름에서 이 엔드포인트/컨트롤러가 맡는 역할을 한 문단으로(무엇을 받아 어디로 위임).'),
      {
        id: 'request',
        label: '요청 처리',
        promptHint: '받는 요청 파라미터·검증·인증/권한 처리. 핸들러 메서드 시그니처와 검증 코드에서 인용.',
      },
    ],
    service: [
      roleSection('이 흐름에서 이 서비스가 맡는 역할을 한 문단으로(어떤 비즈니스 작업을 조율).'),
      {
        id: 'businessLogic',
        label: '비즈니스 로직',
        promptHint: '핵심 비즈니스 규칙·계산·트랜잭션 경계. 규칙이 구현된 메서드 본문에서 인용.',
      },
    ],
    dao: [
      roleSection('이 흐름에서 이 DAO/매퍼가 맡는 역할을 한 문단으로(어떤 영속 작업을 담당).'),
      {
        id: 'persistence',
        label: '영속 처리',
        promptHint: '실행하는 쿼리/SQL·대상 테이블·결과 매핑. 매퍼 메서드/XML/@Query 에서 인용.',
      },
    ],
    db: [
      roleSection('이 데이터 노드가 흐름에서 맡는 역할을 한 문단으로(어떤 데이터를 보관/표현).'),
      {
        id: 'schema',
        label: '스키마',
        promptHint: '테이블/엔티티의 주요 컬럼·키·제약·관계. 스키마 정의/@Entity/DDL 에서 인용.',
      },
    ],
    unknown: [
      roleSection('이 노드가 흐름에서 맡는 역할을 한 문단으로(데이터 구조 또는 협력 객체).'),
      {
        id: 'dataShape',
        label: '데이터 구조',
        promptHint: '주요 필드/구조와 지켜야 할 불변식. 클래스 필드 선언/검증 로직에서 인용.',
      },
    ],
  },
}

/** 파일명(확장자 제외) → 계층 키. other = unknown(코드 계층 열거형 매핑). */
export const LAYER_FILE_ALIAS: Record<string, FlowLayer> = {
  api: 'api',
  service: 'service',
  dao: 'dao',
  db: 'db',
  other: 'unknown',
  unknown: 'unknown',
}

/**
 * **한 계층 템플릿 파일**(.md)의 섹션을 파싱한다. 계층마다 파일이 따로 있으므로
 * 파일 자체가 계층이고, 본문은 섹션 목록이다(비개발자 친화):
 *   `## <라벨> {#<id>}`  섹션 헤딩 (라벨=표시명, id=fill/detail 키)
 *   그 아래 본문          promptHint(LLM 채움 지시, 산문)
 * 결정론: 파일 순서 보존. 형식 오류는 **명확히 throw**(조용한 폴백 금지 — 정직성).
 * `## ` 앞의 제목(`#`)/설명(`>`) 프로즈는 무시한다.
 */
export function parseLayerSections(md: string): NodeDetailSection[] {
  const sections: NodeDetailSection[] = []
  let cur: { id: string; label: string; hint: string[] } | null = null

  const flush = () => {
    if (cur) {
      const promptHint = cur.hint.join('\n').trim()
      if (!promptHint) throw new Error(`섹션 '${cur.id}' 의 promptHint(본문)가 비어 있습니다`)
      sections.push({ id: cur.id, label: cur.label, promptHint })
    }
    cur = null
  }

  for (const line of md.split(/\r?\n/)) {
    // 섹션 헤딩 `## 라벨 {#id}`. (`#` 제목, `###` 등은 섹션 본문으로 취급.)
    const h = /^##\s+(.+?)\s*$/.exec(line)
    if (h && !line.startsWith('###')) {
      flush()
      const m = /^(.*?)\s*\{#([A-Za-z0-9_-]+)\}\s*$/.exec(h[1].trim())
      if (!m) {
        throw new Error(`섹션 헤딩에 id 가 없습니다: '## ${h[1]}' — '## 라벨 {#id}' 형식 필요`)
      }
      cur = { id: m[2], label: m[1].trim(), hint: [] }
      continue
    }
    if (cur) cur.hint.push(line)
  }
  flush()

  if (sections.length === 0) {
    throw new Error('계층 템플릿에 섹션(## 라벨 {#id})이 하나도 없습니다')
  }
  return sections
}

/**
 * 계층별 템플릿 파일(.md) 내용을 모아 NodeDetailTemplate 로 조립·검증한다.
 * 입력 = { <계층>: 파일내용 } (IO 는 호출자/.mjs 가 — 엔진은 순수). 키는 FlowLayer
 * (파일명 other → unknown 은 호출자가 LAYER_FILE_ALIAS 로 매핑해 넘긴다).
 */
export function parseNodeDetailTemplate(
  filesByLayer: Partial<Record<FlowLayer, string>>,
): NodeDetailTemplate {
  const byLayer: Partial<Record<FlowLayer, NodeDetailSection[]>> = {}
  for (const [layer, md] of Object.entries(filesByLayer)) {
    if (md == null) continue
    byLayer[layer as FlowLayer] = parseLayerSections(md)
  }
  if (Object.keys(byLayer).length === 0) {
    throw new Error('계층 템플릿 파일이 하나도 없습니다')
  }
  return NodeDetailTemplateSchema.parse({ version: 2, byLayer })
}

/**
 * 주어진 노드 계층에 적용되는 템플릿 섹션. 미정의 계층은 unknown(other) 폴백.
 * 결정론: 템플릿이 정의한 섹션 순서 보존(표시/채움 순서).
 */
export function sectionsForLayer(
  template: NodeDetailTemplate,
  layer: FlowLayer | undefined,
): NodeDetailSection[] {
  const key: FlowLayer = layer && layer in template.byLayer ? layer : 'unknown'
  return template.byLayer[key] ?? template.byLayer.unknown ?? []
}
