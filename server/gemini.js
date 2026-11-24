// ── Shared Gemini helper ────────────────────────────────────────────────────
// Used by /api/ai/generate + /api/ai/stream (server/index.js), the coding
// review route and the NVIDIA fallback, so there is one key path, one rate
// limiter and one error-handling block.
//
// Changes vs. the previous revision:
//  • API key is sent in the `x-goog-api-key` header instead of the URL query
//    string (URLs end up in proxy/error logs).
//  • Every upstream call has a timeout (a hung Google request used to hold the
//    connection — and the user's rate-limit slot — open forever).
//  • All response `parts` are joined (only the first was read before).
//  • The rate limiter is the single shared one (index.js had a second copy with
//    its own budget) and is pruned so the Map can't grow without bound.
// ─────────────────────────────────────────────────────────────────────────────

const AI_RATE_LIMIT = 12
const AI_RATE_WINDOW_MS = 60_000
const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest'
const MODEL_CANDIDATES = [
  DEFAULT_GEMINI_MODEL,
  'gemini-flash-lite-latest',
  'gemini-3.5-flash-lite',
  'gemini-3.8-flash',
  'gemini-flash-latest',
]
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const REQUEST_TIMEOUT_MS = 60_000

const aiCallLog = new Map()

export function isRateLimited(key) {
  const now = Date.now()
  const calls = (aiCallLog.get(key) || []).filter((t) => now - t < AI_RATE_WINDOW_MS)
  calls.push(now)
  aiCallLog.set(key, calls)
  return calls.length > AI_RATE_LIMIT
}

// Drop idle keys so the Map doesn't leak one entry per user forever.
setInterval(() => {
  const now = Date.now()
  for (const [k, calls] of aiCallLog) {
    if (!calls.some((t) => now - t < AI_RATE_WINDOW_MS)) aiCallLog.delete(k)
  }
}, 5 * 60_000).unref()

function resolveKey(clientApiKey) {
  const key =
    clientApiKey ||
    process.env.GEMINI_API_KEY ||
    process.env.VITE_GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY
  if (!key) {
    const err = new Error('AI generation is not configured on the server.')
    err.status = 500
    throw err
  }
  return key
}

const requestBody = (prompt, sys, images = null) => {
  const parts = []
  if (Array.isArray(images) && images.length > 0) {
    for (const img of images) {
      if (img && typeof img.data === 'string' && typeof img.mimeType === 'string') {
        const cleanBase64 = img.data.replace(/^data:[^;]+;base64,/, '')
        parts.push({
          inline_data: {
            mime_type: img.mimeType,
            data: cleanBase64,
          },
        })
      }
    }
  }
  parts.push({ text: prompt })
  return JSON.stringify({
    system_instruction: { parts: [{ text: sys || '' }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      maxOutputTokens: 8192,
      temperature: 0.1,
    },
  })
}

const joinParts = (parsed) =>
  (parsed?.candidates?.[0]?.content?.parts || []).map((p) => p?.text || '').join('')

export async function callGemini(prompt, sys, clientApiKey = null, images = null) {
  const key = resolveKey(clientApiKey)
  const models = [...new Set(MODEL_CANDIDATES)]
  let lastErr = null

  for (const model of models) {
    try {
      const geminiRes = await fetch(`${GEMINI_BASE}/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: requestBody(prompt, sys, images),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (geminiRes.ok) {
        const data = await geminiRes.json().catch(() => ({}))
        return joinParts(data)
      }
      const data = await geminiRes.json().catch(() => ({}))
      console.warn(`Gemini API returned ${geminiRes.status} on model ${model}:`, data?.error?.message || '')
      if (geminiRes.status === 404) {
        continue
      }
      const err = new Error(data?.error?.message || 'AI generation service error.')
      err.status = geminiRes.status >= 500 ? 502 : geminiRes.status
      lastErr = err
      break
    } catch (e) {
      console.warn(`Gemini fetch error with ${model}:`, e.message)
      lastErr = e
    }
  }

  const err = new Error(lastErr?.message || 'AI generation service unreachable.')
  err.status = lastErr?.status || 502
  throw err
}

/**
 * Streams a Gemini response, calling onChunk(text) as it arrives.
 * `signal` (optional) aborts the upstream request, e.g. when the browser disconnects.
 */
export async function streamGemini(prompt, sys, onChunk, clientApiKey = null, signal = null) {
  const key = resolveKey(clientApiKey)
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS * 2)
  const models = [...new Set(MODEL_CANDIDATES)]
  let geminiRes = null

  for (const model of models) {
    try {
      geminiRes = await fetch(`${GEMINI_BASE}/${model}:streamGenerateContent?alt=sse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: requestBody(prompt, sys),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      })
      if (geminiRes.status === 404) {
        continue
      }
      break
    } catch (e) {
      if (signal?.aborted) return
      console.warn(`Gemini stream connect error on ${model}:`, e.message)
    }
  }

  if (!geminiRes || !geminiRes.ok) {
    if (signal?.aborted) return
    const data = await geminiRes?.json().catch(() => ({}))
    console.error('Gemini stream error:', geminiRes?.status, data?.error?.message || '')
    const err = new Error('AI streaming service error.')
    err.status = 502
    throw err
  }

  const reader = geminiRes.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  const handleLine = (line) => {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) return
    const jsonStr = trimmed.slice(5).trim()
    if (!jsonStr || jsonStr === '[DONE]') return
    try {
      const text = joinParts(JSON.parse(jsonStr))
      if (text) onChunk(text)
    } catch {
      // partial JSON line, ignore
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      lines.forEach(handleLine)
    }
    handleLine(buffer)
  } catch (e) {
    if (!signal?.aborted) throw e // aborted-by-client is not an error
  }
}
