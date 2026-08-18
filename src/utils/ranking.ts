export interface RankableSession {
  studentName: string
  studentEmail: string
  department?: string
  domain: string
  score: number
  date: string
  warnings: number
}

export interface RankedStudent {
  email: string
  name: string
  department: string
  totalInterviews: number
  avgScore: number
  peakScore: number
  domainDiversity: number
  domainNames: string[]
  integrityScore: number
  consistencyScore: number
  frequencyScore: number
  compositeScore: number
  percentile: number
  rank: number
  tier: string
  placementReady: boolean
}

export function computeRankings(
  sessions: RankableSession[],
  placementReadyMap: Record<string, boolean>,
): RankedStudent[] {
  const grouped = new Map<string, RankableSession[]>()
  for (const s of sessions) {
    const email = s.studentEmail.toLowerCase()
    if (!grouped.has(email)) grouped.set(email, [])
    grouped.get(email)!.push(s)
  }

  const results: RankedStudent[] = []

  for (const [email, studentSessions] of grouped) {
    const totalInterviews = studentSessions.length
    if (totalInterviews < 2) continue

    const sorted = [...studentSessions].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    )

    const last5 = sorted.slice(0, 5)
    const avgScore = Math.round(last5.reduce((sum, s) => sum + s.score, 0) / last5.length)

    const peakScore = Math.max(...studentSessions.map((s) => s.score))

    const uniqueDomains = new Set(studentSessions.map((s) => s.domain.toLowerCase()))
    const domainDiversity = Math.round((uniqueDomains.size / 4) * 100)

    const totalWarnings = studentSessions.reduce((sum, s) => sum + s.warnings, 0)
    const warningsPerSession = totalWarnings / totalInterviews
    const integrityScore = Math.max(0, Math.round(100 - warningsPerSession * 25))

    const scores = studentSessions.map((s) => s.score)
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length
    const variance = scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / scores.length
    const stdDev = Math.sqrt(variance)
    const cv = mean > 0 ? stdDev / mean : 0
    const consistencyScore = Math.max(0, Math.min(100, Math.round(100 - cv * 100)))

    const frequencyScore = Math.min(100, totalInterviews * 20)

    const compositeScore = Math.round(
      avgScore * 0.40 +
        peakScore * 0.15 +
        domainDiversity * 0.15 +
        integrityScore * 0.15 +
        consistencyScore * 0.10 +
        frequencyScore * 0.05,
    )

    const name = studentSessions[0].studentName
    const department = studentSessions[0].department || 'General'

    results.push({
      email,
      name,
      department,
      totalInterviews,
      avgScore,
      peakScore,
      domainDiversity,
      domainNames: Array.from(uniqueDomains),
      integrityScore,
      consistencyScore,
      frequencyScore,
      compositeScore,
      percentile: 0,
      rank: 0,
      tier: '',
      placementReady: !!placementReadyMap[email],
    })
  }

  results.sort((a, b) => b.compositeScore - a.compositeScore)

  const total = results.length
  for (let i = 0; i < total; i++) {
    results[i].rank = i + 1
    results[i].percentile = total > 1 ? Math.round(((total - i - 1) / (total - 1)) * 100) : 100
    const p = results[i].percentile
    if (p >= 99) results[i].tier = 'Top 1%'
    else if (p >= 95) results[i].tier = 'Top 5%'
    else if (p >= 85) results[i].tier = 'Top 15%'
    else if (p >= 70) results[i].tier = 'Top 30%'
    else if (p >= 50) results[i].tier = 'Top 50%'
    else results[i].tier = 'Above 50%'
  }

  return results
}
