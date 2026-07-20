import { describe, expect, it } from 'vitest'
import { parseSource } from '../tree-sitter.js'
import { extractKotlinBatchEntries } from './batch-kotlin.js'

describe('extractKotlinBatchEntries', () => {
  it('@Scheduled(cron=...) — 클래스 소속 메서드', async () => {
    const src = [
      '@Component',
      'class Sweeper {',
      '    @Scheduled(cron = "0 0 * * * *")',
      '    fun sweep() { }',
      '}',
      '',
    ].join('\n')
    const root = await parseSource('kotlin', src)
    const entries = extractKotlinBatchEntries(root, 'Sweeper.kt')

    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      entryId: 'batch:Sweeper.kt#sweep',
      trigger: 'scheduled',
      schedule: 'cron=0 0 * * * *',
      handler: 'Sweeper#sweep',
    })
  })

  it('@Scheduled(fixedRate=...) — 수치 인자는 원문 텍스트로 폴백', async () => {
    const src = ['class Ticker {', '    @Scheduled(fixedRate = 5000)', '    fun tick() { }', '}', ''].join('\n')
    const root = await parseSource('kotlin', src)
    const entries = extractKotlinBatchEntries(root, 'Ticker.kt')

    expect(entries).toHaveLength(1)
    expect(entries[0].schedule).toBe('fixedRate=5000')
    expect(entries[0].trigger).toBe('scheduled')
  })

  it('반복 @Scheduled — 어노테이션당 1엔트리', async () => {
    // 분리형 미스파스 치유 재현: 클래스 본문에 멤버 확장함수를 넣어 클래스 어노테이션을
    // annotated_expression 으로 떨어뜨린다(메서드 자체 어노테이션 파싱과는 무관 — 회귀 확인용).
    const src = [
      '@Component',
      '@Profile("batch")',
      'class MultiJob {',
      '    private fun A.toView() = V(x)',
      '',
      '    @Scheduled(cron = "0 0 0 * * *")',
      '    @Scheduled(cron = "0 0 12 * * *")',
      '    fun runTwice() { }',
      '}',
      '',
    ].join('\n')
    const root = await parseSource('kotlin', src)
    const entries = extractKotlinBatchEntries(root, 'MultiJob.kt')

    const scheduled = entries.filter((e) => e.trigger === 'scheduled')
    expect(scheduled).toHaveLength(2)
    expect(scheduled.map((e) => e.schedule).sort()).toEqual(['cron=0 0 0 * * *', 'cron=0 0 12 * * *'])
    expect(scheduled.every((e) => e.handler === 'MultiJob#runTwice')).toBe(true)
  })

  it('top-level fun main -> trigger main', async () => {
    const src = ['package com.example', '', 'fun main(args: Array<String>) {', '    println("hi")', '}', ''].join('\n')
    const root = await parseSource('kotlin', src)
    const entries = extractKotlinBatchEntries(root, 'App.kt')

    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      entryId: 'batch:App.kt#main',
      trigger: 'main',
      schedule: null,
      handler: 'main',
    })
  })

  it('클래스 소속 메서드는 이름이 main 이어도 main 트리거로 잡지 않는다', async () => {
    const src = ['class Weird {', '    fun main() { }', '}', ''].join('\n')
    const root = await parseSource('kotlin', src)
    const entries = extractKotlinBatchEntries(root, 'Weird.kt')
    expect(entries).toHaveLength(0)
  })

  it('@Scheduled·main 이 모두 없으면 빈 배열', async () => {
    const src = ['class Plain {', '    fun doWork() { }', '}', ''].join('\n')
    const root = await parseSource('kotlin', src)
    expect(extractKotlinBatchEntries(root, 'Plain.kt')).toEqual([])
  })
})
