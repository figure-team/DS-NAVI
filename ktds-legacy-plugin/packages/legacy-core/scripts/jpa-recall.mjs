#!/usr/bin/env node
/**
 * JPA 추출 반증 게이트(P6.0) — 수동 작성 오라클(petclinic.expected.json)에 대해
 * extractJpaModel 의 산출을 검증한다.
 *
 * 사용법:
 *   node jpa-recall.mjs <projectRoot> <expected.json> [--json]
 *
 * 동작:
 *   - buildCensus(projectRoot) -> extractJpaModel(projectRoot, census) (빌드된 dist).
 *   - 엔티티별: table/tableExplicit, 각 컬럼의 columnName 매핑, implicitColumns 가
 *     confidence=INFERRED + explicit=false, 관계(kind/target/joinColumn) 일치.
 *   - 리포지토리별: entityType/idType/baseInterface, 파생쿼리 컬럼, JPQL 쿼리=CONFIRMED,
 *     native 쿼리=UNVERIFIED.
 *   - 공존(AC-16b): coexist.notJpa 클래스가 repositories[] 에 없어야 함.
 *   - 결정론: 집합/값 비교만(순서 무관). 어떤 불일치라도 있으면 exit 1.
 *
 * 결정론: 타임스탬프 미사용, set/value 비교만.
 */
import { readFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { buildCensus, extractJpaModel } from '../dist/index.js'

function parseArgs(argv) {
  const positional = []
  let json = false
  for (const a of argv) {
    if (a === '--json') json = true
    else positional.push(a)
  }
  return { positional, json }
}

function abs(p) {
  return isAbsolute(p) ? p : resolve(process.cwd(), p)
}

function eqSet(a, b) {
  if (a.size !== b.size) return false
  for (const v of a) if (!b.has(v)) return false
  return true
}

async function main() {
  const { positional, json } = parseArgs(process.argv.slice(2))
  if (positional.length < 2) {
    console.error('usage: node jpa-recall.mjs <projectRoot> <expected.json> [--json]')
    process.exit(2)
  }
  const projectRoot = abs(positional[0])
  const oraclePath = abs(positional[1])
  const oracle = JSON.parse(readFileSync(oraclePath, 'utf8'))

  const census = buildCensus(projectRoot)
  const model = await extractJpaModel(projectRoot, census)

  const entByName = new Map(model.entities.map((e) => [e.className, e]))
  const repoByName = new Map(model.repositories.map((r) => [r.className, r]))

  const checks = [] // { ok, label, detail }
  const pass = (label) => checks.push({ ok: true, label, detail: '' })
  const fail = (label, detail) => checks.push({ ok: false, label, detail })

  const entitySummaries = []
  for (const oe of oracle.entities ?? []) {
    const e = entByName.get(oe.className)
    if (!e) {
      fail(`entity ${oe.className}`, '추출 산출에 없음')
      entitySummaries.push({ className: oe.className, present: false })
      continue
    }
    // table + explicit
    if (e.tableName === oe.table) pass(`${oe.className}.table`)
    else fail(`${oe.className}.table`, `expected=${oe.table} actual=${e.tableName}`)
    if (e.tableExplicit === oe.tableExplicit) pass(`${oe.className}.tableExplicit`)
    else fail(`${oe.className}.tableExplicit`, `expected=${oe.tableExplicit} actual=${e.tableExplicit}`)
    const wantTableConf = oe.tableExplicit ? 'CONFIRMED' : 'INFERRED'
    if (e.tableConfidence === wantTableConf) pass(`${oe.className}.tableConfidence`)
    else fail(`${oe.className}.tableConfidence`, `expected=${wantTableConf} actual=${e.tableConfidence}`)
    // idField
    if (oe.idField !== undefined) {
      if (e.idField === oe.idField) pass(`${oe.className}.idField`)
      else fail(`${oe.className}.idField`, `expected=${oe.idField} actual=${e.idField}`)
    }
    // columns (value mapping)
    const colByField = new Map(e.columns.map((c) => [c.fieldName, c]))
    const implicit = new Set(oe.implicitColumns ?? [])
    for (const [field, expectedCol] of Object.entries(oe.columns ?? {})) {
      const c = colByField.get(field)
      if (!c) {
        fail(`${oe.className}.column.${field}`, '컬럼 없음')
        continue
      }
      if (c.columnName === expectedCol) pass(`${oe.className}.column.${field}=${expectedCol}`)
      else fail(`${oe.className}.column.${field}`, `expected=${expectedCol} actual=${c.columnName}`)
      // implicit ↔ confidence/explicit
      const wantImplicit = implicit.has(field)
      const wantExplicit = !wantImplicit
      const wantConf = wantImplicit ? 'INFERRED' : 'CONFIRMED'
      if (c.explicit === wantExplicit && c.confidence === wantConf) {
        pass(`${oe.className}.column.${field}.tier`)
      } else {
        fail(
          `${oe.className}.column.${field}.tier`,
          `expected explicit=${wantExplicit}/${wantConf} actual explicit=${c.explicit}/${c.confidence}`,
        )
      }
    }
    // relations (set of kind|target|joinColumn keyed by field)
    const relByField = new Map(e.relations.map((r) => [r.fieldName, r]))
    for (const orel of oe.relations ?? []) {
      const r = relByField.get(orel.field)
      if (!r) {
        fail(`${oe.className}.relation.${orel.field}`, '관계 없음')
        continue
      }
      const ok = r.kind === orel.kind && r.targetType === orel.target && r.joinColumn === orel.joinColumn
      if (ok && r.confidence === 'INFERRED') pass(`${oe.className}.relation.${orel.field}`)
      else {
        fail(
          `${oe.className}.relation.${orel.field}`,
          `expected kind=${orel.kind} target=${orel.target} join=${orel.joinColumn}/INFERRED ` +
            `actual kind=${r.kind} target=${r.targetType} join=${r.joinColumn}/${r.confidence}`,
        )
      }
    }
    entitySummaries.push({
      className: oe.className,
      present: true,
      table: e.tableName,
      tableExplicit: e.tableExplicit,
      columns: e.columns.length,
      relations: e.relations.length,
    })
  }

  const repoSummaries = []
  for (const orepo of oracle.repositories ?? []) {
    const r = repoByName.get(orepo.className)
    if (!r) {
      fail(`repository ${orepo.className}`, '추출 산출에 없음')
      repoSummaries.push({ className: orepo.className, present: false })
      continue
    }
    if (orepo.entity !== undefined) {
      if (r.entityType === orepo.entity) pass(`${orepo.className}.entityType`)
      else fail(`${orepo.className}.entityType`, `expected=${orepo.entity} actual=${r.entityType}`)
    }
    if (orepo.id !== undefined) {
      if (r.idType === orepo.id) pass(`${orepo.className}.idType`)
      else fail(`${orepo.className}.idType`, `expected=${orepo.id} actual=${r.idType}`)
    }
    if (orepo.baseInterface !== undefined) {
      if (r.baseInterface === orepo.baseInterface) pass(`${orepo.className}.baseInterface`)
      else fail(`${orepo.className}.baseInterface`, `expected=${orepo.baseInterface} actual=${r.baseInterface}`)
    }
    // derived queries → columns (set compare per method)
    const derivedByMethod = new Map(r.derivedQueries.map((d) => [d.method, d]))
    for (const [method, cols] of Object.entries(orepo.derived ?? {})) {
      const d = derivedByMethod.get(method)
      if (!d) {
        fail(`${orepo.className}.derived.${method}`, '파생쿼리 없음')
        continue
      }
      if (eqSet(new Set(d.columns), new Set(cols)) && d.confidence === 'INFERRED') pass(`${orepo.className}.derived.${method}`)
      else
        fail(
          `${orepo.className}.derived.${method}`,
          `expected cols=[${cols}]/INFERRED actual cols=[${d.columns}]/${d.confidence}`,
        )
    }
    // jpql queries (confidence CONFIRMED, native=false)
    const queryByMethod = new Map(r.queries.map((q) => [q.method, q]))
    for (const method of orepo.jpql ?? []) {
      const q = queryByMethod.get(method)
      if (q && q.native === false && q.confidence === 'CONFIRMED') pass(`${orepo.className}.jpql.${method}`)
      else fail(`${orepo.className}.jpql.${method}`, q ? `native=${q.native} conf=${q.confidence}` : '쿼리 없음')
    }
    // native queries (confidence UNVERIFIED, native=true)
    for (const method of orepo.native ?? []) {
      const q = queryByMethod.get(method)
      if (q && q.native === true && q.confidence === 'UNVERIFIED') pass(`${orepo.className}.native.${method}`)
      else fail(`${orepo.className}.native.${method}`, q ? `native=${q.native} conf=${q.confidence}` : '쿼리 없음')
    }
    repoSummaries.push({
      className: orepo.className,
      present: true,
      entity: r.entityType,
      base: r.baseInterface,
      derived: r.derivedQueries.length,
      queries: r.queries.length,
    })
  }

  // Tier C: every method in tierC must be flagged native + UNVERIFIED somewhere.
  const nativeMethods = new Set()
  for (const r of model.repositories) for (const q of r.queries) if (q.native && q.confidence === 'UNVERIFIED') nativeMethods.add(q.method)
  for (const m of oracle.tierC ?? []) {
    if (nativeMethods.has(m)) pass(`tierC.${m}`)
    else fail(`tierC.${m}`, 'native/UNVERIFIED 쿼리로 표시되지 않음')
  }

  // Coexistence (AC-16b): notJpa classes must NOT be repositories.
  const repoNames = new Set(model.repositories.map((r) => r.className))
  for (const cls of oracle.coexist?.notJpa ?? []) {
    if (!repoNames.has(cls)) pass(`coexist.notJpa.${cls}`)
    else fail(`coexist.notJpa.${cls}`, 'JPA repository 로 잘못 추출됨')
  }
  for (const cls of oracle.coexist?.jpaRepositories ?? []) {
    if (repoNames.has(cls)) pass(`coexist.jpa.${cls}`)
    else fail(`coexist.jpa.${cls}`, 'JPA repository 로 추출되지 않음')
  }

  const failed = checks.filter((c) => !c.ok)
  const total = checks.length
  const passed = total - failed.length

  if (json) {
    console.log(
      JSON.stringify(
        {
          project: oracle.project ?? null,
          total,
          passed,
          failed: failed.length,
          failures: failed.map((c) => ({ check: c.label, detail: c.detail })),
          entities: entitySummaries,
          repositories: repoSummaries,
          knownGaps: oracle.knownGaps ?? [],
        },
        null,
        2,
      ),
    )
  } else {
    console.log(`jpa-recall: project=${oracle.project ?? '(unknown)'}`)
    console.log(`  entities (${entitySummaries.length}):`)
    for (const e of entitySummaries) {
      if (!e.present) console.log(`    MISSING  ${e.className}`)
      else
        console.log(
          `    ${e.className.padEnd(12)} table=${e.table} explicit=${e.tableExplicit} cols=${e.columns} rels=${e.relations}`,
        )
    }
    console.log(`  repositories (${repoSummaries.length}):`)
    for (const r of repoSummaries) {
      if (!r.present) console.log(`    MISSING  ${r.className}`)
      else
        console.log(
          `    ${r.className.padEnd(16)} entity=${r.entity} base=${r.base} derived=${r.derived} queries=${r.queries}`,
        )
    }
    console.log(`  ------`)
    console.log(`  ${passed}/${total} checks passed`)
    for (const c of failed) console.log(`    FAIL: ${c.label} — ${c.detail}`)
  }

  if (failed.length > 0) {
    if (!json) console.error(`FAIL: ${failed.length} oracle assertion(s) mismatched`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(2)
})
