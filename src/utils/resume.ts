import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

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

async function callGemini(prompt: string, sys: string): Promise<string> {
  const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY
  if (!GEMINI_API_KEY) {
    throw new Error('Missing VITE_GEMINI_API_KEY environment variable.')
  }
  const baseUrl = import.meta.env.DEV ? '/gemini' : 'https://generativelanguage.googleapis.com'
  const res = await fetch(
    `${baseUrl}/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: sys }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      }),
    }
  )
  const d = await res.json()
  return d.candidates?.[0]?.content?.parts?.[0]?.text || ''
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