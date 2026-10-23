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
export async function callNvidia(prompt, sys, { model = DEFAULT_NVIDIA_MODEL, temperature = 0.2, clientApiKey = null } = {}) {
  const apiKey = getApiKeyForModel(model)
  if (!apiKey) {
    console.warn(`⚠️ No NVIDIA API key configured for model "${model}". Falling back to Gemini.`)
    return callGemini(prompt, sys, clientApiKey)
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
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenceMatch && fenceMatch[1]) {
    text = fenceMatch[1].trim()
  } else {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start !== -1 && end !== -1 && end > start) {
      text = text.substring(start, end + 1).trim()
    }
  }
  return JSON.parse(text)
}

/**
 * Generates an offline curated problem template matching the topic prompt
 * if both NVIDIA and Gemini are unconfigured or unavailable.
 */
function generateOfflineFallbackProblem({ topic, difficulty = 'Medium', languages = ['python', 'javascript', 'cpp', 'java'], facultyNotes = '' }) {
  const t = (topic || '').toLowerCase()
  const isSelectionSort = t.includes('selection') || (t.includes('sort') && !t.includes('quick') && !t.includes('merge'))
  const isBinarySearch = t.includes('binary') || t.includes('search')
  const isTwoSum = t.includes('two') || t.includes('sum')

  if (isSelectionSort) {
    return {
      title: 'Selection Sort Implementation',
      slug: 'selection-sort-implementation',
      difficulty: 'Easy',
      topics: ['Sorting', 'Arrays', 'Algorithms'],
      statement: `### Problem Statement\nGiven an array of integers \`arr\`, implement the **Selection Sort** algorithm to sort the array in ascending order.\n\n### Algorithm Overview\n1. Find the smallest element in the unsorted segment.\n2. Swap it with the element at the beginning of the unsorted segment.\n3. Repeat for each index until the whole array is sorted.\n\n${facultyNotes ? `> **Faculty Note:** ${facultyNotes}\n` : ''}`,
      inputFormat: 'The first line contains an integer n (1 <= n <= 10^4). The second line contains n space-separated integers.',
      outputFormat: 'Print the sorted array elements separated by single spaces.',
      constraints: '1 <= n <= 10^4\n-10^9 <= arr[i] <= 10^9',
      timeLimitMs: 2000,
      memoryLimitMb: 256,
      languages,
      starterCode: {
        python: `def selection_sort(arr):\n    n = len(arr)\n    for i in range(n):\n        min_idx = i\n        for j in range(i + 1, n):\n            if arr[j] < arr[min_idx]:\n                min_idx = j\n        arr[i], arr[min_idx] = arr[min_idx], arr[i]\n    return arr\n\nif __name__ == '__main__':\n    import sys\n    lines = sys.stdin.read().split()\n    if lines:\n        n = int(lines[0])\n        arr = [int(x) for x in lines[1:n+1]]\n        res = selection_sort(arr)\n        print(*(res))`,
        cpp: `#include <iostream>\n#include <vector>\nusing namespace std;\n\nvoid selectionSort(vector<int>& arr) {\n    int n = arr.size();\n    for (int i = 0; i < n; i++) {\n        int min_idx = i;\n        for (int j = i + 1; j < n; j++) {\n            if (arr[j] < arr[min_idx]) min_idx = j;\n        }\n        swap(arr[i], arr[min_idx]);\n    }\n}\n\nint main() {\n    int n;\n    if (cin >> n) {\n        vector<int> arr(n);\n        for (int i = 0; i < n; i++) cin >> arr[i];\n        selectionSort(arr);\n        for (int i = 0; i < n; i++) {\n            cout << arr[i] << (i == n - 1 ? "" : " ");\n        }\n        cout << endl;\n    }\n    return 0;\n}`,
        java: `import java.util.*;\n\npublic class Main {\n    public static void selectionSort(int[] arr) {\n        int n = arr.length;\n        for (int i = 0; i < n; i++) {\n            int minIdx = i;\n            for (int j = i + 1; j < n; j++) {\n                if (arr[j] < arr[minIdx]) minIdx = j;\n            }\n            int temp = arr[i];\n            arr[i] = arr[minIdx];\n            arr[minIdx] = temp;\n        }\n    }\n\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        if (sc.hasNextInt()) {\n            int n = sc.nextInt();\n            int[] arr = new int[n];\n            for (int i = 0; i < n; i++) arr[i] = sc.nextInt();\n            selectionSort(arr);\n            for (int i = 0; i < n; i++) {\n                System.out.print(arr[i] + (i == n - 1 ? "" : " "));\n            }\n            System.out.println();\n        }\n    }\n}`,
        javascript: `const fs = require('fs');\n\nfunction selectionSort(arr) {\n  const n = arr.length;\n  for (let i = 0; i < n; i++) {\n    let minIdx = i;\n    for (let j = i + 1; j < n; j++) {\n      if (arr[j] < arr[minIdx]) minIdx = j;\n    }\n    const temp = arr[i];\n    arr[i] = arr[minIdx];\n    arr[minIdx] = temp;\n  }\n  return arr;\n}\n\nconst input = fs.readFileSync(0, 'utf-8').trim().split(/\\s+/);\nif (input.length > 0 && input[0] !== '') {\n  const n = parseInt(input[0], 10);\n  const arr = input.slice(1, n + 1).map(Number);\n  console.log(selectionSort(arr).join(' '));\n}`,
        c: `#include <stdio.h>\n\nvoid selectionSort(int arr[], int n) {\n    for (int i = 0; i < n; i++) {\n        int min_idx = i;\n        for (int j = i + 1; j < n; j++) {\n            if (arr[j] < arr[min_idx]) min_idx = j;\n        }\n        int temp = arr[i];\n        arr[i] = arr[min_idx];\n        arr[min_idx] = temp;\n    }\n}\n\nint main() {\n    int n;\n    if (scanf("%d", &n) == 1) {\n        int arr[n];\n        for (int i = 0; i < n; i++) scanf("%d", &arr[i]);\n        selectionSort(arr, n);\n        for (int i = 0; i < n; i++) {\n            printf("%d%s", arr[i], (i == n - 1 ? "" : " "));\n        }\n        printf("\\n");\n    }\n    return 0;\n}`,
      },
      referenceSolution: {
        language: 'python',
        code: `import sys\n\ndef selection_sort(arr):\n    n = len(arr)\n    for i in range(n):\n        min_idx = i\n        for j in range(i + 1, n):\n            if arr[j] < arr[min_idx]:\n                min_idx = j\n        arr[i], arr[min_idx] = arr[min_idx], arr[i]\n    return arr\n\ndef main():\n    lines = sys.stdin.read().split()\n    if lines:\n        n = int(lines[0])\n        arr = [int(x) for x in lines[1:n+1]]\n        res = selection_sort(arr)\n        print(*(res))\n\nif __name__ == '__main__':\n    main()`,
      },
      sampleTests: [
        { input: '5\n64 25 12 22 11', output: '11 12 22 25 64', explanation: 'The elements are rearranged in non-decreasing order.' },
        { input: '4\n5 1 4 2', output: '1 2 4 5', explanation: 'Sorted in ascending order.' },
      ],
      hiddenTests: [
        { input: '1\n42', output: '42' },
        { input: '5\n1 2 3 4 5', output: '1 2 3 4 5' },
        { input: '5\n5 4 3 2 1', output: '1 2 3 4 5' },
        { input: '6\n3 1 2 3 1 2', output: '1 1 2 2 3 3' },
        { input: '5\n-5 3 -2 0 4', output: '-5 -2 0 3 4' },
      ],
    }
  }

  // Default algorithmic template for any prompt
  const cleanTitle = topic.trim().replace(/[^\w\s-]/g, '').replace(/\b\w/g, (c) => c.toUpperCase())
  return {
    title: cleanTitle || 'Algorithm Challenge',
    slug: (cleanTitle || 'algorithm-challenge').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
    difficulty: ['Easy', 'Medium', 'Hard'].includes(difficulty) ? difficulty : 'Medium',
    topics: ['Algorithms', 'Data Structures'],
    statement: `### Problem Description\nImplement an efficient algorithm for **${topic}**.\n\nGiven the input array, process the elements and output the result according to problem constraints.\n\n${facultyNotes ? `> **Faculty Instructions:** ${facultyNotes}\n` : ''}`,
    inputFormat: 'First line contains integer n. Second line contains n space-separated integers.',
    outputFormat: 'Print the resulting values separated by single spaces.',
    constraints: '1 <= n <= 10^5\n-10^9 <= arr[i] <= 10^9',
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    languages,
    starterCode: {
      python: `def solve(arr):\n    # TODO: Implement your solution\n    return arr\n\nif __name__ == '__main__':\n    import sys\n    lines = sys.stdin.read().split()\n    if lines:\n        n = int(lines[0])\n        arr = [int(x) for x in lines[1:n+1]]\n        res = solve(arr)\n        print(*(res))`,
      cpp: `#include <iostream>\n#include <vector>\nusing namespace std;\n\nvector<int> solve(vector<int>& arr) {\n    // TODO: Implement solution\n    return arr;\n}\n\nint main() {\n    int n;\n    if (cin >> n) {\n        vector<int> arr(n);\n        for (int i = 0; i < n; i++) cin >> arr[i];\n        vector<int> res = solve(arr);\n        for (int i = 0; i < res.size(); i++) {\n            cout << res[i] << (i == res.size() - 1 ? "" : " ");\n        }\n        cout << endl;\n    }\n    return 0;\n}`,
      java: `import java.util.*;\n\npublic class Main {\n    public static int[] solve(int[] arr) {\n        // TODO: Implement solution\n        return arr;\n    }\n\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        if (sc.hasNextInt()) {\n            int n = sc.nextInt();\n            int[] arr = new int[n];\n            for (int i = 0; i < n; i++) arr[i] = sc.nextInt();\n            int[] res = solve(arr);\n            for (int i = 0; i < res.length; i++) {\n                System.out.print(res[i] + (i == res.length - 1 ? "" : " "));\n            }\n            System.out.println();\n        }\n    }\n}`,
      javascript: `const fs = require('fs');\n\nfunction solve(arr) {\n  // TODO: Implement solution\n  return arr;\n}\n\nconst input = fs.readFileSync(0, 'utf-8').trim().split(/\\s+/);\nif (input.length > 0 && input[0] !== '') {\n  const n = parseInt(input[0], 10);\n  const arr = input.slice(1, n + 1).map(Number);\n  console.log(solve(arr).join(' '));\n}`,
    },
    referenceSolution: {
      language: 'python',
      code: `import sys\n\ndef solve(arr):\n    return arr\n\ndef main():\n    lines = sys.stdin.read().split()\n    if lines:\n        n = int(lines[0])\n        arr = [int(x) for x in lines[1:n+1]]\n        print(*(arr))\n\nif __name__ == '__main__':\n    main()`,
    },
    sampleTests: [
      { input: '3\n1 2 3', output: '1 2 3', explanation: 'Elements preserved in standard sequence.' },
      { input: '1\n100', output: '100', explanation: 'Single element case.' },
    ],
    hiddenTests: [
      { input: '4\n4 3 2 1', output: '4 3 2 1' },
      { input: '2\n-5 10', output: '-5 10' },
    ],
  }
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
  clientApiKey = null,
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

  try {
    const raw = await callNvidia(userPrompt, systemPrompt, { model, clientApiKey })
    const problem = cleanAndParseJson(raw)

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
      sampleTests: (Array.isArray(problem.sampleTests) ? problem.sampleTests : []).map((t) => ({
        input: typeof t.input === 'string' ? t.input : JSON.stringify(t.input ?? ''),
        output: typeof t.output === 'string' ? t.output : JSON.stringify(t.output ?? ''),
        explanation: t.explanation ? String(t.explanation) : undefined,
      })),
      hiddenTests: (Array.isArray(problem.hiddenTests) ? problem.hiddenTests : []).map((t) => ({
        input: typeof t.input === 'string' ? t.input : JSON.stringify(t.input ?? ''),
        output: typeof t.output === 'string' ? t.output : JSON.stringify(t.output ?? ''),
      })),
    }
  } catch (err) {
    console.warn('⚠️ Cloud AI problem generation unavailable or failed, using curated algorithmic template fallback:', err.message)
    return generateOfflineFallbackProblem({ topic, difficulty, languages, facultyNotes })
  }
}
