import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanDomainMap } from '../domain-map/extract.js'

/**
 * W8 증분 스캔 e2e — 합성 스프링 미니 프로젝트에서 AC-2(byte-diff=0)를 회귀 고정한다.
 *
 * 핵심 시나리오: 상수 정의 파일(Const.java)의 값 변경이 그 상수를 소비하는 **다른**
 * 파일(AController.java, 내용 무변경)의 라우트에 전파돼야 한다 — consumed-ctx 무효화.
 * 전역 ctxHash 방식이면 무관 파일까지 재추출되고, 무효화가 없으면 낡은 라우트가 남는다.
 */
function writeFile(root: string, rel: string, content: string): void {
  const abs = join(root, rel)
  mkdirSync(join(abs, '..'), { recursive: true })
  writeFileSync(abs, content, 'utf8')
}

const CONST_JAVA = `package app;
public class Const {
  public static final String BASE = "/base";
}
`
const A_CONTROLLER = `package app;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
@RestController
@RequestMapping(Const.BASE)
public class AController {
  private final BService svc = null;
  @GetMapping("/a")
  public String a() { if (svc != null) { return svc.hello(); } return "a"; }
}
`
const B_SERVICE = `package app;
public class BService {
  public String hello() { return "hello"; }
}
`

/** `.spec/map/` 산출물 전부를 파일명→내용으로 스냅샷. */
function snapshotMap(root: string): Record<string, string> {
  const dir = join(root, '.spec', 'map')
  const out: Record<string, string> = {}
  for (const name of readdirSync(dir).sort()) {
    const abs = join(dir, name)
    try {
      out[name] = readFileSync(abs, 'utf8')
    } catch {
      // 하위 디렉터리(bundle/ 등)는 스캔 산출물 비교 대상 아님.
    }
  }
  return out
}

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'w8-incremental-'))
  writeFile(root, 'src/main/java/app/Const.java', CONST_JAVA)
  writeFile(root, 'src/main/java/app/AController.java', A_CONTROLLER)
  writeFile(root, 'src/main/java/app/BService.java', B_SERVICE)
  writeFile(root, 'src/main/resources/schema.sql', 'CREATE TABLE t_user (id INT PRIMARY KEY, name VARCHAR(10));\n')
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('W8 증분 스캔 — byte-diff=0 (AC-2)', () => {
  it('무변경 웜 재실행: 산출물 byte-identical + 전 파일 재사용', async () => {
    await scanDomainMap(root)
    const cold = snapshotMap(root)
    const warm = await scanDomainMap(root)
    expect(snapshotMap(root)).toEqual(cold)
    const stats = warm.scanCache.statsSummary()
    expect(stats.recomputed).toBe(0)
    expect(stats.reused).toBeGreaterThan(0)
  })

  it('다른 파일이 소비하는 상수 변경: consumed-ctx 무효화로 전파 + full 과 동일', async () => {
    await scanDomainMap(root)
    // 상수 정의만 변경 — AController.java 내용은 그대로.
    writeFile(root, 'src/main/java/app/Const.java', CONST_JAVA.replace('"/base"', '"/v2"'))
    const incr = await scanDomainMap(root)
    const incrSnap = snapshotMap(root)
    // 낡은 라우트가 남으면 안 된다(무효화 실패 검출).
    expect(incrSnap['routes.json']).toContain('/v2')
    expect(incrSnap['routes.json']).not.toContain('/base')
    // AController 는 내용 무변경이지만 consumed-ctx 무효로 재추출됐어야 한다.
    const sr = incr.scanCache.statsSummary().sections['spring-routes']
    expect(sr.recomputed).toBe(2) // Const.java(변경) + AController.java(ctx 무효)
    // BService 는 상수 미소비 — 재사용 유지(전역 무효화가 아님을 고정).
    expect(sr.reused).toBe(1)

    await scanDomainMap(root, { readCache: false })
    expect(snapshotMap(root)).toEqual(incrSnap)
  })

  it('파일 본문 수정: 그 파일만 재추출 + full 과 byte-diff=0', async () => {
    await scanDomainMap(root)
    writeFile(root, 'src/main/java/app/BService.java', B_SERVICE.replace('"hello"', '"world"'))
    const incr = await scanDomainMap(root)
    const incrSnap = snapshotMap(root)
    const jf = incr.scanCache.statsSummary().sections['java-facts']
    expect(jf.recomputed).toBe(1)
    expect(jf.reused).toBe(2)

    await scanDomainMap(root, { readCache: false })
    expect(snapshotMap(root)).toEqual(incrSnap)
  })

  it('파일 추가/삭제: 증분 == full + 삭제 엔트리 프루닝', async () => {
    await scanDomainMap(root)
    writeFile(root, 'src/main/java/app/CNew.java', 'package app;\npublic class CNew { void c() {} }\n')
    rmSync(join(root, 'src/main/java/app/BService.java'))
    await scanDomainMap(root)
    const incrSnap = snapshotMap(root)

    await scanDomainMap(root, { readCache: false })
    expect(snapshotMap(root)).toEqual(incrSnap)

    const cache = JSON.parse(readFileSync(join(root, '.spec', 'cache', 'scan-facts.json'), 'utf8'))
    const rels = Object.keys(cache.sections['java-facts'].entries)
    expect(rels).toContain('src/main/java/app/CNew.java')
    expect(rels).not.toContain('src/main/java/app/BService.java')
  })

  it('.sql 파일 변경: sql-facts 만 재추출되고 db-schema 가 full 과 동일', async () => {
    await scanDomainMap(root)
    writeFile(
      root,
      'src/main/resources/schema.sql',
      'CREATE TABLE t_user (id INT PRIMARY KEY, name VARCHAR(10));\nCREATE TABLE t_order (id INT PRIMARY KEY);\n',
    )
    const incr = await scanDomainMap(root)
    const incrSnap = snapshotMap(root)
    expect(incrSnap['db-schema.json']).toContain('t_order')
    expect(incr.scanCache.statsSummary().sections['sql-facts']).toMatchObject({ reused: 0, recomputed: 1 })
    expect(incr.scanCache.statsSummary().sections['java-facts'].recomputed).toBe(0)

    await scanDomainMap(root, { readCache: false })
    expect(snapshotMap(root)).toEqual(incrSnap)
  })
})
