// ── Institutional Company-Specific Placement Tracks for PrepHire-AI ────────
import type { QuestionNode } from './questionBank'

export interface CompanyTrack {
  id: string
  name: string
  brandColor: string
  badge: 'Mass Recruiter' | 'Product Tech' | 'FinTech Enterprise' | 'Digital Specialist'
  tagline: string
  description: string
  targetRoles: string[]
  keyFocusAreas: string[]
  sampleQuestions: Partial<QuestionNode>[]
}

export const COMPANY_TRACKS: CompanyTrack[] = [
  {
    id: 'tcs-nqt',
    name: 'TCS National Qualifier (NQT)',
    brandColor: '#0284C7',
    badge: 'Mass Recruiter',
    tagline: 'Aptitude Speed Math, Numerical Reasoning & Core Engineering Foundations',
    description: 'Calibrated for TCS Ninja & Digital roles. Emphasizes speed calculations, work-rate problems, fundamental OOP, and clean situational behavior.',
    targetRoles: ['Systems Engineer (Ninja)', 'Digital Software Engineer', 'Prime Associate'],
    keyFocusAreas: ['Time & Work LCM Math', 'Permutations & Probability', 'Arrays & String Manipulation', 'Core OOP Principles'],
    sampleQuestions: [
      {
        id: 'tcs-01',
        category: 'Numerical Reasoning',
        question: 'A train 240 meters long passes a pole in 24 seconds. How long will it take to pass a platform 650 meters long at the same speed?',
        expectedKeywords: ['10 m/s', '36 km/h', '89 seconds', 'total distance 890m', 'speed formula'],
      },
      {
        id: 'tcs-02',
        category: 'Core Java / C++ OOP',
        question: 'Explain the difference between method overloading and method overriding in Object-Oriented Programming, citing compile-time versus runtime binding.',
        expectedKeywords: ['static polymorphism', 'dynamic dispatch', 'vtable', 'signatures', 'runtime', 'compile time'],
      },
    ],
  },
  {
    id: 'infosys-dse',
    name: 'Infosys DSE & Specialist Programmer',
    brandColor: '#2563EB',
    badge: 'Digital Specialist',
    tagline: 'Advanced Dynamic Programming, Graph Traversals & High-Complexity DSA',
    description: 'Designed for Infosys Digital Specialist Engineer (DSE) and Specialist Programmer (SP) selection with multi-pointer algorithmic rigor.',
    targetRoles: ['Specialist Programmer (SP)', 'Digital Specialist Engineer (DSE)'],
    keyFocusAreas: ['Dynamic Programming on Grids', 'BFS/DFS & Dijkstra Trees', 'Prefix Sums & Sliding Windows', 'Bit Manipulation'],
    sampleQuestions: [
      {
        id: 'infy-01',
        category: 'Graph Algorithms',
        question: 'How does Dijkstra’s shortest path algorithm work with a min-heap priority queue, and why does it fail on graphs with negative edge weights?',
        expectedKeywords: ['priority queue', 'relaxation', 'o((v+e) log v)', 'negative cycles', 'greedy choice'],
      },
      {
        id: 'infy-02',
        category: 'Dynamic Programming',
        question: 'Walk through the optimal substructure and state transition for solving the Longest Common Subsequence (LCS) problem in O(M*N) time.',
        expectedKeywords: ['memoization', 'tabulation', 'dp[i][j]', 'character match', 'space optimization'],
      },
    ],
  },
  {
    id: 'amazon-sde',
    name: 'Amazon SDE & Product Tech',
    brandColor: '#F59E0B',
    badge: 'Product Tech',
    tagline: 'Leadership Principles (STAR), System Scalability & Distributed Trade-offs',
    description: 'Simulates Tier-1 product tech hiring. Combines bar-raising Amazon Leadership Principles with low-latency system design and clean code architectures.',
    targetRoles: ['Software Development Engineer (SDE-1)', 'Systems Engineer'],
    keyFocusAreas: ['Customer Obsession & Bias for Action', 'Distributed Caching (Redis/Memcached)', 'ACID vs BASE Consistency', 'Microservices'],
    sampleQuestions: [
      {
        id: 'amzn-01',
        category: 'Leadership Principles (STAR)',
        question: 'Tell me about a time you had to make an important engineering decision with incomplete data. How did you balance Bias for Action with Calculated Risk?',
        expectedKeywords: ['two-way door decision', 'mvp', 'telemetry', 'bias for action', 'data gaps', 'measured risk'],
      },
      {
        id: 'amzn-02',
        category: 'System Architecture',
        question: 'Design an idempotent payment processing API endpoint. How do you prevent double-charging a customer when network timeouts occur between gateway and bank?',
        expectedKeywords: ['idempotency key', 'distributed lock', 'unique constraint', 'database transaction', 'retry with backoff'],
      },
    ],
  },
  {
    id: 'barclays-fintech',
    name: 'Barclays & FinTech Enterprise',
    brandColor: '#0D9488',
    badge: 'FinTech Enterprise',
    tagline: 'Financial Transaction Concurrency, Resilience & Banking Protocol Security',
    description: 'Structured for premier financial institutions. Focuses on transaction atomicity, secure cryptographic tokens, fault tolerance, and zero-downtime ledger processing.',
    targetRoles: ['Graduate Tech Analyst', 'FinTech Platform Engineer', 'Security Operations Engineer'],
    keyFocusAreas: ['Pessimistic vs Optimistic Locking', 'Mutual TLS & Token Revocation', 'Message Queues (Kafka/RabbitMQ)', 'Zero-Downtime Deployment'],
    sampleQuestions: [
      {
        id: 'barclays-01',
        category: 'Transaction Concurrency',
        question: 'When debiting an account and crediting another simultaneously, how do you prevent deadlocks in high-frequency concurrent banking databases?',
        expectedKeywords: ['ordered locking', 'deadlock detection', 'isolation levels', 'two-phase commit', 'optimistic concurrency'],
      },
      {
        id: 'barclays-02',
        category: 'Application Security',
        question: 'Explain the difference between Symmetric (AES) and Asymmetric (RSA/ECC) encryption in banking transport security. How does TLS handshake combine both?',
        expectedKeywords: ['asymmetric key exchange', 'symmetric session key', 'digital certificates', 'pki', 'cipher suite'],
      },
    ],
  },
]

export function getCompanyTrack(id: string): CompanyTrack | undefined {
  return COMPANY_TRACKS.find((c) => c.id === id)
}
