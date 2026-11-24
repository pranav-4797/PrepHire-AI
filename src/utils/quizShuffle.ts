// ── Anti-Cheating Deterministic Question & Option Shuffling ──────────────────
// Ensures students sitting side-by-side in college labs see questions and choices
// in completely different orders while maintaining 100% deterministic reproducibility
// across reloads and accurate evaluation against master answer keys.
// ─────────────────────────────────────────────────────────────────────────────

import type { QuizQuestion } from '../types/quiz'

/**
 * 32-bit Mulberry PRNG for fast, high-quality pseudo-random numbers from a string seed.
 */
function createPRNG(seedStr: string): () => number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 16777619) >>> 0
  }
  return function () {
    let t = (h += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Deterministic Fisher-Yates array shuffle.
 */
function shuffleArray<T>(arr: T[], rng: () => number): T[] {
  const result = [...arr]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const temp = result[i]
    result[i] = result[j]
    result[j] = temp
  }
  return result
}

export interface ShuffledQuizQuestion extends QuizQuestion {
  originalQuestionIndex: number
  /** Maps displayed option index (0..3) -> original master option index (0..3) */
  displayedToOriginalOptionIndex: [number, number, number, number]
  /** Maps original master option index (0..3) -> displayed option index (0..3) */
  originalToDisplayedOptionIndex: [number, number, number, number]
}

export interface ShuffledQuizPackage {
  shuffledQuestions: ShuffledQuizQuestion[]
  /** Map from questionId to its ShuffledQuizQuestion metadata */
  questionMap: Map<string, ShuffledQuizQuestion>
}

/**
 * Shuffles quiz questions and their options deterministically for a given candidate.
 * If shuffleQuestions is false, questions stay in order.
 * If shuffleOptions is false, options stay in [A, B, C, D] order.
 */
export function generateShuffledQuiz(
  questions: QuizQuestion[],
  seedKey: string,
  options?: {
    shuffleQuestions?: boolean
    shuffleOptions?: boolean
  }
): ShuffledQuizPackage {
  const doShuffleQuestions = options?.shuffleQuestions !== false
  const doShuffleOptions = options?.shuffleOptions !== false

  const qRng = createPRNG(`${seedKey}_questions`)

  // Step 1: Assign original index and prepare question list
  const indexed = questions.map((q, idx) => ({ q, originalIndex: idx }))
  const orderedQuestions = doShuffleQuestions ? shuffleArray(indexed, qRng) : indexed

  // Step 2: Shuffle options per question
  const shuffledQuestions: ShuffledQuizQuestion[] = orderedQuestions.map((item, qPos) => {
    const { q, originalIndex } = item
    const optRng = createPRNG(`${seedKey}_q_${q.id || originalIndex}_opts_${qPos}`)

    let finalOptions: [string, string, string, string] = [...q.options]
    let displayedToOriginal: [number, number, number, number] = [0, 1, 2, 3]
    let originalToDisplayed: [number, number, number, number] = [0, 1, 2, 3]

    if (doShuffleOptions) {
      // Create indexed options [ { text: opt, origIdx: 0 }, ... ]
      const indexedOpts = q.options.map((text, idx) => ({ text, origIdx: idx }))
      const shuffledOpts = shuffleArray(indexedOpts, optRng)

      finalOptions = [
        shuffledOpts[0].text,
        shuffledOpts[1].text,
        shuffledOpts[2].text,
        shuffledOpts[3].text,
      ]

      displayedToOriginal = [
        shuffledOpts[0].origIdx,
        shuffledOpts[1].origIdx,
        shuffledOpts[2].origIdx,
        shuffledOpts[3].origIdx,
      ]

      // Invert mapping for quick lookup: originalToDisplayed[origIdx] = dispIdx
      const inverted: [number, number, number, number] = [0, 0, 0, 0]
      for (let dispIdx = 0; dispIdx < 4; dispIdx++) {
        inverted[displayedToOriginal[dispIdx]] = dispIdx
      }
      originalToDisplayed = inverted
    }

    return {
      ...q,
      originalQuestionIndex: originalIndex,
      options: finalOptions,
      correctIndex:
        typeof q.correctIndex === 'number'
          ? originalToDisplayed[q.correctIndex]
          : undefined,
      displayedToOriginalOptionIndex: displayedToOriginal,
      originalToDisplayedOptionIndex: originalToDisplayed,
    }
  })

  const questionMap = new Map<string, ShuffledQuizQuestion>()
  for (let idx = 0; idx < shuffledQuestions.length; idx++) {
    const sq = shuffledQuestions[idx]
    if (sq.id) questionMap.set(sq.id, sq)
    questionMap.set(`q-${idx}`, sq)
  }

  return { shuffledQuestions, questionMap }
}

/**
 * Converts displayed option selections back to master option indices for Firestore persistence.
 * answers: { [questionId]: displayedOptionIndex (0..3) }
 * Returns: { [questionId]: originalOptionIndex (0..3) }
 */
export function convertDisplayedAnswersToMaster(
  displayedAnswers: Record<string, number>,
  questionMap: Map<string, ShuffledQuizQuestion>
): Record<string, number> {
  const masterAnswers: Record<string, number> = {}

  for (const [qId, dispIdx] of Object.entries(displayedAnswers)) {
    const sq = questionMap.get(qId)
    if (sq && dispIdx >= 0 && dispIdx <= 3) {
      masterAnswers[qId] = sq.displayedToOriginalOptionIndex[dispIdx]
    } else {
      masterAnswers[qId] = dispIdx
    }
  }

  return masterAnswers
}
