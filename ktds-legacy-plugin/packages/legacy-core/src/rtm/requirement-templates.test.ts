/**
 * requirement-templates 단위테스트 — 실제 플러그인 동봉 템플릿(templates/requirements/) 3종을
 * 로드 검증하고, override→plugin 우선순위 규약을 잠근다(P1).
 */
import { describe, it, expect } from 'vitest'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  REQUIREMENT_TEMPLATES,
  CHANGE_TEMPLATES,
  requirementTemplateFile,
  requirementTemplateEntry,
  changeTemplateEntry,
  changeTemplateFile,
  resolveRequirementTemplatePath,
  loadRequirementTemplate,
  loadChangeTemplate,
  type RequirementDocKind,
  type ChangeDocKind,
} from './requirement-templates.js'

const here = dirname(fileURLToPath(import.meta.url))
// src/rtm → ../../../.. = ktds-legacy-plugin 루트 → templates/requirements
const PLUGIN_DIR = join(here, '..', '..', '..', '..', 'templates', 'requirements')

// 각 종류의 템플릿이 반드시 포함해야 할 구조 표식(업데이트된 2단 ID 구조).
const STRUCTURE_MARKERS: Record<RequirementDocKind, string[]> = {
  list: ['## 2. 요청 목록', '## 4. 요구사항 목록', '요청ID', '요구사항ID'],
  definition: ['## 4. 요청별 요구사항 정의', '정의', '범위', '출처'],
  spec: ['## 2. 요구사항 상세 명세', '소속 요청ID', '인수 기준', '출처 / 추적'],
}

describe('requirement-templates 레지스트리', () => {
  it('3종(list/definition/spec)을 ②③④ 단계 순서로 노출한다', () => {
    expect(REQUIREMENT_TEMPLATES.map((e) => e.kind)).toEqual(['list', 'definition', 'spec'])
    expect(REQUIREMENT_TEMPLATES.map((e) => e.step)).toEqual([2, 3, 4])
  })

  it('파일명 매핑이 01/02/03 으로 잠겨 있다', () => {
    expect(requirementTemplateFile('list')).toBe('01_요구사항목록표.md')
    expect(requirementTemplateFile('definition')).toBe('02_요구사항정의서.md')
    expect(requirementTemplateFile('spec')).toBe('03_요구사항명세서.md')
  })

  it('알 수 없는 종류는 throw', () => {
    expect(() => requirementTemplateEntry('xxx' as RequirementDocKind)).toThrow()
  })
})

describe('vendored 템플릿 로드(plugin)', () => {
  for (const entry of REQUIREMENT_TEMPLATES) {
    it(`${entry.kind}(${entry.file}) 를 plugin 에서 로드하고 구조 표식을 갖는다`, () => {
      const loaded = loadRequirementTemplate(entry.kind, { pluginDir: PLUGIN_DIR })
      expect(loaded.source).toBe('plugin')
      expect(loaded.text.length).toBeGreaterThan(0)
      for (const marker of STRUCTURE_MARKERS[entry.kind]) {
        expect(loaded.text).toContain(marker)
      }
    })
  }
})

describe('변경관리(절차 B) 템플릿', () => {
  it('2종(change-request/change-impact)을 04/05 파일로 노출한다', () => {
    expect(CHANGE_TEMPLATES.map((e) => e.kind)).toEqual(['change-request', 'change-impact'])
    expect(changeTemplateFile('change-request')).toBe('04_과업내용변경요청서.md')
    expect(changeTemplateFile('change-impact')).toBe('05_변경영향분석서.md')
  })

  it('알 수 없는 변경관리 종류는 throw', () => {
    expect(() => changeTemplateEntry('xxx' as ChangeDocKind)).toThrow()
  })

  it('plugin 에서 로드하고 구조 표식을 갖는다', () => {
    const cr = loadChangeTemplate('change-request', { pluginDir: PLUGIN_DIR })
    expect(cr.source).toBe('plugin')
    expect(cr.text).toContain('변경요청ID')
    expect(cr.text).toContain('대상 요청ID')
    const ia = loadChangeTemplate('change-impact', { pluginDir: PLUGIN_DIR })
    expect(ia.text).toContain('## 3. 영향 기능')
    expect(ia.text).toContain('## 7. 후속조치 체크리스트')
  })

  it('plugin 에도 없으면 load 는 throw', () => {
    expect(() =>
      loadChangeTemplate('change-request', { pluginDir: join(here, '__nope__') }),
    ).toThrow(/변경관리 템플릿을 찾지 못했습니다/)
  })
})

describe('override→plugin 우선순위', () => {
  it('projectDir 에 파일이 있으면 project 를 택한다', () => {
    // projectDir 로도 vendored 디렉터리를 가리키면 project 가 우선되어야 한다.
    const resolved = resolveRequirementTemplatePath('list', {
      projectDir: PLUGIN_DIR,
      pluginDir: PLUGIN_DIR,
    })
    expect(resolved?.source).toBe('project')
  })

  it('projectDir override 가 없으면 plugin 으로 폴백한다', () => {
    const resolved = resolveRequirementTemplatePath('list', {
      projectDir: join(here, '__no_such_override__'),
      pluginDir: PLUGIN_DIR,
    })
    expect(resolved?.source).toBe('plugin')
  })

  it('plugin 에도 없으면 load 는 throw', () => {
    expect(() =>
      loadRequirementTemplate('list', { pluginDir: join(here, '__nope__') }),
    ).toThrow(/요구사항 템플릿을 찾지 못했습니다/)
  })
})
