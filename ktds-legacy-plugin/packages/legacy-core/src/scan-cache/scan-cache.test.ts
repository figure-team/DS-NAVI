import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildCensus } from '../domain-map/census.js'
import { ScanCacheSession, SCAN_CACHE_FILENAME } from './index.js'

/** 임시 프로젝트에 파일을 깔고 census 를 만든다(캐시 키 = 내용 해시 검증용). */
function writeFile(root: string, rel: string, content: string): void {
  const abs = join(root, rel)
  mkdirSync(join(abs, '..'), { recursive: true })
  writeFileSync(abs, content, 'utf8')
}

const cachePath = (root: string) => join(root, '.spec', 'cache', SCAN_CACHE_FILENAME)

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'w8-scan-cache-'))
  writeFile(root, 'src/A.java', 'public class A { void a() {} }\n')
  writeFile(root, 'src/B.java', 'public class B { void b() {} }\n')
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('scan-cache 라운드트립·무효화', () => {
  it('put → finalize → 새 세션 get 이 동일 값(깊은 복사)을 돌려준다', () => {
    const census = buildCensus(root)
    const s1 = new ScanCacheSession(root, census)
    const sec1 = s1.section<{ n: number[] }>('t', 'v1')
    sec1.put('src/A.java', { n: [1, 2] })
    s1.finalize()
    expect(existsSync(cachePath(root))).toBe(true)

    const s2 = new ScanCacheSession(root, buildCensus(root))
    const sec2 = s2.section<{ n: number[] }>('t', 'v1')
    const got = sec2.get('src/A.java')
    expect(got).toEqual({ n: [1, 2] })
    // 깊은 복사 — 소비자가 변조해도 저장본이 오염되지 않는다(캐시 파일 진동 방지).
    got!.n.push(999)
    expect(sec2.get('src/A.java')).toEqual({ n: [1, 2] })
    // 미기록 파일은 미스.
    expect(sec2.get('src/B.java')).toBeUndefined()
  })

  it('파일 내용 변경(해시 불일치) 시 그 파일만 미스가 된다', () => {
    const s1 = new ScanCacheSession(root, buildCensus(root))
    const sec1 = s1.section<string>('t', 'v1')
    sec1.put('src/A.java', 'facts-A')
    sec1.put('src/B.java', 'facts-B')
    s1.finalize()

    writeFile(root, 'src/A.java', 'public class A { void changed() {} }\n')
    const s2 = new ScanCacheSession(root, buildCensus(root))
    const sec2 = s2.section<string>('t', 'v1')
    expect(sec2.get('src/A.java')).toBeUndefined()
    expect(sec2.get('src/B.java')).toBe('facts-B')
  })

  it('섹션 salt 불일치는 섹션 통째 미스(추출기 개정/config 변경)', () => {
    const s1 = new ScanCacheSession(root, buildCensus(root))
    s1.section<string>('t', 'v1').put('src/A.java', 'old')
    s1.finalize()

    const s2 = new ScanCacheSession(root, buildCensus(root))
    expect(s2.section<string>('t', 'v2').get('src/A.java')).toBeUndefined()
  })

  it('손상 캐시 파일은 크래시 없이 전체 미스로 degrade 한다', () => {
    mkdirSync(join(root, '.spec', 'cache'), { recursive: true })
    writeFileSync(cachePath(root), '{corrupt', 'utf8')
    const s = new ScanCacheSession(root, buildCensus(root))
    expect(s.section<string>('t', 'v1').get('src/A.java')).toBeUndefined()
  })

  it('스키마 버전 불일치도 전체 미스로 degrade 한다', () => {
    mkdirSync(join(root, '.spec', 'cache'), { recursive: true })
    writeFileSync(cachePath(root), JSON.stringify({ schemaVersion: 999, sections: {} }), 'utf8')
    const s = new ScanCacheSession(root, buildCensus(root))
    expect(s.section<string>('t', 'v1').get('src/A.java')).toBeUndefined()
  })

  it('read:false(--no-cache)는 저장본을 읽지 않되 재구축은 한다', () => {
    const s1 = new ScanCacheSession(root, buildCensus(root))
    s1.section<string>('t', 'v1').put('src/A.java', 'old')
    s1.finalize()

    const s2 = new ScanCacheSession(root, buildCensus(root), { read: false })
    const sec2 = s2.section<string>('t', 'v1')
    expect(sec2.get('src/A.java')).toBeUndefined()
    sec2.put('src/A.java', 'fresh')
    s2.finalize()

    const s3 = new ScanCacheSession(root, buildCensus(root))
    expect(s3.section<string>('t', 'v1').get('src/A.java')).toBe('fresh')
  })
})

describe('scan-cache 프루닝·이월·결정론', () => {
  it('finalize 는 이번 실행에서 관측된 엔트리만 남긴다(삭제 파일 프루닝)', () => {
    const s1 = new ScanCacheSession(root, buildCensus(root))
    const sec1 = s1.section<string>('t', 'v1')
    sec1.put('src/A.java', 'a')
    sec1.put('src/B.java', 'b')
    s1.finalize()

    rmSync(join(root, 'src/B.java'))
    const s2 = new ScanCacheSession(root, buildCensus(root))
    const sec2 = s2.section<string>('t', 'v1')
    expect(sec2.get('src/A.java')).toBe('a') // 관측(이월)
    s2.finalize()

    const stored = JSON.parse(readFileSync(cachePath(root), 'utf8'))
    expect(Object.keys(stored.sections['t'].entries)).toEqual(['src/A.java'])
  })

  it('이번 실행에서 열지 않은 섹션은 해시 일치 엔트리만 이월된다(부분 실행 보호)', () => {
    const s1 = new ScanCacheSession(root, buildCensus(root))
    s1.section<string>('other', 'v1').put('src/A.java', 'keep')
    s1.section<string>('other', 'v1').put('src/B.java', 'stale-after-edit')
    s1.finalize()

    writeFile(root, 'src/B.java', 'public class B { void changed() {} }\n')
    const s2 = new ScanCacheSession(root, buildCensus(root))
    s2.section<string>('t', 'v1').put('src/A.java', 'observed')
    s2.finalize()

    const stored = JSON.parse(readFileSync(cachePath(root), 'utf8'))
    // other 섹션: A(해시 일치)만 이월, B(변경)는 탈락.
    expect(Object.keys(stored.sections['other'].entries)).toEqual(['src/A.java'])
    expect(Object.keys(stored.sections['t'].entries)).toEqual(['src/A.java'])
  })

  it('동일 상태에서 finalize 를 두 번 해도 캐시 파일은 byte-identical', () => {
    const s1 = new ScanCacheSession(root, buildCensus(root))
    const sec = s1.section<string>('t', 'v1')
    sec.put('src/A.java', 'a')
    s1.finalize()
    const first = readFileSync(cachePath(root), 'utf8')
    s1.finalize()
    expect(readFileSync(cachePath(root), 'utf8')).toBe(first)

    // 웜 재실행(전부 get 히트)도 동일 바이트.
    const s2 = new ScanCacheSession(root, buildCensus(root))
    s2.section<string>('t', 'v1').get('src/A.java')
    s2.finalize()
    expect(readFileSync(cachePath(root), 'utf8')).toBe(first)
  })

  it('통계: get 히트=재사용, put=재추출, 히트 후 put 은 재추출로 정정된다', () => {
    const s1 = new ScanCacheSession(root, buildCensus(root))
    const sec1 = s1.section<string>('t', 'v1')
    sec1.put('src/A.java', 'a')
    sec1.put('src/B.java', 'b')
    s1.finalize()
    expect(s1.statsSummary()).toMatchObject({ reused: 0, recomputed: 2 })

    const s2 = new ScanCacheSession(root, buildCensus(root))
    const sec2 = s2.section<string>('t', 'v1')
    sec2.get('src/A.java')
    sec2.get('src/B.java')
    // B 는 히트였지만 상위 무효화(consumed-ctx 등)로 재추출됐다고 치자.
    sec2.put('src/B.java', 'b2')
    expect(s2.statsSummary()).toMatchObject({ reused: 1, recomputed: 1 })
  })

  it('census 밖 파일 put 은 무시된다(키 없는 해시)', () => {
    const s = new ScanCacheSession(root, buildCensus(root))
    const sec = s.section<string>('t', 'v1')
    sec.put('없는/파일.java', 'x')
    s.finalize()
    const stored = JSON.parse(readFileSync(cachePath(root), 'utf8'))
    expect(stored.sections['t']?.entries ?? {}).toEqual({})
  })
})
