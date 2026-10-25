export interface QuestionCategory {
  label: string
  icon: string
  color: string
  bg: string
  tip: string
}

export interface ParsedQuestion {
  prelude: string | null
  coreQuestion: string
  category: QuestionCategory
}

/**
 * Intelligently decomposes AI interviewer output into conversational prelude,
 * the spotlight core question, and an inferred technical category with coaching tips.
 */
export function parseAiMessage(text: string): ParsedQuestion {
  const clean = text.trim()
  const lower = clean.toLowerCase()

  // 1. Identify category & tailored coaching tip
  let category: QuestionCategory = {
    label: 'Technical Assessment',
    icon: '🧠',
    color: '#003366',
    bg: '#edf2f7',
    tip: 'Structure your answer with clear architectural points, technical rationale, and quantifiable metrics.',
  }

  if (/latency|throughput|real-time|realtime|concurrency|scal(e|ing)|distributed|pipeline|microservice|kafka|redis|qps/.test(lower)) {
    category = {
      label: 'Architecture & Latency',
      icon: '⚡',
      color: '#0052cc',
      bg: '#e8f0fe',
      tip: 'Focus on: End-to-end data flow, latency bottlenecks (caching/batching), model optimization, and throughput.',
    }
  } else if (/trade-?off|precision vs|accuracy vs|speed vs|cost vs|benchmark/.test(lower)) {
    category = {
      label: 'Technical Trade-offs',
      icon: '⚖️',
      color: '#7c3aed',
      bg: '#f3e8ff',
      tip: 'Pro-tip: Contrast the alternative architectures considered, key constraints prioritized, and why.',
    }
  } else if (/project|built|developed|hackathon|paytrust|resume|experience|portfolio/.test(lower)) {
    category = {
      label: 'Project Deep Dive',
      icon: '🎯',
      color: '#059669',
      bg: '#ecfdf5',
      tip: 'Highlight: Your specific ownership role, engineering decisions made, and measurable outcomes.',
    }
  } else if (/time complexity|space complexity|big-?o|algorithm|tree|graph|dynamic programming|array|hash table/.test(lower)) {
    category = {
      label: 'Algorithms & Data Structures',
      icon: '🧩',
      color: '#d97706',
      bg: '#fffbeb',
      tip: 'Walk through: Constraints, brute-force baseline vs optimal approach, and Big-O time/space bounds.',
    }
  } else if (/conflict|disagreement|team|leadership|failed|challenge|mistake|deadline/.test(lower)) {
    category = {
      label: 'Behavioral (STAR)',
      icon: '🤝',
      color: '#2563eb',
      bg: '#eff6ff',
      tip: 'Apply the STAR technique: Situation → Task → Actions you personally took → Quantifiable Results.',
    }
  }

  // 2. Check for colon transition followed by interrogative cues
  const colonMatch = clean.match(/^([\s\S]+?:)\s+((?:Given\b|How\b|What\b|Why\b|Can you\b|Could you\b|Explain\b|Describe\b|Walk me\b)[\s\S]+)$/i)
  if (colonMatch) {
    return {
      prelude: colonMatch[1].trim(),
      coreQuestion: colonMatch[2].trim(),
      category,
    }
  }

  // 3. Sentence boundary decomposition
  const sentences = clean.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) || [clean]
  if (sentences.length > 1) {
    let questionStartIdx = -1
    for (let i = 0; i < sentences.length; i++) {
      const s = sentences[i].trim()
      const sLower = s.toLowerCase()
      if (
        s.endsWith('?') ||
        /^(given that|how|what|why|could you|can you|explain|describe|walk me through|in your)/i.test(sLower)
      ) {
        questionStartIdx = i
        break
      }
    }

    if (questionStartIdx > 0 && questionStartIdx < sentences.length) {
      const prelude = sentences.slice(0, questionStartIdx).join(' ').trim()
      const coreQuestion = sentences.slice(questionStartIdx).join(' ').trim()
      return { prelude, coreQuestion, category }
    }
  }

  // Fallback: full text as core question
  return {
    prelude: null,
    coreQuestion: clean,
    category,
  }
}
