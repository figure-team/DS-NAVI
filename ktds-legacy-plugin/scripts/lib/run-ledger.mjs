/**
 * 실행 원장(run ledger) — 엔진 실행 사실의 append-only 기록.
 *
 * 결정론 산출물(byte-diff=0 계약)에는 벽시계 시각을 박을 수 없다 — 같은 커밋 재실행이
 * 바이트 단위로 같아야 하기 때문. 그래서 "언제 무엇을 돌렸나"는 산출물 밖 이 원장에만
 * 기록한다(impact-history/ledger.json 과 같은 패턴). 대시보드 홈 「최근 활동」이 읽는다.
 *
 * 불변식: 원장 기록 실패가 본 실행을 깨뜨리지 않는다(베스트 에포트, 조용한 skip).
 */
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const LEDGER_FILE = 'run-ledger.json'
/** 원장 보존 상한 — 홈 feed 는 최신 몇 건만 쓰므로 무한 성장을 막는다. */
const MAX_ENTRIES = 100

/** 실행 시작 시각을 잡아 둔다 — 완료 시 appendRunLedger 의 startedAt 으로 넘긴다. */
export function runStartedAt() {
  return new Date().toISOString()
}

/**
 * 원장에 실행 1건을 append 한다.
 * @param {string} projectRoot
 * @param {{tool: string, action: string, startedAt?: string, summary?: string}} entry
 */
export function appendRunLedger(projectRoot, entry) {
  try {
    const dir = join(projectRoot, '.understand-anything')
    mkdirSync(dir, { recursive: true })
    const file = join(dir, LEDGER_FILE)
    let ledger = { schemaVersion: 1, entries: [] }
    if (existsSync(file)) {
      try {
        const parsed = JSON.parse(readFileSync(file, 'utf8'))
        if (parsed && Array.isArray(parsed.entries)) ledger = parsed
      } catch {
        /* 손상 원장은 새로 시작 — 기록이 본 실행보다 중요하지 않다 */
      }
    }
    let gitCommit = null
    try {
      gitCommit = execSync('git rev-parse HEAD', { cwd: projectRoot, stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim()
    } catch {
      /* git 저장소가 아니어도 원장은 유효 */
    }
    ledger.entries.push({
      tool: entry.tool,
      action: entry.action,
      startedAt: entry.startedAt ?? null,
      finishedAt: new Date().toISOString(),
      gitCommit,
      summary: entry.summary ?? null,
    })
    if (ledger.entries.length > MAX_ENTRIES) ledger.entries = ledger.entries.slice(-MAX_ENTRIES)
    writeFileSync(file, JSON.stringify(ledger, null, 2) + '\n', 'utf8')
  } catch {
    /* 원장 실패는 본 실행을 깨뜨리지 않는다 */
  }
}
