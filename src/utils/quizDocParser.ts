// ── Quiz Document Parser (DOCX, PDF, TXT, JSON) ──────────────────────────────
// Extracts questions, 4 options (A-D), and correct answer keys from uploaded files.

import mammoth from 'mammoth'
import { extractResumeText } from './resume'
import type { QuizQuestion } from '../types/quiz'

/**
 * Extracts raw textual content from an uploaded document file (.docx, .pdf, .txt, .json).
 */
export async function extractDocumentText(file: File): Promise<string> {
  const fileName = file.name.toLowerCase()

  // 1. Word Document (.docx)
  if (fileName.endsWith('.docx') || fileName.endsWith('.doc')) {
    const arrayBuffer = await file.arrayBuffer()
    const result = await mammoth.extractRawText({ arrayBuffer })
    return result.value.trim()
  }

  // 2. PDF Document (.pdf)
  if (fileName.endsWith('.pdf')) {
    const text = await extractResumeText(file)
    return text.trim()
  }

  // 3. Plain Text / Markdown / CSV (.txt, .md, .csv)
  if (
    fileName.endsWith('.txt') ||
    fileName.endsWith('.md') ||
    fileName.endsWith('.csv') ||
    fileName.endsWith('.tsv') ||
    fileName.endsWith('.json')
  ) {
    return (await file.text()).trim()
  }

  // Fallback: Attempt plain text read
  return (await file.text()).trim()
}

/**
 * Heuristic fallback parser using regular expressions to extract MCQs from raw text.
 */
export function parseQuizTextHeuristically(text: string): QuizQuestion[] {
  const questions: QuizQuestion[] = []
  if (!text || text.length < 10) return []

  // Split into chunks based on question numbering patterns:
  // e.g. "1.", "Q1.", "Question 1:", "1)", "Q.1"
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

    // Extract Explanation: e.g. "Explanation: ..." or "Solution: ..."
    let explanation = ''
    const expMatch = block.match(/(?:explanation|solution|rationale)\s*[:=-]?\s*([^\n\r]+(?:\n[^\n\r]+)*)/i)
    if (expMatch) {
      explanation = expMatch[1].trim()
    }

    // Extract Options: Look for A), B), C), D) or (A), (B), (C), (D) or A., B., C., D.
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

    // Extract Question Statement: Text before the first option
    let qText = block
    if (matches.length > 0 && matches[0].index !== undefined) {
      qText = block.substring(0, matches[0].index)
    }

    // Clean leading "1.", "Q1:", etc. from question text
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
 * Intelligent Quiz Document Parser.
 * Uses AI if available for 100% formatting fidelity, falling back to heuristic parsing.
 */
export async function parseQuizDocument(file: File): Promise<{
  questions: QuizQuestion[]
  titleSuggestion: string
}> {
  // Check if JSON file directly uploaded
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
      // Fall through to text extraction
    }
  }

  const rawText = await extractDocumentText(file)
  if (!rawText || rawText.trim().length < 15) {
    throw new Error('The uploaded document appears to be empty or unreadable.')
  }

  let questions: QuizQuestion[] = []

  // Attempt AI parsing first
  try {
    const prompt = `You are a quiz document parser. Extract all multiple-choice questions from the following text document.
Each question MUST have:
1. "question": The exact question statement.
2. "codeSnippet": Code snippet string if present, or empty string.
3. "options": Array of exactly 4 strings for options A, B, C, D.
4. "correctIndex": Integer (0 for A, 1 for B, 2 for C, 3 for D) based on the specified answer key or correct answer in the document.
5. "explanation": Explanation text if provided, or empty string.

Document Content:
"""
${rawText.slice(0, 12000)}
"""

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

    const res = await fetch('/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        systemPrompt: 'You are an accurate assessment document parser that extracts structured MCQs.',
      }),
    })

    if (res.ok) {
      const data = await res.json()
      const text = data.text || ''
      const match = text.match(/\[[\s\S]*\]/)
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
    console.warn('AI document parsing bypassed, using heuristic parser:', err)
  }

  // Fallback to deterministic regex heuristic parsing if AI didn't return questions
  if (questions.length === 0) {
    questions = parseQuizTextHeuristically(rawText)
  }

  if (questions.length === 0) {
    throw new Error(
      'Could not detect any multiple-choice questions in the document. Please ensure questions have statements and options (e.g. A, B, C, D) and an answer key.'
    )
  }

  const titleSuggestion = file.name
    .replace(/\.[^/.]+$/, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())

  return { questions, titleSuggestion }
}
