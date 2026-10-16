// ── NVIDIA NIM LLM Integration for Automated Coding Problem Generation ──────
// Uses NVIDIA NIM (https://integrate.api.nvidia.com/v1) with OpenAI-compatible API.
// Recommended model: qwen/qwen2.5-coder-32b-instruct (benchmark leader for coding),
// with fallback to nvidia/llama-3.1-nemotron-70b-instruct or Google Gemini if NVIDIA_API_KEY is unset.
// ─────────────────────────────────────────────────────────────────────────────

import { callGemini } from './gemini.js'

const NVIDIA_BASE_URL = process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1'
const DEFAULT_NVIDIA_MODEL = process.env.NVIDIA_MODEL || 'qwen/qwen2.5-coder-32b-instruct'

/**
 * Resolves the appropriate NVIDIA API key based on the selected model.
 */
function getApiKeyForModel(modelName) {
  const m = (modelName || '').toLowerCase()
  if (m.includes('qwen')) return process.env.NVIDIA_KEY_QWEN || process.env.NVIDIA_API_KEY
  if (m.includes('nemotron')) return process.env.NVIDIA_KEY_NEMOTRON || process.env.NVIDIA_API_KEY
  if (m.includes('meta') || m.includes('llama')) return process.env.NVIDIA_KEY_META || process.env.NVIDIA_API_KEY
  return process.env.NVIDIA_API_KEY
}

/**
 * Call NVIDIA NIM Chat Completions endpoint with JSON-mode output.
 */
export async function callNvidia(prompt, sys, { model = DEFAULT_NVIDIA_MODEL, temperature = 0.2 } = {}) {
  const apiKey = getApiKeyForModel(model)
  if (!apiKey) {
    console.warn(`⚠️ No NVIDIA API key configured for model "${model}". Falling back to Gemini.`)
    return callGemini(prompt, sys)
  }

  const endpoint = `${NVIDIA_BASE_URL.replace(/\/$/, '')}/chat/completions`

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: sys || 'You are an expert competitive programming judge and system designer.' },
          { role: 'user', content: prompt },
        ],
        temperature,
        top_p: 0.8,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
      }),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      console.error(`NVIDIA API HTTP ${res.status}:`, errText)
      console.warn('Falling back to Gemini due to NVIDIA API error.')
      return callGemini(prompt, sys)
    }

    const data = await res.json()
    const content = data.choices?.[0]?.message?.content || ''
    return content
  } catch (err) {
    console.error('NVIDIA NIM request failed:', err.message)
    console.warn('Falling back to Gemini due to network/execution error.')
    return callGemini(prompt, sys)
  }
}

/**
 * Strips markdown code fences (e.g. ```json ... ```) to safely parse JSON.
 */
function cleanAndParseJson(raw) {
  let text = (raw || '').trim()
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  }
  return JSON.parse(text)
}

/**
 * Generates a complete, structured coding problem with starter templates and test cases.
 */
export async function generateCodingProblemWithAI({
  topic,
  difficulty = 'Medium',
  languages = ['python', 'javascript', 'cpp', 'java'],
  facultyNotes = '',
  model = DEFAULT_NVIDIA_MODEL,
}) {
  const systemPrompt = `You are an elite competitive programming architect for PrepHire.AI coding sandbox (which uses Piston execution engine).
Your task is to take a faculty member's brief problem concept and output a complete, publication-grade programming problem.
CRITICAL FORMAT RULE: You MUST return a single, valid JSON object ONLY. No markdown, no preface, no trailing text.

THE PREPHIRE SANDBOX CONVENTION:
1. Piston executes code via standard input (stdin) and verifies against expected standard output (stdout).
2. For each requested language, provide starter code that includes:
   - A clean solution function (e.g., \`def solve(...):\`)
   - An I/O driver at the bottom that parses \`sys.stdin\` / \`process.stdin\` / \`cin\` / \`Scanner\`, calls the function, and prints the result to stdout.
3. Provide an optimal \`referenceSolution\` in Python 3 that fully solves the problem and passes all test cases via stdin/stdout.
4. Output must be strictly normalized: single values or clean lines, no conversational text like "The answer is:".
5. Test cases must be 100% mathematically correct matching the reference solution. Include 2-3 sample tests with clear explanations and 5-8 comprehensive hidden test cases (testing boundary limits, edge cases, large inputs, zeros, negative numbers).

JSON OUTPUT SCHEMA:
{
  "title": "String (concise, clear problem title)",
  "slug": "String (kebab-case)",
  "difficulty": "Easy" | "Medium" | "Hard",
  "topics": ["String", "String"],
  "statement": "String (detailed markdown problem description)",
  "inputFormat": "String (e.g. 'First line contains integer n, second line contains n space-separated integers...')",
  "outputFormat": "String (e.g. 'Print a single integer denoting...')",
  "constraints": "String (e.g. '1 <= n <= 10^5\\n-10^9 <= arr[i] <= 10^9')",
  "timeLimitMs": 2000,
  "memoryLimitMb": 256,
  "languages": ["python", "javascript", "cpp", "java"],
  "starterCode": {
    "python": "String",
    "javascript": "String",
    "cpp": "String",
    "java": "String"
  },
  "referenceSolution": {
    "language": "python",
    "code": "String (complete, working Python 3 code with stdin reader and stdout printer)"
  },
  "sampleTests": [
    { "input": "String", "output": "String", "explanation": "String" }
  ],
  "hiddenTests": [
    { "input": "String", "output": "String" }
  ]
}`

  const userPrompt = `Generate a complete coding problem with the following requirements:
- Topic / Concept: "${topic}"
- Target Difficulty: ${difficulty}
- Target Languages: ${languages.join(', ')}
${facultyNotes ? `- Additional Faculty Instructions: "${facultyNotes}"` : ''}

Ensure:
1. Starter code for each requested language (${languages.join(', ')}) includes both the core algorithm stub and standard I/O reader.
2. The referenceSolution is complete, optimal Python 3 code ready to be executed against the test cases in Piston.
3. Provide at least 2 sample test cases with explanations and 5 diverse hidden test cases (including edge cases).
4. Return ONLY valid JSON.`

  const raw = await callNvidia(userPrompt, systemPrompt, { model })
  const problem = cleanAndParseJson(raw)

  // Ensure default fallback values if any field was omitted
  return {
    title: problem.title || topic,
    slug: problem.slug || (problem.title || topic).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
    difficulty: ['Easy', 'Medium', 'Hard'].includes(problem.difficulty) ? problem.difficulty : difficulty,
    topics: Array.isArray(problem.topics) && problem.topics.length ? problem.topics : ['Algorithms'],
    statement: problem.statement || '',
    inputFormat: problem.inputFormat || '',
    outputFormat: problem.outputFormat || '',
    constraints: problem.constraints || '',
    timeLimitMs: problem.timeLimitMs || 2000,
    memoryLimitMb: problem.memoryLimitMb || 256,
    languages: Array.isArray(problem.languages) && problem.languages.length ? problem.languages : languages,
    starterCode: problem.starterCode || {},
    referenceSolution: problem.referenceSolution || null,
    sampleTests: Array.isArray(problem.sampleTests) ? problem.sampleTests : [],
    hiddenTests: Array.isArray(problem.hiddenTests) ? problem.hiddenTests : [],
  }
}
