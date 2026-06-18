import { describe, it, expect } from 'vitest'
import { CONFIDENCE_VALUES, isConfidence, type CanonicalNode } from './types.js'

describe('CONFIDENCE_VALUES — grounding single source', () => {
  it('is ordered strongest-first', () => {
    expect(CONFIDENCE_VALUES).toEqual(['CONFIRMED', 'CONFIRMED_AI', 'INFERRED', 'UNVERIFIED'])
  })

  it('isConfidence guards membership', () => {
    expect(isConfidence('CONFIRMED')).toBe(true)
    expect(isConfidence('CONFIRMED_AI')).toBe(true)
    expect(isConfidence('nope')).toBe(false)
    expect(isConfidence(42)).toBe(false)
  })
})

describe('CanonicalNode', () => {
  it('accepts a grounded node with a stable id and confidence', () => {
    const node: CanonicalNode = {
      id: 'domain:billing',
      kind: 'domain',
      name: '결제',
      anchor: { file: 'src/billing/BillingController.java', line: 12 },
      confidence: 'CONFIRMED',
    }
    expect(node.id).toBe('domain:billing')
    expect(isConfidence(node.confidence)).toBe(true)
  })
})
