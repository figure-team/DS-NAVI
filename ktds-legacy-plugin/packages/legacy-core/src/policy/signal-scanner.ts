/**
 * 정책 신호 스캐너(정책서 P1) — 코드 신호(java-facts) + DB 신호(db-schema)를 병합해
 * 카테고리별 PolicySignal[](앵커) 생성. PoC 4종: glossary / data / validation / authz.
 *
 * 결정론·정직성: 신호는 (category, file, line, kind, subject) 로 정렬, Java 파싱 실패는
 * unresolved 로 격리. 값/의미 해석은 후속(P3) LLM 보강 — 여기선 앵커만 결정론으로 확보.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gitCommitHash } from '../domain-map/persist.js'
import type { CensusReport } from '../domain-map/types.js'
import { extractJavaFacts } from '../domain-map/java-facts.js'
import type { JavaFileFacts } from '../domain-map/java-facts.js'
import type { DbSchemaModel } from '../db-schema/types.js'
import { PolicySignalSetSchema } from './types.js'
import type { PolicySignal, PolicySignalSet } from './types.js'

/** Spring Security / JSR-250 권한 어노테이션(이름만, '@' 제외). */
const AUTHZ_ANNOTATIONS = new Set([
  'PreAuthorize',
  'PostAuthorize',
  'Secured',
  'RolesAllowed',
  'PreFilter',
  'PostFilter',
  'DenyAll',
  'PermitAll',
])

/** Bean Validation(JSR-303/380) 어노테이션. */
const VALIDATION_ANNOTATIONS = new Set([
  'NotNull',
  'NotBlank',
  'NotEmpty',
  'Size',
  'Min',
  'Max',
  'Pattern',
  'Email',
  'Valid',
  'Positive',
  'PositiveOrZero',
  'Negative',
  'NegativeOrZero',
  'Past',
  'PastOrPresent',
  'Future',
  'FutureOrPresent',
  'Digits',
  'DecimalMin',
  'DecimalMax',
  'AssertTrue',
  'AssertFalse',
])

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** 정책 신호 스캐너 입력(이미 추출된 모델 — 순수 함수, 테스트 용이). */
export interface PolicySignalInput {
  javaFacts: JavaFileFacts[]
  dbSchema: DbSchemaModel
  gitCommit?: string | null
}

/** 코드/DB 모델에서 정책 신호를 결정론으로 추출(순수). */
export function buildPolicySignals(
  input: PolicySignalInput,
  seedUnresolved: Array<{ ref: string; reason: string }> = [],
): PolicySignalSet {
  const signals: PolicySignal[] = []
  const unresolved = [...seedUnresolved]

  // ── DB 신호: glossary(용어) + data(제약) ──────────────────────────────────
  for (const t of input.dbSchema.tables) {
    signals.push({
      category: 'glossary',
      kind: 'table',
      subject: t.name,
      detail: t.comment ?? '(주석 없음)',
      anchor: { file: t.relPath, line: t.line },
      confidence: t.comment ? 'CONFIRMED' : 'INFERRED',
    })
    for (const c of t.columns) {
      if (c.comment) {
        signals.push({
          category: 'glossary',
          kind: 'column-comment',
          subject: `${t.name}.${c.name}`,
          detail: c.comment,
          anchor: { file: t.relPath, line: c.line },
          confidence: 'CONFIRMED',
        })
      }
      if (!c.nullable) {
        signals.push({
          category: 'data',
          kind: 'not-null',
          subject: `${t.name}.${c.name}`,
          detail: 'NOT NULL',
          anchor: { file: t.relPath, line: c.line },
          confidence: 'CONFIRMED',
        })
      }
    }
    if (t.primaryKey.length > 0) {
      signals.push({
        category: 'data',
        kind: 'primary-key',
        subject: t.name,
        detail: `PRIMARY KEY (${t.primaryKey.join(', ')})`,
        anchor: { file: t.relPath, line: t.line },
        confidence: 'CONFIRMED',
      })
    }
    for (const u of t.uniques) {
      signals.push({
        category: 'data',
        kind: 'unique',
        subject: `${t.name}(${u.join(', ')})`,
        detail: 'UNIQUE',
        anchor: { file: t.relPath, line: t.line },
        confidence: 'CONFIRMED',
      })
    }
    for (const fk of t.foreignKeys) {
      signals.push({
        category: 'data',
        kind: 'fk',
        subject: `${t.name}(${fk.columns.join(', ')})`,
        detail: `FK → ${fk.refTable}(${fk.refColumns.join(', ')})`,
        anchor: { file: t.relPath, line: fk.line },
        confidence: 'CONFIRMED',
      })
    }
    for (const ck of t.checks) {
      signals.push({
        category: 'data',
        kind: 'check',
        subject: t.name,
        detail: ck.expression,
        anchor: { file: t.relPath, line: ck.line },
        confidence: 'CONFIRMED',
      })
    }
  }

  // ── 코드 신호: glossary(enum) + validation + authz ────────────────────────
  for (const facts of input.javaFacts) {
    for (const cls of facts.classes) {
      if (cls.kind === 'enum') {
        signals.push({
          category: 'glossary',
          kind: 'enum',
          subject: cls.name,
          detail: `enum ${cls.name}`,
          anchor: { file: facts.relPath, line: cls.line },
          confidence: 'CONFIRMED',
        })
      }
      for (const anno of cls.annotations) {
        if (AUTHZ_ANNOTATIONS.has(anno)) {
          signals.push({
            category: 'authz',
            kind: 'class-authz',
            subject: cls.name,
            detail: `@${anno}`,
            anchor: { file: facts.relPath, line: cls.line },
            confidence: 'CONFIRMED',
          })
        }
      }
      for (const fld of cls.fields) {
        for (const anno of fld.annotations) {
          if (VALIDATION_ANNOTATIONS.has(anno)) {
            signals.push({
              category: 'validation',
              kind: 'bean-validation',
              subject: `${cls.name}.${fld.name}`,
              detail: `@${anno}`,
              anchor: { file: facts.relPath, line: fld.line },
              confidence: 'CONFIRMED',
            })
          }
        }
      }
      for (const m of cls.methods) {
        for (const anno of m.annotations) {
          if (AUTHZ_ANNOTATIONS.has(anno)) {
            signals.push({
              category: 'authz',
              kind: 'method-authz',
              subject: `${cls.name}#${m.name}`,
              detail: `@${anno}`,
              anchor: { file: facts.relPath, line: m.line },
              confidence: 'CONFIRMED',
            })
          }
        }
      }
    }
  }

  signals.sort(
    (a, b) =>
      cmp(a.category, b.category) ||
      cmp(a.anchor.file, b.anchor.file) ||
      (a.anchor.line ?? 0) - (b.anchor.line ?? 0) ||
      cmp(a.kind, b.kind) ||
      cmp(a.subject, b.subject),
  )
  unresolved.sort((a, b) => cmp(a.ref, b.ref) || cmp(a.reason, b.reason))

  return PolicySignalSetSchema.parse({
    schemaVersion: 1,
    gitCommit: input.gitCommit ?? null,
    signals,
    unresolved,
  })
}

/** census 의 Java 파일을 파싱해 정책 신호를 추출(IO 래퍼). */
export async function scanPolicySignals(
  projectRoot: string,
  census: CensusReport,
  dbSchema: DbSchemaModel,
): Promise<PolicySignalSet> {
  const javaFacts: JavaFileFacts[] = []
  const unresolved: Array<{ ref: string; reason: string }> = []
  for (const f of census.files) {
    if (f.lang !== 'java') continue
    let source: string
    try {
      source = readFileSync(join(projectRoot, f.relPath), 'utf8')
    } catch {
      continue
    }
    try {
      javaFacts.push(await extractJavaFacts(f.relPath, source))
    } catch (err) {
      unresolved.push({ ref: f.relPath, reason: `Java 파싱 실패: ${(err as Error).message}` })
    }
  }
  return buildPolicySignals({ javaFacts, dbSchema, gitCommit: gitCommitHash(projectRoot) }, unresolved)
}
