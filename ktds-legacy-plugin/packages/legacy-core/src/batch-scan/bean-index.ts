/**
 * 스프링 XML 빈 인덱스(W2) — `<bean id|name class>` 와 property(value/ref)를
 * 전 XML census 파일에서 결정론 수집한다. 배치 핸들러 해석(quartz jobDetail ref →
 * 잡 클래스)의 단일 소스.
 *
 * 파싱은 batch.ts 관례와 동일한 정규식 근사(주석 제거, 여는 태그 ~ 첫 `</bean>` 본문).
 * 중첩 빈의 property 귀속 오차 가능성은 알려진 한계 — 해석 실패는 [미확인]으로
 * 표면화되지 조용히 틀린 값을 만들지 않도록 클래스 존재(census 매칭)까지 확인한다.
 * 결정론: relPath ASC 순회, 동일 id 첫 출현 승리.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CensusReport } from '../domain-map/types.js'

export interface BeanDef {
  id: string
  className: string | null
  file: string
  line: number
  /** property name → { value, ref } (첫 출현). */
  properties: Map<string, { value: string | null; ref: string | null }>
}

export type BeanIndex = Map<string, BeanDef>

/** XML 주석을 공백으로 치환(줄 번호 보존). */
function stripXmlComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '))
}

function lineAt(text: string, index: number): number {
  let line = 1
  for (let i = 0; i < index && i < text.length; i++) {
    if (text[i] === '\n') line++
  }
  return line
}

function attrValue(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`))
  return m ? m[1] : null
}

/**
 * 여는 태그 위치에서 깊이 추적으로 "그 빈 자신의" 본문 범위를 구한다.
 * 첫 `</bean>` 근사는 중첩 빈에서 ①외부 property 유실 ②중첩 빈 property 가 외부에
 * 오귀속되는 "틀린 값" 경로를 만든다(실증) — 깊이 카운트로 정확한 닫힘을 찾는다.
 */
export function beanBodyRange(text: string, openEnd: number): { end: number } {
  const tokenRe = /<bean\b[^>]*>|<\/bean>/g
  tokenRe.lastIndex = openEnd
  let depth = 1
  let tm: RegExpExecArray | null
  while ((tm = tokenRe.exec(text)) !== null) {
    if (tm[0] === '</bean>') {
      depth--
      if (depth === 0) return { end: tm.index }
    } else if (!tm[0].endsWith('/>')) {
      depth++
    }
  }
  return { end: text.length }
}

/** 본문에서 중첩 빈 구간을 공백으로 지운다(속성 오귀속 방지, 오프셋 보존). */
export function blankNestedBeans(body: string): string {
  let result = body
  const openRe = /<bean\b[^>]*>/g
  let om: RegExpExecArray | null
  while ((om = openRe.exec(result)) !== null) {
    const open = om[0]
    const start = om.index
    const end = open.endsWith('/>')
      ? start + open.length
      : beanBodyRange(result, start + open.length).end + '</bean>'.length
    const span = result.slice(start, Math.min(end, result.length))
    result = result.slice(0, start) + span.replace(/[^\n]/g, ' ') + result.slice(start + span.length)
    openRe.lastIndex = start + span.length
  }
  return result
}

/** 단일 XML 텍스트에서 빈 정의를 수집해 인덱스에 누적한다(첫 출현 승리). */
export function collectBeans(rawText: string, relPath: string, out: BeanIndex): void {
  const text = stripXmlComments(rawText)
  const beanOpenRe = /<bean\b[^>]*>/g
  let bm: RegExpExecArray | null
  while ((bm = beanOpenRe.exec(text)) !== null) {
    const tag = bm[0]
    const id = attrValue(tag, 'id') ?? attrValue(tag, 'name')
    if (!id) continue
    if (out.has(id)) continue
    const bodyStart = bm.index + tag.length
    const rawBody = tag.endsWith('/>') ? '' : text.slice(bodyStart, beanBodyRange(text, bodyStart).end)
    // 중첩 빈 내부 property 는 이 빈의 것이 아니다 — 지우고 스캔(틀린 확정값 방지).
    const body = blankNestedBeans(rawBody)
    const properties = new Map<string, { value: string | null; ref: string | null }>()
    const propRe = /<property\b[^>]*\bname\s*=\s*"([^"]*)"[^>]*\/?>/g
    let pm: RegExpExecArray | null
    while ((pm = propRe.exec(body)) !== null) {
      const name = pm[1]
      if (properties.has(name)) continue
      properties.set(name, { value: attrValue(pm[0], 'value'), ref: attrValue(pm[0], 'ref') })
    }
    out.set(id, {
      id,
      className: attrValue(tag, 'class'),
      file: relPath,
      line: lineAt(text, bm.index),
      properties,
    })
  }
}

/** census 의 전 XML 파일에서 빈 인덱스를 만든다. */
export function buildSpringBeanIndex(projectRoot: string, census: CensusReport): BeanIndex {
  const out: BeanIndex = new Map()
  const xmlFiles = census.files
    .filter((f) => f.lang === 'xml')
    .map((f) => f.relPath)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  for (const relPath of xmlFiles) {
    let text: string
    try {
      text = readFileSync(join(projectRoot, relPath), 'utf8')
    } catch {
      continue
    }
    collectBeans(text, relPath, out)
  }
  return out
}

/**
 * 클래스 FQN → census java 파일 해석.
 * 1) 패키지 경로 접미 일치(…/com/foo/Bar.java) 2) 단순명 유일 일치.
 * 0건/다중(모호) → null — 틀린 확정값보다 [미확인]이 낫다.
 */
export function classFqnToFile(fqn: string, census: CensusReport): string | null {
  const cleaned = fqn.trim()
  if (!cleaned) return null
  const suffix = '/' + cleaned.replace(/\./g, '/') + '.java'
  const javaFiles = census.files.filter((f) => f.lang === 'java')
  const byPath = javaFiles.filter((f) => ('/' + f.relPath).endsWith(suffix))
  if (byPath.length === 1) return byPath[0].relPath
  if (byPath.length > 1) return null
  const simple = cleaned.slice(cleaned.lastIndexOf('.') + 1)
  const bySimple = javaFiles.filter((f) => f.relPath.endsWith('/' + simple + '.java'))
  return bySimple.length === 1 ? bySimple[0].relPath : null
}
