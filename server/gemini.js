// ── Shared Gemini helper ────────────────────────────────────────────────────
// Used by both /api/ai/generate (server/index.js) and /api/coding/.../review
// (server/coding/routes.js) so we don't duplicate the fetch/error-handling
// block and keep a single GEMINI_API_KEY path.

const AI_RATE_LIMIT = 12
const AI_RATE_WINDOW_MS = 60_000
const aiCallLog = new Map()

export function isRateLimited(key) {
  const now = Date.now()
  const calls = (aiCallLog.get(key) || []).filter((t) => now - t < AI_RATE_WINDOW_MS)
  calls.push(now)
  aiCallLog.set(key, calls)
  return calls.length > AI_RATE_LIMIT
}

export async function callGemini(prompt, sys) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY
  if (!GEMINI_API_KEY) {
    const err = new Error('AI generation is not configured on the server.')
    err.status = 500
    throw err
  }
  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: sys || '' }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      }),
    }
  )
  const data = await geminiRes.json().catch(() => ({}))
  if (!geminiRes.ok) {
    console.error('Gemini API error:', data)
    const err = new Error('AI generation service error.')
    err.status = 502
    err.data = data
    throw err
  }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  return text
}
