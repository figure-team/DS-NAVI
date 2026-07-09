import { childrenOfType, startLine } from '../domain-map/tree-sitter.js';
/** 바인딩 타입(단순명) → 호출 스펙. */
const INVOCATION_SPECS = {
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
};
const first = (args) => args[0] ?? null;
const hostPort = (args) => args[0] !== null ? (args[1] !== null ? `${args[0]}:${args[1]}` : args[0]) : null;
const CREATION_SPECS = {
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
};
/** 메서드 어노테이션 리스너 — inbound-extra(mq). 속성명 → endpoint. */
const LISTENER_ANNOTATIONS = {
    KafkaListener: { clientType: 'KafkaListener', attrs: ['topics'] },
    JmsListener: { clientType: 'JmsListener', attrs: ['destination'] },
    RabbitListener: { clientType: 'RabbitListener', attrs: ['queues'] },
};
// ── AST 헬퍼 ─────────────────────────────────────────────────────────────
/** 타입 표기 → 단순명: 제네릭 제거 + FQN 마지막 세그먼트(`java.net.URL` → `URL`). */
function simpleTypeName(typeText) {
    const noGenerics = typeText.replace(/<.*$/, '');
    const dot = noGenerics.lastIndexOf('.');
    return dot >= 0 ? noGenerics.slice(dot + 1) : noGenerics;
}
function child(node, type) {
    for (const c of node.namedChildren) {
        if (c && c.type === type)
            return c;
    }
    return null;
}
/** Java 이스케이프 시퀀스 → 실제 문자(단일 문자 이스케이프). */
const JAVA_ESCAPES = {
    n: '\n',
    t: '\t',
    r: '\r',
    b: '\b',
    f: '\f',
    s: ' ',
    '"': '"',
    "'": "'",
    '\\': '\\',
    '0': '\0',
};
/**
 * 문자열 리터럴 전체 값 복원 — fragment + escape_sequence 를 순서대로 이어붙인다.
 * 첫 fragment 만 취하면 이스케이프 뒤가 조용히 절단되어 "틀린 확정값"이 된다
 * (예: "smb://host/a\tb" → "smb://host/a"). 침묵 누락 금지 불변식 위반이므로 전체 복원.
 */
function stringLiteralValue(node) {
    let out = '';
    for (const c of node.namedChildren) {
        if (!c)
            continue;
        if (c.type === 'string_fragment')
            out += c.text;
        else if (c.type === 'escape_sequence') {
            const t = c.text;
            if (t.startsWith('\\u')) {
                const code = Number.parseInt(t.slice(2), 16);
                out += Number.isNaN(code) ? t : String.fromCharCode(code);
            }
            else {
                out += JAVA_ESCAPES[t[1]] ?? t.slice(1);
            }
        }
    }
    return out;
}
/** 모든 자손을 깊이우선 순회(결정론: 선언 순서). */
function* walk(root) {
    const stack = [root];
    while (stack.length > 0) {
        const node = stack.pop();
        yield node;
        // pop 순서 보정: 역순 push 로 선언 순서 방문.
        for (let i = node.namedChildCount - 1; i >= 0; i--) {
            const c = node.namedChild(i);
            if (c)
                stack.push(c);
        }
    }
}
/** 둘러싼 심볼 — `Class#method` / `Class` / `<top>`. */
function enclosingSymbol(node) {
    let method = null;
    let type = null;
    let cur = node.parent;
    while (cur) {
        if (method === null && cur.type === 'method_declaration') {
            method = cur.childForFieldName('name')?.text ?? null;
        }
        if (type === null &&
            (cur.type === 'class_declaration' ||
                cur.type === 'interface_declaration' ||
                cur.type === 'enum_declaration')) {
            type = cur.childForFieldName('name')?.text ?? null;
        }
        cur = cur.parent;
    }
    if (type && method)
        return `${type}#${method}`;
    if (type)
        return type;
    return method ?? '<top>';
}
/** 상수를 둘러싼 타입 선언의 이름(가장 가까운 class/interface/enum). */
function enclosingTypeName(node) {
    let cur = node.parent;
    while (cur) {
        if (cur.type === 'class_declaration' ||
            cur.type === 'interface_declaration' ||
            cur.type === 'enum_declaration') {
            return cur.childForFieldName('name')?.text ?? null;
        }
        cur = cur.parent;
    }
    return null;
}
/**
 * 같은 파일의 `static final String NAME = "..."` 상수 수집.
 * 키는 `Class.NAME`(한정) + `NAME`(비한정) 이중 등록 — 비한정 키는 파일 내 동명 상수가
 * 값이 다르면 제거(모호 → 해석 포기가 "틀린 확정값"보다 낫다). 한정 참조(Ext.API_URL)가
 * 로컬 상수로 잘못 풀리는 것은 resolveStringExpr 의 한정 조회가 차단.
 */
function collectStringConstants(root) {
    const out = new Map();
    const ambiguousPlain = new Set();
    for (const node of walk(root)) {
        if (node.type !== 'field_declaration')
            continue;
        const mods = child(node, 'modifiers')?.text ?? '';
        if (!/\bstatic\b/.test(mods) || !/\bfinal\b/.test(mods))
            continue;
        const typeNode = node.childForFieldName('type');
        if (!typeNode || typeNode.text !== 'String')
            continue;
        const cls = enclosingTypeName(node);
        for (const decl of childrenOfType(node, 'variable_declarator')) {
            const name = decl.childForFieldName('name')?.text;
            const value = decl.childForFieldName('value');
            if (!name || value?.type !== 'string_literal')
                continue;
            const v = stringLiteralValue(value);
            if (cls)
                out.set(`${cls}.${name}`, v);
            if (out.has(name) && out.get(name) !== v)
                ambiguousPlain.add(name);
            else
                out.set(name, v);
        }
    }
    for (const name of ambiguousPlain)
        out.delete(name);
    return out;
}
/**
 * 식(expression)을 문자열로 해석 — 리터럴 / 같은 파일 상수 / 이들만의 `+` 연결.
 * 해석 불가 → null.
 */
function resolveStringExpr(node, constants) {
    switch (node.type) {
        case 'string_literal':
            return stringLiteralValue(node);
        case 'decimal_integer_literal':
            return node.text;
        case 'identifier':
            return constants.get(node.text) ?? null;
        case 'field_access': {
            // 한정 참조는 한정 키로만 조회 — Ext.API_URL 을 로컬 API_URL 로 오해석하지 않는다.
            const field = node.childForFieldName('field')?.text;
            const qualifier = node.childForFieldName('object')?.text;
            if (!field || !qualifier)
                return null;
            if (qualifier === 'this')
                return constants.get(field) ?? null;
            return constants.get(`${simpleTypeName(qualifier)}.${field}`) ?? null;
        }
        case 'binary_expression': {
            // 문자열 연결(`+`)만 해석 — 다른 연산자는 endpoint 로 합성하지 않는다.
            if (node.childForFieldName('operator')?.text !== '+')
                return null;
            const left = node.childForFieldName('left');
            const right = node.childForFieldName('right');
            if (!left || !right)
                return null;
            const l = resolveStringExpr(left, constants);
            const r = resolveStringExpr(right, constants);
            return l !== null && r !== null ? l + r : null;
        }
        case 'method_invocation': {
            // URI.create("...") / java.net.URI.create(CONST) — http 체인에서 흔한 래핑.
            const obj = node.childForFieldName('object')?.text;
            const name = node.childForFieldName('name')?.text;
            if (obj && simpleTypeName(obj) === 'URI' && name === 'create') {
                const arg = firstArg(node);
                return arg ? resolveStringExpr(arg, constants) : null;
            }
            return null;
        }
        default:
            return null;
    }
}
/** method_invocation / object_creation_expression 의 n번째 인자 노드. */
function argAt(node, idx) {
    const argList = node.childForFieldName('arguments');
    if (!argList)
        return null;
    const args = argList.namedChildren.filter((c) => c !== null);
    return args[idx] ?? null;
}
const firstArg = (node) => argAt(node, 0);
/** 체인 호출의 최내곽 수신자(식별자면 그 텍스트, 생성식이면 노드)를 찾는다. */
function innermostReceiver(node) {
    let cur = node.childForFieldName('object');
    while (cur) {
        if (cur.type === 'method_invocation') {
            const deeper = cur.childForFieldName('object');
            if (!deeper)
                return cur; // 정적 호출 수신자 없음 → invocation 자체 반환
            cur = deeper;
            continue;
        }
        if (cur.type === 'parenthesized_expression' || cur.type === 'cast_expression') {
            cur = cur.namedChildren.filter((c) => c !== null).at(-1) ?? null;
            continue;
        }
        return cur;
    }
    return null;
}
/** 어노테이션 인자에서 속성값 읽기(string / {string, ...} 배열 첫 요소 / ${} 포함). */
function annotationAttr(annot, attr) {
    const argList = child(annot, 'annotation_argument_list');
    if (!argList)
        return null;
    for (const pair of childrenOfType(argList, 'element_value_pair')) {
        const key = pair.childForFieldName('key')?.text ?? child(pair, 'identifier')?.text;
        if (key !== attr)
            continue;
        const value = pair.childForFieldName('value') ?? pair.namedChildren.filter((c) => c !== null)[1];
        if (!value)
            return null;
        if (value.type === 'string_literal')
            return stringLiteralValue(value);
        if (value.type === 'element_value_array_initializer') {
            const firstEl = value.namedChildren.filter((c) => c !== null)[0];
            if (firstEl?.type === 'string_literal')
                return stringLiteralValue(firstEl);
        }
        return null;
    }
    // 단일 value 축약형: @KafkaListener("topic") — element_value_pair 없이 리터럴만.
    if (attr === 'value') {
        const lone = argList.namedChildren.filter((c) => c !== null)[0];
        if (lone?.type === 'string_literal')
            return stringLiteralValue(lone);
    }
    return null;
}
/** 어노테이션 이름(마지막 세그먼트). */
function annotationName(annot) {
    const nameNode = annot.childForFieldName('name') ?? child(annot, 'identifier');
    if (!nameNode)
        return null;
    const text = nameNode.text;
    const dot = text.lastIndexOf('.');
    return dot >= 0 ? text.slice(dot + 1) : text;
}
// ── 본체 ─────────────────────────────────────────────────────────────────
/**
 * 단일 Java 파일에서 인터페이스 신호를 추출한다.
 * @param root 파싱된 program 노드
 * @param filePath census relPath
 * @param customSpecs 프로젝트 커스텀 클라이언트(understanding.config.json seam) —
 *        내장 카탈로그와 병합하되 내장이 우선(동명 타입 재정의 금지).
 */
export function scanJavaInterfaces(root, filePath, customSpecs) {
    const specs = { ...(customSpecs ?? {}), ...INVOCATION_SPECS };
    const out = [];
    const constants = collectStringConstants(root);
    const seen = new Set();
    const push = (sig) => {
        const key = `${sig.line}|${sig.clientType}|${sig.endpointRaw ?? ''}`;
        if (seen.has(key))
            return;
        seen.add(key);
        out.push(sig);
    };
    // 1) 선언 바인딩 — 식별자 → 클라이언트 타입(+생성 초기화의 endpoint raw).
    //    파일 내 "모든" 선언의 타입을 모아, 같은 이름이 서로 다른 타입으로도 선언되면
    //    바인딩에서 제외한다(스코프 미추적의 방어 — 메서드 A 의 RestTemplate client 가
    //    메서드 B 의 무관한 Widget client 호출을 오탐시키는 것을 차단).
    const declTypes = new Map();
    const declEndpoints = new Map();
    for (const node of walk(root)) {
        if (node.type !== 'field_declaration' &&
            node.type !== 'local_variable_declaration' &&
            node.type !== 'formal_parameter')
            continue;
        const typeNode = node.childForFieldName('type');
        if (!typeNode)
            continue;
        const typeName = simpleTypeName(typeNode.text);
        const record = (name) => {
            const set = declTypes.get(name) ?? new Set();
            set.add(typeName);
            declTypes.set(name, set);
        };
        if (node.type === 'formal_parameter') {
            const name = node.childForFieldName('name')?.text;
            if (name)
                record(name);
            continue;
        }
        for (const decl of childrenOfType(node, 'variable_declarator')) {
            const name = decl.childForFieldName('name')?.text;
            if (!name)
                continue;
            record(name);
            const value = decl.childForFieldName('value');
            if (value?.type === 'object_creation_expression') {
                const arg = firstArg(value);
                const raw = arg ? resolveStringExpr(arg, constants) : null;
                if (raw !== null) {
                    const set = declEndpoints.get(name) ?? new Set();
                    set.add(raw);
                    declEndpoints.set(name, set);
                }
            }
        }
    }
    const bindings = new Map();
    const boundEndpoint = new Map();
    for (const [name, types] of declTypes) {
        if (types.size !== 1)
            continue; // 동명 이타입 선언 → 모호, 바인딩 포기(오탐 방지)
        const typeName = [...types][0];
        if (!(typeName in specs) && typeName !== 'URL' && typeName !== 'WebClient')
            continue;
        bindings.set(name, typeName);
        const eps = declEndpoints.get(name);
        if (eps && eps.size === 1)
            boundEndpoint.set(name, [...eps][0]);
    }
    for (const node of walk(root)) {
        // 2) 어노테이션 신호.
        if (node.type === 'annotation' || node.type === 'marker_annotation') {
            const name = annotationName(node);
            if (!name)
                continue;
            if (name === 'FeignClient') {
                const url = annotationAttr(node, 'url');
                const svc = annotationAttr(node, 'name') ?? annotationAttr(node, 'value');
                push({
                    protocol: 'http',
                    direction: 'outbound',
                    clientType: 'FeignClient',
                    endpointRaw: url ?? (svc !== null ? `feign:${svc}` : null),
                    dataHint: null,
                    file: filePath,
                    line: startLine(node),
                    symbol: enclosingSymbol(node),
                });
                continue;
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
                });
                continue;
            }
            const listener = LISTENER_ANNOTATIONS[name];
            if (listener) {
                const endpoint = listener.attrs.map((a) => annotationAttr(node, a)).find((v) => v !== null) ??
                    annotationAttr(node, 'value');
                push({
                    protocol: 'mq',
                    direction: 'inbound-extra',
                    clientType: listener.clientType,
                    endpointRaw: endpoint,
                    dataHint: 'consume',
                    file: filePath,
                    line: startLine(node),
                    symbol: enclosingSymbol(node),
                });
                continue;
            }
        }
        // 3) 생성 신호.
        if (node.type === 'object_creation_expression') {
            const typeName = simpleTypeName(node.childForFieldName('type')?.text ?? '');
            const spec = CREATION_SPECS[typeName];
            if (spec) {
                const args = [];
                for (let i = 0; i < 3; i++) {
                    const a = argAt(node, i);
                    args.push(a ? resolveStringExpr(a, constants) : null);
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
                });
            }
            continue;
        }
        // 4) 호출 신호.
        if (node.type !== 'method_invocation')
            continue;
        const methodName = node.childForFieldName('name')?.text;
        if (!methodName)
            continue;
        const objNode = node.childForFieldName('object');
        // 4-a) WebClient.create("...") 정적 호출.
        if (objNode?.type === 'identifier' && objNode.text === 'WebClient' && methodName === 'create') {
            const arg = firstArg(node);
            push({
                protocol: 'http',
                direction: 'outbound',
                clientType: 'WebClient',
                endpointRaw: arg ? resolveStringExpr(arg, constants) : null,
                dataHint: null,
                file: filePath,
                line: startLine(node),
                symbol: enclosingSymbol(node),
            });
            continue;
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
            });
            continue;
        }
        // 4-c) 체인 패턴: …uri("...") / …url("...") — WebClient/JdkHttpClient/OkHttp.
        if (methodName === 'uri' || methodName === 'url') {
            const inner = innermostReceiver(node);
            const innerText = inner?.text ?? '';
            const isWebClient = inner?.type === 'identifier' &&
                (bindings.get(innerText) === 'WebClient' || innerText === 'WebClient');
            // HttpRequest.newBuilder()…uri(..) — innermostReceiver 는 체인 최내곽의
            // `HttpRequest` 까지 내려간다. 비한정이면 identifier, FQN(java.net.http.…)이면
            // field_access 노드(method_invocation 이 아님에 주의).
            const isJdkHttp = (inner?.type === 'identifier' || inner?.type === 'field_access') &&
                simpleTypeName(innerText) === 'HttpRequest';
            // OkHttp: 생성 타입의 마지막 두 세그먼트가 정확히 Request.Builder 일 때만
            // (PurchaseRequest.Builder 같은 도메인 빌더 오탐 방지).
            const creationType = inner?.type === 'object_creation_expression'
                ? (inner.childForFieldName('type')?.text ?? '')
                : '';
            const isOkHttp = creationType.split('.').slice(-2).join('.') === 'Request.Builder';
            if (isWebClient || isJdkHttp || isOkHttp) {
                const arg = firstArg(node);
                // dataHint: WebClient 체인의 HTTP 동사(webClient.get().uri(..)).
                let verb = null;
                const parentChain = node.childForFieldName('object');
                if (isWebClient && parentChain?.type === 'method_invocation') {
                    const v = parentChain.childForFieldName('name')?.text ?? '';
                    if (['get', 'post', 'put', 'delete', 'patch', 'head', 'options'].includes(v))
                        verb = v.toUpperCase();
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
                });
                continue;
            }
        }
        // 4-d) new URL("...").openConnection() / boundUrl.openConnection().
        if (methodName === 'openConnection') {
            const inner = innermostReceiver(node);
            let raw = null;
            if (inner?.type === 'object_creation_expression') {
                const arg = firstArg(inner);
                raw = arg ? resolveStringExpr(arg, constants) : null;
            }
            else if (inner?.type === 'identifier' && bindings.get(inner.text) === 'URL') {
                raw = boundEndpoint.get(inner.text) ?? null;
            }
            else if (inner?.type !== 'identifier') {
                continue; // URL 과 무관한 openConnection 수신자 — 잡지 않음(정밀 우선).
            }
            else if (bindings.get(inner.text) !== 'URL') {
                continue;
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
            });
            continue;
        }
        // 4-e) 바인딩 수신자 화이트리스트 호출.
        if (objNode?.type === 'identifier' || objNode?.type === 'field_access') {
            const recvName = objNode.type === 'identifier'
                ? objNode.text
                : (objNode.childForFieldName('field')?.text ?? '');
            const typeName = bindings.get(recvName);
            if (!typeName)
                continue;
            const spec = specs[typeName];
            if (!spec || !(methodName in spec.methods))
                continue;
            const arg = argAt(node, spec.endpointArg ?? 0);
            let endpointRaw = arg ? resolveStringExpr(arg, constants) : null;
            // JSch.getSession(user, host, port) — host[:port] 로 구성.
            if (typeName === 'JSch') {
                const port = argAt(node, 2);
                const portVal = port ? resolveStringExpr(port, constants) : null;
                if (endpointRaw !== null && portVal !== null)
                    endpointRaw = `${endpointRaw}:${portVal}`;
            }
            // FTPClient.connect(host[, port]).
            if (typeName === 'FTPClient') {
                const port = argAt(node, 1);
                const portVal = port ? resolveStringExpr(port, constants) : null;
                if (endpointRaw !== null && portVal !== null)
                    endpointRaw = `${endpointRaw}:${portVal}`;
            }
            let dataHint = spec.methods[methodName];
            // RestTemplate.exchange/execute — 2번째 인자 HttpMethod.X 에서 동사 추출.
            if (spec.clientType === 'RestTemplate' && dataHint === null) {
                const m = argAt(node, 1)?.text.match(/^HttpMethod\s*\.\s*(\w+)$/);
                if (m)
                    dataHint = m[1];
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
            });
        }
    }
    return out;
}
//# sourceMappingURL=java-scan.js.map