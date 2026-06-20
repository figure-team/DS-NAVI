/**
 * 문서 템플릿(doc-template) — 산출물 문서의 **런타임 로드 템플릿** 파서/적용기(D2).
 *
 * node-template.ts(node-detail) 와 동형 철학: 플러그인 동봉 .md(`templates/doc/*.md`)를
 * 사람이 편집하면 재빌드 없이 반영. 단 doc-generator 는 claim **생성이 코드 로직**(그래프
 * 질의)이므로 템플릿은 **표시 구조만**(문서 제목·섹션 헤딩·표 컬럼명·섹션 순서) 외부화한다.
 * 각 섹션은 `{#바인딩키}`로 빌더가 채울 데이터를 가리킨다(고정 어휘).
 *
 * - parseDocTemplate: 한 템플릿 .md → DocTemplate(순수, IO 는 호출자/.mjs).
 * - applyDocTemplate: 빌더 산출 GeneratedDoc 에 템플릿의 헤딩/컬럼/순서를 입힌다.
 *   템플릿 미적용 시 빌더 기본 구조 그대로(골든 스냅샷 보존).
 */
import { z } from 'zod'
import { MethodologySchema } from './types.js'
import type { GeneratedDoc, Section } from './types.js'

export const DocTemplateSectionSchema = z.object({
  /** 바인딩 키 — `## 라벨 {#키}` 의 키. 빌더 섹션 key 와 매칭. */
  key: z.string().min(1),
  /** 표시 헤딩(편집 가능). */
  heading: z.string().min(1),
  /**
   * 표 컬럼명(편집 가능, 선택). 있으면 표 섹션. 신뢰도/근거 열은 렌더러가 자동 부가하므로
   * 여기 포함하지 않는다(도메인 컬럼만). 매트릭스 섹션은 고정 선두 컬럼만 둔다.
   */
  columns: z.array(z.string()).optional(),
})
export type DocTemplateSection = z.infer<typeof DocTemplateSectionSchema>

export const DocTemplateSchema = z.object({
  docId: z.string().min(1),
  title: z.string().min(1),
  methodology: MethodologySchema,
  sections: z.array(DocTemplateSectionSchema).min(1),
})
export type DocTemplate = z.infer<typeof DocTemplateSchema>

/** frontmatter(--- ... ---) 의 key: value 를 평탄 맵으로. 없으면 throw(정직성). */
function parseFrontmatter(md: string): Record<string, string> {
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---/.exec(md)
  if (!m) throw new Error('문서 템플릿에 frontmatter(--- ... ---)가 없습니다')
  const out: Record<string, string> = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line.trim())
    if (kv) out[kv[1]] = kv[2].trim()
  }
  return out
}

/** `| a | b | c |` 한 줄 → ['a','b','c'](양끝 파이프 제거 후 trim, 빈 끝 셀 제외). */
function parseColumnRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim())
    .filter((c) => c.length > 0)
}

/** GFM 표 구분선(`| --- | --- |`)인가 — 컬럼 헤더와 구별. */
function isSeparatorRow(line: string): boolean {
  return /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes('-')
}

/**
 * 한 문서 템플릿(.md) → DocTemplate. frontmatter(docId/title/methodology) +
 * `## 라벨 {#키}` 섹션들. 섹션 헤딩 아래 첫 표 헤더 줄(`| ... |`)이 있으면 columns(표 섹션),
 * 없으면 목록 섹션. 헤딩 앞 제목(`#`)/주석(`<!-- -->`)/프로즈는 무시.
 * 결정론: 파일 순서 보존. 형식 오류는 명확히 throw(조용한 폴백 금지).
 */
export function parseDocTemplate(md: string): DocTemplate {
  const fm = parseFrontmatter(md)
  const sections: DocTemplateSection[] = []
  let cur: { key: string; heading: string; columns?: string[] } | null = null

  const flush = () => {
    if (cur) sections.push({ key: cur.key, heading: cur.heading, ...(cur.columns ? { columns: cur.columns } : {}) })
    cur = null
  }

  for (const line of md.split(/\r?\n/)) {
    const h = /^##\s+(.+?)\s*$/.exec(line)
    if (h && !line.startsWith('###')) {
      flush()
      const m = /^(.*?)\s*\{#([A-Za-z0-9_-]+)\}\s*$/.exec(h[1].trim())
      if (!m) {
        throw new Error(`섹션 헤딩에 바인딩키가 없습니다: '## ${h[1]}' — '## 라벨 {#키}' 형식 필요`)
      }
      cur = { key: m[2], heading: m[1].trim() }
      continue
    }
    // 현재 섹션의 첫 표 헤더 줄을 컬럼으로 채택(구분선/이미 채택됨은 건너뜀).
    if (cur && !cur.columns && line.trim().startsWith('|') && !isSeparatorRow(line)) {
      const cols = parseColumnRow(line)
      if (cols.length > 0) cur.columns = cols
    }
  }
  flush()

  if (sections.length === 0) {
    throw new Error('문서 템플릿에 섹션(## 라벨 {#키})이 하나도 없습니다')
  }
  return DocTemplateSchema.parse({
    docId: fm.docId,
    title: fm.title,
    methodology: fm.methodology,
    sections,
  })
}

/**
 * 빌더 산출 GeneratedDoc 에 템플릿(제목·섹션 헤딩·컬럼·순서)을 입힌다.
 * - 출력 섹션 = **템플릿 섹션 순서**. 각 섹션은 빌더가 같은 key 로 만든 데이터(claims/table)를
 *   채우고, 없으면 빈 섹션.
 * - 표 컬럼: 템플릿 컬럼 수가 빌더 표 컬럼 수와 **같으면** 템플릿 라벨로 rename(편집 반영).
 *   다르면(매트릭스 등 동적 컬럼) 빌더 컬럼 유지(안전).
 * 템플릿 미적용 경로는 호출자가 빌더 산출을 그대로 쓰면 된다(이 함수 미호출 = 기존 동작).
 */
export function applyDocTemplate(doc: GeneratedDoc, tpl: DocTemplate): GeneratedDoc {
  const byKey = new Map<string, Section>()
  for (const s of doc.sections) {
    if (typeof s.key === 'string') byKey.set(s.key, s)
  }
  const sections: Section[] = tpl.sections.map((ts): Section => {
    const data = byKey.get(ts.key)
    if (!data) {
      // 빌더가 안 만든 키 → 빈 섹션(헤딩만). 표/목록 여부는 컬럼 유무로.
      return ts.columns
        ? { heading: ts.heading, key: ts.key, claims: [], table: { columns: ts.columns, rows: [] } }
        : { heading: ts.heading, key: ts.key, claims: [] }
    }
    const out: Section = { ...data, heading: ts.heading, key: ts.key }
    if (data.table && ts.columns && ts.columns.length === data.table.columns.length) {
      out.table = { columns: ts.columns, rows: data.table.rows }
    }
    return out
  })
  return { docId: tpl.docId, title: tpl.title, methodology: tpl.methodology, sections }
}
