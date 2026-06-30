/**
 * 정책서 대조(정책서 P4) — 기존 문서(PolicyItem)와 코드/DB 신호(PolicySignal)를 맞춰
 * 항목별 policyStatus(준수/미정의/문서에만)를 판정한다. "기존 문서가 있을 때" 경로.
 *
 * 결정론 reconcile 은 **커버리지**(주제 매칭)만 본다:
 *  - 준수: 문서·신호 모두 존재(category+subject 매칭).
 *  - 미정의: 신호만 있고 문서엔 없음(코드에만 — 문서 누락).
 *  - 문서에만: 문서만 있고 신호 없음(미구현 후보).
 * **위반**(값 모순)은 신호에 인자값이 없어 결정론 비교 불가 → LLM 보강(SKILL) 영역.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gitCommitHash } from '../domain-map/persist.js'
import { parseExistingPolicy } from './ingest.js'
import { ReconcileResultSchema, PolicyCategorySchema } from './types.js'
import type { PolicyCategory, PolicyItem, PolicySignal, ReconcileEntry, ReconcileResult } from './types.js'

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** 주제 정규화(매칭 키) — 백틱 제거, 공백 정리, 소문자. */
function norm(s: string): string {
  return s.replace(/`/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
}
const keyOf = (category: string, subject: string) => `${category}::${norm(subject)}`

/** 정렬 안정성용 status 우선순위(위반→미정의→문서에만→준수). */
const STATUS_RANK: Record<string, number> = { 위반: 0, 미정의: 1, 문서에만: 2, 준수: 3 }

/** 문서 항목 × 신호 → 대조 결과(순수, 결정론). */
export function reconcilePolicy(
  items: PolicyItem[],
  signals: PolicySignal[],
  gitCommit: string | null = null,
  seedUnresolved: Array<{ ref: string; reason: string }> = [],
): ReconcileResult {
  const sigByKey = new Map<string, PolicySignal[]>()
  for (const s of signals) {
    const k = keyOf(s.category, s.subject)
    const list = sigByKey.get(k) ?? []
    list.push(s)
    sigByKey.set(k, list)
  }

  const entries: ReconcileEntry[] = []
  const coveredKeys = new Set<string>()

  for (const it of items) {
    const k = keyOf(it.category, it.subject)
    const sigs = sigByKey.get(k)
    if (sigs && sigs.length > 0) {
      coveredKeys.add(k)
      entries.push({
        category: it.category,
        subject: it.subject,
        status: '준수',
        docStatement: it.statement.length > 0 ? it.statement : null,
        signalDetail: sigs[0].detail,
        anchor: sigs[0].anchor,
        note: '문서·코드 모두 존재',
      })
    } else {
      entries.push({
        category: it.category,
        subject: it.subject,
        status: '문서에만',
        docStatement: it.statement.length > 0 ? it.statement : null,
        signalDetail: null,
        anchor: null,
        note: '코드/DB 신호 없음(미구현 후보)',
      })
    }
  }

  // 문서가 안 덮은 신호 → 미정의(키 단위 1건, 같은 키 다중 신호는 첫 detail + 외 N).
  for (const [k, sigs] of [...sigByKey.entries()].sort((a, b) => cmp(a[0], b[0]))) {
    if (coveredKeys.has(k)) continue
    const first = sigs[0]
    const extra = sigs.length > 1 ? ` 외 ${sigs.length - 1}` : ''
    entries.push({
      category: first.category,
      subject: first.subject,
      status: '미정의',
      docStatement: null,
      signalDetail: `${first.detail}${extra}`,
      anchor: first.anchor,
      note: '문서에 없음(코드/DB 에만 존재)',
    })
  }

  entries.sort(
    (a, b) =>
      cmp(a.category, b.category) ||
      (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9) ||
      cmp(a.subject, b.subject),
  )

  const summary = { 준수: 0, 위반: 0, 미정의: 0, 문서에만: 0 }
  for (const e of entries) summary[e.status]++

  const unresolved = [...seedUnresolved].sort((a, b) => cmp(a.ref, b.ref) || cmp(a.reason, b.reason))
  return ReconcileResultSchema.parse({ schemaVersion: 1, gitCommit, entries, summary, unresolved })
}

/** 파일명(스템) → 카테고리. `policy-` 접두 허용. 미지원이면 null. */
function categoryOfFile(stem: string): PolicyCategory | null {
  const s = stem.replace(/^policy-/, '')
  return PolicyCategorySchema.safeParse(s).success ? (s as PolicyCategory) : null
}

/**
 * `.understand-anything/policy-input/*.md` 의 기존 정책서를 ingest·대조(IO 래퍼).
 * 입력 디렉터리가 없으면 빈 결과(대조 대상 없음 — "없을 때" 경로).
 */
export function scanPolicyReconcile(projectRoot: string, signals: PolicySignal[]): ReconcileResult {
  const dir = join(projectRoot, '.understand-anything', 'policy-input')
  const items: PolicyItem[] = []
  const unresolved: Array<{ ref: string; reason: string }> = []
  if (existsSync(dir)) {
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .sort()
    for (const f of files) {
      const stem = f.replace(/\.md$/, '')
      const category = categoryOfFile(stem)
      if (!category) {
        unresolved.push({ ref: f, reason: '파일명→카테고리 미매핑(policy-input/<카테고리>.md)' })
        continue
      }
      try {
        items.push(...parseExistingPolicy(readFileSync(join(dir, f), 'utf8'), category))
      } catch (err) {
        unresolved.push({ ref: f, reason: `ingest 실패: ${(err as Error).message}` })
      }
    }
  }
  return reconcilePolicy(items, signals, gitCommitHash(projectRoot), unresolved)
}
