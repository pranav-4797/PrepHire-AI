// ── Speech Delivery & Cadence Analytics ────────────────────────────────────
// Analyzes candidate spoken answers for speaking pace (Words Per Minute)
// and verbal crutches / filler words (um, uh, like, basically, etc.).
// ─────────────────────────────────────────────────────────────────────────────

export interface SpeechDeliveryMetrics {
  totalWords: number
  speakingDurationSec: number
  wpm: number
  pacingFeedback: string
  fillerCount: number
  fillerBreakdown: Record<string, number>
  fillerFrequencyPerMin: number
  deliveryScore: number // 0-100
  advice: string
}

const COMMON_FILLERS = [
  'um',
  'uh',
  'er',
  'ah',
  'like',
  'basically',
  'actually',
  'literally',
  'you know',
  'sort of',
  'kind of',
  'to be honest',
  'i mean',
]

export function analyzeSpeech(
  answers: string[],
  totalDurationSeconds: number
): SpeechDeliveryMetrics {
  const combinedText = answers.join(' ').toLowerCase()
  if (!combinedText.trim()) {
    return {
      totalWords: 0,
      speakingDurationSec: totalDurationSeconds,
      wpm: 0,
      pacingFeedback: 'No speech recorded',
      fillerCount: 0,
      fillerBreakdown: {},
      fillerFrequencyPerMin: 0,
      deliveryScore: 0,
      advice: 'Ensure your microphone is connected and practice speaking aloud.',
    }
  }

  // Count words
  const words = combinedText
    .replace(/[^\w\s'-]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  const totalWords = words.length
  const durationMin = Math.max(totalDurationSeconds / 60, 0.2) // minimum 12 seconds baseline
  const wpm = Math.round(totalWords / durationMin)

  // Count fillers
  const fillerBreakdown: Record<string, number> = {}
  let fillerCount = 0

  for (const filler of COMMON_FILLERS) {
    const escaped = filler.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi')
    const matches = combinedText.match(regex)
    if (matches && matches.length > 0) {
      fillerBreakdown[filler] = matches.length
      fillerCount += matches.length
    }
  }

  const fillerFrequencyPerMin = Number((fillerCount / durationMin).toFixed(1))

  // Pacing diagnosis
  let pacingFeedback = 'Optimal Pace (120–160 WPM)'
  let pacingPenalty = 0
  if (wpm < 100) {
    pacingFeedback = 'Slightly Deliberate / Slow (<100 WPM)'
    pacingPenalty = 15
  } else if (wpm > 170) {
    pacingFeedback = 'Slightly Rushed (>170 WPM)'
    pacingPenalty = 12
  }

  // Filler penalty: up to 35 points
  const fillerPenalty = Math.min(Math.round(fillerFrequencyPerMin * 5), 35)

  // Delivery score: 100 base minus penalties
  const deliveryScore = Math.max(40, Math.min(100, 100 - pacingPenalty - fillerPenalty))

  // Actionable advice
  let advice = 'Great articulation and professional cadence.'
  if (fillerCount > 6 && wpm > 165) {
    advice = 'Pause for a breath before answering; slow down slightly to reduce "like" and "um" verbal crutches.'
  } else if (fillerCount > 5) {
    const topFiller = Object.entries(fillerBreakdown).sort((a, b) => b[1] - a[1])[0]?.[0] || 'fillers'
    advice = `Notice the use of "${topFiller}". Replace fillers with intentional 1-second silence to sound authoritative.`
  } else if (wpm < 105) {
    advice = 'Maintain steady vocal momentum and structure thoughts with the STAR framework to keep answers dynamic.'
  }

  return {
    totalWords,
    speakingDurationSec: totalDurationSeconds,
    wpm,
    pacingFeedback,
    fillerCount,
    fillerBreakdown,
    fillerFrequencyPerMin,
    deliveryScore,
    advice,
  }
}
