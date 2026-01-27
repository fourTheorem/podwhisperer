/**
 * LCS (Longest Common Subsequence) utilities for word-level diffing.
 * Used for reconciling transcript corrections with timing data.
 */

export interface LCSResult {
  lcs: string[]
  aIndices: number[]
  bIndices: number[]
}

export type DiffOp = 'keep' | 'remove' | 'add'

export interface DiffOperation {
  op: DiffOp
  originalIndex?: number
  patchedIndex?: number
  word: string
}

// Computes Longest Common Subsequence for word alignment
export function computeLCS(a: string[], b: string[]): LCSResult {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0),
  )

  // Build the DP table
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // Backtrack to find the LCS and indices
  const lcs: string[] = []
  const aIndices: number[] = []
  const bIndices: number[] = []
  let i = m
  let j = n

  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      lcs.unshift(a[i - 1])
      aIndices.unshift(i - 1)
      bIndices.unshift(j - 1)
      i--
      j--
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--
    } else {
      j--
    }
  }

  return { lcs, aIndices, bIndices }
}

// Generates diff operations (keep/remove/add) between word arrays
export function computeDiff(
  original: string[],
  patched: string[],
): DiffOperation[] {
  const { aIndices: origKept, bIndices: patchKept } = computeLCS(
    original,
    patched,
  )
  const origKeptSet = new Set(origKept)
  const patchKeptSet = new Set(patchKept)

  const operations: DiffOperation[] = []
  let origPtr = 0
  let patchPtr = 0
  let keptPtr = 0

  while (origPtr < original.length || patchPtr < patched.length) {
    const origIsKept = origKeptSet.has(origPtr)
    const patchIsKept = patchKeptSet.has(patchPtr)

    if (
      origIsKept &&
      patchIsKept &&
      origKept[keptPtr] === origPtr &&
      patchKept[keptPtr] === patchPtr
    ) {
      // Both are at a kept position - emit KEEP
      operations.push({
        op: 'keep',
        originalIndex: origPtr,
        patchedIndex: patchPtr,
        word: original[origPtr],
      })
      origPtr++
      patchPtr++
      keptPtr++
    } else if (!origIsKept && origPtr < original.length) {
      // Original word is not in LCS - it was removed
      operations.push({
        op: 'remove',
        originalIndex: origPtr,
        word: original[origPtr],
      })
      origPtr++
    } else if (!patchIsKept && patchPtr < patched.length) {
      // Patched word is not in LCS - it was added
      operations.push({
        op: 'add',
        patchedIndex: patchPtr,
        word: patched[patchPtr],
      })
      patchPtr++
    } else {
      // Safety: advance whichever pointer is behind
      if (origPtr < original.length) origPtr++
      else if (patchPtr < patched.length) patchPtr++
    }
  }

  return operations
}
