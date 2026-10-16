// ── PrepHire-AI Resume ATS Score & Job Description (JD) Gap Matrix ─────────
// Evaluates candidate resumes against target company job descriptions (JDs),
// scoring keyword alignment and highlighting placement gaps in <20ms client-side.
// ─────────────────────────────────────────────────────────────────────────────

export interface AtsAnalysisResult {
  matchScore: number // 0 - 100
  foundKeywords: string[]
  missingKeywords: string[]
  topStrengths: string[]
  criticalGaps: string[]
  formattingRecommendations: string[]
  executiveSummary: string
}

const COMMON_TECH_TERMS = [
  'react', 'typescript', 'javascript', 'python', 'java', 'c++', 'c#', 'golang',
  'node.js', 'express', 'django', 'fastapi', 'spring boot', 'html5', 'css3',
  'sql', 'postgresql', 'mysql', 'mongodb', 'redis', 'elasticsearch', 'dynamodb',
  'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'ci/cd', 'git', 'linux',
  'microservices', 'rest api', 'graphql', 'grpc', 'kafka', 'rabbitmq',
  'machine learning', 'deep learning', 'pytorch', 'tensorflow', 'pandas', 'numpy',
  'unit testing', 'jest', 'cypress', 'system design', 'agile', 'scrum'
]

const ACTION_VERBS = [
  'spearheaded', 'developed', 'architected', 'optimized', 'reduced', 'increased',
  'deployed', 'designed', 'engineered', 'streamlined', 'implemented', 'automated'
]

/**
 * Extracts normalized unique keywords from arbitrary text.
 */
function extractTechKeywords(text: string): string[] {
  const norm = text.toLowerCase()
  return COMMON_TECH_TERMS.filter((term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i')
    return regex.test(norm)
  })
}

/**
 * Analyzes resume content against a target Job Description
 */
export function analyzeResumeAgainstJD(
  resumeText: string,
  jobDescriptionText: string
): AtsAnalysisResult {
  const normResume = resumeText.toLowerCase()
  const normJD = jobDescriptionText.toLowerCase()

  const jdKeywords = extractTechKeywords(normJD)
  // If the JD contains very few recognizable keywords, pick terms from common industry sets
  const targetKeywords = jdKeywords.length >= 3 ? jdKeywords : ['python', 'sql', 'git', 'rest api', 'data structures']

  const foundKeywords: string[] = []
  const missingKeywords: string[] = []

  targetKeywords.forEach((kw) => {
    if (normResume.includes(kw)) {
      foundKeywords.push(kw)
    } else {
      missingKeywords.push(kw)
    }
  })

  // Check quantified impact (numbers, percentages, metrics)
  const metricMatches = (resumeText.match(/\b\d+(\.\d+)?(%|\+|x|k|ms|s|gb|users|requests)\b/gi) || []).length
  const verbMatches = ACTION_VERBS.filter((verb) => normResume.includes(verb)).length

  // Calculate ATS Match Score
  const keywordMatchRate = targetKeywords.length > 0 ? foundKeywords.length / targetKeywords.length : 0.5
  const impactFactor = Math.min(metricMatches / 4, 1.0)
  const verbFactor = Math.min(verbMatches / 3, 1.0)

  const rawScore = Math.round(
    keywordMatchRate * 70 +
    impactFactor * 18 +
    verbFactor * 12
  )
  const matchScore = Math.min(98, Math.max(25, rawScore))

  // Formulate top strengths
  const topStrengths: string[] = []
  if (foundKeywords.length > 0) {
    topStrengths.push(`Direct alignment on ${foundKeywords.slice(0, 4).join(', ')}.`)
  }
  if (metricMatches >= 3) {
    topStrengths.push(`Strong quantification of project impact (${metricMatches}+ measurable metrics identified).`)
  }
  if (verbMatches >= 2) {
    topStrengths.push('Active engineering leadership verbs used across project bullet points.')
  }

  // Formulate critical gaps
  const criticalGaps: string[] = []
  if (missingKeywords.length > 0) {
    criticalGaps.push(`Missing prominent JD requirements: ${missingKeywords.slice(0, 5).join(', ')}.`)
  }
  if (metricMatches < 2) {
    criticalGaps.push('Limited quantified impact metrics. Add measurable results (e.g. "reduced latency by 35%").')
  }

  // Formatting recommendations
  const formattingRecommendations: string[] = [
    'Incorporate the missing tech stack keywords into your project descriptions.',
    'Follow the Google X-Y-Z formula: "Accomplished [X] as measured by [Y] by doing [Z]".',
    'Keep your PDF single-column for standard ATS parser compatibility.'
  ]

  let executiveSummary = ''
  if (matchScore >= 80) {
    executiveSummary = 'Excellent ATS alignment! Your profile strongly mirrors the target job qualifications with substantial technical keyword overlap.'
  } else if (matchScore >= 60) {
    executiveSummary = 'Moderate ATS alignment. You possess foundational requirements, but adding the missing keywords above will significantly raise recruiter screening pass rates.'
  } else {
    executiveSummary = 'Low ATS alignment for this specific role. Tailor your project descriptions to highlight the target skills and core technical competencies listed.'
  }

  return {
    matchScore,
    foundKeywords,
    missingKeywords,
    topStrengths,
    criticalGaps,
    formattingRecommendations,
    executiveSummary,
  }
}
