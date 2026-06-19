import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  DEFAULT_NODE_DETAIL_TEMPLATE,
  NodeDetailTemplateSchema,
  sectionsForLayer,
  parseNodeDetailTemplate,
  parseLayerSections,
} from './node-template.js'

const here = dirname(fileURLToPath(import.meta.url))
const TEMPLATE_DIR = join(here, '..', '..', '..', '..', 'templates', 'node-detail')
const layerFile = (name: string) => readFileSync(join(TEMPLATE_DIR, name), 'utf8')

describe('node-template — 계층별(P4) 기본 템플릿', () => {
  it('스키마 통과 + version 2 + 5개 계층 키 전부 존재', () => {
    expect(() => NodeDetailTemplateSchema.parse(DEFAULT_NODE_DETAIL_TEMPLATE)).not.toThrow()
    expect(DEFAULT_NODE_DETAIL_TEMPLATE.version).toBe(2)
    for (const layer of ['api', 'service', 'dao', 'db', 'unknown'] as const) {
      expect(DEFAULT_NODE_DETAIL_TEMPLATE.byLayer[layer]).toBeDefined()
    }
  })

  it('각 계층은 role + 시그니처 섹션(2개) — 계층별 시그니처 id 가 다르다', () => {
    const sig: Record<string, string> = {
      api: 'request',
      service: 'businessLogic',
      dao: 'persistence',
      db: 'schema',
      unknown: 'dataShape',
    }
    for (const [layer, sigId] of Object.entries(sig)) {
      const sections = DEFAULT_NODE_DETAIL_TEMPLATE.byLayer[layer as keyof typeof sig]
      const ids = sections.map((s) => s.id)
      expect(ids).toContain('role')
      expect(ids).toContain(sigId)
      // role 의 promptHint 는 계층마다 다르다(공통 id, 계층별 지시).
      expect(sections.find((s) => s.id === 'role')!.promptHint.length).toBeGreaterThan(0)
    }
  })

  it('role promptHint 가 계층마다 실제로 다르다', () => {
    const apiRole = DEFAULT_NODE_DETAIL_TEMPLATE.byLayer.api.find((s) => s.id === 'role')!.promptHint
    const daoRole = DEFAULT_NODE_DETAIL_TEMPLATE.byLayer.dao.find((s) => s.id === 'role')!.promptHint
    expect(apiRole).not.toBe(daoRole)
  })

  it('sectionsForLayer: 해당 계층 섹션 반환', () => {
    const apiSections = sectionsForLayer(DEFAULT_NODE_DETAIL_TEMPLATE, 'api')
    expect(apiSections.map((s) => s.id)).toEqual(['role', 'request'])
  })

  it('sectionsForLayer: undefined/미정의 계층은 unknown(other) 폴백', () => {
    const fallback = sectionsForLayer(DEFAULT_NODE_DETAIL_TEMPLATE, undefined)
    expect(fallback.map((s) => s.id)).toEqual(['role', 'dataShape'])
  })
})

describe('parseLayerSections — 한 계층 파일(.md) 파서', () => {
  const md = [
    '# API 계층 (제목 무시)',
    '> 설명 프로즈(무시)',
    '## 역할 {#role}',
    'API 역할 지시 본문.',
    '여러 줄 가능.',
    '',
    '## 요청 처리 {#request}',
    '요청 처리 지시.',
  ].join('\n')

  it('## 라벨 {#id} / 본문=promptHint 로 파싱(파일 순서·라벨·산문 보존)', () => {
    const sections = parseLayerSections(md)
    expect(sections.map((s) => s.id)).toEqual(['role', 'request'])
    expect(sections[0].label).toBe('역할')
    expect(sections[0].promptHint).toBe('API 역할 지시 본문.\n여러 줄 가능.')
  })

  it('id 없는 섹션 헤딩은 명확히 throw', () => {
    expect(() => parseLayerSections('## 역할\n본문')).toThrow(/id 가 없습니다/)
  })

  it('섹션 없으면 throw', () => {
    expect(() => parseLayerSections('# 제목만\n> 설명만')).toThrow(/섹션/)
  })

  it('본문(promptHint) 없는 섹션은 throw', () => {
    expect(() => parseLayerSections('## 역할 {#role}\n\n## 다음 {#next}\nx')).toThrow(/promptHint/)
  })
})

describe('parseNodeDetailTemplate — 계층 파일 모음 조립', () => {
  it('계층별 파일 내용을 byLayer 로 조립·검증', () => {
    const tpl = parseNodeDetailTemplate({
      api: '## 역할 {#role}\nAPI 역할.',
      unknown: '## 데이터 구조 {#dataShape}\n구조.',
    })
    expect(tpl.version).toBe(2)
    expect(tpl.byLayer.api?.map((s) => s.id)).toEqual(['role'])
    expect(tpl.byLayer.unknown?.map((s) => s.id)).toEqual(['dataShape'])
    expect(tpl.byLayer.service).toBeUndefined() // 부분 템플릿 허용
  })

  it('파일이 하나도 없으면 throw', () => {
    expect(() => parseNodeDetailTemplate({})).toThrow(/하나도 없습니다/)
  })

  it('동봉 templates/node-detail/*.md (계층별 파일)이 잘 파싱되고 시그니처 섹션 보유', () => {
    // .md 가 권위(편집 자유) — DEFAULT(TS)와 동일성은 강제하지 않고 구조만 검증.
    const tpl = parseNodeDetailTemplate({
      api: layerFile('api.md'),
      service: layerFile('service.md'),
      dao: layerFile('dao.md'),
      db: layerFile('db.md'),
      unknown: layerFile('other.md'),
    })
    const sig: Record<string, string> = {
      api: 'request',
      service: 'businessLogic',
      dao: 'persistence',
      db: 'schema',
      unknown: 'dataShape',
    }
    for (const [layer, sigId] of Object.entries(sig)) {
      const ids = tpl.byLayer[layer as keyof typeof sig]?.map((s) => s.id) ?? []
      expect(ids).toContain('role')
      expect(ids).toContain(sigId)
    }
  })
})
