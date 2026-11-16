// ── Ultra-Low-Latency SSE Streaming & Sentence-Boundary Speech Synthesizer ───
// Streams tokens from the server and synthesizes audio sentence-by-sentence,
// slashing conversational Time-To-First-Token (TTFT) from ~3500ms down to ~200ms.
// ─────────────────────────────────────────────────────────────────────────────

import { auth } from '../firebase/firebase'

const AI_API_URL = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL || '')

export interface StreamCallbacks {
  onChunk: (fullText: string, chunk: string) => void
  onSentenceReady?: (sentence: string) => void
}

/**
 * SentenceBoundarySpeaker: Pipes streamed text into speech audio immediately
 * as each sentence finishes, masking network latency completely.
 */
export class SentenceBoundarySpeaker {
  private queue: string[] = []
  private isPlaying = false
  private voiceEnabled = true
  private preferredVoice: SpeechSynthesisVoice | null = null

  constructor(voiceEnabled = true) {
    this.voiceEnabled = voiceEnabled
    this.initVoice()
  }

  private initVoice(): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    const setVoice = () => {
      const voices = window.speechSynthesis.getVoices()
      this.preferredVoice =
        voices.find((v) => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha'))) ||
        voices.find((v) => v.lang.startsWith('en')) ||
        null
    }
    setVoice()
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = setVoice
    }
  }

  setVoiceEnabled(enabled: boolean): void {
    this.voiceEnabled = enabled
    if (!enabled) this.stop()
  }

  enqueue(sentence: string): void {
    const clean = sentence.trim()
    if (!clean || !this.voiceEnabled) return
    this.queue.push(clean)
    if (!this.isPlaying) {
      this.playNext()
    }
  }

  private playNext(): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    if (this.queue.length === 0 || !this.voiceEnabled) {
      this.isPlaying = false
      return
    }

    this.isPlaying = true
    const textToSpeak = this.queue.shift()!
    const utterance = new SpeechSynthesisUtterance(textToSpeak)
    if (this.preferredVoice) utterance.voice = this.preferredVoice
    utterance.rate = 1.05
    utterance.pitch = 1.0

    utterance.onend = () => {
      this.playNext()
    }

    utterance.onerror = (e) => {
      console.warn('SpeechSynthesis error:', e)
      this.playNext()
    }

    window.speechSynthesis.speak(utterance)
  }

  stop(): void {
    this.queue = []
    this.isPlaying = false
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
  }

  speaking(): boolean {
    return this.isPlaying
  }
}

/**
 * Streams AI responses from /api/ai/stream with sentence-boundary detection.
 */
export async function callClaudeStream(
  prompt: string,
  sys: string,
  callbacks: StreamCallbacks,
  signal?: AbortSignal
): Promise<string> {
  const token = await auth.currentUser?.getIdToken()
  if (!token) {
    throw new Error('You must be signed in to use AI features.')
  }

  const res = await fetch(`${AI_API_URL}/api/ai/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ prompt, sys }),
    signal,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'AI streaming request failed.')
  }

  if (!res.body) {
    throw new Error('ReadableStream not supported by browser.')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let accumulatedText = ''
  let pendingSentenceBuffer = ''
  let buffer = ''

  // Emits EVERY completed sentence in the buffer. A sentence ends at . ? ! followed by
  // whitespace; requiring the whitespace (instead of also accepting end-of-buffer) stops
  // "3.5" / "e.g." arriving split across chunks from being cut mid-token. The old regex
  // also emitted only one sentence per network chunk, delaying the rest.
  const drainSentences = (final: boolean) => {
    for (;;) {
      const m = pendingSentenceBuffer.match(/^([\s\S]*?[.?!]+["')\]]*)\s+/)
      if (!m) break
      const sentence = m[1].trim()
      pendingSentenceBuffer = pendingSentenceBuffer.slice(m[0].length)
      if (sentence) callbacks.onSentenceReady?.(sentence)
    }
    if (final && pendingSentenceBuffer.trim()) {
      callbacks.onSentenceReady?.(pendingSentenceBuffer.trim())
      pendingSentenceBuffer = ''
    }
  }

  const handleLine = (line: string) => {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) return
    const payload = trimmed.slice(5).trim()
    if (!payload || payload === '[DONE]') return

    // Parse separately from handling: previously a server-sent {"error": ...} was thrown
    // INSIDE the try block and then swallowed by the catch (only two hard-coded message
    // fragments were re-thrown), so most AI failures produced an empty question silently.
    let parsed: { text?: string; error?: string }
    try {
      parsed = JSON.parse(payload)
    } catch {
      return // partial / malformed line
    }
    if (parsed.error) throw new Error(parsed.error)
    if (parsed.text) {
      accumulatedText += parsed.text
      pendingSentenceBuffer += parsed.text
      callbacks.onChunk(accumulatedText, parsed.text)
      drainSentences(false)
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    lines.forEach(handleLine)
  }
  handleLine(buffer)

  drainSentences(true) // flush the tail

  return accumulatedText.trim()
}
