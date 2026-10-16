// ── PrepHire-AI Resilience Orchestrator & Fallback State Machine ───────────
import {
  getQuestionsForSession,
  type QuestionNode,
  type InterviewDomain,
} from '../data/questionBank'
import type { ResumeProfile } from './resume'

export type EngineMode = 'cloud' | 'offline'

interface CircuitBreakerConfig {
  failureThreshold: number
  cooldownPeriodMs: number
}

class CircuitBreaker {
  private failures = 0
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED'
  private nextAttemptTimestamp = 0
  private config: CircuitBreakerConfig

  constructor(config: CircuitBreakerConfig = { failureThreshold: 2, cooldownPeriodMs: 30000 }) {
    this.config = config
  }

  isOpen(): boolean {
    if (this.state === 'OPEN') {
      if (Date.now() >= this.nextAttemptTimestamp) {
        this.state = 'HALF_OPEN'
        return false
      }
      return true
    }
    return false
  }

  recordSuccess(): void {
    this.failures = 0
    this.state = 'CLOSED'
  }

  recordFailure(): void {
    this.failures += 1
    if (this.failures >= this.config.failureThreshold) {
      this.state = 'OPEN'
      this.nextAttemptTimestamp = Date.now() + this.config.cooldownPeriodMs
      console.warn(`[PrepHire CircuitBreaker] Tripped to OPEN state for ${this.config.cooldownPeriodMs / 1000}s.`)
    }
  }

  getState(): 'CLOSED' | 'OPEN' | 'HALF_OPEN' {
    return this.state
  }

  reset(): void {
    this.failures = 0
    this.state = 'CLOSED'
    this.nextAttemptTimestamp = 0
  }
}

export const interviewCircuitBreaker = new CircuitBreaker()

/**
 * Executes an async task with a strict timeout
 */
export async function withTimeout<T>(promise: Promise<T>, timeoutMs = 8000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`AI service request timed out after ${timeoutMs / 1000}s.`))
    }, timeoutMs)
  })

  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export interface NextQuestionContext {
  domain: string
  department?: string
  level?: string
  resumeProfile?: ResumeProfile | null
  intro?: string
  qCount: number // e.g. 0 for initial question, 1..4 for subsequent questions
  previousQA: Array<{ q: string; a: string }>
  latestAnswer?: string
  usedQuestionIds?: string[]
}

export interface OrchestratedQuestionResult {
  text: string
  mode: EngineMode
  questionNode?: QuestionNode
  circuitState: 'CLOSED' | 'OPEN' | 'HALF_OPEN'
}

/**
 * Orchestrates the next interview question:
 * 1. Attempts the generative AI API (with circuit breaker & 8s timeout).
 * 2. On failure / rate limit, seamlessly falls back to the curated multi-branch Question Bank.
 */
export async function orchestrateNextQuestion(
  callAIFn: (prompt: string, sys: string) => Promise<string>,
  context: NextQuestionContext,
  generateAIPrompt: () => { prompt: string; sys: string }
): Promise<OrchestratedQuestionResult> {
  const isCircuitOpen = interviewCircuitBreaker.isOpen()

  // Attempt Cloud AI if circuit breaker is not OPEN
  if (!isCircuitOpen) {
    try {
      const { prompt, sys } = generateAIPrompt()
      const aiReply = await withTimeout(callAIFn(prompt, sys), 8000)

      if (aiReply && aiReply.trim().length > 0) {
        interviewCircuitBreaker.recordSuccess()
        return {
          text: aiReply.trim(),
          mode: 'cloud',
          circuitState: interviewCircuitBreaker.getState(),
        }
      }
    } catch (err) {
      console.warn('⚠️ Cloud AI request failed or timed out — activating Autonomous Offline Engine:', (err as Error).message)
      interviewCircuitBreaker.recordFailure()
    }
  }

  // ── AUTONOMOUS OFFLINE FALLBACK ──────────────────────────────────────────
  const resumeSkills = context.resumeProfile?.skills || []
  const availableQuestions = getQuestionsForSession(
    context.domain as InterviewDomain,
    context.department,
    context.level,
    resumeSkills
  )

  const usedIds = new Set(context.usedQuestionIds || [])
  const unusedQuestions = availableQuestions.filter((q) => !usedIds.has(q.id))
  const selectedNode = unusedQuestions.length > 0 ? unusedQuestions[0] : availableQuestions[0]

  // Construct calibrated offline response
  let responseText = ''

  if (context.qCount === 0) {
    // Initial opening question
    const introAck = context.intro?.trim()
      ? `Welcome to PrepHire.AI. Thank you for sharing your background. Let's begin.`
      : `Welcome to PrepHire.AI. Let's begin your ${context.domain} assessment.`
    responseText = `${introAck}\n\n${selectedNode?.question || 'To start, please introduce yourself and walk me through your core engineering strengths.'}`
  } else {
    // Calibrated micro-feedback on the previous answer
    const prevAnswer = context.latestAnswer || ''
    const wordCount = prevAnswer.trim().split(/\s+/).filter(Boolean).length
    let microFeedback = 'Thank you for your answer.'

    if (wordCount < 15) {
      microFeedback = 'Understood, but your response was quite brief. Try elaborating with specific technical details or examples.'
    } else if (wordCount > 40) {
      microFeedback = 'Good explanation with solid coverage. Let us move to the next topic.'
    } else {
      microFeedback = 'Clear response. Let us proceed.'
    }

    const questionPrompt = selectedNode?.question || 'Explain a core concept in your target domain and walk through its primary trade-offs.'
    responseText = `${microFeedback}\n\nQuestion ${context.qCount + 1} of 5: ${questionPrompt}`
  }

  return {
    text: responseText,
    mode: 'offline',
    questionNode: selectedNode,
    circuitState: interviewCircuitBreaker.getState(),
  }
}
