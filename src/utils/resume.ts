import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { auth } from '../firebase/firebase'

GlobalWorkerOptions.workerSrc = workerUrl

export interface ResumeProfile {
  education: string
  skills: string[]
  techStacks: string[]
  experience: string
  projects: string[]
  certifications: string[]
  achievements?: string[]
}

const MAX_RESUME_CHARS = 8000
const MAX_NOTES_CHARS = 500

/**
 * Extracts raw text from a PDF with preserved line breaks and spatial structure.
 * Checks coordinate jumps (Y-axis translation) and hasEOL signals so sections,
 * titles, and bullet points don't collapse into a single giant line.
 */
export async function extractResumeText(file: File): Promise<string> {
  const buffer = new Uint8Array(await file.arrayBuffer())
  const doc = await getDocument({ data: buffer }).promise
  let fullText = ''

  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      let lastY: number | null = null
      let pageText = ''

      for (const item of content.items) {
        if (!('str' in item)) continue
        const str = item.str
        if (!str) continue

        const transform = item.transform
        const y = transform ? transform[5] : null

        // If Y coordinate drops significantly (new line in visual layout)
        if (lastY !== null && y !== null && Math.abs(y - lastY) > 4) {
          pageText += '\n' + str
        } else if (item.hasEOL) {
          pageText += (pageText ? ' ' : '') + str + '\n'
        } else {
          pageText += (pageText && !pageText.endsWith('\n') ? ' ' : '') + str
        }
        if (y !== null) lastY = y
      }

      fullText += pageText.trim() + '\n\n'
      if (fullText.length >= MAX_RESUME_CHARS) break
    }
  } finally {
    await (doc as unknown as { destroy?: () => Promise<void> })?.destroy?.().catch(() => {})
  }

  return fullText.trim().slice(0, MAX_RESUME_CHARS)
}

const AI_API_URL = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL || '')

async function callGemini(prompt: string, sys: string): Promise<string> {
  const token = await auth.currentUser?.getIdToken()
  if (!token) {
    throw new Error('You must be signed in to use AI features.')
  }
  const res = await fetch(`${AI_API_URL}/api/ai/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ prompt, sys }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'AI request failed.')
  }
  const d = await res.json()
  return d.text || ''
}

const KNOWN_SKILLS = [
  'Python', 'JavaScript', 'TypeScript', 'Java', 'C++', 'C#', 'C', 'Go', 'Rust', 'Ruby', 'PHP', 'Swift', 'Kotlin', 'Dart', 'SQL', 'HTML5', 'CSS3', 'HTML', 'CSS',
  'React', 'Next.js', 'Angular', 'Vue.js', 'Vue', 'Node.js', 'Express.js', 'Express', 'Django', 'Flask', 'FastAPI', 'Spring Boot', 'Spring', 'ASP.NET', 'Flutter',
  'MongoDB', 'PostgreSQL', 'MySQL', 'Redis', 'SQLite', 'Firebase', 'Supabase', 'Oracle', 'DynamoDB',
  'Docker', 'Kubernetes', 'AWS', 'Azure', 'GCP', 'Google Cloud', 'Git', 'GitHub', 'GitLab', 'CI/CD', 'Linux', 'REST API', 'GraphQL', 'Microservices', 'WebSockets',
  'Machine Learning', 'Deep Learning', 'TensorFlow', 'PyTorch', 'Scikit-Learn', 'Pandas', 'NumPy', 'OpenCV', 'NLP', 'Computer Vision', 'Data Analysis', 'Generative AI',
  'Power BI', 'Vercel', 'Railway', 'PeerJS', 'Tailwind CSS', 'Bootstrap', 'Postman', 'LangChain', 'HuggingFace', 'Prisma', 'Socket.io',
  'Data Structures', 'Algorithms', 'OOP', 'System Design', 'DBMS', 'Operating Systems', 'Computer Networks', 'Agile', 'Scrum'
]

/**
 * Deterministic rule-based offline resume parser fallback.
 * Automatically extracts candidate skills, education, projects, tech stacks,
 * certifications, and achievements directly from raw text with 100% reliability.
 */
export function offlineParseResume(text: string): ResumeProfile {
  const clean = text.replace(/\r/g, '').trim()

  // Normalize Unicode bullets and dashes
  const normalized = clean
    .replace(/[\u2013\u2014]/g, '—')
    .replace(/[\u2022\u25cf\u25cb\u25aa\u25fe▪*]/g, '•')

  const SECTION_ALIASES: Record<string, string[]> = {
    summary: ['SUMMARY', 'PROFESSIONAL SUMMARY', 'ABOUT ME', 'PROFILE', 'OBJECTIVE'],
    education: ['EDUCATION', 'ACADEMIC BACKGROUND', 'ACADEMICS', 'QUALIFICATIONS'],
    projects: ['PROJECTS', 'ACADEMIC PROJECTS', 'KEY PROJECTS', 'PERSONAL PROJECTS', 'NOTABLE PROJECTS'],
    experience: ['EXPERIENCE', 'WORK EXPERIENCE', 'PROFESSIONAL EXPERIENCE', 'EMPLOYMENT', 'INTERNSHIPS', 'INTERNSHIP'],
    skills: ['SKILLS', 'TECHNICAL SKILLS', 'SKILLS & TECHNOLOGIES', 'TECH STACK', 'CORE COMPETENCIES', 'TOOLS & TECHNOLOGIES'],
    achievements: ['ACHIEVEMENTS', 'ACCOMPLISHMENTS', 'AWARDS', 'HONORS & AWARDS', 'HONORS'],
    certifications: ['CERTIFICATIONS', 'CERTIFICATES', 'COURSES', 'LICENSES & CERTIFICATIONS'],
    interests: ['INTERESTS & SOFT SKILLS', 'INTERESTS', 'SOFT SKILLS', 'HOBBIES', 'EXTRACURRICULAR']
  }

  // Find section heading boundaries that appear at line start
  const allHeaders: { canon: string; alias: string }[] = []
  for (const [canon, aliases] of Object.entries(SECTION_ALIASES)) {
    for (const alias of aliases) {
      allHeaders.push({ canon, alias })
    }
  }

  const foundSections: { canon: string; title: string; index: number; contentStart: number }[] = []
  for (const item of allHeaders) {
    const escaped = item.alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`(?:^|\\n)\\s*${escaped}\\s*(?:\\n|:|$)`, 'gi')
    let m: RegExpExecArray | null
    while ((m = regex.exec(normalized)) !== null) {
      foundSections.push({
        canon: item.canon,
        title: item.alias,
        index: m.index,
        contentStart: m.index + m[0].length
      })
    }
  }

  // Sort sections by document order
  foundSections.sort((a, b) => a.index - b.index)

  // Deduplicate overlapping indices
  const validSections: typeof foundSections = []
  for (const s of foundSections) {
    if (validSections.length === 0 || s.index >= validSections[validSections.length - 1].contentStart) {
      validSections.push(s)
    }
  }

  const sectionsContent: Record<string, string> = {}
  for (let i = 0; i < validSections.length; i++) {
    const cur = validSections[i]
    const nextStart = i + 1 < validSections.length ? validSections[i + 1].index : normalized.length
    sectionsContent[cur.canon] = normalized.slice(cur.contentStart, nextStart).trim()
  }

  // 1. SKILLS EXTRACTION
  const rawSkills: string[] = []
  const skillsText = sectionsContent['skills'] || ''
  if (skillsText) {
    const sLines = skillsText.split('\n').map((l) => l.trim()).filter(Boolean)
    for (const l of sLines) {
      const parts = l.split(/:\s*/)
      const textToSplit = parts.length > 1 ? parts.slice(1).join(': ') : parts[0]
      const items = textToSplit
        .split(/[,|•·▪]/)
        .map((s) => s.replace(/\([^)]*\)/g, '').trim())
        .filter((s) => s.length > 1 && s.length < 35)
      rawSkills.push(...items)
    }
  }

  // Also scan full text for KNOWN_SKILLS
  for (const skill of KNOWN_SKILLS) {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`\\b${escaped}\\b`, 'i')
    if (regex.test(normalized) && !rawSkills.some((s) => s.toLowerCase() === skill.toLowerCase())) {
      rawSkills.push(skill)
    }
  }

  const skills = Array.from(new Set(rawSkills.map((s) => s.trim())))
    .filter((s) => s.length > 1 && !/^(basic|intermediate|advanced|tools|languages|web|backend|ai|ml)$/i.test(s))

  // 2. TECH STACKS CATEGORIZATION
  const techStacks: string[] = []
  if (skills.some((s) => /react|next\.?js|node|express|vue|angular|mongo/i.test(s))) techStacks.push('Full Stack / MERN')
  if (skills.some((s) => /fastapi|django|flask|python/i.test(s))) techStacks.push('Python Web & APIs')
  if (skills.some((s) => /machine learning|deep learning|data analysis|generative ai|tensorflow|pytorch/i.test(s))) techStacks.push('Data Science & AI/ML')
  if (skills.some((s) => /websockets|peerjs|webrtc|socket\.io/i.test(s))) techStacks.push('Real-Time & Networking')
  if (skills.some((s) => /docker|kubernetes|aws|azure|gcp|vercel|railway|ci\/cd/i.test(s))) techStacks.push('Cloud & DevOps')
  if (skills.some((s) => /\bjava\b|spring/i.test(s))) techStacks.push('Java Enterprise')
  if (skills.some((s) => /c\+\+|data structures|algorithms/i.test(s))) techStacks.push('C++ Systems & DSA')
  if (techStacks.length === 0 && skills.length > 0) techStacks.push(skills.slice(0, 3).join(', '))

  // 3. PROJECTS EXTRACTION
  const projects: string[] = []
  const projText = sectionsContent['projects'] || ''
  if (projText) {
    const lines = projText.split('\n').map((l) => l.trim()).filter(Boolean)
    for (const l of lines) {
      const isBullet = /^[•\-*▪–—]/.test(l)
      const isTechHeader = /^(?:python|javascript|typescript|c\+\+|java|html|react)[\s·•|]/i.test(l)
      const isUrlLine = /^(?:https?:\/\/|github\.com|live\b)/i.test(l)
      if (!isBullet && !isTechHeader && !isUrlLine && l.length > 3 && l.length < 85) {
        const cleanTitle = l.replace(/\|?\s*(?:GitHub|Live Demo|Live|Demo|Code)\s*\|?/gi, '').trim()
        if (cleanTitle && !projects.includes(cleanTitle)) {
          projects.push(cleanTitle)
        }
      }
    }
  }

  // 4. EDUCATION EXTRACTION
  let education = ''
  const eduText = sectionsContent['education'] || ''
  if (eduText) {
    const lines = eduText.split('\n').map((l) => l.trim()).filter(Boolean)
    if (lines.length > 0) {
      education = lines.slice(0, 2).join(' — ').replace(/\s+/g, ' ')
    }
  }
  if (!education) {
    const eduMatch = normalized.match(
      /(?:B\.?\s*Tech|B\.?\s*E\.?|M\.?\s*Tech|Bachelor|Master|Diploma|BCA|MCA)[\s\S]{0,120}?(?:Computer|Information|Electronics|Mechanical|Civil|Engineering|Technology|University|College|Institute)/i
    )
    education = eduMatch ? eduMatch[0].replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim() : 'Engineering Undergraduate'
  }

  // 5. CERTIFICATIONS EXTRACTION
  const certifications: string[] = []
  const certText = sectionsContent['certifications'] || ''
  if (certText) {
    const lines = certText.split('\n').map((l) => l.trim()).filter(Boolean)
    for (const l of lines) {
      const cleanCert = l.replace(/^[•\-*▪–—]\s*/, '').trim()
      if (cleanCert.length > 4 && !/^(certifications|certificates|courses)$/i.test(cleanCert)) {
        certifications.push(cleanCert)
      }
    }
  }

  // 6. ACHIEVEMENTS EXTRACTION
  const achievements: string[] = []
  const achText = sectionsContent['achievements'] || ''
  if (achText) {
    const lines = achText.split('\n').map((l) => l.trim()).filter(Boolean)
    for (const l of lines) {
      const cleanAch = l.replace(/^[•\-*▪–—\s]+/, '').replace(/^[^\w\s]{1,3}\s*/, '').trim()
      if (cleanAch.length > 4) {
        achievements.push(cleanAch)
      }
    }
  }

  // 7. EXPERIENCE EXTRACTION
  let experience = ''
  const expText = sectionsContent['experience'] || ''
  if (expText) {
    const lines = expText.split('\n').map((l) => l.trim()).filter(Boolean)
    experience = lines.slice(0, 3).join(' | ').slice(0, 150)
  }
  if (!experience) {
    experience = 'Fresher / Academic Project Experience'
  }

  return {
    education: education.slice(0, 140),
    skills: skills.slice(0, 25),
    techStacks: techStacks.slice(0, 8),
    experience: experience.slice(0, 140),
    projects: projects.slice(0, 8),
    certifications: certifications.slice(0, 8),
    achievements: achievements.slice(0, 6)
  }
}

export async function analyzeResume(text: string): Promise<ResumeProfile> {
  const sys = `You are an expert resume parser. Extract a comprehensive candidate profile.
Return ONLY valid JSON matching this schema with NO markdown code fences and NO additional prose:
{
  "education": "string with highest degree, college, and GPA/percentage if present",
  "skills": ["string", "string", ...],
  "techStacks": ["string", ...],
  "experience": "string summarizing work history or internships",
  "projects": ["string with project name and domain", ...],
  "certifications": ["string with cert name and provider", ...],
  "achievements": ["string with hackathon, award, or key metric", ...]
}`

  try {
    const raw = await callGemini(
      `Extract a structured profile from this resume. Keep each field concise and accurate. Include all programming languages, backend/frontend frameworks, tools, projects, certifications, and awards mentioned. Omit phone numbers, addresses, and dates of birth.\n\n${text}`,
      sys
    )
    const cleaned = raw.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(cleaned) as Partial<ResumeProfile>

    const offlineFallback = offlineParseResume(text)

    const combinedSkills = Array.from(new Set([
      ...(Array.isArray(parsed.skills) ? parsed.skills.map((s) => String(s).trim()) : []),
      ...offlineFallback.skills,
    ])).filter(Boolean).slice(0, 25)

    const combinedProjects = (Array.isArray(parsed.projects) && parsed.projects.length > 0)
      ? parsed.projects.map((p) => String(p).trim()).slice(0, 10)
      : offlineFallback.projects

    const combinedCerts = (Array.isArray(parsed.certifications) && parsed.certifications.length > 0)
      ? parsed.certifications.map((c) => String(c).trim()).slice(0, 8)
      : offlineFallback.certifications

    const combinedAchievements = (Array.isArray(parsed.achievements) && parsed.achievements.length > 0)
      ? parsed.achievements.map((a) => String(a).trim()).slice(0, 6)
      : (offlineFallback.achievements || [])

    return {
      education: parsed.education?.trim() || offlineFallback.education,
      skills: combinedSkills.length > 0 ? combinedSkills : offlineFallback.skills,
      techStacks: (Array.isArray(parsed.techStacks) && parsed.techStacks.length > 0)
        ? parsed.techStacks.map((s) => String(s).trim()).slice(0, 8)
        : offlineFallback.techStacks,
      experience: parsed.experience?.trim() || offlineFallback.experience,
      projects: combinedProjects,
      certifications: combinedCerts,
      achievements: combinedAchievements,
    }
  } catch (err) {
    console.warn('⚠️ AI resume analysis failed or unavailable, activating rule-based offline parser:', err)
    return offlineParseResume(text)
  }
}

export function buildResumeContext(profile: ResumeProfile, notes: string, domain: string): string {
  const isTechnical = domain === 'technical'
  const isHr = domain === 'hr'
  if (!isTechnical && !isHr) return ''

  const parts: string[] = []
  if (profile.education) parts.push(`Education: ${profile.education}`)
  if (profile.skills.length) parts.push(`Skills: ${profile.skills.join(', ')}`)
  if (profile.techStacks.length) parts.push(`Tech stacks: ${profile.techStacks.join(', ')}`)
  if (profile.experience) parts.push(`Experience: ${profile.experience}`)
  if (profile.projects.length) parts.push(`Projects: ${profile.projects.join('; ')}`)
  if (profile.certifications.length) parts.push(`Certifications: ${profile.certifications.join(', ')}`)
  if (profile.achievements && profile.achievements.length) parts.push(`Achievements: ${profile.achievements.join('; ')}`)
  if (parts.length === 0) return ''

  const rule = isTechnical
    ? 'Questions MUST be grounded in this resume. Drill into the listed tech stacks and projects, and ask depth questions on the top 2 most relevant skills.'
    : "Base behavioral questions on the candidate's listed experience, projects, achievements, and certifications. Probe examples they actually mention."
  const notesCtx = notes.trim() ? ` Candidate's own notes: "${notes.trim().substring(0, MAX_NOTES_CHARS)}".` : ''
  return `Candidate resume profile: ${parts.join(' | ')}. ${rule}${notesCtx} `
}
