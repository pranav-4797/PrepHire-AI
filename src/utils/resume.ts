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

export async function analyzeResume(text: string): Promise<ResumeProfile> {
  const sys = `You are a resume parser. Return ONLY valid JSON, no markdown:
{"education":"...","skills":["..."],"techStacks":["..."],"experience":"...","projects":["..."],"certifications":["..."]}`
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