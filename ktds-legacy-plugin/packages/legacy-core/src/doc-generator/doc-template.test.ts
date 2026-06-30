/**
 * DOC-TEMPLATE 파서/적용 — 런타임 문서 템플릿(D2).
 * 실제 플러그인 동봉 템플릿(`templates/doc/*.md`) 9종을 파싱 검증하고, applyDocTemplate 의
 * 헤딩/컬럼/순서 덮어쓰기 + 매트릭스 안전(컬럼 수 불일치 시 빌더 컬럼 유지)을 락한다.
 */
import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readFileSync } from 'node:fs'
import { parseDocTemplate, applyDocTemplate } from './doc-template.js'
import type { GeneratedDoc } from './types.js'

const here = dirname(fileURLToPath(import.meta.url))
const DOC_DIR = join(here, '..', '..', '..', '..', 'templates', 'doc')
const read = (file: string) => readFileSync(join(DOC_DIR, file), 'utf8')

describe('parseDocTemplate — 동봉 템플릿 9종', () => {
  const cases: Array<{ file: string; docId: string; methodology: string; keys: string[] }> = [
    { file: 'tech-stack.md', docId: '01_tech-stack', methodology: 'as-built', keys: ['languages', 'frameworks', 'modules'] },
    { file: 'architecture.md', docId: '02_architecture', methodology: 'as-built', keys: ['layers', 'dependencies', 'cycles'] },
    { file: 'feature-spec.md', docId: 'si-기능명세서', methodology: 'si-standard', keys: ['feature-list'] },
    { file: 'interface-spec.md', docId: 'si-인터페이스정의서', methodology: 'si-standard', keys: ['api-list'] },
    { file: 'table-spec.md', docId: 'si-테이블정의서', methodology: 'si-standard', keys: ['table-list'] },
    { file: 'program-list.md', docId: '06_program-list', methodology: 'as-built', keys: ['program-list'] },
    { file: 'crud-matrix.md', docId: '07_crud-matrix', methodology: 'as-built', keys: ['crud-matrix'] },
    { file: 'batch-list.md', docId: '08_batch-list', methodology: 'as-built', keys: ['batch-list'] },
    { file: 'impact-analysis.md', docId: '09_impact-analysis', methodology: 'as-built', keys: ['impact-hotspots', 'cross-domain-deps'] },
  ]

  for (const c of cases) {
    it(`${c.file} → docId/methodology/섹션키`, () => {
      const tpl = parseDocTemplate(read(c.file))
      expect(tpl.docId).toBe(c.docId)
      expect(tpl.methodology).toBe(c.methodology)
      expect(tpl.sections.map((s) => s.key)).toEqual(c.keys)
    })
  }

  it('표 섹션은 컬럼을, 목록 섹션은 컬럼 없음', () => {
    const fs = parseDocTemplate(read('feature-spec.md'))
    expect(fs.sections[0].columns).toEqual([
      '기능ID', '기능명', '설명', '진입점', '관련 API', '관련 테이블', '업무규칙',
    ])
    const ts = parseDocTemplate(read('tech-stack.md'))
    expect(ts.sections[0].columns).toBeUndefined()
  })

  it('매트릭스 섹션은 선두 컬럼만(데이터로 확장)', () => {
    const cm = parseDocTemplate(read('crud-matrix.md'))
    expect(cm.sections[0].columns).toEqual(['기능'])
  })

  it('frontmatter 없으면 throw', () => {
    expect(() => parseDocTemplate('## 섹션 {#k}\n내용')).toThrow(/frontmatter/)
  })

  it('바인딩키 없는 헤딩은 throw', () => {
    const md = '---\ndocId: x\ntitle: X\nmethodology: as-built\n---\n## 키없음\n본문'
    expect(() => parseDocTemplate(md)).toThrow(/바인딩키/)
  })
})

describe('applyDocTemplate — 헤딩/컬럼/순서 덮어쓰기', () => {
  const doc: GeneratedDoc = {
    docId: '01_tech-stack',
    title: '기술 스택',
    methodology: 'as-built',
    sections: [
      { heading: '언어', key: 'languages', claims: [] },
      { heading: '모듈', key: 'modules', claims: [] },
    ],
  }

  it('템플릿 순서·헤딩·제목을 적용한다', () => {
    const tpl = parseDocTemplate(
      '---\ndocId: 01_tech-stack\ntitle: 기술 스택 정의서\nmethodology: as-built\n---\n' +
        '## 모듈 목록 {#modules}\n설명\n## 사용 언어 {#languages}\n설명',
    )
    const out = applyDocTemplate(doc, tpl)
    expect(out.title).toBe('기술 스택 정의서')
    expect(out.sections.map((s) => s.heading)).toEqual(['모듈 목록', '사용 언어'])
    expect(out.sections.map((s) => s.key)).toEqual(['modules', 'languages'])
  })

  it('빌더가 안 만든 키는 빈 섹션', () => {
    const tpl = parseDocTemplate(
      '---\ndocId: 01_tech-stack\ntitle: T\nmethodology: as-built\n---\n## 신규 {#newkey}\n설명',
    )
    const out = applyDocTemplate(doc, tpl)
    expect(out.sections).toHaveLength(1)
    expect(out.sections[0].claims).toEqual([])
  })

  it('표 컬럼 수가 같으면 라벨 rename, 다르면 빌더 컬럼 유지(매트릭스 안전)', () => {
    const tableDoc: GeneratedDoc = {
      docId: 'd', title: 'D', methodology: 'as-built',
      sections: [{ heading: 'T', key: 't', claims: [], table: { columns: ['A', 'B'], rows: [] } }],
    }
    const same = parseDocTemplate('---\ndocId: d\ntitle: D\nmethodology: as-built\n---\n## T {#t}\n| 가 | 나 |')
    expect(applyDocTemplate(tableDoc, same).sections[0].table?.columns).toEqual(['가', '나'])

    const fewer = parseDocTemplate('---\ndocId: d\ntitle: D\nmethodology: as-built\n---\n## T {#t}\n| 기능 |')
    expect(applyDocTemplate(tableDoc, fewer).sections[0].table?.columns).toEqual(['A', 'B'])
  })
})

describe('템플릿 본문(prose) — 헤딩 아래 표 앞 산문 캡처·전파', () => {
  const FM = '---\ndocId: d\ntitle: D\nmethodology: as-built\n---\n'

  it('표 앞 산문을 prose 로 캡처(표 뒤·주석 제외)', () => {
    const tpl = parseDocTemplate(`${FM}## 개요 {#ov}\n안내 문장 첫째.\n둘째 줄.\n\n| A | B |\n| --- | --- |\n표뒤줄`)
    expect(tpl.sections[0].prose).toBe('안내 문장 첫째.\n둘째 줄.')
    expect(tpl.sections[0].columns).toEqual(['A', 'B'])
  })

  it('산문이 없으면 prose 미설정', () => {
    const tpl = parseDocTemplate(`${FM}## 표 {#t}\n| A |`)
    expect(tpl.sections[0].prose).toBeUndefined()
  })

  it('applyDocTemplate 가 prose 를 섹션에 전파(빌더 데이터 위 안내문)', () => {
    const doc: GeneratedDoc = { docId: 'd', title: 'D', methodology: 'as-built', sections: [{ heading: 'X', key: 'ov', claims: [] }] }
    const tpl = parseDocTemplate(`${FM}## 개요 {#ov}\n사람 편집 안내.`)
    expect(applyDocTemplate(doc, tpl).sections[0].prose).toBe('사람 편집 안내.')
  })

  it('빌더가 안 만든 키도 헤딩 + prose 로 빈 섹션 생성', () => {
    const doc: GeneratedDoc = { docId: 'd', title: 'D', methodology: 'as-built', sections: [] }
    const tpl = parseDocTemplate(`${FM}## 신규 {#new}\n안내만.`)
    const out = applyDocTemplate(doc, tpl).sections[0]
    expect(out.heading).toBe('신규')
    expect(out.prose).toBe('안내만.')
  })
})
