import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { readFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildMinimalKg,
  writeMinimalKg,
  emitMinimalKg,
  loadMinimalKgInputs,
  MinimalKgInputMissingError,
  ANALYZED_AT_SENTINEL,
  isSecretCarrierPath,
  type MinimalKgBuildInputs,
} from './minimal-kg.js'
import { writeCensus, uaDir, stableJson } from './persist.js'
import { writeDbSchema } from '../db-schema/index.js'
import type { CensusReport, RoutesReport } from './types.js'
import type { DbSchemaModel } from '../db-schema/types.js'
import { listJspFilesFromGraph } from '../screen-capture/discover.js'
import { loadKgTableCatalog } from '../impact/engine.js'
import { validateGraph } from '@understand-anything/core'
import { loadProjectGraph } from '../orchestrator/index.js'

const census: CensusReport = {
  schemaVersion: 1,
  gitCommit: 'abc123',
  fileCount: 5,
  files: [
    { relPath: 'src/main/java/com/petstore/AccountService.java', lang: 'java' },
    { relPath: 'src/test/java/com/petstore/AccountServiceTest.java', lang: 'java' },
    { relPath: 'web/WEB-INF/jsp/account/EditAccount.jsp', lang: 'jsp' },
    { relPath: 'db/schema.sql', lang: 'sql' },
    { relPath: 'README.md', lang: 'md' },
    { relPath: 'src/main/resources/applicationContext.xml', lang: 'xml' },
  ],
}

const dbSchema: DbSchemaModel = {
  schemaVersion: 1,
  gitCommit: 'abc123',
  tier: 'ddl',
  sqlFileCount: 1,
  tables: [
    {
      name: 'account',
      relPath: 'db/schema.sql',
      line: 1,
      comment: null,
      columns: [
        { name: 'userid', type: 'varchar', nullable: false, primaryKey: true, unique: false, default: null, comment: null, line: 2 },
        { name: 'email', type: 'varchar', nullable: true, primaryKey: false, unique: false, default: null, comment: null, line: 3 },
      ],
      primaryKey: ['userid'],
      uniques: [],
      foreignKeys: [],
      checks: [],
      indexes: [],
      isCodeTable: false,
      codeTableReason: null,
      rows: [],
      rowCount: 0,
    },
  ],
  liveDbSignals: [],
  unresolved: [],
}

const routes: RoutesReport = {
  schemaVersion: 1,
  gitCommit: 'abc123',
  contextPath: null,
  routes: [
    { routeId: 'r1', method: 'GET', path: '/account', rawPath: '/account', kind: 'page', framework: 'spring', filePath: 'x.java', line: 1, handler: null, notes: [] },
    { routeId: 'r2', method: 'POST', path: '/account', rawPath: '/account', kind: 'form', framework: 'spring', filePath: 'x.java', line: 2, handler: null, notes: [] },
    { routeId: 'r3', method: 'GET', path: '/legacy', rawPath: '/legacy', kind: 'servlet', framework: 'webxml', filePath: 'y.java', line: 3, handler: null, notes: [] },
  ],
  batchEntries: [],
}

function baseInputs(): MinimalKgBuildInputs {
  return {
    projectRoot: '/tmp/does-not-matter',
    census,
    dbSchema,
    routes,
    gitCommit: 'abc123',
    analyzedAt: '2026-07-14T00:00:00.000Z',
    projectName: 'petstore',
  }
}

describe('buildMinimalKg — determinism', () => {
  it('동일 입력 2회 byte-identical(stableJson)', () => {
    const a = buildMinimalKg(baseInputs())
    const b = buildMinimalKg(baseInputs())
    expect(stableJson(a)).toBe(stableJson(b))
  })

  it('languages/frameworks 는 빈도 내림차순(동률은 사전식)', () => {
    const kg = buildMinimalKg(baseInputs())
    // java 2, jsp 1, sql 1, md 1, xml 1 -> java 먼저, 나머지는 사전식(md, sql, xml, jsp 순? 확인)
    expect(kg.project.languages[0]).toBe('java')
    expect(kg.project.frameworks).toEqual(['spring', 'webxml'])
  })

  it('file 노드 type 분류: java/jsp→file, xml→config, sql→schema, md→document', () => {
    const kg = buildMinimalKg(baseInputs())
    // db/schema.sql 은 file 노드(schema)와 table 노드가 filePath 를 공유하므로 file: 접두 id 로 구분.
    const byPath = new Map(kg.nodes.filter((n) => n.id.startsWith('file:')).map((n) => [n.filePath, n]))
    expect(byPath.get('src/main/java/com/petstore/AccountService.java')?.type).toBe('file')
    expect(byPath.get('web/WEB-INF/jsp/account/EditAccount.jsp')?.type).toBe('file')
    expect(byPath.get('src/main/resources/applicationContext.xml')?.type).toBe('config')
    expect(byPath.get('db/schema.sql')?.type).toBe('schema')
    expect(byPath.get('README.md')?.type).toBe('document')
  })

  it('test 경로 세그먼트가 있으면 tags=["test"]', () => {
    const kg = buildMinimalKg(baseInputs())
    const testNode = kg.nodes.find((n) => n.filePath === 'src/test/java/com/petstore/AccountServiceTest.java')
    expect(testNode?.tags).toEqual(['test'])
    const nonTest = kg.nodes.find((n) => n.filePath === 'db/schema.sql')
    expect(nonTest?.tags).toEqual([])
  })

  it('table 노드 + defines_schema 엣지(schema 파일 -> table)', () => {
    const kg = buildMinimalKg(baseInputs())
    const tableNode = kg.nodes.find((n) => n.type === 'table')
    expect(tableNode?.id).toBe('table:account')
    expect(tableNode?.filePath).toBe('db/schema.sql')
    expect(tableNode?.lineRange).toEqual([1, 3])
    expect(kg.edges).toEqual([
      { source: 'file:db/schema.sql', target: 'table:account', type: 'defines_schema', direction: 'forward', weight: 1 },
    ])
  })

  it('참조 무결성 — 모든 엣지의 source/target 이 실존 노드', () => {
    const kg = buildMinimalKg(baseInputs())
    const ids = new Set(kg.nodes.map((n) => n.id))
    for (const e of kg.edges) {
      expect(ids.has(e.source)).toBe(true)
      expect(ids.has(e.target)).toBe(true)
    }
  })

  it('routes 없으면 frameworks=[]', () => {
    const kg = buildMinimalKg({ ...baseInputs(), routes: null })
    expect(kg.project.frameworks).toEqual([])
  })

  it('ktdsStructure 마커 포함(가드용)', () => {
    const kg = buildMinimalKg(baseInputs())
    expect(kg.ktdsStructure).toEqual({ generatedFromCommit: 'abc123', minimal: true })
  })
})

describe('buildMinimalKg — 하드 시크릿 캐리어 노드화 제외(적대 리뷰 C2)', () => {
  const secretCensus: CensusReport = {
    schemaVersion: 1,
    gitCommit: 'abc123',
    fileCount: 9,
    files: [
      ...census.files,
      { relPath: '.env', lang: 'other' },
      { relPath: 'config/prod.env', lang: 'env' },
      { relPath: 'certs/server.pem', lang: 'pem' },
      { relPath: 'certs/server.key', lang: 'key' },
      { relPath: 'certs/app.jks', lang: 'jks' },
      { relPath: 'certs/client.p12', lang: 'p12' },
      { relPath: 'certs/release.keystore', lang: 'keystore' },
      { relPath: '.ssh/id_rsa', lang: 'other' },
      { relPath: '.ssh/id_rsa.pub', lang: 'pub' },
      { relPath: 'certs/client.pfx', lang: 'pfx' },
      { relPath: 'certs/server.ppk', lang: 'ppk' },
      { relPath: 'certs/ca.der', lang: 'der' },
      { relPath: 'keys/secret.gpg', lang: 'gpg' },
      // 위장/백업 우회 시도 — 리뷰어 실측 케이스(마감 라운드).
      { relPath: '.ssh/id_rsa.bak', lang: 'bak' },
      { relPath: '.ssh/id_rsa.txt', lang: 'txt' },
      { relPath: 'certs/server.key.bak', lang: 'bak' },
    ],
  }

  it('isSecretCarrierPath 가 명시된 패턴을 전부 잡고, id_rsa.pub 은 잡지 않는다', () => {
    expect(isSecretCarrierPath('.env')).toBe(true)
    expect(isSecretCarrierPath('config/prod.env')).toBe(true)
    expect(isSecretCarrierPath('certs/server.pem')).toBe(true)
    expect(isSecretCarrierPath('certs/server.key')).toBe(true)
    expect(isSecretCarrierPath('certs/app.jks')).toBe(true)
    expect(isSecretCarrierPath('certs/client.p12')).toBe(true)
    expect(isSecretCarrierPath('certs/release.keystore')).toBe(true)
    expect(isSecretCarrierPath('.ssh/id_rsa')).toBe(true)
    expect(isSecretCarrierPath('.ssh/id_rsa.pub')).toBe(false)
    expect(isSecretCarrierPath('src/main/resources/applicationContext.xml')).toBe(false)
    expect(isSecretCarrierPath('application.properties')).toBe(false)
    expect(isSecretCarrierPath('application.yml')).toBe(false)
    // 마감 라운드 추가분 — pfx/ppk/der/gpg.
    expect(isSecretCarrierPath('certs/client.pfx')).toBe(true)
    expect(isSecretCarrierPath('certs/server.ppk')).toBe(true)
    expect(isSecretCarrierPath('certs/ca.der')).toBe(true)
    expect(isSecretCarrierPath('keys/secret.gpg')).toBe(true)
    // 위장/백업 우회 시도(리뷰어 실측) — 전부 제외되어야 한다.
    expect(isSecretCarrierPath('.ssh/id_rsa.bak')).toBe(true)
    expect(isSecretCarrierPath('.ssh/id_rsa.txt')).toBe(true)
    expect(isSecretCarrierPath('certs/server.key.bak')).toBe(true)
  })

  it('buildMinimalKg 가 시크릿 캐리어를 노드화하지 않되, JSP/일반 파일·.properties/.yml 은 유지', () => {
    const kg = buildMinimalKg({ ...baseInputs(), census: secretCensus })
    const filePaths = new Set(kg.nodes.filter((n) => n.id.startsWith('file:')).map((n) => n.filePath))
    expect(filePaths.has('.env')).toBe(false)
    expect(filePaths.has('config/prod.env')).toBe(false)
    expect(filePaths.has('certs/server.pem')).toBe(false)
    expect(filePaths.has('certs/server.key')).toBe(false)
    expect(filePaths.has('certs/app.jks')).toBe(false)
    expect(filePaths.has('certs/client.p12')).toBe(false)
    expect(filePaths.has('certs/release.keystore')).toBe(false)
    expect(filePaths.has('.ssh/id_rsa')).toBe(false)
    expect(filePaths.has('certs/client.pfx')).toBe(false)
    expect(filePaths.has('certs/server.ppk')).toBe(false)
    expect(filePaths.has('certs/ca.der')).toBe(false)
    expect(filePaths.has('keys/secret.gpg')).toBe(false)
    expect(filePaths.has('.ssh/id_rsa.bak')).toBe(false)
    expect(filePaths.has('.ssh/id_rsa.txt')).toBe(false)
    expect(filePaths.has('certs/server.key.bak')).toBe(false)
    // 유지: 공개키, JSP, 일반 파일
    expect(filePaths.has('.ssh/id_rsa.pub')).toBe(true)
    expect(filePaths.has('web/WEB-INF/jsp/account/EditAccount.jsp')).toBe(true)
    expect(filePaths.has('src/main/java/com/petstore/AccountService.java')).toBe(true)
  })

  it('오탐(과대 제외) 방지 — 템플릿 접미사·최종 확장자 지배 규칙(적대 리뷰 C2 3차 라운드)', () => {
    // 템플릿/샘플 접미사 — 공유 안전 사본은 제외하지 않는다.
    expect(isSecretCarrierPath('.env.example')).toBe(false)
    expect(isSecretCarrierPath('.env.sample')).toBe(false)
    expect(isSecretCarrierPath('config/monkey.env.example')).toBe(false)
    // 최종 확장자 지배 — 마지막 확장자가 소스/문서면 중간 세그먼트에 시크릿 확장자가
    // 있어도(또는 keystore 패턴이 있어도) 제외하지 않는다.
    expect(isSecretCarrierPath('docs/api.key.md')).toBe(false)
    expect(isSecretCarrierPath('src/render.der.js')).toBe(false)
    expect(isSecretCarrierPath('src/messages.key.json')).toBe(false)
    expect(isSecretCarrierPath('docs/using.pem.tutorial.md')).toBe(false)
    expect(isSecretCarrierPath('src/main/java/com/x/keyStore.java')).toBe(false)
    expect(isSecretCarrierPath('src/main/java/com/x/KeystoreManager.java')).toBe(false)
    // 회귀 — id_ 개인키 프리픽스 룰은 확장자 무관 최우선(템플릿/최종확장자 규칙보다 우선).
    expect(isSecretCarrierPath('.ssh/id_rsa.txt')).toBe(true)
    expect(isSecretCarrierPath('.ssh/id_rsa.bak')).toBe(true)
    expect(isSecretCarrierPath('certs/server.key.bak')).toBe(true)
    expect(isSecretCarrierPath('certs/client.pfx')).toBe(true)
    expect(isSecretCarrierPath('certs/server.ppk')).toBe(true)
    expect(isSecretCarrierPath('certs/ca.der')).toBe(true)
    expect(isSecretCarrierPath('keys/secret.gpg')).toBe(true)
    expect(isSecretCarrierPath('certs/release.keystore')).toBe(true)
  })

  it('buildMinimalKg — 오탐 케이스는 노드로 유지된다', () => {
    const falsePositiveCensus: CensusReport = {
      ...secretCensus,
      files: [
        ...secretCensus.files,
        { relPath: '.env.example', lang: 'other' },
        { relPath: '.env.sample', lang: 'other' },
        { relPath: 'config/monkey.env.example', lang: 'other' },
        { relPath: 'docs/api.key.md', lang: 'md' },
        { relPath: 'src/render.der.js', lang: 'javascript' },
        { relPath: 'src/messages.key.json', lang: 'json' },
        { relPath: 'docs/using.pem.tutorial.md', lang: 'md' },
        { relPath: 'src/main/java/com/x/keyStore.java', lang: 'java' },
        { relPath: 'src/main/java/com/x/KeystoreManager.java', lang: 'java' },
      ],
    }
    const kg = buildMinimalKg({ ...baseInputs(), census: falsePositiveCensus })
    const filePaths = new Set(kg.nodes.filter((n) => n.id.startsWith('file:')).map((n) => n.filePath))
    for (const kept of [
      '.env.example',
      '.env.sample',
      'config/monkey.env.example',
      'docs/api.key.md',
      'src/render.der.js',
      'src/messages.key.json',
      'docs/using.pem.tutorial.md',
      'src/main/java/com/x/keyStore.java',
      'src/main/java/com/x/KeystoreManager.java',
    ]) {
      expect(filePaths.has(kept)).toBe(true)
    }
    // 회귀 — 기존 차단 케이스는 여전히 제외.
    for (const excluded of [
      '.env',
      'certs/server.key',
      'certs/release.keystore',
      '.ssh/id_rsa',
      '.ssh/id_rsa.bak',
      '.ssh/id_rsa.txt',
      'certs/server.key.bak',
      'certs/client.pfx',
      'certs/server.ppk',
      'certs/ca.der',
      'keys/secret.gpg',
    ]) {
      expect(filePaths.has(excluded)).toBe(false)
    }
  })
})

describe('minimal KG — 계약 스모크(실제 소비 함수 호출)', () => {
  it('listJspFilesFromGraph 가 census 의 .jsp 전부 반환', () => {
    const kg = buildMinimalKg(baseInputs())
    const jsps = listJspFilesFromGraph(kg.nodes)
    expect(jsps).toEqual(['web/WEB-INF/jsp/account/EditAccount.jsp'])
  })

  it('loadKgTableCatalog 가 실제 기록된 파일에서 table 노드를 읽어낸다', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ktds-minimal-kg-'))
    try {
      const kg = buildMinimalKg(baseInputs())
      writeMinimalKg(root, kg)
      const catalog = loadKgTableCatalog(root)
      expect(catalog).toEqual([{ name: 'account', filePath: 'db/schema.sql', startLine: 1, endLine: 3 }])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('UA core validateGraph 통과(success, fatal 없음, 노드≥1)', () => {
    const kg = buildMinimalKg(baseInputs())
    const result = validateGraph(kg)
    expect(result.success).toBe(true)
    expect(result.fatal).toBeUndefined()
    expect((result.data?.nodes.length ?? 0) >= 1).toBe(true)
    expect(result.data?.nodes.every((n) => n.complexity === 'simple')).toBe(true)
  })

  it('UA core 자동 보정을 한 건도 유발하지 않는다(정식 어휘 — 대시보드 배너 소음 0)', () => {
    // 과거엔 complexity:"low" 를 써서 COMPLEXITY_ALIASES 별칭 경로로 통과했다. 값은
    // "simple" 로 치환돼 결과가 같았지만 노드마다 auto-corrected 이슈가 1건씩 쌓여
    // 대시보드가 노드 수만큼 경고를 띄웠다(egov 11658건). 위 테스트는 치환 **결과**만
    // 보므로 이 회귀를 못 잡는다 — 보정이 일어났는지 자체를 단언한다.
    const result = validateGraph(buildMinimalKg(baseInputs()))
    expect(result.issues.filter((i) => i.level === 'auto-corrected')).toEqual([])
  })

  it('orchestrator loadProjectGraph 가 하드 throw 없이 병합 그래프를 반환', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ktds-minimal-kg-'))
    try {
      const kg = buildMinimalKg(baseInputs())
      writeMinimalKg(root, kg)
      const merged = await loadProjectGraph(root)
      expect(merged.nodes.length).toBe(kg.nodes.length)
      expect(merged.project.gitCommitHash).toBe('abc123')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('writeMinimalKg — 기존 LLM KG 보호 가드', () => {
  let root: string
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ktds-minimal-kg-guard-'))
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('파일 없으면 기록', () => {
    const kg = buildMinimalKg(baseInputs())
    const result = writeMinimalKg(root, kg)
    expect(result.action).toBe('written')
    const raw = JSON.parse(readFileSync(result.path, 'utf8'))
    expect(raw.ktdsStructure.minimal).toBe(true)
  })

  it('기존 파일에 ktdsStructure 마커 없으면(=/understand 산출) 보존 + 경고', async () => {
    await mkdir(uaDir(root), { recursive: true })
    const llmKg = {
      version: '1.0.0',
      project: { name: 'petstore', languages: ['java'], frameworks: [], description: 'LLM 산출', analyzedAt: '2026-01-01T00:00:00.000Z', gitCommitHash: 'zzz' },
      nodes: [{ id: 'file:Foo.java', type: 'file', name: 'Foo.java', summary: 'x', tags: [], complexity: 'simple' }],
      edges: [],
      layers: [],
      tour: [],
    }
    await writeFile(join(uaDir(root), 'knowledge-graph.json'), JSON.stringify(llmKg, null, 2), 'utf8')

    const kg = buildMinimalKg(baseInputs())
    const result = writeMinimalKg(root, kg)
    expect(result.action).toBe('skipped-existing-llm-kg')
    const raw = JSON.parse(readFileSync(join(uaDir(root), 'knowledge-graph.json'), 'utf8'))
    expect(raw.project.description).toBe('LLM 산출') // 보존됨(덮어쓰지 않음)
  })

  it('--overwrite-kg 로 마커 없는 기존 파일도 교체', async () => {
    await mkdir(uaDir(root), { recursive: true })
    const llmKg = { version: '1.0.0', project: { name: 'x' }, nodes: [], edges: [], layers: [], tour: [] }
    await writeFile(join(uaDir(root), 'knowledge-graph.json'), JSON.stringify(llmKg, null, 2), 'utf8')

    const kg = buildMinimalKg(baseInputs())
    const result = writeMinimalKg(root, kg, { overwriteKg: true })
    expect(result.action).toBe('written')
    const raw = JSON.parse(readFileSync(join(uaDir(root), 'knowledge-graph.json'), 'utf8'))
    expect(raw.ktdsStructure.minimal).toBe(true)
  })

  it('기존 파일에 ktdsStructure 마커가 있으면(우리 이전 산출) 재기록', async () => {
    const kg1 = buildMinimalKg(baseInputs())
    writeMinimalKg(root, kg1)
    const kg2 = buildMinimalKg({ ...baseInputs(), analyzedAt: '2026-07-15T00:00:00.000Z' })
    const result = writeMinimalKg(root, kg2)
    expect(result.action).toBe('written')
    const raw = JSON.parse(readFileSync(join(uaDir(root), 'knowledge-graph.json'), 'utf8'))
    expect(raw.project.analyzedAt).toBe('2026-07-15T00:00:00.000Z')
  })
})

describe('loadMinimalKgInputs / emitMinimalKg — IO 래퍼', () => {
  let root: string
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ktds-minimal-kg-io-'))
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('census.json 없으면 MinimalKgInputMissingError', () => {
    expect(() => loadMinimalKgInputs(root)).toThrow(MinimalKgInputMissingError)
  })

  it('census+db-schema 있으면 로드 성공, routes 없으면 null', () => {
    writeCensus(root, census)
    writeDbSchema(root, dbSchema)
    const inputs = loadMinimalKgInputs(root)
    expect(inputs.census.fileCount).toBe(5)
    expect(inputs.dbSchema.tables.length).toBe(1)
    expect(inputs.routes).toBeNull()
  })

  it('emitMinimalKg 가 scan 산출물로부터 knowledge-graph.json 을 기록한다', () => {
    writeCensus(root, census)
    writeDbSchema(root, dbSchema)
    const result = emitMinimalKg(root, { analyzedAt: '2026-07-14T00:00:00.000Z' })
    expect(result.action).toBe('written')
    const raw = JSON.parse(readFileSync(result.path, 'utf8'))
    expect(raw.ktdsStructure.minimal).toBe(true)
    expect(raw.nodes.length).toBe(census.files.length + dbSchema.tables.length)
  })
})

describe('analyzedAt 결정론 센티널(적대 리뷰 C1) — now() 폴백 제거 확인', () => {
  let root: string
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ktds-minimal-kg-c1-'))
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('비-git 프로젝트(gitCommit=null) — analyzedAt 은 센티널, 재실행 byte-identical', () => {
    const nonGitCensus: CensusReport = { ...census, gitCommit: null }
    writeCensus(root, nonGitCensus)
    writeDbSchema(root, dbSchema)

    const r1 = emitMinimalKg(root)
    const raw1 = readFileSync(r1.path, 'utf8')
    const parsed1 = JSON.parse(raw1)
    expect(parsed1.project.analyzedAt).toBe(ANALYZED_AT_SENTINEL)

    // 재실행(overwriteKg 로 마커 재기록) — now() 였다면 두 번째 실행 시각이 달라 byte-diff 가 났을 것.
    const r2 = emitMinimalKg(root, { overwriteKg: true })
    const raw2 = readFileSync(r2.path, 'utf8')
    expect(raw2).toBe(raw1)
  })

  it('gitCommit 은 있으나 저장소 히스토리에 없음(P1: 사라진 커밋) — now() 대신 센티널로 폴백', () => {
    // 진짜 git 저장소를 만들되, census.gitCommit 은 그 저장소에 존재하지 않는 가짜 SHA —
    // "비-git" 과는 다른 실패 모드(저장소는 있으나 해당 커밋 조회 실패)를 별도로 검증한다.
    execFileSync('git', ['init', '-q'], { cwd: root })
    execFileSync('git', ['-c', 'user.email=t@t.com', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init'], {
      cwd: root,
    })
    const bogusCommit = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef'
    writeCensus(root, { ...census, gitCommit: bogusCommit })
    writeDbSchema(root, dbSchema)

    const result = emitMinimalKg(root)
    const raw = JSON.parse(readFileSync(result.path, 'utf8'))
    expect(raw.project.analyzedAt).toBe(ANALYZED_AT_SENTINEL)
    expect(raw.project.gitCommitHash).toBe(bogusCommit) // gitCommitHash 필드 자체는 그대로 보존
  })
})

describe('writeMinimalKg — 대상이 디렉터리(적대 리뷰 P2) — 크래시 없이 표면화', () => {
  let root: string
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ktds-minimal-kg-p2-'))
    mkdirSync(join(uaDir(root), 'knowledge-graph.json'), { recursive: true })
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('overwriteKg 없이 — skipped-invalid-target, 크래시 없음', () => {
    const kg = buildMinimalKg(baseInputs())
    expect(() => writeMinimalKg(root, kg)).not.toThrow()
    const result = writeMinimalKg(root, kg)
    expect(result.action).toBe('skipped-invalid-target')
  })

  it('--overwrite-kg 를 줘도 — EISDIR 크래시 없이 skipped-invalid-target', () => {
    const kg = buildMinimalKg(baseInputs())
    expect(() => writeMinimalKg(root, kg, { overwriteKg: true })).not.toThrow()
    const result = writeMinimalKg(root, kg, { overwriteKg: true })
    expect(result.action).toBe('skipped-invalid-target')
  })
})
