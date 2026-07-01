#!/usr/bin/env node
/**
 * perf-measure.mjs — /understand-* 명령 성능 계측기 (토큰 총량 + 소요 시간).
 *
 * Claude Code 세션 transcript(JSONL)의 assistant 메시지 `usage` 필드와 timestamp를
 * 파싱해, 한 번의 `/understand-*` 실행 구간에 대한 토큰/시간을 결정론으로 집계한다.
 * LLM 토큰 비용은 이미 transcript에 전량 기록되므로 새 인프라 없이 파싱만으로 나온다.
 * 서브에이전트(sidechain) 메시지도 포함해 합산한다.
 *
 * 모드:
 *   start   UserPromptSubmit 훅에서 호출. stdin(JSON)의 prompt가 `/understand-*` 를
 *           호출하면 실행 마커(.spec/perf/active-run.json)를 새로 연다.
 *   stop    Stop 훅에서 호출. 열린 마커가 있으면 마커 startTs 이후의 usage/시간을
 *           재집계해 .spec/perf/runs.jsonl(runId 기준 덮어쓰기) + latest.md 로 기록한다.
 *   report  <transcript.jsonl> [--since <iso>] [--until <iso>] [--command <name>]
 *           수동/사후 분석. 지정 구간(기본: 파일 전체)의 집계를 stdout으로 출력한다.
 *
 * 실행 구간(run window) 규칙:
 *   한 `/understand-*` 프롬프트부터 다음 `/understand-*` 프롬프트(또는 세션 종료)까지의
 *   모든 턴을 그 실행에 귀속한다. 중간의 사람 게이트(confirm) 응답 턴도 자연히 누적된다.
 *   깔끔한 단발 벤치마크는 명령을 독립 턴으로 실행하면 window == 해당 턴 하나가 된다.
 *
 * 시간 지표:
 *   wallSeconds   : 구간 첫 메시지 ~ 마지막 메시지 (사람 대기 시간 포함)
 *   activeSeconds : wall 에서 IDLE_GAP(기본 60s) 초과 유휴 구간을 제외한 근사 실작업 시간
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const IDLE_GAP_SECONDS = 60
const PERF_DIR = join(process.cwd(), '.spec', 'perf')
const MARKER_PATH = join(PERF_DIR, 'active-run.json')
const RUNS_PATH = join(PERF_DIR, 'runs.jsonl')
const LATEST_MD = join(PERF_DIR, 'latest.md')

/** `/understand-map ...` 형태의 프롬프트에서 명령명(understand-map)을 뽑는다. 아니면 null. */
function parseUnderstandCommand(prompt) {
  if (typeof prompt !== 'string') return null
  const m = prompt.trim().match(/^\/(understand[\w-]*)/)
  return m ? m[1] : null
}

/** stdin(JSON) 전체를 동기로 읽는다. 훅은 stdin 으로 이벤트 페이로드를 준다. */
function readStdinJson() {
  try {
    const raw = readFileSync(0, 'utf8')
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function ensurePerfDir() {
  if (!existsSync(PERF_DIR)) mkdirSync(PERF_DIR, { recursive: true })
}

/** ISO timestamp → epoch ms (실패 시 NaN). */
function ts(v) {
  const t = Date.parse(v)
  return Number.isNaN(t) ? NaN : t
}

/**
 * 메인 transcript 경로에서 집계 대상 파일 목록을 만든다.
 * 서브에이전트 토큰은 인라인이 아니라 `<sessionId>/subagents/agent-*.jsonl` 별도 파일에
 * 저장되므로(신형 Claude Code), 형제 subagents 디렉터리를 함께 수집한다.
 * 각 subagent 파일의 라벨은 동명 `.meta.json` 의 agentType 로 잡는다.
 * @returns {{path:string,label:string,isSub:boolean}[]}
 */
function resolveTranscriptFiles(mainPath) {
  const files = []
  if (mainPath && existsSync(mainPath)) files.push({ path: mainPath, label: 'main', isSub: false })
  if (!mainPath) return files
  const sessDir = mainPath.replace(/\.jsonl$/, '')
  const subDir = join(sessDir, 'subagents')
  if (existsSync(subDir)) {
    for (const name of readdirSync(subDir)) {
      if (!name.endsWith('.jsonl')) continue
      let label = 'subagent'
      const metaPath = join(subDir, name.replace(/\.jsonl$/, '.meta.json'))
      if (existsSync(metaPath)) {
        try {
          label = JSON.parse(readFileSync(metaPath, 'utf8')).agentType || label
        } catch {
          /* meta 없거나 깨지면 기본 라벨 */
        }
      }
      files.push({ path: join(subDir, name), label, isSub: true })
    }
  }
  return files
}

/**
 * transcript 파일들을 순회하며 [sinceMs, untilMs] 구간의 usage/시간을 집계한다.
 * assistant 메시지의 message.usage 만 토큰으로 계상하며, 별도 파일로 저장된
 * 서브에이전트 메시지도 포함한다. byAgent 에 라벨별 토큰/메시지수를 누적한다.
 */
function aggregate(files, sinceMs = -Infinity, untilMs = Infinity) {
  const acc = {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    assistantMessages: 0,
    subagentMessages: 0,
    models: {},
    byAgent: {},
    firstTs: null,
    lastTs: null,
    // 유휴 제외용: 계상 대상 메시지들의 정렬된 timestamp
    _stamps: [],
  }
  for (const { path, label, isSub } of files) {
    if (!existsSync(path)) continue
    const lines = readFileSync(path, 'utf8').split('\n')
    for (const line of lines) {
      if (!line) continue
      let rec
      try {
        rec = JSON.parse(line)
      } catch {
        continue
      }
      if (rec.type !== 'assistant') continue
      const t = ts(rec.timestamp)
      if (Number.isNaN(t) || t < sinceMs || t > untilMs) continue
      const u = rec.message?.usage
      if (!u) continue

      const msgTotal =
        (u.input_tokens || 0) +
        (u.output_tokens || 0) +
        (u.cache_creation_input_tokens || 0) +
        (u.cache_read_input_tokens || 0)
      acc.input_tokens += u.input_tokens || 0
      acc.output_tokens += u.output_tokens || 0
      acc.cache_creation_input_tokens += u.cache_creation_input_tokens || 0
      acc.cache_read_input_tokens += u.cache_read_input_tokens || 0
      acc.assistantMessages += 1
      if (isSub || rec.isSidechain) acc.subagentMessages += 1
      const model = rec.message?.model
      if (model) acc.models[model] = (acc.models[model] || 0) + 1

      const a = (acc.byAgent[label] = acc.byAgent[label] || { total: 0, messages: 0 })
      a.total += msgTotal
      a.messages += 1

      acc._stamps.push(t)
      if (acc.firstTs === null || t < acc.firstTs) acc.firstTs = t
      if (acc.lastTs === null || t > acc.lastTs) acc.lastTs = t
    }
  }
  return acc
}

/** 집계 결과 → 파생 지표(총 토큰, wall/active 시간)를 붙인 요약 객체. */
function summarize(acc, command, startTsMs) {
  const total =
    acc.input_tokens +
    acc.output_tokens +
    acc.cache_creation_input_tokens +
    acc.cache_read_input_tokens
  // 유휴 제외: startTs(있으면) ~ 각 메시지 timestamp 순으로 gap 계산
  const stamps = [...acc._stamps].sort((a, b) => a - b)
  const anchor = Number.isFinite(startTsMs) ? startTsMs : acc.firstTs
  let wallMs = 0
  let activeMs = 0
  if (anchor != null && acc.lastTs != null) {
    wallMs = acc.lastTs - anchor
    let prev = anchor
    let idle = 0
    for (const s of stamps) {
      const gap = s - prev
      if (gap > IDLE_GAP_SECONDS * 1000) idle += gap
      prev = s
    }
    activeMs = Math.max(0, wallMs - idle)
  }
  return {
    command: command || null,
    tokens: {
      input: acc.input_tokens,
      output: acc.output_tokens,
      cacheCreation: acc.cache_creation_input_tokens,
      cacheRead: acc.cache_read_input_tokens,
      total,
    },
    time: {
      wallSeconds: Math.round(wallMs / 100) / 10,
      activeSeconds: Math.round(activeMs / 100) / 10,
    },
    counts: {
      assistantMessages: acc.assistantMessages,
      subagentMessages: acc.subagentMessages,
    },
    byAgent: acc.byAgent,
    models: acc.models,
    startTs: Number.isFinite(anchor) ? new Date(anchor).toISOString() : null,
    endTs: acc.lastTs != null ? new Date(acc.lastTs).toISOString() : null,
  }
}

function fmt(n) {
  return n.toLocaleString('en-US')
}

/** 사람이 읽는 리포트 텍스트. */
function renderText(s, runId) {
  const L = []
  L.push(`━━ 성능 계측: /${s.command ?? '(unknown)'} ━━`)
  if (runId) L.push(`runId       : ${runId}`)
  L.push(`구간        : ${s.startTs ?? '?'} → ${s.endTs ?? '?'}`)
  L.push(`소요 시간   : wall ${s.time.wallSeconds}s / active ${s.time.activeSeconds}s (유휴 제외)`)
  L.push(`총 토큰     : ${fmt(s.tokens.total)}`)
  L.push(`  ├ input          : ${fmt(s.tokens.input)}`)
  L.push(`  ├ output         : ${fmt(s.tokens.output)}`)
  L.push(`  ├ cache creation : ${fmt(s.tokens.cacheCreation)}`)
  L.push(`  └ cache read     : ${fmt(s.tokens.cacheRead)}`)
  L.push(
    `메시지      : assistant ${s.counts.assistantMessages} (서브에이전트 ${s.counts.subagentMessages})`,
  )
  const models = Object.keys(s.models)
  if (models.length) L.push(`모델        : ${models.map((m) => `${m}×${s.models[m]}`).join(', ')}`)
  const agents = Object.entries(s.byAgent || {}).sort((a, b) => b[1].total - a[1].total)
  if (agents.length > 1) {
    L.push('에이전트별 토큰:')
    for (const [label, v] of agents) {
      L.push(`  ${label.padEnd(38)} ${fmt(v.total).padStart(14)}  (msg ${v.messages})`)
    }
  }
  return L.join('\n')
}

// ── 모드 디스패치 ──────────────────────────────────────────────────────────
const mode = process.argv[2]

if (mode === 'start') {
  const evt = readStdinJson()
  const command = parseUnderstandCommand(evt.prompt)
  if (!command) process.exit(0) // /understand-* 아니면 아무것도 안 함
  ensurePerfDir()
  const marker = {
    runId: `${new Date().toISOString().replace(/[:.]/g, '-')}__${command}`,
    command,
    startTs: new Date().toISOString(),
    sessionId: evt.session_id || null,
    transcriptPath: evt.transcript_path || null,
    cwd: evt.cwd || process.cwd(),
  }
  writeFileSync(MARKER_PATH, JSON.stringify(marker, null, 2))
  process.exit(0)
}

if (mode === 'stop') {
  const evt = readStdinJson()
  if (!existsSync(MARKER_PATH)) process.exit(0)
  let marker
  try {
    marker = JSON.parse(readFileSync(MARKER_PATH, 'utf8'))
  } catch {
    process.exit(0)
  }
  const transcriptPath = evt.transcript_path || marker.transcriptPath
  const startTsMs = ts(marker.startTs)
  const acc = aggregate(resolveTranscriptFiles(transcriptPath), startTsMs)
  if (acc.assistantMessages === 0) process.exit(0) // 아직 집계할 게 없음
  const s = summarize(acc, marker.command, startTsMs)
  const record = { runId: marker.runId, sessionId: marker.sessionId, ...s }

  ensurePerfDir()
  // runs.jsonl: 같은 runId 는 최신 것으로 덮어쓴다(멱등).
  let existing = []
  if (existsSync(RUNS_PATH)) {
    existing = readFileSync(RUNS_PATH, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l)
        } catch {
          return null
        }
      })
      .filter(Boolean)
      .filter((r) => r.runId !== marker.runId)
  }
  existing.push(record)
  writeFileSync(RUNS_PATH, existing.map((r) => JSON.stringify(r)).join('\n') + '\n')
  writeFileSync(LATEST_MD, '```\n' + renderText(s, marker.runId) + '\n```\n')
  process.exit(0)
}

if (mode === 'report') {
  const transcriptPath = process.argv[3]
  if (!transcriptPath) {
    console.error('사용법: perf-measure.mjs report <transcript.jsonl> [--since <iso>] [--until <iso>] [--command <name>]')
    process.exit(2)
  }
  const args = process.argv.slice(4)
  const getFlag = (name) => {
    const i = args.indexOf(name)
    return i >= 0 ? args[i + 1] : undefined
  }
  const sinceMs = getFlag('--since') ? ts(getFlag('--since')) : -Infinity
  const untilMs = getFlag('--until') ? ts(getFlag('--until')) : Infinity
  const command = getFlag('--command')
  const acc = aggregate(resolveTranscriptFiles(transcriptPath), sinceMs, untilMs)
  const s = summarize(acc, command, Number.isFinite(sinceMs) ? sinceMs : undefined)
  if (args.includes('--json')) {
    console.log(JSON.stringify(s, null, 2))
  } else {
    console.log(renderText(s, null))
  }
  process.exit(0)
}

console.error('알 수 없는 모드. 사용: perf-measure.mjs <start|stop|report> ...')
process.exit(2)
