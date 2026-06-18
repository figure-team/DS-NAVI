import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { initProject, SPEC_DIR, SPEC_MASTER } from './index.js'
import { CONFIG_FILENAME, loadConfig } from '../config/index.js'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ktds-init-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('initProject', () => {
  it('creates config + .spec scaffold on a fresh project', () => {
    const r = initProject(dir)
    expect(r.created).toContain(CONFIG_FILENAME)
    expect(r.created).toContain(SPEC_DIR + '/')
    expect(r.created).toContain(`${SPEC_DIR}/${SPEC_MASTER}`)
    expect(existsSync(join(dir, CONFIG_FILENAME))).toBe(true)
    expect(existsSync(join(dir, SPEC_DIR, SPEC_MASTER))).toBe(true)
    expect(loadConfig(dir)?.outputLanguage).toBe('ko')
  })

  it('is idempotent — preserves existing files on re-run', () => {
    initProject(dir)
    // mutate config + master to detect overwrite
    writeFileSync(join(dir, CONFIG_FILENAME), JSON.stringify({ outputLanguage: 'en' }), 'utf8')
    writeFileSync(join(dir, SPEC_DIR, SPEC_MASTER), 'EDITED', 'utf8')

    const r = initProject(dir)
    expect(r.preserved).toContain(CONFIG_FILENAME)
    expect(r.preserved).toContain(`${SPEC_DIR}/${SPEC_MASTER}`)
    expect(loadConfig(dir)?.outputLanguage).toBe('en') // not overwritten
    expect(readFileSync(join(dir, SPEC_DIR, SPEC_MASTER), 'utf8')).toBe('EDITED')
  })
})
