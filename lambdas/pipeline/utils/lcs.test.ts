import { describe, expect, it } from 'vitest'
import { computeDiff, computeLCS } from './lcs'

describe('computeLCS', () => {
  it('finds LCS of identical arrays', () => {
    const result = computeLCS(['a', 'b', 'c'], ['a', 'b', 'c'])
    expect(result.lcs).toEqual(['a', 'b', 'c'])
    expect(result.aIndices).toEqual([0, 1, 2])
    expect(result.bIndices).toEqual([0, 1, 2])
  })

  it('finds LCS with one removal', () => {
    const result = computeLCS(['a', 'b', 'c'], ['a', 'c'])
    expect(result.lcs).toEqual(['a', 'c'])
    expect(result.aIndices).toEqual([0, 2])
    expect(result.bIndices).toEqual([0, 1])
  })

  it('finds LCS with one addition', () => {
    const result = computeLCS(['a', 'c'], ['a', 'b', 'c'])
    expect(result.lcs).toEqual(['a', 'c'])
    expect(result.aIndices).toEqual([0, 1])
    expect(result.bIndices).toEqual([0, 2])
  })

  it('returns empty for completely different arrays', () => {
    const result = computeLCS(['a', 'b'], ['c', 'd'])
    expect(result.lcs).toEqual([])
  })
})

describe('computeDiff', () => {
  it('returns all keeps for identical arrays', () => {
    const diff = computeDiff(['hello', 'world'], ['hello', 'world'])
    expect(diff).toEqual([
      { op: 'keep', originalIndex: 0, patchedIndex: 0, word: 'hello' },
      { op: 'keep', originalIndex: 1, patchedIndex: 1, word: 'world' },
    ])
  })

  it('detects removal', () => {
    const diff = computeDiff(['a', 'b', 'c'], ['a', 'c'])
    expect(diff).toEqual([
      { op: 'keep', originalIndex: 0, patchedIndex: 0, word: 'a' },
      { op: 'remove', originalIndex: 1, word: 'b' },
      { op: 'keep', originalIndex: 2, patchedIndex: 1, word: 'c' },
    ])
  })

  it('detects addition', () => {
    const diff = computeDiff(['a', 'c'], ['a', 'b', 'c'])
    expect(diff).toEqual([
      { op: 'keep', originalIndex: 0, patchedIndex: 0, word: 'a' },
      { op: 'add', patchedIndex: 1, word: 'b' },
      { op: 'keep', originalIndex: 1, patchedIndex: 2, word: 'c' },
    ])
  })

  it('detects replacement as remove + add', () => {
    const diff = computeDiff(['hello', 'world'], ['hello', 'universe'])
    expect(diff).toEqual([
      { op: 'keep', originalIndex: 0, patchedIndex: 0, word: 'hello' },
      { op: 'remove', originalIndex: 1, word: 'world' },
      { op: 'add', patchedIndex: 1, word: 'universe' },
    ])
  })
})
