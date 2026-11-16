// ── Quiz Document & Scanned OCR Parser (DOCX, PDF, Images, TXT, JSON) ─────────
// Extracts questions, code snippets, 4 options (A-D), and correct answer keys from
// digital documents, scanned PDFs, and question paper photos using Vision OCR & AI.

import mammoth from 'mammoth'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { auth } from '../firebase/firebase'
import type { QuizQuestion } from '../types/quiz'

GlobalWorkerOptions.workerSrc = workerUrl

export interface ExtractedPayload {
  text: string
  images: Array<{ mimeType: string; data: string }>
}

/**
 * Converts a browser File object to a clean base64 string (stripping data URL prefix).
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const base64 = result.replace(/^data:[^;]+;base64,/, '')
      resolve(base64)
    }
    reader.onerror = (err) => reject(err)
    reader.readAsDataURL(file)
  })
}

/**
 * Extracts text and any embedded images from a Word document (.docx).
 */
async function extractDocxPayload(file: File): Promise<ExtractedPayload> {
  const arrayBuffer = await file.arrayBuffer()
  const rawTextResult = await mammoth.extractRawText({ arrayBuffer })
  const text = rawTextResult.value.trim()
  const images: Array<{ mimeType: string; data: string }> = []

  // Check for embedded images (e.g. photos/screenshots of questions pasted into Word)
  try {
    await mammoth.convertToHtml(
      { arrayBuffer },
      {
        convertImage: mammoth.images.imgElement((element) => {
          return element.read('base64').then((imgBase64) => {
            if (images.length < 8) {
              images.push({
                mimeType: element.contentType || 'image/jpeg',
                data: imgBase64,
              })
            }
            return { src: `data:${element.contentType || 'image/jpeg'};base64,${imgBase64}` }
          })
        }),
      }
    )
  } catch (imgErr) {
    console.warn('Docx image extraction skipped:', imgErr)
  }

  return { text, images }
}

/**
 * Extracts text and native PDF data for OCR from a PDF file (.pdf).
 */
async function extractPdfPayload(file: File): Promise<ExtractedPayload> {
  const base64 = await fileToBase64(file)
  let text = ''

  try {
    const buffer = new Uint8Array(await file.arrayBuffer())
    const doc = await getDocument({ data: buffer }).promise
    for (let i = 1; i <= Math.min(doc.numPages, 10); i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      text += content.items.map((it) => ('str' in it ? it.str : '')).join(' ') + '\n'
    }
  } catch (err) {
    console.warn('Digital text extraction from PDF failed:', err)
  }

  const images: Array<{ mimeType: string; data: string }> = []
  // Attach PDF as application/pdf payload for native Gemini multimodal OCR
  if (file.size <= 18 * 1024 * 1024) {
    images.push({
      mimeType: 'application/pdf',
      data: base64,
    })
  }

  return { text: text.trim(), images }
}

/**
 * Extracts base64 payload from an image file (.png, .jpg, .jpeg, .webp).
 */
async function extractImagePayload(file: File): Promise<ExtractedPayload> {
  const base64 = await fileToBase64(file)
  const mimeType = file.type || (file.name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg')
  return {
    text: '',
    images: [{ mimeType, data: base64 }],
  }
}

/**
 * Extracts payload (text and/or image/PDF) from any supported file format.
 */
export async function extractDocumentPayload(file: File): Promise<ExtractedPayload> {
  const fileName = file.name.toLowerCase()

  // 1. Word Document (.docx, .doc)
  if (fileName.endsWith('.docx') || fileName.endsWith('.doc')) {
    return extractDocxPayload(file)
  }

  // 2. PDF Document (.pdf)
  if (fileName.endsWith('.pdf')) {
    return extractPdfPayload(file)
  }

  // 3. Standalone Image / Question Sheet Photo (.png, .jpg, .jpeg, .webp)
  if (
    fileName.endsWith('.png') ||
    fileName.endsWith('.jpg') ||
    fileName.endsWith('.jpeg') ||
    fileName.endsWith('.webp') ||
    file.type.startsWith('image/')
  ) {
    return extractImagePayload(file)
  }

  // 4. Plaintext / Markdown / CSV / JSON (.txt, .md, .csv, .tsv)
  const text = (await file.text()).trim()
  return { text, images: [] }
}

/**
 * Heuristic fallback parser using regular expressions to extract MCQs from raw text.
 */
export function parseQuizTextHeuristically(text: string): QuizQuestion[] {
  const questions: QuizQuestion[] = []
  if (!text || text.length < 10) return []

  const rawBlocks = text.split(/(?:\r?\n)+(?=(?:Q(?:uestion)?\s*\.?\s*\d+[.:)]|\b\d+[.:)]\s+))/i)

  for (let i = 0; i < rawBlocks.length; i++) {
    const block = rawBlocks[i].trim()
    if (!block) continue

    // Extract Answer Key: e.g. "Ans: B", "Answer: (C)", "Correct Answer: A", "Correct: D"
    let correctIndex = 0
    const ansMatch = block.match(/(?:(?:correct\s+)?ans(?:wer)?|key)\s*[:=-]?\s*\(?([A-D1-4])\)?/i)
    if (ansMatch) {
      const char = ansMatch[1].toUpperCase()
      if (char === 'A' || char === '1') correctIndex = 0
      else if (char === 'B' || char === '2') correctIndex = 1
      else if (char === 'C' || char === '3') correctIndex = 2
      else if (char === 'D' || char === '4') correctIndex = 3
    }

    // Extract Explanation
    let explanation = ''
    const expMatch = block.match(/(?:explanation|solution|rationale)\s*[:=-]?\s*([^\n\r]+(?:\n[^\n\r]+)*)/i)
    if (expMatch) {
      explanation = expMatch[1].trim()
    }

    // Extract Options: A), B), C), D)
    const optRegex = /(?:^|\n)\s*(?:\(?([A-D1-4])\)|\b([A-D1-4])[.:)])\s+([^\n]+)/g
    const matches = Array.from(block.matchAll(optRegex))

    const options: [string, string, string, string] = ['', '', '', '']
    if (matches.length >= 2) {
      matches.slice(0, 4).forEach((m, idx) => {
        const optText = (m[3] || '').replace(/(?:(?:correct\s+)?ans(?:wer)?|explanation|key).*/i, '').trim()
        options[idx] = optText
      })
    }

    // Fill missing options if document had fewer than 4
    for (let o = 0; o < 4; o++) {
      if (!options[o]) {
        options[o] = `Option ${String.fromCharCode(65 + o)}`
      }
    }

    // Extract Question Statement
    let qText = block
    if (matches.length > 0 && matches[0].index !== undefined) {
      qText = block.substring(0, matches[0].index)
    }

    qText = qText
      .replace(/^(?:Q(?:uestion)?\s*\.?\s*\d+[.:)]|\b\d+[.:)]\s*)/i, '')
      .replace(/(?:(?:correct\s+)?ans(?:wer)?|key)\s*[:=-]?\s*\(?[A-D1-4]\)?/i, '')
      .trim()

    if (qText.length > 0) {
      questions.push({
        id: `q-doc-${Date.now()}-${i}`,
        question: qText,
        options,
        correctIndex,
        explanation: explanation || undefined,
        points: 1,
      })
    }
  }

  return questions
}

/**
 * Intelligent Quiz Document & OCR Parser.
 * Uses Multimodal Gemini AI (reading text, scanned PDF pages, and docx images via OCR).
 * Falls back to heuristic text parsing when text is available.
 */
export async function parseQuizDocument(file: File): Promise<{
  questions: QuizQuestion[]
  titleSuggestion: string
}> {
  // 1. Direct JSON file import check
  if (file.name.toLowerCase().endsWith('.json')) {
    try {
      const parsed = JSON.parse(await file.text())
      if (Array.isArray(parsed) && parsed.length > 0) {
        const questions: QuizQuestion[] = parsed.map((item, idx) => ({
          id: `q-json-${Date.now()}-${idx}`,
          question: item.question || item.title || `Question ${idx + 1}`,
          codeSnippet: item.codeSnippet || undefined,
          options: (item.options && item.options.length === 4
            ? item.options
            : [
                item.options?.[0] || 'Option A',
                item.options?.[1] || 'Option B',
                item.options?.[2] || 'Option C',
                item.options?.[3] || 'Option D',
              ]) as [string, string, string, string],
          correctIndex:
            typeof item.correctIndex === 'number'
              ? item.correctIndex
              : typeof item.answer === 'number'
              ? item.answer
              : 0,
          explanation: item.explanation || undefined,
          points: item.points || 1,
        }))
        return {
          questions,
          titleSuggestion: file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
        }
      }
    } catch {
      // Fall through to standard extraction
    }
  }

  // 2. Extract Document Payload (text and/or image/PDF attachments)
  const { text: rawText, images } = await extractDocumentPayload(file)

  if ((!rawText || rawText.length < 10) && images.length === 0) {
    throw new Error('The uploaded document or image appears to be empty or unreadable.')
  }

  let questions: QuizQuestion[] = []

  // 3. Attempt Gemini Multimodal Vision / OCR Parsing
  try {
    const token = await auth.currentUser?.getIdToken()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }

    const ocrInstruction = images.length > 0
      ? 'Perform Optical Character Recognition (OCR) on the attached document/images. Read all printed text, mathematical expressions, code blocks, question numbers, options, and answer keys carefully.'
      : 'Extract all multiple-choice questions from the provided text.'

    const prompt = `You are an expert assessment parser and OCR engine.
${ocrInstruction}

Each question MUST have:
1. "question": The exact question statement without option letters.
2. "codeSnippet": Code snippet string if present, or empty string.
3. "options": Array of exactly 4 strings for options A, B, C, D (exclude the option letter prefixes like "A)", "B." from the option text).
4. "correctIndex": Integer (0 for A, 1 for B, 2 for C, 3 for D) based on the specified answer key or correct answer marked in the document/image. If not specified, choose the technically correct answer.
5. "explanation": Technical explanation if provided, or empty string.

${rawText ? `Extracted Document Text:\n"""\n${rawText.slice(0, 15000)}\n"""\n` : ''}

Return ONLY a valid JSON array of question objects matching this schema:
[
  {
    "question": "string",
    "codeSnippet": "string",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctIndex": 0,
    "explanation": "string"
  }
]
No markdown wrapping, no explanations, no text other than the JSON array.`

    const AI_API_URL = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL || '')
    const res = await fetch(`${AI_API_URL}/api/ai/generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        prompt,
        sys: 'You are an accurate assessment document parser and OCR engine that extracts structured MCQs into JSON.',
        images: images.length > 0 ? images : undefined,
      }),
    })

    if (res.ok) {
      const data = await res.json()
      const responseText = data.text || ''
      const match = responseText.match(/\[[\s\S]*\]/)
      if (match) {
        const rawArr = JSON.parse(match[0])
        if (Array.isArray(rawArr) && rawArr.length > 0) {
          questions = rawArr.map((q, idx) => ({
            id: `q-doc-${Date.now()}-${idx}`,
            question: q.question || `Question ${idx + 1}`,
            codeSnippet: q.codeSnippet?.trim() || undefined,
            options: (q.options && q.options.length === 4
              ? q.options
              : [
                  q.options?.[0] || 'Option A',
                  q.options?.[1] || 'Option B',
                  q.options?.[2] || 'Option C',
                  q.options?.[3] || 'Option D',
                ]) as [string, string, string, string],
            correctIndex:
              typeof q.correctIndex === 'number' && q.correctIndex >= 0 && q.correctIndex <= 3
                ? q.correctIndex
                : 0,
            explanation: q.explanation?.trim() || undefined,
            points: 1,
          }))
        }
      }
    }
  } catch (err) {
    console.warn('AI OCR document parsing bypassed, attempting heuristic fallback:', err)
  }

  // 4. Fallback to deterministic regex heuristic parsing if AI didn't return questions but text exists
  if (questions.length === 0 && rawText && rawText.length >= 15) {
    questions = parseQuizTextHeuristically(rawText)
  }

  if (questions.length === 0) {
    throw new Error(
      'Could not detect any multiple-choice questions in the document or image. Please ensure the file contains legible questions, 4 options (A, B, C, D), and an answer key.'
    )
  }

  const titleSuggestion = file.name
    .replace(/\.[^/.]+$/, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())

  return { questions, titleSuggestion }
}
