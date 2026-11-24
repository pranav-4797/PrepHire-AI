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
}

const MAX_RESUME_CHARS = 6000
const MAX_NOTES_CHARS = 500

export async function extractResumeText(file: File): Promise<string> {
  const buffer = new Uint8Array(await file.arrayBuffer())
  const doc = await getDocument({ data: buffer }).promise
  let text = ''
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    text +=
      content.items.map((it) => (('str' in it ? it.str : '') as string)).join(' ') + '\n'
    if (text.length >= MAX_RESUME_CHARS) break
  }
  return text.trim().slice(0, MAX_RESUME_CHARS)
}

const AI_API_URL = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL || '')

// Calls our own Express server (/api/ai/generate), which holds the Gemini key
// server-side and forwards the request. The key never reaches the browser.
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
  'Docker', 'Kubernetes', 'AWS', 'Azure', 'GCP', 'Google Cloud', 'Git', 'GitHub', 'GitLab', 'CI/CD', 'Linux', 'REST API', 'GraphQL', 'Microservices',
  'Machine Learning', 'Deep Learning', 'TensorFlow', 'PyTorch', 'Scikit-Learn', 'Pandas', 'NumPy', 'OpenCV', 'NLP', 'Computer Vision',
  'Data Structures', 'Algorithms', 'OOP', 'System Design', 'DBMS', 'Operating Systems', 'Computer Networks', 'Agile', 'Scrum'
]

/**
 * Deterministic rule-based offline resume parser fallback.
 * Automatically extracts candidate skills, education, projects, and tech stacks
 * directly from raw text when Gemini or external AI endpoints are unavailable.
 */
export function offlineParseResume(text: string): ResumeProfile {
  const clean = text.replace(/\r/g, '')

  // 1. Extract Skills via dictionary token matching
  const foundSkills: string[] = []
  for (const skill of KNOWN_SKILLS) {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`\\b${escaped}\\b`, 'i')
    if (regex.test(clean) && !foundSkills.includes(skill)) {
      foundSkills.push(skill)
    }
  }

  // 2. Identify Tech Stacks based on matched skills
  const techStacks: string[] = []
  if (foundSkills.some((s) => ['React', 'Next.js', 'Node.js', 'Express', 'MongoDB'].includes(s))) {
    techStacks.push('Full Stack / MERN')
  }
  if (foundSkills.some((s) => ['Python', 'Django', 'Flask', 'FastAPI'].includes(s))) {
    techStacks.push('Python Web Services')
  }
  if (foundSkills.some((s) => ['Java', 'Spring Boot', 'Spring'].includes(s))) {
    techStacks.push('Java Enterprise')
  }
  if (foundSkills.some((s) => ['Machine Learning', 'Deep Learning', 'TensorFlow', 'PyTorch', 'Pandas'].includes(s))) {
    techStacks.push('Data Science & AI/ML')
  }
  if (foundSkills.some((s) => ['Docker', 'Kubernetes', 'AWS', 'Azure', 'GCP'].includes(s))) {
    techStacks.push('Cloud & DevOps')
  }
  if (foundSkills.some((s) => ['Flutter', 'Kotlin', 'Swift', 'Dart'].includes(s))) {
    techStacks.push('Mobile Development')
  }
  if (foundSkills.some((s) => ['C++', 'Data Structures', 'Algorithms'].includes(s))) {
    techStacks.push('C++ Competitive Systems')
  }
  if (techStacks.length === 0 && foundSkills.length > 0) {
    techStacks.push(foundSkills.slice(0, 3).join(', '))
  }

  // 3. Extract Education
  let education = ''
  const eduMatch = clean.match(
    /(?:B\.?\s*Tech|B\.?\s*E\.?|M\.?\s*Tech|Bachelor|Master|Diploma|BCA|MCA)[\s\S]{0,120}?(?:Computer|Information|Electronics|Mechanical|Civil|Engineering|Technology|University|College|Institute)/i
  )
  if (eduMatch) {
    education = eduMatch[0].replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim()
  } else {
    const fallbackCollege = clean.match(/(?:MIT\s*Academy\s*of\s*Engineering|Savitribai\s*Phule|Pune\s*University|[A-Z][a-z]+\s*College\s*of\s*Engineering)/i)
    education = fallbackCollege ? fallbackCollege[0] : 'Engineering Undergraduate'
  }

  const cgpaMatch = clean.match(/(?:CGPA|GPA|Percentage|Aggregate)[:\s]*([0-9]+(?:\.[0-9]+)?(?:\s*\/\s*10|\s*%)?)/i)
  if (cgpaMatch) {
    education += ` (Score: ${cgpaMatch[1]})`
  }

  // 4. Extract Projects
  const projects: string[] = []
  const projectSection = clean.match(/(?:PROJECTS|ACADEMIC PROJECTS|PERSONAL PROJECTS)([\s\S]*?)(?:EXPERIENCE|WORK EXPERIENCE|EDUCATION|SKILLS|CERTIFICATIONS|ACHIEVEMENTS|$)/i)
  if (projectSection && projectSection[1]) {
    const lines = projectSection[1].split('\n').map((l) => l.trim()).filter((l) => l.length > 5)
    for (const line of lines) {
      if (line.match(/^[•\-*▪]|\b(?:Developed|Built|Created|Implemented|Designed)\b/i) || (line.length < 50 && line.length > 8 && !line.includes(':'))) {
        projects.push(line.replace(/^[•\-*▪]\s*/, '').slice(0, 100))
        if (projects.length >= 5) break
      }
    }
  }

  // 5. Extract Experience / Internships
  let experience = ''
  const expSection = clean.match(/(?:EXPERIENCE|WORK EXPERIENCE|INTERNSHIP|INTERNSHIPS)([\s\S]*?)(?:PROJECTS|EDUCATION|SKILLS|CERTIFICATIONS|ACHIEVEMENTS|$)/i)
  if (expSection && expSection[1]) {
    const expLines = expSection[1].split('\n').map((l) => l.trim()).filter((l) => l.length > 8)
    experience = expLines.slice(0, 3).join(' | ').slice(0, 150)
  }
  if (!experience) {
    experience = 'Fresher / Academic Internship Practice'
  }

  // 6. Extract Certifications
  const certifications: string[] = []
  const certSection = clean.match(/(?:CERTIFICATIONS|CERTIFICATES|COURSES)([\s\S]*?)(?:PROJECTS|EDUCATION|SKILLS|EXPERIENCE|ACHIEVEMENTS|$)/i)
  if (certSection && certSection[1]) {
    const certLines = certSection[1].split('\n').map((l) => l.trim()).filter((l) => l.length > 5)
    for (const c of certLines) {
      certifications.push(c.replace(/^[•\-*▪]\s*/, '').slice(0, 80))
      if (certifications.length >= 4) break
    }
  }

  return {
    education: education.slice(0, 120),
    skills: foundSkills.slice(0, 15),
    techStacks: techStacks.slice(0, 6),
    experience: experience.slice(0, 120),
    projects: projects.length > 0 ? projects.slice(0, 6) : ['Campus Technical Capstone Project'],
    certifications: certifications.slice(0, 6),
  }
}

export async function analyzeResume(text: string): Promise<ResumeProfile> {
  const sys = `You are a resume parser. Return ONLY valid JSON, no markdown:
{"education":"...","skills":["..."],"techStacks":["..."],"experience":"...","projects":["..."],"certifications":["..."]}`
  
  try {
    const raw = await callGemini(
      `Extract a structured profile from this resume. Keep each field under 120 words. Omit phone numbers, addresses, and dates of birth.\n\n${text}`,
      sys
    )
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim()) as Partial<ResumeProfile>
    return {
      education: parsed.education || '',
      skills: Array.isArray(parsed.skills) ? parsed.skills.map((s) => String(s)).slice(0, 15) : [],
      techStacks: Array.isArray(parsed.techStacks) ? parsed.techStacks.map((s) => String(s)).slice(0, 10) : [],
      experience: parsed.experience || '',
      projects: Array.isArray(parsed.projects) ? parsed.projects.map((s) => String(s)).slice(0, 8) : [],
      certifications: Array.isArray(parsed.certifications) ? parsed.certifications.map((s) => String(s)).slice(0, 8) : [],
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
  if (parts.length === 0) return ''

  const rule = isTechnical
    ? 'Questions MUST be grounded in this resume. Drill into the listed tech stacks and projects, and ask depth questions on the top 2 most relevant skills.'
    : "Base behavioral questions on the candidate's listed experience, projects, and certifications. Probe examples they actually mention."
  const notesCtx = notes.trim() ? ` Candidate's own notes: "${notes.trim().substring(0, MAX_NOTES_CHARS)}".` : ''
  return `Candidate resume profile: ${parts.join(' | ')}. ${rule}${notesCtx} `
}