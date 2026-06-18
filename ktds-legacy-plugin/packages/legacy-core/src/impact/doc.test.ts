import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { cpSync, mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { renderSkeleton } from '../doc-generator/index.js'
import { ProfileWChangeStorySchema } from '../profile-w/index.js'
import { analyzeImpact, loadImpactInputs } from './engine.js'
import { findPrecedents } from './precedents.js'
import { buildCreationSuggestion } from './supplement-a.js'
import {
  buildChangeImpact,
  publishChangeImpact,
  toProfileWChangeStory,
  CHANGE_IMPACT_FILENAME,
} from './doc.js'
import type { ImpactSeed } from './types.js'

const here = dirname(fileURLToPath(import.meta.url))
const petstore = join(here, '..', '..', 'fixtures', 'impact-recall', 'petstore')
const SEED: ImpactSeed = {
  relPath: 'src/main/java/com/petstore/service/impl/AccountServiceImpl.java',
  origin: 'path',
  confidence: 'CONFIRMED',
}

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ktds-impact-doc-'))
  cpSync(petstore, dir, { recursive: true })
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function buildAll() {
  const inputs = loadImpactInputs(dir)
  const { result, verify } = analyzeImpact(dir, [SEED])
  const precedent = findPrecedents(dir, {
    domainHints: ['account'],
    entityHints: ['Kakao'],
    operationHints: ['callback'],
  }).candidates[0]
  const suggestion = buildCreationSuggestion(dir, {
    intent: { domainHints: ['account'], entityHints: ['Kakao'], operationHints: ['callback'] },
    entityHint: 'KakaoLogin',
    precedent,
    changeTargets: [
      { relPath: 'src/main/java/com/petstore/config/SecurityConfig.java', line: 1, symbols: ['OAuth2 필터 등록'] },
    ],
    impact: result,
    census: inputs.census,
  })
  const aggregate = { census: inputs.census.files, confirmed: inputs.confirmed, ownership: inputs.slices.ownership }
  return { result, verify, suggestion, aggregate }
}

describe('buildChangeImpact + L3 골든 스냅샷', () => {
  it('결정론 skeleton(펜스 내 claim 만, LLM prose 제외) 골든', () => {
    const { result, verify, suggestion, aggregate } = buildAll()
    const doc = buildChangeImpact(result, verify, { suggestion, aggregate })
    // renderSkeleton = prose/프런트매터 제외 → 결정론 골든 대상(스펙 L3).
    expect(renderSkeleton(doc)).toMatchSnapshot()
  })

  it('동일 입력 → byte-identical(결정론)', () => {
    const a = buildAll()
    const b = buildAll()
    const docA = buildChangeImpact(a.result, a.verify, { suggestion: a.suggestion, aggregate: a.aggregate })
    const docB = buildChangeImpact(b.result, b.verify, { suggestion: b.suggestion, aggregate: b.aggregate })
    expect(renderSkeleton(docA)).toBe(renderSkeleton(docB))
  })

  it('[생성] 항목은 CONFIRMED 태그를 받지 않는다(문서 표면)', () => {
    const { result, verify, suggestion, aggregate } = buildAll()
    const doc = buildChangeImpact(result, verify, { suggestion, aggregate })
    const createSection = doc.sections.find((s) => s.heading.includes('생성 ([생성])'))!
    expect(createSection.claims.every((c) => c.confidence !== 'CONFIRMED')).toBe(true)
  })
})

describe('publishChangeImpact — read-only 발행', () => {
  it('docs/09_release/change-impact-analysis.md 작성, doc-state 미등록', () => {
    const { result, verify, suggestion, aggregate } = buildAll()
    const doc = buildChangeImpact(result, verify, { suggestion, aggregate })
    const file = publishChangeImpact(dir, doc, { sourceCommit: result.gitCommit })
    expect(file.endsWith(CHANGE_IMPACT_FILENAME)).toBe(true)
    expect(existsSync(file)).toBe(true)
    expect(readFileSync(file, 'utf8')).toContain('변경 영향도 분석')
    // read-only: doc-state 산출물(.spec/docs/<id>.state.json)은 생성되지 않아야 한다
    expect(existsSync(join(dir, '.spec', 'docs'))).toBe(false)
  })
})

describe('toProfileWChangeStory — AC-25 동결 스키마 생산', () => {
  it('생성예측 → ProfileWChangeStory(유효), 변경/생성 task + 인용 + fileList', () => {
    const { result, suggestion } = buildAll()
    const story = toProfileWChangeStory(suggestion, result)
    // 동결 스키마로 검증(스큐 차단)
    expect(() => ProfileWChangeStorySchema.parse(story)).not.toThrow()
    expect(story.storyId).toBe('change-story:KakaoLogin')
    expect(story.tasks.some((t) => t.id.startsWith('change:'))).toBe(true)
    expect(story.tasks.some((t) => t.id.startsWith('create:'))).toBe(true)
    // 선례 앵커가 sourceCitations 로 grounding
    expect(story.sourceCitations.some((c) => c.file.includes('AccountController.java'))).toBe(true)
    // fileList 에 변경 대상 포함
    expect(story.fileList).toContain('src/main/java/com/petstore/config/SecurityConfig.java')
  })

  it('결정론: 동일 제안 → 동일 story(정렬 안정)', () => {
    const a = buildAll()
    const b = buildAll()
    expect(toProfileWChangeStory(a.suggestion, a.result)).toEqual(toProfileWChangeStory(b.suggestion, b.result))
  })
})
