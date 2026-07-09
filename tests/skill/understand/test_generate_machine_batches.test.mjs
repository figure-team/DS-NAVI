import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = resolve(__dirname, '../../../understand-anything-plugin/skills/understand');
const AGENT_DEF = resolve(__dirname, '../../../understand-anything-plugin/agents/file-analyzer.md');

function run(script, args) {
  return spawnSync('node', [join(SKILL_DIR, script), ...args], { encoding: 'utf-8' });
}

describe('generate-machine-batches.mjs — deterministic machine-tier output', () => {
  let root;
  let intermediate;
  let batchesDoc;
  let machineBatches;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'ua-gmb-'));
    intermediate = join(root, '.understand-anything', 'intermediate');
    mkdirSync(intermediate, { recursive: true });

    // Real files on disk (ghost.html is listed in scan but intentionally absent)
    mkdirSync(join(root, 'pages'), { recursive: true });
    mkdirSync(join(root, 'docs'), { recursive: true });
    mkdirSync(join(root, 'data'), { recursive: true });
    mkdirSync(join(root, 'src'), { recursive: true });
    mkdirSync(join(root, 'conf'), { recursive: true });
    writeFileSync(join(root, 'pages', 'index.html'),
      '<html><head><title>로그인</title></head>\n<body>\n<p>hello</p>\n</body></html>\n');
    writeFileSync(join(root, 'pages', 'about.html'),
      '<html><head></head>\n<body>about</body></html>\n');
    writeFileSync(join(root, 'docs', 'readme.md'),
      '# Guide\n\n## Install\n\ntext\n\n## Usage\n\nmore text\n');
    writeFileSync(join(root, 'data', 'users.csv'),
      'id,name,email\n1,alice,a@x.com\n2,bob,b@x.com\n');
    writeFileSync(join(root, 'src', 'app.js'), 'export function main() { return 1; }\n');
    writeFileSync(join(root, 'conf', 'app.properties'), 'key=value\n');

    const files = [
      { path: 'pages/index.html', language: 'html', sizeLines: 4, fileCategory: 'markup' },
      { path: 'pages/about.html', language: 'html', sizeLines: 2, fileCategory: 'markup' },
      { path: 'pages/ghost.html', language: 'html', sizeLines: 10, fileCategory: 'markup' },
      { path: 'docs/readme.md', language: 'markdown', sizeLines: 9, fileCategory: 'docs' },
      { path: 'data/users.csv', language: 'csv', sizeLines: 3, fileCategory: 'data' },
      { path: 'src/app.js', language: 'javascript', sizeLines: 1, fileCategory: 'code' },
      { path: 'conf/app.properties', language: 'properties', sizeLines: 1, fileCategory: 'config' },
    ];
    const importMap = Object.fromEntries(files.map(f => [f.path, []]));
    writeFileSync(join(intermediate, 'scan-result.json'), JSON.stringify({
      name: 'gmb-test', description: '', languages: ['javascript', 'html'], frameworks: [],
      files, totalFiles: files.length, filteredByIgnore: 0,
      estimatedComplexity: 'small', importMap,
    }));

    let r = run('compute-batches.mjs', [root]);
    expect(r.status).toBe(0);
    r = run('slice-batch-inputs.mjs', [root, '--skill-dir', SKILL_DIR, '--agent-def-path', AGENT_DEF, '--language-directive', '']);
    expect(r.status).toBe(0);
    r = run('generate-machine-batches.mjs', [root, '--locale', 'ko']);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).generated).toBeGreaterThan(0);

    batchesDoc = JSON.parse(readFileSync(join(intermediate, 'batches.json'), 'utf-8'));
    machineBatches = batchesDoc.batches.filter(b => b.tier === 'machine');
  });

  afterAll(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('covers every machine-eligible file across machine-tier batches', () => {
    const covered = machineBatches.flatMap(b => b.files.map(f => f.path)).sort();
    expect(covered).toEqual([
      'data/users.csv', 'docs/readme.md',
      'pages/about.html', 'pages/ghost.html', 'pages/index.html',
    ]);
  });

  it('writes fragment + sentinel for machine batches only', () => {
    for (const b of batchesDoc.batches) {
      const isMachine = b.tier === 'machine';
      expect(existsSync(join(intermediate, `batch-${b.batchIndex}.json`))).toBe(isMachine);
      expect(existsSync(join(intermediate, `batch-${b.batchIndex}.done`))).toBe(isMachine);
    }
  });

  it('emits schema-satisfying nodes with correct prefixes and ko templates', () => {
    const nodes = machineBatches.flatMap(b =>
      JSON.parse(readFileSync(join(intermediate, `batch-${b.batchIndex}.json`), 'utf-8')).nodes);
    const byId = new Map(nodes.map(n => [n.id, n]));

    for (const n of nodes) {
      expect(typeof n.summary).toBe('string');
      expect(n.summary.length).toBeGreaterThan(0);
      expect(Array.isArray(n.tags)).toBe(true);
      expect(n.tags).toContain('machine-tier');
      expect(['simple', 'moderate', 'complex']).toContain(n.complexity);
      expect(typeof n.filePath).toBe('string');
    }

    const html = byId.get('file:pages/index.html');
    expect(html.type).toBe('file');
    expect(html.summary).toContain('정적 HTML 페이지');
    expect(html.summary).toContain('제목: "로그인"');

    const ghost = byId.get('file:pages/ghost.html');
    expect(ghost.summary).toContain('읽을 수 없었습니다');

    const doc = byId.get('document:docs/readme.md');
    expect(doc.type).toBe('document');
    expect(doc.summary).toContain('문서 파일');

    const csv = byId.get('table:data/users.csv');
    expect(csv.type).toBe('table');
    expect(csv.summary).toContain('표 형식 데이터 파일');
    expect(csv.summary).toContain('id, name, email');
    expect(csv.summary).toContain('2행');
  });

  it('audit-batches marks machine batches complete and LLM batches incomplete', () => {
    const r = spawnSync('node', [join(SKILL_DIR, 'audit-batches.mjs'), intermediate], { encoding: 'utf-8' });
    expect(r.status).toBe(0);
    const audit = JSON.parse(r.stdout);
    const machineIdx = machineBatches.map(b => b.batchIndex).sort((a, b) => a - b);
    const llmIdx = batchesDoc.batches.filter(b => b.tier !== 'machine').map(b => b.batchIndex).sort((a, b) => a - b);
    expect(audit.complete.sort((a, b) => a - b)).toEqual(machineIdx);
    expect(audit.incomplete.map(p => p.batchIndex).sort((a, b) => a - b)).toEqual(llmIdx);
  });

  it('is idempotent — re-running produces byte-identical fragments', () => {
    const i = machineBatches[0].batchIndex;
    const before = readFileSync(join(intermediate, `batch-${i}.json`), 'utf-8');
    const r = run('generate-machine-batches.mjs', [root, '--locale', 'ko']);
    expect(r.status).toBe(0);
    const after = readFileSync(join(intermediate, `batch-${i}.json`), 'utf-8');
    expect(after).toBe(before);
  });
});

describe('generate-machine-batches.mjs — SQL-mapper XML machineization', () => {
  let root;
  let intermediate;
  let batchesDoc;
  let genOut;
  let allNodes;
  let allEdges;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'ua-gmb-mapper-'));
    intermediate = join(root, '.understand-anything', 'intermediate');
    mkdirSync(intermediate, { recursive: true });
    mkdirSync(join(root, 'src/main/resources/mapper'), { recursive: true });
    mkdirSync(join(root, 'src/main/java/com/acme/dao'), { recursive: true });
    mkdirSync(join(root, 'src/main/java/com/acme/mapper'), { recursive: true });
    mkdirSync(join(root, 'conf'), { recursive: true });

    // Short-alias namespace (egov style) + two DB variants
    const userMapper = (db) => `<?xml version="1.0" encoding="UTF-8"?>
<mapper namespace="UserDAO">
  <select id="selectUser">SELECT * FROM COMTNUSER WHERE ID = #{id}</select>
  <select id="selectUserList">SELECT * FROM COMTNUSER ORDER BY ID</select>
  <insert id="insertUser">INSERT INTO COMTNUSER (ID) VALUES (#{id})</insert>
</mapper>
`;
    writeFileSync(join(root, 'src/main/resources/mapper/UserDAO_SQL_mysql.xml'), userMapper('mysql'));
    writeFileSync(join(root, 'src/main/resources/mapper/UserDAO_SQL_oracle.xml'), userMapper('oracle'));
    // FQCN namespace (MyBatis 3 style)
    writeFileSync(join(root, 'src/main/resources/mapper/OrderMapper.xml'), `<?xml version="1.0"?>
<mapper namespace="com.acme.mapper.OrderMapper">
  <select id="getOrder">SELECT * FROM ORDERS WHERE ORDERID = #{id}</select>
  <update id="updateOrder">UPDATE ORDERS SET STATUS = #{s}</update>
</mapper>
`);
    writeFileSync(join(root, 'src/main/java/com/acme/dao/UserDAO.java'),
      'public class UserDAO { public int count() { return 0; } }\n');
    writeFileSync(join(root, 'src/main/java/com/acme/mapper/OrderMapper.java'),
      'public interface OrderMapper { }\n');
    // Non-mapper config XML — must stay in the LLM tier
    writeFileSync(join(root, 'conf/web.xml'),
      '<?xml version="1.0"?>\n<web-app><servlet-name>x</servlet-name></web-app>\n');

    const files = [
      { path: 'src/main/resources/mapper/UserDAO_SQL_mysql.xml', language: 'xml', sizeLines: 7, fileCategory: 'config' },
      { path: 'src/main/resources/mapper/UserDAO_SQL_oracle.xml', language: 'xml', sizeLines: 7, fileCategory: 'config' },
      { path: 'src/main/resources/mapper/OrderMapper.xml', language: 'xml', sizeLines: 6, fileCategory: 'config' },
      { path: 'src/main/java/com/acme/dao/UserDAO.java', language: 'java', sizeLines: 1, fileCategory: 'code' },
      { path: 'src/main/java/com/acme/mapper/OrderMapper.java', language: 'java', sizeLines: 1, fileCategory: 'code' },
      { path: 'conf/web.xml', language: 'xml', sizeLines: 2, fileCategory: 'config' },
    ];
    const importMap = Object.fromEntries(files.map(f => [f.path, []]));
    writeFileSync(join(intermediate, 'scan-result.json'), JSON.stringify({
      name: 'mapper-test', description: '', languages: ['java', 'xml'], frameworks: [],
      files, totalFiles: files.length, filteredByIgnore: 0,
      estimatedComplexity: 'small', importMap,
    }));

    let r = run('compute-batches.mjs', [root]);
    expect(r.status).toBe(0);
    expect(r.stderr).toMatch(/detected 3 SQL-mapper XML files/);
    r = run('slice-batch-inputs.mjs', [root, '--skill-dir', SKILL_DIR, '--agent-def-path', AGENT_DEF, '--language-directive', '']);
    expect(r.status).toBe(0);
    r = run('generate-machine-batches.mjs', [root, '--locale', 'ko']);
    expect(r.status).toBe(0);
    genOut = JSON.parse(r.stdout);

    batchesDoc = JSON.parse(readFileSync(join(intermediate, 'batches.json'), 'utf-8'));
    const machine = batchesDoc.batches.filter(b => b.tier === 'machine');
    allNodes = machine.flatMap(b => JSON.parse(readFileSync(join(intermediate, `batch-${b.batchIndex}.json`), 'utf-8')).nodes);
    allEdges = machine.flatMap(b => JSON.parse(readFileSync(join(intermediate, `batch-${b.batchIndex}.json`), 'utf-8')).edges);
  });

  afterAll(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('routes mapper XMLs to machine tier, keeps non-mapper config XML in LLM tier', () => {
    const machinePaths = batchesDoc.batches.filter(b => b.tier === 'machine')
      .flatMap(b => b.files.map(f => f.path)).sort();
    expect(machinePaths).toEqual([
      'src/main/resources/mapper/OrderMapper.xml',
      'src/main/resources/mapper/UserDAO_SQL_mysql.xml',
      'src/main/resources/mapper/UserDAO_SQL_oracle.xml',
    ]);
    const webXmlBatch = batchesDoc.batches.find(b => b.files.some(f => f.path === 'conf/web.xml'));
    expect(webXmlBatch.tier).not.toBe('machine');
  });

  it('emits deterministic mapper summaries (namespace, db, counts, tables)', () => {
    expect(genOut).toMatchObject({ mappers: 3, daoEdges: 3, variantEdges: 1 });
    const byId = new Map(allNodes.map(n => [n.id, n]));
    const mysql = byId.get('config:src/main/resources/mapper/UserDAO_SQL_mysql.xml');
    expect(mysql.type).toBe('config');
    expect(mysql.summary).toContain('UserDAO 네임스페이스의 mysql용 SQL 매퍼');
    expect(mysql.summary).toContain('쿼리 3개(select 2/insert 1)');
    expect(mysql.summary).toContain('COMTNUSER');
    expect(mysql.tags).toContain('sql-mapper');
    const order = byId.get('config:src/main/resources/mapper/OrderMapper.xml');
    expect(order.summary).toContain('com.acme.mapper.OrderMapper');
    expect(order.summary).toContain('ORDERS');
    expect(order.summary).not.toContain('용 SQL'); // no db variant suffix
  });

  it('resolves namespace → DAO edges for both FQCN and short-alias styles', () => {
    const dao = allEdges.filter(e => e.type === 'defines_schema');
    expect(dao.map(e => `${e.source} -> ${e.target}`).sort()).toEqual([
      'config:src/main/resources/mapper/OrderMapper.xml -> file:src/main/java/com/acme/mapper/OrderMapper.java',
      'config:src/main/resources/mapper/UserDAO_SQL_mysql.xml -> file:src/main/java/com/acme/dao/UserDAO.java',
      'config:src/main/resources/mapper/UserDAO_SQL_oracle.xml -> file:src/main/java/com/acme/dao/UserDAO.java',
    ].sort());
  });

  it('links DB variants of the same mapper with related edges', () => {
    const rel = allEdges.filter(e => e.type === 'related');
    expect(rel).toHaveLength(1);
    expect(rel[0].source).toBe('config:src/main/resources/mapper/UserDAO_SQL_oracle.xml');
    expect(rel[0].target).toBe('config:src/main/resources/mapper/UserDAO_SQL_mysql.xml');
  });
});
