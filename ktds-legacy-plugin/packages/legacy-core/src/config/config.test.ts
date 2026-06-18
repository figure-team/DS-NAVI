import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CONFIG_FILENAME, defaultConfig, loadConfig, writeConfig } from './index.js'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ktds-config-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('config defaults', () => {
  it('defaults outputLanguage=ko, networkType=3, thresholds 0.3/0.6', () => {
    const c = defaultConfig()
    expect(c.outputLanguage).toBe('ko')
    expect(c.networkType).toBe(3)
    expect(c.inferredRatioWarnThreshold).toBe(0.3)
    expect(c.inferredRatioBlockThreshold).toBe(0.6)
    expect(c.supportedSchemaVersions).toEqual(['1.0.0'])
  })
})

describe('config IO', () => {
  it('writes then loads round-trip', () => {
    writeConfig(dir, defaultConfig())
    const loaded = loadConfig(dir)
    expect(loaded?.outputLanguage).toBe('ko')
  })

  it('loadConfig returns null when absent', () => {
    expect(loadConfig(dir)).toBeNull()
  })

  it('preserves passthrough fields', () => {
    writeFileSync(
      join(dir, CONFIG_FILENAME),
      JSON.stringify({ outputLanguage: 'ko', customKey: 42 }),
      'utf8',
    )
    const loaded = loadConfig(dir) as Record<string, unknown>
    expect(loaded.customKey).toBe(42)
  })

  it('writes trailing newline and 2-space indent (stable)', () => {
    writeConfig(dir, defaultConfig())
    const text = readFileSync(join(dir, CONFIG_FILENAME), 'utf8')
    expect(text.endsWith('}\n')).toBe(true)
    expect(text).toContain('\n  "networkType"')
  })
})
