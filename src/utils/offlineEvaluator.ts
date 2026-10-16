// ── PrepHire-AI Offline Heuristic & Rubric Evaluation Engine ────────────────
import type { SpeechDeliveryMetrics } from './speechAnalytics'
import { QUESTION_BANK, type QuestionNode } from '../data/questionBank'

export interface QA {
  q: string
  a: string
}

export interface OfflineEvaluationReport {
  overallScore: number
  technical: number
  communication: number
  confidence: number
  clarity: number
  relevance: number
  strengths: string[]
  improvements: string[]
  tip: string
  proctoringNote: string
  warnCount: number
  actionPlan: string[]
  speechMetrics?: SpeechDeliveryMetrics
  evaluationMode: 'offline_heuristic'
}

const STAR_MARKERS = {
  situation: /\b(when|during|while|project|college|team|company|situation|context)\b/i,
  task: /\b(task|responsibility|assigned|goal|objective|needed to|had to|required to)\b/i,
  action: /\b(implemented|developed|designed|built|optimized|resolved|refactored|analyzed|created|led|coordinated)\b/i,
  result: /\b(result|outcome|achieved|reduced|improved|delivered|learned|increased|success|consequently)\b/i,
}

const TECHNICAL_CORE_TERMS = [
  'algorithm', 'complexity', 'time', 'space', 'memory', 'database', 'sql', 'nosql',
  'latency', 'throughput', 'architecture', 'cache', 'redis', 'api', 'http', 'async',
  'concurrency', 'thread', 'index', 'query', 'scale', 'distributed', 'security', 'test'
]

/**
 * Calculates a comprehensive rubric scorecard deterministically without calling an external LLM
 */
export function evaluateOfflineSession(
  data: QA[],
  context: {
    domain: string
    level: string
    department?: string
    warnCount: number
    speechMetrics?: SpeechDeliveryMetrics
  }
): OfflineEvaluationReport {
  const wc = context.warnCount
  const qAnswered = data.length
  const isEarlyEnd = qAnswered < 5

  if (qAnswered === 0) {
    return {
      overallScore: 0,
      technical: 0,
      communication: 0,
      confidence: 0,
      clarity: 0,
      relevance: 0,
      strengths: [],
      improvements: ['No interview questions were answered.'],
      tip: 'Start a new interview and answer at least one question to receive feedback.',
      proctoringNote: wc > 0
        ? `Interview ended before any questions were answered. Warnings: ${wc}.`
        : 'The interview was ended before any questions could be answered. No performance data to evaluate.',
      warnCount: wc,
      actionPlan: [
        'Complete a full 5-question interview to generate a personalized action plan.',
        'Review fundamentals for your target domain and prepare one project story with STAR format.',
        'Practice answering one technical and one behavioral question aloud and time yourself.',
      ],
      evaluationMode: 'offline_heuristic',
    }
  }

  // 1. Analyze per-question metrics
  let totalWords = 0
  let matchedKeywordsCount = 0
  let starSignalsTotal = 0
  let lowestScoringQIndex = 0
  let minWords = Infinity

  data.forEach((item, index) => {
    const text = item.a.toLowerCase()
    const words = text.split(/\s+/).filter(Boolean).length
    totalWords += words

    if (words < minWords) {
      minWords = words
      lowestScoringQIndex = index
    }

    // Try finding matching node from question bank
    const matchedNode: QuestionNode | undefined = QUESTION_BANK.find(
      (node) => item.q.toLowerCase().includes(node.question.toLowerCase().slice(0, 30))
    )

    const expected = matchedNode?.expectedKeywords || TECHNICAL_CORE_TERMS
    const matchedInQ = expected.filter((kw) => text.includes(kw.toLowerCase())).length
    matchedKeywordsCount += matchedInQ

    // Check STAR pattern
    let starCount = 0
    if (STAR_MARKERS.situation.test(text)) starCount++
    if (STAR_MARKERS.task.test(text)) starCount++
    if (STAR_MARKERS.action.test(text)) starCount++
    if (STAR_MARKERS.result.test(text)) starCount++
    starSignalsTotal += starCount
  })

  const avgWordsPerAnswer = totalWords / qAnswered

  // 2. Compute dimensional rubric scores (0 - 100)
  // Technical depth: based on keywords & length
  const keywordDensity = matchedKeywordsCount / Math.max(qAnswered * 2, 1)
  let technicalScore = Math.min(95, Math.round(50 + keywordDensity * 20 + Math.min(avgWordsPerAnswer * 0.3, 25)))

  // Communication: based on speechMetrics and answer pacing
  let communicationScore = 72
  if (context.speechMetrics) {
    const wpm = context.speechMetrics.wpm
    if (wpm >= 115 && wpm <= 165) {
      communicationScore = 88
    } else if (wpm > 85 && wpm < 190) {
      communicationScore = 76
    } else {
      communicationScore = 62
    }
    // Deduct for high filler word count
    if (context.speechMetrics.fillerCount > 5) {
      communicationScore = Math.max(50, communicationScore - 10)
    }
  } else {
    communicationScore = Math.min(90, Math.round(55 + Math.min(avgWordsPerAnswer * 0.4, 30)))
  }

  // Clarity: structure & STAR framework presence
  const starAvg = starSignalsTotal / qAnswered
  let clarityScore = Math.min(94, Math.round(55 + starAvg * 10 + (avgWordsPerAnswer >= 30 ? 10 : 0)))

  // Confidence: based on proctoring warnings and completeness
  const confidenceScore = Math.max(45, 88 - (wc * 8) - (isEarlyEnd ? 12 : 0))

  // Relevance: answers were non-trivial
  const relevanceScore = Math.min(96, Math.max(50, Math.round(60 + (avgWordsPerAnswer > 25 ? 25 : 10))))

  // If session was ended prematurely, calibrate scores proportionally
  if (isEarlyEnd) {
    const completionFactor = qAnswered / 5
    technicalScore = Math.round(technicalScore * (0.65 + 0.35 * completionFactor))
    communicationScore = Math.round(communicationScore * (0.7 + 0.3 * completionFactor))
    clarityScore = Math.round(clarityScore * (0.7 + 0.3 * completionFactor))
  }

  const overallScore = Math.round(
    technicalScore * 0.35 +
    communicationScore * 0.2 +
    clarityScore * 0.15 +
    relevanceScore * 0.2 +
    confidenceScore * 0.1
  )

  // 3. Formulate Strengths
  const strengths: string[] = []
  if (avgWordsPerAnswer >= 40) {
    strengths.push('Demonstrated strong elaboration and willingness to explain thinking in detail.')
  } else {
    strengths.push('Kept answers focused and concise without unnecessary digression.')
  }
  if (matchedKeywordsCount >= qAnswered) {
    strengths.push('Integrated appropriate domain terminology and foundational technical principles.')
  }
  if (starSignalsTotal >= 3) {
    strengths.push('Structured situational examples with clear action steps and outcomes.')
  }
  if (wc === 0) {
    strengths.push('Maintained exemplary camera presence and continuous proctoring focus throughout the session.')
  }

  // 4. Formulate Specific Improvements
  const improvements: string[] = []
  if (minWords < 20) {
    improvements.push(`In Q${lowestScoringQIndex + 1}, your response was noticeably brief. Support your answers with concrete examples, edge cases, or trade-offs.`)
  } else {
    improvements.push('Deepen technical trade-off discussions by explicitly contrasting your chosen approach against alternatives.')
  }
  if (context.speechMetrics && context.speechMetrics.fillerCount > 3) {
    improvements.push(`Reduce filler crutches (detected ${context.speechMetrics.fillerCount} filler words). Practice pausing silently rather than vocalizing filler syllables.`)
  }
  if (isEarlyEnd) {
    improvements.push(`Interview ended early after ${qAnswered} of 5 questions. Complete all 5 questions for a full evaluation.`)
  }

  // 5. Formulate Personalized Action Plan
  const actionPlan: string[] = [
    `Drill 3 core technical topics from your ${context.domain} domain with attention to time/space trade-offs.`,
    'Practice framing answers aloud using the STAR technique (Situation, Task, Action, Result).',
    'Record a 2-minute mock answer to a difficult question and review your pacing and vocal clarity.'
  ]

  let proctoringNote = isEarlyEnd
    ? `Interview ended early after ${qAnswered} of 5 questions.`
    : 'Session completed with full transcript.'
  if (wc > 0) {
    proctoringNote += ` Proctoring recorded ${wc} attention flag(s).`
  }

  return {
    overallScore,
    technical: technicalScore,
    communication: communicationScore,
    confidence: confidenceScore,
    clarity: clarityScore,
    relevance: relevanceScore,
    strengths,
    improvements,
    tip: isEarlyEnd
      ? 'Complete all 5 questions in your next session to receive a full radar benchmark.'
      : 'Review the action plan items above and rehearse your project stories aloud before your campus placement drive.',
    proctoringNote,
    warnCount: wc,
    actionPlan,
    speechMetrics: context.speechMetrics,
    evaluationMode: 'offline_heuristic',
  }
}
