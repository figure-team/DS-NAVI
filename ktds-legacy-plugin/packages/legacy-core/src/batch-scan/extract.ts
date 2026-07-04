/**
 * W2 신규 배치 신호 추출 — spring-batch XML / Quartz Java API / 프로그램적 스케줄러 /
 * shell / crontab. 기존 batch.ts(@Scheduled·main·quartz XML·task:scheduled)를 보완한다.
 *
 * 관례: entryId `batch:<relPath>#<symbol>`, 증거 없는 엔트리 금지, 정렬은 호출측
 * (sortBatchEntries). Java 탐지는 W1 교훈 반영 — 동명 이타입 선언은 바인딩 포기(오탐 방지).
 */
import type { Node } from 'web-tree-sitter'
import { childrenOfType, startLine } from '../domain-map/tree-sitter.js'
import type { BatchEntry } from '../domain-map/types.js'

// ── XML: spring-batch ────────────────────────────────────────────────────

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
 * spring-batch XML `<job id>`(또는 `<batch:job>`) → 엔트리.
 * 네임스페이스 가드: 파일에 spring-batch 스키마 선언이 있을 때만(quartz/기타 `<job>` 오탐 방지).
 * handler = 첫 step 의 tasklet ref → 없으면 chunk reader ref(대표 1개, 나머지는 notes).
 */
export function extractSpringBatchXmlJobs(rawText: string, filePath: string): BatchEntry[] {
  if (!rawText.includes('springframework.org/schema/batch')) return []
  const text = stripXmlComments(rawText)
  const out: BatchEntry[] = []
  const jobRe = /<(?:batch:)?job\b[^>]*>/g
  let jm: RegExpExecArray | null
  while ((jm = jobRe.exec(text)) !== null) {
    const tag = jm[0]
    // job-repository 등 유사 태그 제외: 태그명이 정확히 job 인 경우만(정규식 \b 로 보장).
    const id = attrValue(tag, 'id')
    if (!id) continue
    const bodyStart = jm.index + tag.length
    const closeIdx = text.indexOf('</', bodyStart) >= 0 ? text.indexOf(`</${tag.startsWith('<batch:') ? 'batch:job' : 'job'}>`, bodyStart) : -1
    const body = closeIdx >= 0 ? text.slice(bodyStart, closeIdx) : text.slice(bodyStart)
    const notes: string[] = []
    // tasklet ref 우선.
    const taskletRef = body.match(/<(?:batch:)?tasklet\b[^>]*\bref\s*=\s*"([^"]*)"/)
    let handler: string | null = taskletRef ? taskletRef[1] : null
    // chunk reader/processor/writer — 대표 = reader, 전체는 notes.
    const chunk = body.match(/<(?:batch:)?chunk\b[^>]*>/)
    if (chunk) {
      const reader = attrValue(chunk[0], 'reader')
      const processor = attrValue(chunk[0], 'processor')
      const writer = attrValue(chunk[0], 'writer')
      if (!handler && reader) handler = reader
      for (const [k, v] of [['reader', reader], ['processor', processor], ['writer', writer]] as const) {
        if (v) notes.push(`${k}=${v}`)
      }
    }
    out.push({
      entryId: `batch:${filePath}#${id}`,
      trigger: 'spring-batch',
      schedule: null, // 기동은 JobLauncher/외부 스케줄러 소관 — 합성 금지.
      filePath,
      line: lineAt(text, jm.index),
      handler,
      notes,
    })
  }
  return out
}

// ── Java: quartz-java / executor / timer ────────────────────────────────

function child(node: Node, type: string): Node | null {
  for (const c of node.namedChildren) {
    if (c && c.type === type) return c
  }
  return null
}

function* walk(root: Node): Generator<Node> {
  const stack: Node[] = [root]
  while (stack.length > 0) {
    const node = stack.pop()!
    yield node
    for (let i = node.namedChildCount - 1; i >= 0; i--) {
      const c = node.namedChild(i)
      if (c) stack.push(c)
    }
  }
}

function enclosingSymbol(node: Node): string {
  let method: string | null = null
  let type: string | null = null
  let cur: Node | null = node.parent
  while (cur) {
    if (method === null && cur.type === 'method_declaration') {
      method = cur.childForFieldName('name')?.text ?? null
    }
    if (
      type === null &&
      (cur.type === 'class_declaration' || cur.type === 'interface_declaration' || cur.type === 'enum_declaration')
    ) {
      type = cur.childForFieldName('name')?.text ?? null
    }
    cur = cur.parent
  }
  if (type && method) return `${type}#${method}`
  return type ?? method ?? '<top>'
}

function simpleTypeName(typeText: string): string {
  const noGenerics = typeText.replace(/<.*$/, '')
  const dot = noGenerics.lastIndexOf('.')
  return dot >= 0 ? noGenerics.slice(dot + 1) : noGenerics
}

/** 스케줄러 타입 → trigger. */
const SCHEDULER_TYPES: Record<string, { trigger: BatchEntry['trigger']; methods: Set<string> }> = {
  ScheduledExecutorService: {
    trigger: 'executor',
    methods: new Set(['schedule', 'scheduleAtFixedRate', 'scheduleWithFixedDelay']),
  },
  TaskScheduler: {
    trigger: 'executor',
    methods: new Set(['schedule', 'scheduleAtFixedRate', 'scheduleWithFixedDelay']),
  },
  ThreadPoolTaskScheduler: {
    trigger: 'executor',
    methods: new Set(['schedule', 'scheduleAtFixedRate', 'scheduleWithFixedDelay']),
  },
  Timer: { trigger: 'timer', methods: new Set(['schedule', 'scheduleAtFixedRate']) },
}

function stringLiteralValueSimple(node: Node): string {
  // 스케줄 표현용 — 이스케이프 포함 리터럴은 그대로 이어붙임(W1 관례 축약형).
  let out = ''
  for (const c of node.namedChildren) {
    if (!c) continue
    if (c.type === 'string_fragment') out += c.text
    else if (c.type === 'escape_sequence') out += c.text
  }
  return out
}

/**
 * 단일 Java 파일에서 W2 신호(quartz-java/executor/timer)를 추출한다.
 * @param root 파싱된 program 노드(라우트 추출과 공유)
 */
export function extractJavaBatchEntriesW2(root: Node, filePath: string): BatchEntry[] {
  const out: BatchEntry[] = []
  const seen = new Set<string>()
  const push = (e: BatchEntry) => {
    const key = `${e.line}|${e.trigger}|${e.handler ?? ''}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(e)
  }

  // 선언 타입 수집(동명 이타입 → 바인딩 포기, W1 M3 교훈).
  const declTypes = new Map<string, Set<string>>()
  for (const node of walk(root)) {
    if (
      node.type !== 'field_declaration' &&
      node.type !== 'local_variable_declaration' &&
      node.type !== 'formal_parameter'
    )
      continue
    const typeNode = node.childForFieldName('type')
    if (!typeNode) continue
    const typeName = simpleTypeName(typeNode.text)
    const names: string[] = []
    if (node.type === 'formal_parameter') {
      const n = node.childForFieldName('name')?.text
      if (n) names.push(n)
    } else {
      for (const decl of childrenOfType(node, 'variable_declarator')) {
        const n = decl.childForFieldName('name')?.text
        if (n) names.push(n)
      }
    }
    for (const n of names) {
      const set = declTypes.get(n) ?? new Set<string>()
      set.add(typeName)
      declTypes.set(n, set)
    }
  }
  const bindings = new Map<string, string>()
  for (const [name, types] of declTypes) {
    if (types.size !== 1) continue
    const t = [...types][0]
    if (t in SCHEDULER_TYPES) bindings.set(name, t)
  }

  for (const node of walk(root)) {
    if (node.type !== 'method_invocation') continue
    const methodName = node.childForFieldName('name')?.text
    if (!methodName) continue
    const argList = node.childForFieldName('arguments')
    const args = argList ? argList.namedChildren.filter((c): c is Node => c !== null) : []

    // quartz-java: newJob(X.class) — JobBuilder 정적/체인 모두 이름만으로 판별.
    if (methodName === 'newJob') {
      const classLit = args.find((a) => a.type === 'class_literal')
      const clsName = classLit ? simpleTypeName(classLit.text.replace(/\.class$/, '')) : null
      if (!clsName) continue
      // 같은 메서드 안의 cronSchedule("...") 리터럴을 스케줄로(없으면 null).
      let schedule: string | null = null
      let m: Node | null = node.parent
      while (m && m.type !== 'method_declaration') m = m.parent
      if (m) {
        for (const inner of walk(m)) {
          if (inner.type !== 'method_invocation') continue
          if (inner.childForFieldName('name')?.text !== 'cronSchedule') continue
          const ia = inner.childForFieldName('arguments')
          const lit = ia?.namedChildren.find((c) => c?.type === 'string_literal')
          if (lit) {
            schedule = `cron=${stringLiteralValueSimple(lit)}`
            break
          }
        }
      }
      push({
        entryId: `batch:${filePath}#${clsName}`,
        trigger: 'quartz-java',
        schedule,
        filePath,
        line: startLine(node),
        handler: clsName,
        notes: [],
      })
      continue
    }

    // executor/timer: 바인딩 수신자의 스케줄 메서드.
    const objNode = node.childForFieldName('object')
    if (!objNode) continue
    const recv =
      objNode.type === 'identifier'
        ? objNode.text
        : objNode.type === 'field_access'
          ? (objNode.childForFieldName('field')?.text ?? '')
          : ''
    const typeName = bindings.get(recv)
    if (!typeName) continue
    const spec = SCHEDULER_TYPES[typeName]
    if (!spec.methods.has(methodName)) continue
    const symbol = enclosingSymbol(node)
    push({
      entryId: `batch:${filePath}#${symbol}`,
      trigger: spec.trigger,
      schedule: null, // 지연/주기 인자는 단위 불명 숫자 — 합성 금지(notes 로도 남기지 않음).
      filePath,
      line: startLine(node),
      handler: symbol,
      notes: [`method=${methodName}`],
    })
  }
  return out
}

// ── shell / crontab ──────────────────────────────────────────────────────

/** shell 스크립트에서 `java -jar x.jar` / `java -cp … MainClass` 라인 추출. */
export function extractShellBatchEntries(rawText: string, filePath: string): BatchEntry[] {
  const out: BatchEntry[] = []
  const lines = rawText.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*(#|REM\b|::)/i.test(line)) continue
    if (!/\bjava\b/.test(line)) continue
    const jar = line.match(/-jar\s+(\S+\.jar)/)
    const cp = line.match(/-(?:cp|classpath)\s+\S+\s+([A-Za-z_][\w.]*)/)
    const handler = jar ? jar[1] : cp ? cp[1] : null
    if (!handler) continue
    out.push({
      entryId: `batch:${filePath}#${handler}`,
      trigger: 'shell',
      schedule: null,
      filePath,
      line: i + 1,
      handler,
      notes: [],
    })
  }
  return out
}

/** crontab 형식 파일에서 5필드 cron 라인 추출(파일 선별은 호출측). */
export function extractCrontabEntries(rawText: string, filePath: string): BatchEntry[] {
  const out: BatchEntry[] = []
  const lines = rawText.split('\n')
  const cronRe = /^\s*((?:[\d*\/,\-]+\s+){4}[\d*\/,\-]+)\s+(\S.*)$/
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*(#|$)/.test(line) || /^\s*\w+=/.test(line)) continue
    const m = line.match(cronRe)
    if (!m) continue
    const command = m[2].trim()
    out.push({
      entryId: `batch:${filePath}#${i + 1}`,
      trigger: 'crontab',
      schedule: `cron=${m[1].replace(/\s+/g, ' ').trim()}`,
      filePath,
      line: i + 1,
      handler: command,
      notes: [],
    })
  }
  return out
}

/** crontab 파일 여부(basename crontab* 또는 상위 디렉터리 cron.d). */
export function isCrontabPath(relPath: string): boolean {
  const segs = relPath.split('/')
  const base = segs[segs.length - 1].toLowerCase()
  return base.startsWith('crontab') || segs.includes('cron.d')
}
