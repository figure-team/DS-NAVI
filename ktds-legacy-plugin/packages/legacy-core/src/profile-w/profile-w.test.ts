import { describe, it, expect } from 'vitest'
import { ProfileWChangeStorySchema } from './profile-w.js'
import type { ProfileWChangeStory } from './profile-w.js'

function valid(): ProfileWChangeStory {
  return {
    storyId: 'CS-1',
    title: 'Add timeout to fetchData',
    acceptanceCriteria: ['timeout defaults to 30s', 'callers can override'],
    tasks: [
      { id: 'T1', description: 'thread timeout param', fileList: ['src/fetch.ts'] },
      { id: 'T2', description: 'update test' },
    ],
    sourceCitations: [
      { file: 'src/fetch.ts', line: 12 },
      { file: 'src/dynamic.ts', line: null },
    ],
    fileList: ['src/fetch.ts', 'src/fetch.test.ts'],
  }
}

describe('ProfileWChangeStorySchema', () => {
  it('parses a valid Profile-W change-story object', () => {
    const parsed = ProfileWChangeStorySchema.parse(valid())
    expect(parsed.storyId).toBe('CS-1')
    expect(parsed.acceptanceCriteria).toHaveLength(2)
    expect(parsed.tasks).toHaveLength(2)
    expect(parsed.sourceCitations[1].line).toBeNull()
  })

  it('fails when a required field is missing', () => {
    const broken: Record<string, unknown> = { ...valid() }
    delete broken.acceptanceCriteria
    expect(ProfileWChangeStorySchema.safeParse(broken).success).toBe(false)
  })

  it('exposes AC / tasks / sourceCitations / fileList fields', () => {
    const shape = ProfileWChangeStorySchema.shape
    expect(Object.keys(shape).sort()).toEqual([
      'acceptanceCriteria',
      'fileList',
      'sourceCitations',
      'storyId',
      'tasks',
      'title',
    ])
  })

  it('rejects a task without id', () => {
    const broken = valid()
    const tasks: unknown[] = [{ description: 'no id' }]
    expect(
      ProfileWChangeStorySchema.safeParse({ ...broken, tasks }).success,
    ).toBe(false)
  })
})
