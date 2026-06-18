/**
 * 배치/스케줄 진입점 추출 — Java(@Scheduled / main) + XML(Quartz / task:scheduled).
 *
 * Java: @Scheduled(cron=.. | fixedRate=.. | fixedDelay=..) -> trigger "scheduled"
 *       (어노테이션당 1엔트리, 중복 @Scheduled 도 각각 1엔트리),
 *       public static void main(String[]) -> trigger "main".
 * XML : Spring CronTriggerFactoryBean 빈(중첩 list 포함) -> trigger "quartz"
 *       (handler = jobDetail ref 빈 id, schedule = cron=<cronExpression>),
 *       <task:scheduled .../> -> trigger "task-xml"
 *       (handler = ref#method, schedule = cron=<cron 속성>).
 *       MethodInvokingJobDetailFactoryBean(JobDetail 빈)은 트리거와 중복되므로 제외한다.
 * entryId = `batch:<relPath>#<symbol>`. 모든 산출은 호출측에서 sortBatchEntries 로 정렬한다.
 */
import type { Node } from 'web-tree-sitter'
import { childrenOfType, startLine } from '../tree-sitter.js'
import type { BatchEntry } from '../types.js'

/** @Scheduled 가 받는, schedule 문자열을 구성하는 속성(우선순위 순). */
const SCHEDULE_ATTRS = ['cron', 'fixedRate', 'fixedDelay'] as const

/** 직계 named child 중 첫 번째 주어진 타입. */
function child(node: Node, type: string): Node | null {
  for (const c of node.namedChildren) {
    if (c && c.type === type) return c
  }
  return null
}

/** string_literal 노드의 실제 문자열(따옴표 제외). */
function stringLiteralValue(node: Node): string {
  const frag = childrenOfType(node, 'string_fragment')[0]
  return frag ? frag.text : ''
}

/** method_declaration 의 메서드 이름(formal_parameters 직전 identifier). */
function methodName(method: Node): string | null {
  const named = method.namedChildren.filter((c): c is Node => c !== null)
  const fpIdx = named.findIndex((c) => c.type === 'formal_parameters')
  if (fpIdx > 0 && named[fpIdx - 1].type === 'identifier') return named[fpIdx - 1].text
  return named.find((c) => c.type === 'identifier')?.text ?? null
}

/** program 전체에서 class_declaration 들을 재귀 수집. */
function findClassDeclarations(root: Node): Node[] {
  const out: Node[] = []
  const stack: Node[] = [root]
  while (stack.length > 0) {
    const node = stack.pop()!
    for (const c of node.namedChildren) {
      if (!c) continue
      if (c.type === 'class_declaration') out.push(c)
      stack.push(c)
    }
  }
  return out
}

/**
 * @Scheduled 어노테이션의 schedule 문자열을 추출한다.
 * cron / fixedRate / fixedDelay 중 첫 매칭을 `<attr>=<value>` 로 표기한다.
 * (cron 도 `cron=<expr>` 로 표기해 트리거 종류를 표면화한다.)
 */
function extractScheduleAttr(annot: Node): string | null {
  const argList = child(annot, 'annotation_argument_list')
  if (!argList) return null
  for (const attr of SCHEDULE_ATTRS) {
    for (const pair of childrenOfType(argList, 'element_value_pair')) {
      const name = child(pair, 'identifier')?.text
      if (name !== attr) continue
      const lit = child(pair, 'string_literal')
      const value = lit
        ? stringLiteralValue(lit)
        : pair.namedChildren.filter((c): c is Node => c !== null)[1]?.text ?? ''
      return `${attr}=${value}`
    }
  }
  return null
}

/**
 * 단일 Java 파일에서 배치 진입점을 추출한다.
 * @param root 파싱된 program 노드
 * @param filePath census relPath
 */
export function extractJavaBatchEntries(root: Node, filePath: string): BatchEntry[] {
  const out: BatchEntry[] = []
  for (const cls of findClassDeclarations(root)) {
    const clsName = child(cls, 'identifier')?.text ?? null
    const body = child(cls, 'class_body')
    if (!body) continue
    for (const method of childrenOfType(body, 'method_declaration')) {
      const mods = child(method, 'modifiers')
      const modText = mods ? mods.text : ''
      const mName = methodName(method) ?? '<unknown>'
      const handler = clsName ? `${clsName}#${mName}` : mName

      // @Scheduled (어노테이션당 1엔트리 — 반복 @Scheduled 지원).
      if (mods) {
        const scheduledAnnots = childrenOfType(mods, 'annotation', 'marker_annotation').filter(
          (a) => child(a, 'identifier')?.text === 'Scheduled',
        )
        for (const annot of scheduledAnnots) {
          out.push({
            entryId: `batch:${filePath}#${mName}`,
            trigger: 'scheduled',
            schedule: extractScheduleAttr(annot),
            filePath,
            line: startLine(annot),
            handler,
            notes: [],
          })
        }
      }

      // public static void main(String[]).
      if (mName === 'main' && /\bpublic\b/.test(modText) && /\bstatic\b/.test(modText)) {
        out.push({
          entryId: `batch:${filePath}#main`,
          trigger: 'main',
          schedule: null,
          filePath,
          line: startLine(method),
          handler,
          notes: [],
        })
      }
    }
  }
  return out
}

/** XML 파일 텍스트에서 줄 번호(1-based)를 구한다. */
function lineAt(text: string, index: number): number {
  let line = 1
  for (let i = 0; i < index && i < text.length; i++) {
    if (text[i] === '\n') line++
  }
  return line
}

/** XML 주석 영역을 공백으로 치환(주석 내용 무시, 줄 번호 보존). */
function stripXmlComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '))
}

/** 단일 XML 여는 태그 텍스트에서 속성 값을 읽는다. */
function attrValue(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`))
  return m ? m[1] : null
}

/**
 * <bean ...> 요소 1개의 본문에서 <property name="..." value=".."|ref=".."/> 를 읽는다.
 * 본문은 해당 bean 의 여는 태그 끝부터 다음 같은 깊이 닫힘까지의 근사 범위다.
 */
function readBeanProperty(body: string, propName: string): { value: string | null; ref: string | null } {
  const re = new RegExp(`<property\\b[^>]*\\bname\\s*=\\s*"${propName}"[^>]*/?>`, 'g')
  const m = re.exec(body)
  if (!m) return { value: null, ref: null }
  return { value: attrValue(m[0], 'value'), ref: attrValue(m[0], 'ref') }
}

/**
 * 단일 XML 파일에서 배치 진입점을 추출한다.
 * - CronTriggerFactoryBean 빈(중첩 포함) -> quartz
 * - <task:scheduled .../> -> task-xml
 */
export function extractXmlBatchEntries(rawText: string, filePath: string): BatchEntry[] {
  const out: BatchEntry[] = []
  const text = stripXmlComments(rawText)

  // 1) Quartz CronTrigger 빈. 여는 태그를 찾고, 다음 </bean> 까지를 본문으로 근사.
  const beanOpenRe = /<bean\b[^>]*>/g
  let bm: RegExpExecArray | null
  while ((bm = beanOpenRe.exec(text)) !== null) {
    const tag = bm[0]
    const cls = attrValue(tag, 'class')
    if (!cls || !/CronTriggerFactoryBean$/.test(cls)) continue
    // 본문 = 여는 태그 끝 ~ 첫 </bean>.
    const bodyStart = bm.index + tag.length
    const closeIdx = text.indexOf('</bean>', bodyStart)
    const body = closeIdx >= 0 ? text.slice(bodyStart, closeIdx) : text.slice(bodyStart)
    const jobDetail = readBeanProperty(body, 'jobDetail')
    const cronProp = readBeanProperty(body, 'cronExpression')
    const handler = jobDetail.ref
    const schedule = cronProp.value !== null ? `cron=${cronProp.value}` : null
    const symbol = handler ?? attrValue(tag, 'id') ?? 'trigger'
    out.push({
      entryId: `batch:${filePath}#${symbol}`,
      trigger: 'quartz',
      schedule,
      filePath,
      line: lineAt(text, bm.index),
      handler,
      notes: [],
    })
  }

  // 2) Spring <task:scheduled .../>. (컨테이너 <task:scheduled-tasks> 와 구분: 뒤에 -tasks 제외.)
  const taskRe = /<task:scheduled(?![-\w])[^>]*\/?>/g
  let tm: RegExpExecArray | null
  while ((tm = taskRe.exec(text)) !== null) {
    const tag = tm[0]
    const ref = attrValue(tag, 'ref')
    const method = attrValue(tag, 'method')
    const cron = attrValue(tag, 'cron')
    const fixedRate = attrValue(tag, 'fixed-rate')
    const fixedDelay = attrValue(tag, 'fixed-delay')
    const handler = ref ? (method ? `${ref}#${method}` : ref) : null
    const schedule =
      cron !== null
        ? `cron=${cron}`
        : fixedRate !== null
          ? `fixedRate=${fixedRate}`
          : fixedDelay !== null
            ? `fixedDelay=${fixedDelay}`
            : null
    const symbol = handler ?? 'task'
    out.push({
      entryId: `batch:${filePath}#${symbol}`,
      trigger: 'task-xml',
      schedule,
      filePath,
      line: lineAt(text, tm.index),
      handler,
      notes: [],
    })
  }

  return out
}
