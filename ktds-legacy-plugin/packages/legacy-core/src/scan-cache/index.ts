/**
 * scan-cache(W8, P8) — 파일단위 팩트 캐시. 변경 파일만 재분석하기 위한 증분 레이어.
 *
 * 원칙(설계: docs/ktds/INCREMENTAL_SCAN_DESIGN.md):
 *   - 파일 내용의 순수 함수인 "파일단위 팩트"만 캐시한다(키 = 내용 sha256 앞 16자,
 *     incremental/computeFileFingerprints 와 동일 함수·동일 값).
 *   - 파일 간 결합(전역 인덱스·해소·정렬·조인·백분위)은 항상 재계산 — 캐시 히트 값이
 *     full 스캔의 파일단위 계산값과 동일 객체이므로 byte-diff=0 이 구조적으로 보장된다.
 *   - get 은 깊은 복사를 돌려준다: 하류 전역 단계가 결과를 변조(예: assignRouteIds)해도
 *     저장본은 항상 "추출 직후" 상태로 유지된다(캐시 파일 진동 방지).
 *   - 캐시는 성능 최적화일 뿐 산출물 형태에 관여하지 않는다: 손상·버전 불일치 →
 *     전체 재추출로 degrade(경고 1줄, 크래시 금지).
 *
 * 무효화:
 *   - 파일 해시 불일치 → 그 파일 엔트리 미스.
 *   - 섹션 salt 불일치(추출기 로직 개정·config 변화) → 섹션 통째 폐기.
 *     **규약**: 캐시되는 팩트의 형태/의미를 바꾸는 추출기 수정 시 해당 호출부 salt 를
 *     bump 할 것(각 배선 지점 주석 참조). 자동화(빌드 해시 연동)는 백로그.
 *   - finalize 시 이번 실행에서 확인(get 히트 or put)된 엔트리만 유지 + 미개방 섹션은
 *     "현재 census 에 존재하고 해시 일치" 엔트리만 이월 — 삭제 파일이 자연 프루닝된다.
 *
 * 결정론: 캐시 파일은 섹션명·relPath 정렬로 기록, 타임스탬프 없음 — 동일 commit 에서
 * 재실행해도 byte-diff=0.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CensusReport } from '../domain-map/types.js'
import { computeFileFingerprints } from '../incremental/index.js'
import type { FingerprintMap } from '../stale/index.js'

/** 캐시 파일 골격 버전 — 이 파일 구조 자체가 바뀔 때 bump. */
export const SCAN_CACHE_SCHEMA_VERSION = 1
/** 캐시 파일 경로: `<projectRoot>/.spec/cache/scan-facts.json` (파생물 — gitignore 권장). */
export const SCAN_CACHE_FILENAME = 'scan-facts.json'

interface StoredEntry {
  /** 저장 시점의 파일 내용 해시(sha256 앞 16자). */
  hash: string
  /** 파일단위 팩트(추출 직후 상태 — 전역 변조 이전). */
  value: unknown
}

interface StoredSection {
  /** 추출기 버전 salt(+ 필요 시 config 해시) — 불일치 시 섹션 폐기. */
  salt: string
  entries: Record<string, StoredEntry>
}

interface StoredCache {
  schemaVersion: number
  sections: Record<string, StoredSection>
}

/** 섹션별 재사용/재추출 통계(정직성 — scan 출력에 표기). */
export interface SectionStats {
  reused: number
  recomputed: number
}

/** 한 섹션에 대한 get/put 핸들 — get 은 깊은 복사, put 도 깊은 복사로 저장. */
export interface ScanCacheSection<T> {
  /** hash 일치 캐시값(깊은 복사) 또는 undefined(미스/불일치). */
  get(relPath: string): T | undefined
  /** 이번 실행의 추출 결과 기록(추출 직후에 호출할 것 — 전역 변조 이전 상태 저장). */
  put(relPath: string, value: T): void
}

function specCacheDir(projectRoot: string): string {
  return join(projectRoot, '.spec', 'cache')
}

/** 저장 캐시 로드 — 부재/손상/스키마 불일치는 null(경고 1줄, 크래시 금지). */
function loadStoredCache(projectRoot: string): StoredCache | null {
  const path = join(specCacheDir(projectRoot), SCAN_CACHE_FILENAME)
  if (!existsSync(path)) return null
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as StoredCache
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      parsed.schemaVersion !== SCAN_CACHE_SCHEMA_VERSION ||
      parsed.sections === null ||
      typeof parsed.sections !== 'object'
    ) {
      console.error('[scan-cache] 캐시 스키마 불일치 — 전체 재추출로 진행합니다(캐시 재구축).')
      return null
    }
    return parsed
  } catch {
    console.error('[scan-cache] 캐시 손상 — 전체 재추출로 진행합니다(캐시 재구축).')
    return null
  }
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** (섹션, relPath) 통계 키 — NUL 구분자(경로에 못 들어가는 문자, 충돌 불가). */
function statKey(section: string, relPath: string): string {
  return section + '\u0000' + relPath
}

/**
 * 스캔 1회분의 캐시 세션. scanDomainMap 이 census 직후 생성해 각 스캐너에 전달하고,
 * 스캔 말미에 finalize 로 기록한다. **전체 스캔 단위 전용** — 일부 스캐너만 도는 부분
 * 실행에 물리면 finalize 의 관측 기반 유지가 미실행 섹션을 이월 규칙(해시 일치)으로만
 * 보존하므로, 세션 생성은 scanDomainMap/buildMap 경로에 한정한다.
 */
export class ScanCacheSession {
  /** census 전 파일의 내용 해시 — 캐시 검증과 fingerprints.json 기록에 공용(1회 계산). */
  readonly fingerprints: FingerprintMap
  private readonly projectRoot: string
  private readonly prev: StoredCache | null
  /** 이번 실행에서 관측(재사용/재기록)된 섹션·엔트리. */
  private readonly next: Map<string, { salt: string; entries: Map<string, StoredEntry> }> = new Map()
  private readonly stats: Map<string, SectionStats> = new Map()
  /** get 히트로 재사용 집계된 (섹션, relPath) — 이후 put 되면 재사용을 되돌린다. */
  private readonly reusedKeys: Set<string> = new Set()
  /** put 이 일어난 (섹션, relPath) — 같은 키 중복 put 을 재추출 1회로 세기 위함. */
  private readonly putKeys: Set<string> = new Set()

  constructor(projectRoot: string, census: CensusReport, opts: { read?: boolean } = {}) {
    this.projectRoot = projectRoot
    this.fingerprints = computeFileFingerprints(projectRoot, census)
    this.prev = opts.read === false ? null : loadStoredCache(projectRoot)
  }

  /**
   * 섹션 핸들. salt 는 추출기 버전(+config 해시 등 파일 외 의존)을 인코드 —
   * 저장본과 다르면 섹션 전체 미스.
   */
  section<T>(name: string, salt: string): ScanCacheSection<T> {
    const prevSection = this.prev?.sections[name]
    const prevEntries = prevSection && prevSection.salt === salt ? prevSection.entries : {}
    let nextSection = this.next.get(name)
    if (!nextSection || nextSection.salt !== salt) {
      nextSection = { salt, entries: new Map() }
      this.next.set(name, nextSection)
    }
    const stat = this.stats.get(name) ?? { reused: 0, recomputed: 0 }
    this.stats.set(name, stat)
    const { fingerprints, putKeys, reusedKeys } = this
    const nextEntries = nextSection.entries

    return {
      get: (relPath: string): T | undefined => {
        const entry = prevEntries[relPath]
        const hash = fingerprints[relPath]
        if (!entry || hash === undefined || entry.hash !== hash) return undefined
        // 관측 이월: 히트 엔트리는 next 로 옮겨 finalize 때 살아남는다(저장본 원본 유지).
        const key = statKey(name, relPath)
        if (!nextEntries.has(relPath) && !reusedKeys.has(key)) {
          nextEntries.set(relPath, entry)
          reusedKeys.add(key)
          stat.reused++
        }
        return structuredClone(entry.value) as T
      },
      put: (relPath: string, value: T): void => {
        const hash = fingerprints[relPath]
        if (hash === undefined) return // census 밖 파일은 캐시 대상 아님.
        nextEntries.set(relPath, { hash, value: structuredClone(value) })
        const key = statKey(name, relPath)
        if (!putKeys.has(key)) {
          putKeys.add(key)
          stat.recomputed++
        }
        // get 히트 후 무효 판정(consumed-ctx 등)으로 재추출된 경우 — 재사용을 되돌린다.
        if (reusedKeys.delete(key)) stat.reused--
      },
    }
  }

  /** 섹션별·합계 통계(정직성 표기용). */
  statsSummary(): { reused: number; recomputed: number; sections: Record<string, SectionStats> } {
    const sections: Record<string, SectionStats> = {}
    let reused = 0
    let recomputed = 0
    for (const name of [...this.stats.keys()].sort(cmp)) {
      const s = this.stats.get(name)!
      sections[name] = { ...s }
      reused += s.reused
      recomputed += s.recomputed
    }
    return { reused, recomputed, sections }
  }

  /**
   * 캐시 기록(결정론: 섹션명·relPath 정렬, 타임스탬프 없음). 여러 번 호출해도 안전 —
   * 마지막 호출 시점까지의 관측 상태를 기록한다(buildMap 이 method-calls 후 재호출).
   * 이번 실행에서 열지 않은 섹션은 "현재 해시와 일치하는" 엔트리만 이월(부분 실행 보호
   * + 삭제 파일 프루닝).
   */
  finalize(): void {
    const out: StoredCache = { schemaVersion: SCAN_CACHE_SCHEMA_VERSION, sections: {} }
    const names = new Set<string>([...this.next.keys()])
    for (const name of Object.keys(this.prev?.sections ?? {})) names.add(name)
    for (const name of [...names].sort(cmp)) {
      const observed = this.next.get(name)
      const entries: Record<string, StoredEntry> = {}
      if (observed) {
        for (const rel of [...observed.entries.keys()].sort(cmp)) {
          entries[rel] = observed.entries.get(rel)!
        }
        out.sections[name] = { salt: observed.salt, entries }
      } else {
        // 미개방 섹션 이월 — 여전히 유효한(해시 일치) 엔트리만.
        const prevSection = this.prev!.sections[name]
        for (const rel of Object.keys(prevSection.entries).sort(cmp)) {
          const entry = prevSection.entries[rel]
          if (this.fingerprints[rel] !== undefined && entry.hash === this.fingerprints[rel]) {
            entries[rel] = entry
          }
        }
        if (Object.keys(entries).length > 0) {
          out.sections[name] = { salt: prevSection.salt, entries }
        }
      }
    }
    const dir = specCacheDir(this.projectRoot)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, SCAN_CACHE_FILENAME), JSON.stringify(out), 'utf8')
  }
}

/** 세션 생성 헬퍼 — read:false 는 `--no-cache`(저장본 무시, 전체 재추출 후 재구축). */
export function createScanCacheSession(
  projectRoot: string,
  census: CensusReport,
  opts: { read?: boolean } = {},
): ScanCacheSession {
  return new ScanCacheSession(projectRoot, census, opts)
}
