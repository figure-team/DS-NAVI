/**
 * Java 대외 인터페이스 신호 스캔(T1) — tree-sitter 단일 파일 결정론 해석.
 *
 * 탐지 계층:
 *  1) 어노테이션: @FeignClient(인터페이스) / @KafkaListener·@JmsListener·@RabbitListener(메서드)
 *     / @WebServiceClient(클래스)
 *  2) 선언 바인딩: 필드/지역변수/파라미터의 타입이 클라이언트 타입이면 식별자→타입 바인딩
 *     (call-edge Tier1 수신자 해석과 동일 원리 — 파일 밖 타입 추론은 하지 않는다)
 *  3) 생성: new Socket/ServerSocket/SmbFile/HttpGet/JaxWsProxyFactoryBean …
 *  4) 호출: 바인딩된 수신자의 화이트리스트 메서드(restTemplate.exchange, jmsTemplate.send …),
 *     체인 패턴(WebClient…uri(), Request.Builder…url(), HttpRequest.newBuilder…uri(),
 *     new URL(..).openConnection())
 *
 * 엔드포인트 인자: 문자열 리터럴 / 같은 파일 static final String 상수 / 리터럴·상수만의
 * `+` 연결까지 해석. 그 외(동적 조립)는 raw=null → unresolved(침묵 누락 금지).
 * `${...}` 플레이스홀더 해석(T2)은 호출측(index.ts)에서 수행한다.
 */
import type { Node } from 'web-tree-sitter'
import { childrenOfType, startLine } from '../domain-map/tree-sitter.js'
import type { InterfaceDirection, InterfaceProtocol } from './types.js'

/** 스캔 원시 항목 — endpoint 는 아직 raw 단계(플레이스홀더 미해석). */
export interface RawInterfaceSignal {
  protocol: InterfaceProtocol
  direction: InterfaceDirection
  clientType: string
  endpointRaw: string | null
  dataHint: string | null
  file: string
  line: number
  symbol: string
}

// ── 클라이언트 타입 카탈로그 ─────────────────────────────────────────────

export interface InvocationSpec {
  protocol: InterfaceProtocol
  clientType: string
  /** 화이트리스트 메서드명 → dataHint (null 허용). */
  methods: Record<string, string | null>
  /** endpoint 로 읽을 인자 인덱스(기본 0). */
  endpointArg?: number
}

/** 바인딩 타입(단순명) → 호출 스펙. */
const INVOCATION_SPECS: Record<string, InvocationSpec> = {
  RestTemplate: {
    protocol: 'http',
    clientType: 'RestTemplate',
    methods: {
      getForObject: 'GET',
      getForEntity: 'GET',
      postForObject: 'POST',
      postForEntity: 'POST',
      postForLocation: 'POST',
      put: 'PUT',
      delete: 'DELETE',
      patchForObject: 'PATCH',
      exchange: null,
      execute: null,
    },
  },
  JmsTemplate: {
    protocol: 'mq',
    clientType: 'JmsTemplate',
    methods: {
      send: 'produce',
      convertAndSend: 'produce',
      receive: 'consume',
      receiveAndConvert: 'consume',
    },
  },
  KafkaTemplate: {
    protocol: 'mq',
    clientType: 'KafkaTemplate',
    methods: { send: 'produce', sendDefault: 'produce' },
  },
  RabbitTemplate: {
    protocol: 'mq',
    clientType: 'RabbitTemplate',
    methods: { send: 'produce', convertAndSend: 'produce', receive: 'consume' },
  },
  JSch: {
    protocol: 'file',
    clientType: 'JSch(SFTP)',
    methods: { getSession: null },
    endpointArg: 1, // getSession(user, host[, port])
  },
  FTPClient: {
    protocol: 'file',
    clientType: 'FTPClient(FTP)',
    methods: { connect: null },
  },
  JavaMailSender: { protocol: 'mail', clientType: 'JavaMailSender', methods: { send: null } },
  JaxWsProxyFactoryBean: {
    protocol: 'ws',
    clientType: 'JaxWsProxyFactoryBean(CXF)',
    methods: { setAddress: null },
  },
}

/** 생성 지점 자체가 신호인 타입 — endpointFromArgs(argList)로 엔드포인트 구성. */
interface CreationSpec {
  protocol: InterfaceProtocol
  direction: InterfaceDirection
  clientType: string
  /** 인자에서 endpoint raw 구성(리터럴/상수 해석 결과 배열). null=구성 불가. */
  endpoint: (args: Array<string | null>) => string | null
  dataHint?: string | null
}

const first = (args: Array<string | null>) => args[0] ?? null
const hostPort = (args: Array<string | null>) =>
  args[0] !== null ? (args[1] !== null ? `${args[0]}:${args[1]}` : args[0]) : null

const CREATION_SPECS: Record<string, CreationSpec> = {
  Socket: { protocol: 'socket', direction: 'outbound', clientType: 'Socket', endpoint: hostPort },
  ServerSocket: {
    protocol: 'socket',
    direction: 'inbound-extra',
    clientType: 'ServerSocket',
    endpoint: (args) => (args[0] !== null ? `port ${args[0]}` : null),
  },
  SmbFile: { protocol: 'file', direction: 'outbound', clientType: 'SmbFile(SMB)', endpoint: first },
  HttpGet: { protocol: 'http', direction: 'outbound', clientType: 'ApacheHttpClient', endpoint: first, dataHint: 'GET' },
  HttpPost: { protocol: 'http', direction: 'outbound', clientType: 'ApacheHttpClient', endpoint: first, dataHint: 'POST' },
  HttpPut: { protocol: 'http', direction: 'outbound', clientType: 'ApacheHttpClient', endpoint: first, dataHint: 'PUT' },
  HttpDelete: { protocol: 'http', direction: 'outbound', clientType: 'ApacheHttpClient', endpoint: first, dataHint: 'DELETE' },
  HttpPatch: { protocol: 'http', direction: 'outbound', clientType: 'ApacheHttpClient', endpoint: first, dataHint: 'PATCH' },
  JaxWsProxyFactoryBean: {
    protocol: 'ws',
    direction: 'outbound',
    clientType: 'JaxWsProxyFactoryBean(CXF)',
    endpoint: () => null,
  },
}

/** 메서드 어노테이션 리스너 — inbound-extra(mq). 속성명 → endpoint. */
const LISTENER_ANNOTATIONS: Record<string, { clientType: string; attrs: string[] }> = {
  KafkaListener: { clientType: 'KafkaListener', attrs: ['topics'] },
  JmsListener: { clientType: 'JmsListener', attrs: ['destination'] },
  RabbitListener: { clientType: 'RabbitListener', attrs: ['queues'] },
}

// ── AST 헬퍼 ─────────────────────────────────────────────────────────────

/** 타입 표기 → 단순명: 제네릭 제거 + FQN 마지막 세그먼트(`java.net.URL` → `URL`). */
function simpleTypeName(typeText: string): string {
  const noGenerics = typeText.replace(/<.*$/, '')
  const dot = noGenerics.lastIndexOf('.')
  return dot >= 0 ? noGenerics.slice(dot + 1) : noGenerics
}

function child(node: Node, type: string): Node | null {
  for (const c of node.namedChildren) {
    if (c && c.type === type) return c
  }
  return null
}

function stringLiteralValue(node: Node): string {
  return childrenOfType(node, 'string_fragment')[0]?.text ?? ''
}

/** 모든 자손을 깊이우선 순회(결정론: 선언 순서). */
function* walk(root: Node): Generator<Node> {
  const stack: Node[] = [root]
  while (stack.length > 0) {
    const node = stack.pop()!
    yield node
    // pop 순서 보정: 역순 push 로 선언 순서 방문.
    for (let i = node.namedChildCount - 1; i >= 0; i--) {
      const c = node.namedChild(i)
      if (c) stack.push(c)
    }
  }
}

/** 둘러싼 심볼 — `Class#method` / `Class` / `<top>`. */
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
      (cur.type === 'class_declaration' ||
        cur.type === 'interface_declaration' ||
        cur.type === 'enum_declaration')
    ) {
      type = cur.childForFieldName('name')?.text ?? null
    }
    cur = cur.parent
  }
  if (type && method) return `${type}#${method}`
  if (type) return type
  return method ?? '<top>'
}

/** 같은 파일의 `static final String NAME = "..."` 상수 수집. */
function collectStringConstants(root: Node): Map<string, string> {
  const out = new Map<string, string>()
  for (const node of walk(root)) {
    if (node.type !== 'field_declaration') continue
    const mods = child(node, 'modifiers')?.text ?? ''
    if (!/\bstatic\b/.test(mods) || !/\bfinal\b/.test(mods)) continue
    const typeNode = node.childForFieldName('type')
    if (!typeNode || typeNode.text !== 'String') continue
    for (const decl of childrenOfType(node, 'variable_declarator')) {
      const name = decl.childForFieldName('name')?.text
      const value = decl.childForFieldName('value')
      if (name && value?.type === 'string_literal') out.set(name, stringLiteralValue(value))
    }
  }
  return out
}

/**
 * 식(expression)을 문자열로 해석 — 리터럴 / 같은 파일 상수 / 이들만의 `+` 연결.
 * 해석 불가 → null.
 */
function resolveStringExpr(node: Node, constants: Map<string, string>): string | null {
  switch (node.type) {
    case 'string_literal':
      return stringLiteralValue(node)
    case 'decimal_integer_literal':
      return node.text
    case 'identifier':
      return constants.get(node.text) ?? null
    case 'field_access': {
      const field = node.childForFieldName('field')?.text
      return field ? (constants.get(field) ?? null) : null
    }
    case 'binary_expression': {
      // 문자열 연결(`+`)만 해석 — 다른 연산자는 endpoint 로 합성하지 않는다.
      if (node.childForFieldName('operator')?.text !== '+') return null
      const left = node.childForFieldName('left')
      const right = node.childForFieldName('right')
      if (!left || !right) return null
      const l = resolveStringExpr(left, constants)
      const r = resolveStringExpr(right, constants)
      return l !== null && r !== null ? l + r : null
    }
    case 'method_invocation': {
      // URI.create("...") / URI.create(CONST) — http 체인에서 흔한 래핑.
      const obj = node.childForFieldName('object')?.text
      const name = node.childForFieldName('name')?.text
      if (obj === 'URI' && name === 'create') {
        const arg = firstArg(node)
        return arg ? resolveStringExpr(arg, constants) : null
      }
      return null
    }
    default:
      return null
  }
}

/** method_invocation / object_creation_expression 의 n번째 인자 노드. */
function argAt(node: Node, idx: number): Node | null {
  const argList = node.childForFieldName('arguments')
  if (!argList) return null
  const args = argList.namedChildren.filter((c): c is Node => c !== null)
  return args[idx] ?? null
}
const firstArg = (node: Node) => argAt(node, 0)

/** 체인 호출의 최내곽 수신자(식별자면 그 텍스트, 생성식이면 노드)를 찾는다. */
function innermostReceiver(node: Node): Node | null {
  let cur: Node | null = node.childForFieldName('object')
  while (cur) {
    if (cur.type === 'method_invocation') {
      const deeper: Node | null = cur.childForFieldName('object')
      if (!deeper) return cur // 정적 호출 수신자 없음 → invocation 자체 반환
      cur = deeper
      continue
    }
    if (cur.type === 'parenthesized_expression' || cur.type === 'cast_expression') {
      cur = cur.namedChildren.filter((c): c is Node => c !== null).at(-1) ?? null
      continue
    }
    return cur
  }
  return null
}

/** 어노테이션 인자에서 속성값 읽기(string / {string, ...} 배열 첫 요소 / ${} 포함). */
function annotationAttr(annot: Node, attr: string): string | null {
  const argList = child(annot, 'annotation_argument_list')
  if (!argList) return null
  for (const pair of childrenOfType(argList, 'element_value_pair')) {
    const key = pair.childForFieldName('key')?.text ?? child(pair, 'identifier')?.text
    if (key !== attr) continue
    const value = pair.childForFieldName('value') ?? pair.namedChildren.filter((c): c is Node => c !== null)[1]
    if (!value) return null
    if (value.type === 'string_literal') return stringLiteralValue(value)
    if (value.type === 'element_value_array_initializer') {
      const firstEl = value.namedChildren.filter((c): c is Node => c !== null)[0]
      if (firstEl?.type === 'string_literal') return stringLiteralValue(firstEl)
    }
    return null
  }
  // 단일 value 축약형: @KafkaListener("topic") — element_value_pair 없이 리터럴만.
  if (attr === 'value') {
    const lone = argList.namedChildren.filter((c): c is Node => c !== null)[0]
    if (lone?.type === 'string_literal') return stringLiteralValue(lone)
  }
  return null
}

/** 어노테이션 이름(마지막 세그먼트). */
function annotationName(annot: Node): string | null {
  const nameNode = annot.childForFieldName('name') ?? child(annot, 'identifier')
  if (!nameNode) return null
  const text = nameNode.text
  const dot = text.lastIndexOf('.')
  return dot >= 0 ? text.slice(dot + 1) : text
}

// ── 본체 ─────────────────────────────────────────────────────────────────

/**
 * 단일 Java 파일에서 인터페이스 신호를 추출한다.
 * @param root 파싱된 program 노드
 * @param filePath census relPath
 * @param customSpecs 프로젝트 커스텀 클라이언트(understanding.config.json seam) —
 *        내장 카탈로그와 병합하되 내장이 우선(동명 타입 재정의 금지).
 */
export function scanJavaInterfaces(
  root: Node,
  filePath: string,
  customSpecs?: Record<string, InvocationSpec>,
): RawInterfaceSignal[] {
  const specs: Record<string, InvocationSpec> = { ...(customSpecs ?? {}), ...INVOCATION_SPECS }
  const out: RawInterfaceSignal[] = []
  const constants = collectStringConstants(root)
  const seen = new Set<string>()

  const push = (sig: RawInterfaceSignal) => {
    const key = `${sig.line}|${sig.clientType}|${sig.endpointRaw ?? ''}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(sig)
  }

  // 1) 선언 바인딩 — 식별자 → 클라이언트 타입(+생성 초기화의 endpoint raw).
  const bindings = new Map<string, string>()
  const boundEndpoint = new Map<string, string>()
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
    const known = typeName in specs || typeName === 'URL' || typeName === 'WebClient'
    if (!known) continue
    if (node.type === 'formal_parameter') {
      const name = node.childForFieldName('name')?.text
      if (name) bindings.set(name, typeName)
      continue
    }
    for (const decl of childrenOfType(node, 'variable_declarator')) {
      const name = decl.childForFieldName('name')?.text
      if (!name) continue
      bindings.set(name, typeName)
      const value = decl.childForFieldName('value')
      if (value?.type === 'object_creation_expression') {
        const arg = firstArg(value)
        const raw = arg ? resolveStringExpr(arg, constants) : null
        if (raw !== null) boundEndpoint.set(name, raw)
      }
    }
  }

  for (const node of walk(root)) {
    // 2) 어노테이션 신호.
    if (node.type === 'annotation' || node.type === 'marker_annotation') {
      const name = annotationName(node)
      if (!name) continue
      if (name === 'FeignClient') {
        const url = annotationAttr(node, 'url')
        const svc = annotationAttr(node, 'name') ?? annotationAttr(node, 'value')
        push({
          protocol: 'http',
          direction: 'outbound',
          clientType: 'FeignClient',
          endpointRaw: url ?? (svc !== null ? `feign:${svc}` : null),
          dataHint: null,
          file: filePath,
          line: startLine(node),
          symbol: enclosingSymbol(node),
        })
        continue
      }
      if (name === 'WebServiceClient') {
        push({
          protocol: 'ws',
          direction: 'outbound',
          clientType: 'JAX-WS',
          endpointRaw: annotationAttr(node, 'wsdlLocation'),
          dataHint: null,
          file: filePath,
          line: startLine(node),
          symbol: enclosingSymbol(node),
        })
        continue
      }
      const listener = LISTENER_ANNOTATIONS[name]
      if (listener) {
        const endpoint =
          listener.attrs.map((a) => annotationAttr(node, a)).find((v) => v !== null) ??
          annotationAttr(node, 'value')
        push({
          protocol: 'mq',
          direction: 'inbound-extra',
          clientType: listener.clientType,
          endpointRaw: endpoint,
          dataHint: 'consume',
          file: filePath,
          line: startLine(node),
          symbol: enclosingSymbol(node),
        })
        continue
      }
    }

    // 3) 생성 신호.
    if (node.type === 'object_creation_expression') {
      const typeName = simpleTypeName(node.childForFieldName('type')?.text ?? '')
      const spec = CREATION_SPECS[typeName]
      if (spec) {
        const args: Array<string | null> = []
        for (let i = 0; i < 3; i++) {
          const a = argAt(node, i)
          args.push(a ? resolveStringExpr(a, constants) : null)
        }
        push({
          protocol: spec.protocol,
          direction: spec.direction,
          clientType: spec.clientType,
          endpointRaw: spec.endpoint(args),
          dataHint: spec.dataHint ?? null,
          file: filePath,
          line: startLine(node),
          symbol: enclosingSymbol(node),
        })
      }
      continue
    }

    // 4) 호출 신호.
    if (node.type !== 'method_invocation') continue
    const methodName = node.childForFieldName('name')?.text
    if (!methodName) continue
    const objNode = node.childForFieldName('object')

    // 4-a) WebClient.create("...") 정적 호출.
    if (objNode?.type === 'identifier' && objNode.text === 'WebClient' && methodName === 'create') {
      const arg = firstArg(node)
      push({
        protocol: 'http',
        direction: 'outbound',
        clientType: 'WebClient',
        endpointRaw: arg ? resolveStringExpr(arg, constants) : null,
        dataHint: null,
        file: filePath,
        line: startLine(node),
        symbol: enclosingSymbol(node),
      })
      continue
    }
    // 4-b) Transport.send(...) 정적 호출(JavaMail).
    if (objNode?.type === 'identifier' && objNode.text === 'Transport' && methodName === 'send') {
      push({
        protocol: 'mail',
        direction: 'outbound',
        clientType: 'JavaMail(Transport)',
        endpointRaw: null,
        dataHint: null,
        file: filePath,
        line: startLine(node),
        symbol: enclosingSymbol(node),
      })
      continue
    }

    // 4-c) 체인 패턴: …uri("...") / …url("...") — WebClient/JdkHttpClient/OkHttp.
    if (methodName === 'uri' || methodName === 'url') {
      const inner = innermostReceiver(node)
      const innerText = inner?.text ?? ''
      const isWebClient =
        inner?.type === 'identifier' &&
        (bindings.get(innerText) === 'WebClient' || innerText === 'WebClient')
      const isJdkHttp =
        inner?.type === 'method_invocation' && /^HttpRequest\s*\.\s*newBuilder/.test(innerText)
      const isOkHttp =
        inner?.type === 'object_creation_expression' && /Request\s*\.\s*Builder/.test(innerText)
      if (isWebClient || isJdkHttp || isOkHttp) {
        const arg = firstArg(node)
        // dataHint: WebClient 체인의 HTTP 동사(webClient.get().uri(..)).
        let verb: string | null = null
        const parentChain = node.childForFieldName('object')
        if (isWebClient && parentChain?.type === 'method_invocation') {
          const v = parentChain.childForFieldName('name')?.text ?? ''
          if (['get', 'post', 'put', 'delete', 'patch', 'head', 'options'].includes(v))
            verb = v.toUpperCase()
        }
        push({
          protocol: 'http',
          direction: 'outbound',
          clientType: isWebClient ? 'WebClient' : isJdkHttp ? 'JdkHttpClient' : 'OkHttp',
          endpointRaw: arg ? resolveStringExpr(arg, constants) : null,
          dataHint: verb,
          file: filePath,
          line: startLine(node),
          symbol: enclosingSymbol(node),
        })
        continue
      }
    }

    // 4-d) new URL("...").openConnection() / boundUrl.openConnection().
    if (methodName === 'openConnection') {
      const inner = innermostReceiver(node)
      let raw: string | null = null
      if (inner?.type === 'object_creation_expression') {
        const arg = firstArg(inner)
        raw = arg ? resolveStringExpr(arg, constants) : null
      } else if (inner?.type === 'identifier' && bindings.get(inner.text) === 'URL') {
        raw = boundEndpoint.get(inner.text) ?? null
      } else if (inner?.type !== 'identifier') {
        continue // URL 과 무관한 openConnection 수신자 — 잡지 않음(정밀 우선).
      } else if (bindings.get(inner.text) !== 'URL') {
        continue
      }
      push({
        protocol: 'http',
        direction: 'outbound',
        clientType: 'HttpURLConnection',
        endpointRaw: raw,
        dataHint: null,
        file: filePath,
        line: startLine(node),
        symbol: enclosingSymbol(node),
      })
      continue
    }

    // 4-e) 바인딩 수신자 화이트리스트 호출.
    if (objNode?.type === 'identifier' || objNode?.type === 'field_access') {
      const recvName =
        objNode.type === 'identifier'
          ? objNode.text
          : (objNode.childForFieldName('field')?.text ?? '')
      const typeName = bindings.get(recvName)
      if (!typeName) continue
      const spec = specs[typeName]
      if (!spec || !(methodName in spec.methods)) continue
      const arg = argAt(node, spec.endpointArg ?? 0)
      let endpointRaw = arg ? resolveStringExpr(arg, constants) : null
      // JSch.getSession(user, host, port) — host[:port] 로 구성.
      if (typeName === 'JSch') {
        const port = argAt(node, 2)
        const portVal = port ? resolveStringExpr(port, constants) : null
        if (endpointRaw !== null && portVal !== null) endpointRaw = `${endpointRaw}:${portVal}`
      }
      // FTPClient.connect(host[, port]).
      if (typeName === 'FTPClient') {
        const port = argAt(node, 1)
        const portVal = port ? resolveStringExpr(port, constants) : null
        if (endpointRaw !== null && portVal !== null) endpointRaw = `${endpointRaw}:${portVal}`
      }
      let dataHint = spec.methods[methodName]
      // RestTemplate.exchange/execute — 2번째 인자 HttpMethod.X 에서 동사 추출.
      if (spec.clientType === 'RestTemplate' && dataHint === null) {
        const m = argAt(node, 1)?.text.match(/^HttpMethod\s*\.\s*(\w+)$/)
        if (m) dataHint = m[1]
      }
      push({
        protocol: spec.protocol,
        direction: 'outbound',
        clientType: spec.clientType,
        endpointRaw,
        dataHint,
        file: filePath,
        line: startLine(node),
        symbol: enclosingSymbol(node),
      })
    }
  }

  return out
}
