// ── Curated Multi-Branch Offline Question Bank for PrepHire-AI ──────────────
import type { Branch } from '../constants/branches'

export type InterviewDomain = 'technical' | 'hr' | 'aptitude' | 'group-discussion'
export type InterviewLevel = 'Beginner' | 'Intermediate' | 'Advanced'

export interface QuestionNode {
  id: string
  domain: InterviewDomain
  department?: Branch | 'All'
  level: InterviewLevel
  category: string
  question: string
  expectedKeywords: string[]
  keyConcepts: string[]
  followUpProbing: string
  followUpAdvanced: string
  sampleStrongAnswer?: string
}

export const QUESTION_BANK: QuestionNode[] = [
  // ── TECHNICAL: Computer Engineering & Software Engineering ───────────────
  {
    id: 'cs-dsa-01',
    domain: 'technical',
    department: 'Computer Engineering',
    level: 'Beginner',
    category: 'Data Structures & Algorithms',
    question: 'Can you explain the time and space complexity of binary search, and describe the prerequisites required to perform it on a data collection?',
    expectedKeywords: ['sorted', 'o(log n)', 'logarithmic', 'divide and conquer', 'o(1) space', 'two pointers', 'mid index'],
    keyConcepts: ['Binary Search', 'Logarithmic Complexity', 'Array Sorting', 'Boundary Conditions'],
    followUpProbing: 'What specific condition must the array satisfy before running binary search, and how do you calculate the middle index without integer overflow?',
    followUpAdvanced: 'How would you adapt binary search to find the inflection point or rotation count in a sorted array that has been cyclically shifted?',
    sampleStrongAnswer: 'Binary search requires a monotonically sorted array or indexed collection. By repeatedly dividing the search interval in half (using mid = low + (high - low) / 2 to prevent 32-bit integer overflow), it achieves O(log n) time complexity. Its iterative form requires O(1) auxiliary space.',
  },
  {
    id: 'cs-dsa-02',
    domain: 'technical',
    department: 'Computer Engineering',
    level: 'Intermediate',
    category: 'Algorithms & Dynamic Programming',
    question: 'How do you detect a cycle in a singly linked list, and what is the mathematical intuition behind Floyd’s Tortoise and Hare algorithm?',
    expectedKeywords: ['floyd', 'tortoise and hare', 'slow and fast pointer', 'o(n) time', 'o(1) space', 'collision', 'cycle length'],
    keyConcepts: ['Two-Pointer Technique', 'Cycle Detection', 'Linked Lists', 'Pointer Arithmetic'],
    followUpProbing: 'Could you explain why the fast pointer moves at 2x speed and how that guarantees they collide within the cycle?',
    followUpAdvanced: 'Once a cycle is detected, how do you locate the exact starting node of the loop using pointer reset and modular traversal?',
    sampleStrongAnswer: 'Floyds cycle detection uses two pointers: slow advancing 1 step and fast advancing 2 steps. If a cycle exists, the distance between them decreases by 1 in each step once inside the loop, guaranteeing collision in O(n) time with O(1) memory.',
  },
  {
    id: 'cs-sys-01',
    domain: 'technical',
    department: 'Computer Engineering',
    level: 'Intermediate',
    category: 'System Design & Distributed Systems',
    question: 'What are the core trade-offs between SQL relational databases and NoSQL document/key-value stores, and when would you choose one over the other for high throughput?',
    expectedKeywords: ['acid', 'base', 'consistency', 'transactions', 'horizontal scaling', 'sharding', 'normalization', 'schema', 'throughput'],
    keyConcepts: ['ACID Transactions', 'Horizontal Scalability', 'Data Consistency', 'Eventual Consistency'],
    followUpProbing: 'What does ACID stand for, and why is horizontal partitioning (sharding) significantly harder in traditional relational databases?',
    followUpAdvanced: 'If an e-commerce platform needs to support flash sales with millions of read requests per second, what caching and database tier architecture would you propose?',
    sampleStrongAnswer: 'SQL provides strict ACID guarantees, normalized relations, and structured query flexibility, ideal for financial transactions. NoSQL relaxes ACID in favor of BASE (eventual consistency), horizontal partitioning, and flexible schemas, excelling in high-throughput unstructured streaming data.',
  },
  {
    id: 'cs-sys-02',
    domain: 'technical',
    department: 'Computer Engineering',
    level: 'Advanced',
    category: 'System Design & Concurrency',
    question: 'Design a distributed rate limiter that handles 100,000 requests per second across multiple regional servers. Which rate limiting algorithm would you select?',
    expectedKeywords: ['token bucket', 'leaky bucket', 'sliding window', 'redis', 'lua script', 'concurrency', 'race condition', 'distributed lock'],
    keyConcepts: ['Distributed Rate Limiting', 'Sliding Window Counter', 'Redis Memory Store', 'Atomic Lua Scripts'],
    followUpProbing: 'How would you prevent race conditions when two distributed gateway nodes try to update the rate limiter counter simultaneously?',
    followUpAdvanced: 'How do you handle clock drift across server nodes, and how would you configure local in-memory token buckets to minimize remote Redis round-trip latency?',
    sampleStrongAnswer: 'I would select the Sliding Window Counter algorithm or Token Bucket stored in a Redis cluster. To prevent race conditions, counter evaluation and decrementing are executed atomically via Lua scripts or Redis hashes with millisecond TTL expiration.',
  },

  // ── TECHNICAL: Information Technology & Software Engineering ─────────────
  {
    id: 'it-web-01',
    domain: 'technical',
    department: 'Information Technology',
    level: 'Beginner',
    category: 'Web Architecture & Networking',
    question: 'What happens under the hood when a user types a URL into their browser and presses Enter, from DNS resolution to DOM rendering?',
    expectedKeywords: ['dns', 'ip address', 'tcp handshake', 'syn ack', 'tls ssl', 'http get', 'server response', 'dom tree', 'critical rendering path'],
    keyConcepts: ['DNS Lookup', 'TCP 3-Way Handshake', 'TLS Encryption', 'Browser Rendering Engine'],
    followUpProbing: 'Can you detail the TCP 3-way handshake process (SYN, SYN-ACK, ACK) and where TLS certificate negotiation occurs?',
    followUpAdvanced: 'How does the browser optimize resource loading using preconnect, preload headers, and HTTP/2 multiplexing over a single TCP connection?',
    sampleStrongAnswer: 'The browser checks DNS caches (browser, OS, resolver) to obtain the IP. It opens a TCP socket via a 3-way handshake (SYN, SYN-ACK, ACK) and completes TLS key exchange. It sends an HTTP GET request, receives HTML, parses the DOM/CSSOM, constructs the render tree, and computes layout paint.',
  },
  {
    id: 'it-sec-01',
    domain: 'technical',
    department: 'Information Technology',
    level: 'Intermediate',
    category: 'Application Security',
    question: 'Explain Cross-Site Scripting (XSS) and Cross-Site Request Forgery (CSRF). How do modern web applications mitigate both attacks?',
    expectedKeywords: ['xss', 'csrf', 'same-origin', 'samesite cookies', 'httponly', 'content security policy', 'csp', 'anti-csrf token', 'sanitization'],
    keyConcepts: ['Web Security', 'XSS Sanitization', 'SameSite Cookie Flags', 'CSP Directives'],
    followUpProbing: 'Why is setting the HttpOnly cookie flag effective against XSS-based session hijacking, and why does it not prevent CSRF?',
    followUpAdvanced: 'How do modern single-page applications (SPAs) leveraging JWT tokens in memory balance security against persistent refresh tokens across browser restarts?',
    sampleStrongAnswer: 'XSS injects malicious client-side JavaScript, prevented by output encoding, contextual sanitization, and strict CSP headers. CSRF tricks authenticated browsers into submitting unauthorized actions, prevented via SameSite=Strict/Lax cookies, Anti-CSRF tokens, and custom header validation.',
  },

  // ── TECHNICAL: AI & ML and Data Science ───────────────────────────────────
  {
    id: 'aiml-ml-01',
    domain: 'technical',
    department: 'Computer Science & Engineering (AI & ML)',
    level: 'Beginner',
    category: 'Machine Learning Fundamentals',
    question: 'Explain the bias-variance trade-off in machine learning. How do overfitting and underfitting relate to this concept, and how can they be remedied?',
    expectedKeywords: ['bias', 'variance', 'overfitting', 'underfitting', 'regularization', 'cross validation', 'l1 l2', 'generalization', 'training error'],
    keyConcepts: ['Bias-Variance Decomposition', 'Regularization (Lasso/Ridge)', 'Cross-Validation', 'Model Complexity'],
    followUpProbing: 'If a model has zero training error but high test error, is it suffering from high bias or high variance, and what is your first step to fix it?',
    followUpAdvanced: 'How does dropout in deep neural networks mathematically approximate ensemble averaging to mitigate high variance?',
    sampleStrongAnswer: 'High bias stems from overly simplistic models that underfit training data. High variance occurs when complex models memorize training noise, failing to generalize. Regularization (L1/L2), feature pruning, and cross-validation help find the optimal balance minimizing total expected error.',
  },
  {
    id: 'aiml-dl-01',
    domain: 'technical',
    department: 'Computer Science & Engineering (AI & ML)',
    level: 'Intermediate',
    category: 'Deep Learning & Transformers',
    question: 'How does the Self-Attention mechanism in the Transformer architecture work, and why did it replace Recurrent Neural Networks (RNNs) for sequential data?',
    expectedKeywords: ['query key value', 'attention matrix', 'softmax', 'parallelization', 'recurrent', 'long range dependencies', 'vanishing gradient', 'dot product'],
    keyConcepts: ['Self-Attention Mechanism', 'QKV Projections', 'Scaled Dot-Product', 'Sequence Parallelization'],
    followUpProbing: 'Why do we scale the dot products of Queries and Keys by the square root of the dimension (sqrt(d_k)) before passing them to softmax?',
    followUpAdvanced: 'How does FlashAttention optimize the quadratic memory complexity of the attention matrix during GPU forward and backward passes?',
    sampleStrongAnswer: 'Self-attention projects token representations into Query, Key, and Value vectors, computing pairwise similarity scores via scaled dot-product softmax(QK^T / sqrt(d_k))V. Unlike sequential RNNs, Transformers allow full sequence parallelization across GPU cores and eliminate vanishing gradients over long contexts.',
  },
  {
    id: 'ds-stat-01',
    domain: 'technical',
    department: 'Computer Science & Engineering (Data Science)',
    level: 'Intermediate',
    category: 'Data Science & Feature Engineering',
    question: 'When dealing with highly imbalanced classification datasets (e.g., 99% negative, 1% positive), why is Accuracy a misleading metric, and how should you evaluate the model?',
    expectedKeywords: ['precision', 'recall', 'f1 score', 'auc roc', 'imbalanced', 'smote', 'confusion matrix', 'false positive', 'false negative'],
    keyConcepts: ['Class Imbalance', 'Precision-Recall AUC', 'F1-Score', 'Resampling Techniques'],
    followUpProbing: 'In a medical cancer detection model, which is more critical: minimizing False Positives or False Negatives, and which metric measures that?',
    followUpAdvanced: 'What are the risks of using synthetic oversampling like SMOTE on high-dimensional noisy tabular datasets, and what alternative cost-sensitive learning techniques exist?',
    sampleStrongAnswer: 'A naive model predicting only the majority class achieves 99% accuracy while failing completely on the minority class. Imbalanced models should be evaluated using Precision, Recall, F1-Score, and PR-AUC curves, paired with class-weighted loss functions or SMOTE resampling.',
  },

  // ── TECHNICAL: Electronics & Telecommunication Engineering ────────────────
  {
    id: 'entc-emb-01',
    domain: 'technical',
    department: 'Electronics & Telecommunication Engineering',
    level: 'Beginner',
    category: 'Embedded Systems & Protocols',
    question: 'Compare UART, SPI, and I2C communication protocols in terms of wire count, speed, data transmission mode (simplex/duplex), and master-slave architecture.',
    expectedKeywords: ['uart', 'spi', 'i2c', 'baud rate', 'clock', 'scl sda', 'miso mosi', 'full duplex', 'half duplex', 'pull up resistors'],
    keyConcepts: ['Serial Protocols', 'Synchronous vs Asynchronous', 'SPI Bus', 'I2C Addressing'],
    followUpProbing: 'Why does I2C require pull-up resistors on the SDA and SCL lines, and what is open-drain configuration?',
    followUpAdvanced: 'In an embedded IoT gateway transmitting sensor telemetry to an edge processor over SPI, how do you handle clock jitter and buffer overrun using DMA?',
    sampleStrongAnswer: 'UART is asynchronous, point-to-point, full-duplex using 2 wires (TX/RX) without a shared clock. I2C is synchronous, multi-master/multi-slave, half-duplex using 2 lines (SDA/SCL) with 7/10-bit addressing. SPI is synchronous, single-master, full-duplex using 4 wires (MOSI, MISO, SCK, SS) achieving the highest throughput.',
  },
  {
    id: 'entc-dsp-01',
    domain: 'technical',
    department: 'Electronics & Telecommunication Engineering',
    level: 'Intermediate',
    category: 'Signals & Digital Signal Processing',
    question: 'State the Nyquist-Shannon Sampling Theorem. What occurs when a continuous signal is sampled below the Nyquist rate, and how do anti-aliasing filters prevent it?',
    expectedKeywords: ['nyquist rate', 'sampling frequency', 'aliasing', 'bandlimited', '2f max', 'low pass filter', 'anti-aliasing', 'spectrum overlap'],
    keyConcepts: ['Sampling Theorem', 'Nyquist Frequency', 'Aliasing Phenomenon', 'Anti-Aliasing Low-Pass Filter'],
    followUpProbing: 'If an audio signal has frequencies up to 20 kHz, what is the absolute minimum sampling rate required, and why do CD standards use 44.1 kHz?',
    followUpAdvanced: 'Explain how discrete Fourier transform (DFT) spectral leakage arises from finite-duration windowing, and how Hanning/Hamming windows mitigate it.',
    sampleStrongAnswer: 'The Nyquist-Shannon theorem states a continuous bandlimited signal can be perfectly reconstructed if sampled at fs > 2*f_max. Sampling below 2*f_max causes spectral overlap known as aliasing. Analog low-pass anti-aliasing filters attenuate frequencies above f_max prior to ADC conversion.',
  },

  // ── TECHNICAL: Mechanical Engineering ─────────────────────────────────────
  {
    id: 'mech-thermo-01',
    domain: 'technical',
    department: 'Mechanical Engineering',
    level: 'Beginner',
    category: 'Thermodynamics & Power Cycles',
    question: 'Explain the Second Law of Thermodynamics (Clausius and Kelvin-Planck statements) and discuss why a 100% efficient heat engine is physically impossible.',
    expectedKeywords: ['second law', 'clausius', 'kelvin planck', 'carnot cycle', 'entropy', 'heat sink', 'thermal efficiency', 'reservoir'],
    keyConcepts: ['Second Law of Thermodynamics', 'Carnot Efficiency', 'Entropy Generation', 'Heat Reservoirs'],
    followUpProbing: 'What is the Carnot theorem and how does Carnot efficiency depend exclusively on the temperatures of the source and sink?',
    followUpAdvanced: 'How do supercritical CO2 Brayton cycles improve thermal cycle efficiency and power plant footprint compared to conventional superheated Rankine steam cycles?',
    sampleStrongAnswer: 'The Kelvin-Planck statement establishes that no engine can operate in a complete cycle and convert all absorbed heat into work without rejecting heat to a lower-temperature reservoir. The Carnot limit eff = 1 - (T_cold / T_hot) dictates that 100% efficiency requires a sink at absolute zero (0 Kelvin), which is physically unattainable.',
  },
  {
    id: 'mech-som-01',
    domain: 'technical',
    department: 'Mechanical Engineering',
    level: 'Intermediate',
    category: 'Strength of Materials & FEA',
    question: 'Walk through the Stress-Strain diagram for a ductile material like mild steel. Identify the proportional limit, yield point, ultimate tensile strength, and fracture point.',
    expectedKeywords: ['hookes law', 'elastic limit', 'proportional limit', 'upper lower yield', 'strain hardening', 'necking', 'uts', 'ductility'],
    keyConcepts: ['Stress-Strain Curve', 'Youngs Modulus', 'Yield Strength', 'Plastic Deformation & Necking'],
    followUpProbing: 'What is the difference between true stress and engineering stress, and when does the divergence become pronounced?',
    followUpAdvanced: 'Under multi-axial stress states, when would you apply Von Mises yield criterion versus Tresca maximum shear stress criterion for ductile component design?',
    sampleStrongAnswer: 'The curve begins with linear elastic deformation governed by Hookes law up to the proportional limit. Beyond the yield point, plastic slip occurs. Strain hardening increases load resistance until Ultimate Tensile Strength (UTS), where localized necking begins until ductile cup-and-cone fracture.',
  },

  // ── TECHNICAL: Civil Engineering ──────────────────────────────────────────
  {
    id: 'civil-struct-01',
    domain: 'technical',
    department: 'Civil Engineering',
    level: 'Beginner',
    category: 'Structural Analysis & Concrete',
    question: 'What is the function of steel reinforcement in Reinforced Cement Concrete (RCC), and why are steel and concrete uniquely compatible as composite materials?',
    expectedKeywords: ['tension', 'compression', 'thermal expansion', 'bond stress', 'rcc', 'tensile strength', 'shrinkage', 'corrosion'],
    keyConcepts: ['RCC Mechanics', 'Tensile Reinforcement', 'Thermal Expansion Coefficient', 'Bond Resistance'],
    followUpProbing: 'Why is plain concrete strong in compression but weak in tension, and what is the typical ratio between its tensile and compressive strengths?',
    followUpAdvanced: 'Compare working stress method (WSM) versus limit state method (LSM) in IS 456 design philosophy with respect to safety factors and material non-linearity.',
    sampleStrongAnswer: 'Concrete exhibits high compressive strength but poor tensile capacity (approx 10% of compression). Steel bars placed in tension zones resist bending stresses. Concrete and mild steel possess nearly identical thermal expansion coefficients (~12 x 10^-6 /°C), preventing thermal shear debonding.',
  },
  {
    id: 'civil-geo-01',
    domain: 'technical',
    department: 'Civil Engineering',
    level: 'Intermediate',
    category: 'Geotechnical Engineering',
    question: 'Explain Terzaghi’s bearing capacity theory for shallow foundations and define the three primary soil failure modes under structural loading.',
    expectedKeywords: ['terzaghi', 'bearing capacity', 'general shear', 'local shear', 'punching shear', 'cohesion', 'surcharge', 'angle of internal friction'],
    keyConcepts: ['Foundation Bearing Capacity', 'Shear Failure Mechanisms', 'Soil Mechanics', 'Safety Factors'],
    followUpProbing: 'How does high groundwater table near the foundation base affect the effective unit weight of soil and ultimate bearing capacity?',
    followUpAdvanced: 'In seismic zones, how does dynamic cyclic pore pressure build-up induce soil liquefaction, and what geotechnical mitigation techniques are applied?',
    sampleStrongAnswer: 'Terzaghis equation q_ult = c*Nc + q*Nq + 0.5*gamma*B*N_gamma calculates ultimate bearing capacity based on soil cohesion, depth surcharge, and foundation width. The failure modes are General Shear (dense soils with bulging), Local Shear (medium soils), and Punching Shear (loose sands with vertical compression).',
  },

  // ── TECHNICAL: Chemical Engineering ───────────────────────────────────────
  {
    id: 'chem-mass-01',
    domain: 'technical',
    department: 'Chemical Engineering',
    level: 'Beginner',
    category: 'Mass Transfer & Distillation',
    question: 'Explain the working principle of fractional distillation and how the McCabe-Thiele graphical method determines the theoretical number of equilibrium stages.',
    expectedKeywords: ['relative volatility', 'vapor liquid equilibrium', 'vle', 'reflux ratio', 'q-line', 'enriching section', 'stripping section', 'tray column'],
    keyConcepts: ['Fractional Distillation', 'Vapor-Liquid Equilibrium', 'McCabe-Thiele Method', 'Reflux Ratio'],
    followUpProbing: 'What is the physical meaning of the minimum reflux ratio (R_min) and what happens to the number of stages as reflux approaches R_min?',
    followUpAdvanced: 'How do you separate an azeotropic mixture (such as 95.6% ethanol-water) where relative volatility equals 1, and what entrainers or pressure swing methods apply?',
    sampleStrongAnswer: 'Distillation separates liquid mixtures based on differences in vapor pressures (relative volatility). The McCabe-Thiele method plots equilibrium curve and operating lines for rectifying, stripping, and feed (q-line). Stepping off stages between operating lines and VLE yields the minimum theoretical trays.',
  },
  {
    id: 'chem-cre-01',
    domain: 'technical',
    department: 'Chemical Engineering',
    level: 'Intermediate',
    category: 'Chemical Reaction Engineering',
    question: 'Compare a Continuous Stirred-Tank Reactor (CSTR) and a Plug Flow Reactor (PFR). Which reactor requires smaller volume for positive order isothermal kinetics?',
    expectedKeywords: ['cstr', 'pfr', 'space time', 'conversion', 'reaction rate', 'isothermal', 'residence time', 'backmixing', 'reactor volume'],
    keyConcepts: ['Reactor Kinetics', 'CSTR vs PFR', 'Residence Time Distribution', 'Conversion Efficiency'],
    followUpProbing: 'Why does complete backmixing in a CSTR cause it to operate at the lowest reactant concentration and therefore lowest reaction rate?',
    followUpAdvanced: 'For an autocatalytic or complex series-parallel reaction network (A -> R -> S), how would you arrange CSTR and PFR combinations to maximize intermediate selectivity?',
    sampleStrongAnswer: 'For positive-order reactions where rate increases with concentration, a PFR requires significantly smaller volume than a CSTR for identical conversion. In a PFR, concentration drops gradually along the length, maintaining higher average rate, whereas a CSTR operates at the lowest exit concentration due to backmixing.',
  },

  // ── HR & BEHAVIORAL: Universal STAR Questions ─────────────────────────────
  {
    id: 'hr-star-01',
    domain: 'hr',
    department: 'All',
    level: 'Beginner',
    category: 'Self Introduction & Career Goals',
    question: 'Please introduce yourself, highlighting your academic background, core technical strengths, and what motivates you to pursue a role in this industry.',
    expectedKeywords: ['projects', 'skills', 'experience', 'motivation', 'passion', 'mit aoe', 'learning', 'career goal', 'contribution'],
    keyConcepts: ['Personal Elevator Pitch', 'Core Competencies', 'Value Proposition', 'Professional Ambition'],
    followUpProbing: 'Can you specify one particular project from your coursework that best demonstrates your problem-solving process?',
    followUpAdvanced: 'How do your personal learning habits and past technical initiatives align with the rapid evolution of this industry over the next 3 to 5 years?',
    sampleStrongAnswer: 'I am an engineering student at MIT AoE with strong foundations in system development and algorithmic problem solving. Through building hands-on projects and solving complex challenges, I have developed technical proficiency in full-stack architecture and a disciplined approach to learning, and I am eager to contribute to production-grade engineering initiatives.',
  },
  {
    id: 'hr-star-02',
    domain: 'hr',
    department: 'All',
    level: 'Intermediate',
    category: 'Overcoming Obstacles (STAR)',
    question: 'Describe a significant technical hurdle or project setback you encountered. Walk me through the situation, your specific task, the actions you took, and the final measurable outcome.',
    expectedKeywords: ['situation', 'task', 'action', 'result', 'star', 'obstacle', 'debug', 'collaboration', 'deadline', 'resolution'],
    keyConcepts: ['STAR Framework', 'Resilience', 'Root Cause Analysis', 'Accountability'],
    followUpProbing: 'What specific roadblock threatened project delivery, and what individual decision did you make to diagnose and resolve it?',
    followUpAdvanced: 'Looking back with the experience you have now, what architectural or procedural safeguard would you put in place to prevent that issue from arising initially?',
    sampleStrongAnswer: 'During our capstone project, our microservices crashed under simulated load 48 hours before testing. As backend lead, my task was to isolate the bottleneck. I profiled database transactions, uncovered unindexed join queries causing thread starvation, implemented Redis caching and query indexing, which reduced latency by 72% and met our SLA on time.',
  },
  {
    id: 'hr-star-03',
    domain: 'hr',
    department: 'All',
    level: 'Intermediate',
    category: 'Conflict & Team Collaboration (STAR)',
    question: 'Tell me about a time you experienced a disagreement with a teammate or project partner regarding an engineering decision. How did you handle the discussion and reach consensus?',
    expectedKeywords: ['disagreement', 'compromise', 'perspective', 'communication', 'objective data', 'listening', 'consensus', 'teamwork', 'outcome'],
    keyConcepts: ['Interpersonal Communication', 'Conflict Resolution', 'Data-Driven Decision Making', 'Team Cohesion'],
    followUpProbing: 'How did you keep the conversation objective rather than personal, and what compromise did you agree upon?',
    followUpAdvanced: 'If consensus cannot be reached and deadlines are imminent, how do you balance disagreeing and committing with project risk management?',
    sampleStrongAnswer: 'My teammate and I disagreed on choosing between MongoDB and PostgreSQL for our analytics module. Rather than debating opinions, I proposed running a rapid benchmark with 50,000 synthetic records simulating our query workload. The benchmark proved relational joins were 3x faster for our reporting needs. My partner agreed, and we delivered the module ahead of schedule.',
  },
  {
    id: 'hr-star-04',
    domain: 'hr',
    department: 'All',
    level: 'Advanced',
    category: 'Leadership & Ambiguity (STAR)',
    question: 'Describe a situation where project requirements were ambiguous or rapidly shifting. How did you take ownership, prioritize tasks, and guide your team to successful delivery?',
    expectedKeywords: ['ambiguity', 'initiative', 'ownership', 'prioritization', 'stakeholder', 'clarification', 'milestones', 'direction', 'delivery'],
    keyConcepts: ['Leadership Under Ambiguity', 'Proactive Ownership', 'Scope Prioritization', 'Stakeholder Alignment'],
    followUpProbing: 'What criteria did you use to distinguish must-have core deliverables from nice-to-have features under changing constraints?',
    followUpAdvanced: 'How do you keep team morale and velocity high when stakeholders change technical or business requirements midway through development?',
    sampleStrongAnswer: 'During an institutional hackathon, problem guidelines were updated 6 hours after launch. I gathered our team, decomposed the new requirements into core MVP components versus secondary features, established 2-hour sprint milestones, and maintained constant sync with the judging rubric. We completed all primary user flows and secured 2nd place.',
  },

  // ── APTITUDE: Quantitative Reasoning & Logic ──────────────────────────────
  {
    id: 'apt-speed-01',
    domain: 'aptitude',
    department: 'All',
    level: 'Beginner',
    category: 'Time, Speed & Distance',
    question: 'A train 180 meters long is traveling at a uniform speed of 54 km/h. How many seconds will it take to completely pass a stationary telegraph pole and a 120-meter platform?',
    expectedKeywords: ['54 km/h', '15 m/s', '12 seconds', '20 seconds', 'relative speed', 'total distance', 'conversion factor 5/18'],
    keyConcepts: ['Unit Conversion (km/h to m/s)', 'Distance-Speed-Time Formula', 'Platform Crossing Physics'],
    followUpProbing: 'Show the calculation converting 54 km/h to meters per second using the standard 5/18 fraction multiplier.',
    followUpAdvanced: 'If a second train 150 meters long traveling at 72 km/h approaches from the opposite direction, in how many seconds will they pass each other completely?',
    sampleStrongAnswer: 'First convert speed: 54 * (5/18) = 15 m/s. To cross a point pole, distance = train length = 180m. Time = 180 / 15 = 12 seconds. To cross a 120m platform, total distance = 180 + 120 = 300m. Time = 300 / 15 = 20 seconds.',
  },
  {
    id: 'apt-work-01',
    domain: 'aptitude',
    department: 'All',
    level: 'Intermediate',
    category: 'Time and Work',
    question: 'Worker A can complete a task in 12 days, and Worker B can complete the same task in 18 days. If they work together for 4 days and then A leaves, how many days will B take to finish the remaining work?',
    expectedKeywords: ['unit work', 'lcm method', 'total units 36', 'efficiency', '3 units', '2 units', '8 days', 'remaining work'],
    keyConcepts: ['LCM Work Rate Model', 'Combined Daily Efficiency', 'Remaining Work Allocation'],
    followUpProbing: 'What is the LCM of 12 and 18, and what are the individual daily work units for workers A and B?',
    followUpAdvanced: 'If a third worker C joins and together all three can finish the job in 4 days, what is Worker C’s individual efficiency in days?',
    sampleStrongAnswer: 'Take total work as LCM(12, 18) = 36 units. As rate = 3 units/day, Bs rate = 2 units/day. Combined rate = 5 units/day. In 4 days they complete 4 * 5 = 20 units. Remaining work = 36 - 20 = 16 units. B completes 16 units alone in 16 / 2 = 8 days.',
  },
  {
    id: 'apt-logic-01',
    domain: 'aptitude',
    department: 'All',
    level: 'Intermediate',
    category: 'Logical Deduction & Probability',
    question: 'A box contains 5 red balls, 4 blue balls, and 3 green balls. If two balls are drawn at random without replacement, what is the probability that both balls are of different colors?',
    expectedKeywords: ['total 12', 'combinations', '12c2 66', 'complementary probability', 'same color probability', '47/66', 'different colors'],
    keyConcepts: ['Combinatorics (nCr)', 'Probability Without Replacement', 'Complementary Probability Rule'],
    followUpProbing: 'Why is calculating 1 minus the probability of drawing two balls of the same color much faster than summing all different pairs?',
    followUpAdvanced: 'If you draw 3 balls sequentially without replacement, what is the probability of drawing exactly one of each color?',
    sampleStrongAnswer: 'Total balls = 12. Total ways to draw 2 = 12C2 = 66. Using complementary probability, P(same color) = (5C2 + 4C2 + 3C2) / 66 = (10 + 6 + 3) / 66 = 19/66. Therefore, P(different colors) = 1 - 19/66 = 47/66 (~71.2%).',
  },

  // ── GROUP DISCUSSION: Debate & Consensus Scenarios ────────────────────────
  {
    id: 'gd-ai-01',
    domain: 'group-discussion',
    department: 'All',
    level: 'Beginner',
    category: 'Technology & Employment',
    question: 'Initiate a structured argument on the topic: "Artificial Intelligence: Boon or Bane for Engineering Employment?" Present balanced perspectives before proposing your conclusion.',
    expectedKeywords: ['automation', 'productivity', 'upskilling', 'job displacement', 'augmentation', 'new roles', 'ethical ai', 'reskilling', 'consensus'],
    keyConcepts: ['Economic Impact of AI', 'Workforce Upskilling', 'Job Augmentation vs Elimination', 'Balanced Argumentation'],
    followUpProbing: 'What new categories of engineering jobs are emerging as routine repetitive tasks become automated by generative AI?',
    followUpAdvanced: 'How should educational institutions and industry placement cells restructure engineering curricula to prepare graduates for an AI-augmented job market?',
    sampleStrongAnswer: 'While AI automates repetitive coding and drafting tasks causing transitional friction, history shows technological shifts augment overall productivity and spawn high-value roles in AI governance, infrastructure, and domain integration. The determining factor is proactive reskilling and continuous institutional upskilling.',
  },
  {
    id: 'gd-work-01',
    domain: 'group-discussion',
    department: 'All',
    level: 'Intermediate',
    category: 'Corporate Culture & Work Ethics',
    question: 'Discuss the proposition: "The Four-Day Work Week: Feasible Transformation or Operational Illusion in Modern Engineering Organizations?"',
    expectedKeywords: ['productivity', 'work life balance', 'mental health', 'operational cost', 'client deadlines', 'output vs hours', 'burnout', 'hybrid model'],
    keyConcepts: ['Work-Life Balance', 'Parkinsons Law', 'Operational Feasibility', 'Agile Velocity'],
    followUpProbing: 'How would 24/7 mission-critical operations such as cloud site reliability engineering (SRE) or hospital facilities adapt to 4-day rotations?',
    followUpAdvanced: 'What key performance indicators (KPIs) should leadership monitor to verify that output quality remains unaffected when working hours decrease?',
    sampleStrongAnswer: 'A four-day work week leverages Parkinsons Law to eliminate meeting fatigue and elevate focus, resulting in proven retention and wellness dividends. However, in continuous client-facing and manufacturing sectors, staggered shift rosters and automated monitoring are essential to prevent coverage gaps and SLA penalties.',
  },
]

// ── Query and Helper Functions ──────────────────────────────────────────────

/**
 * Filter questions by domain, department, and level with graceful fallback to 'All'
 */
export function getQuestionsForSession(
  domain: string,
  department?: string,
  level?: string,
  resumeSkills: string[] = []
): QuestionNode[] {
  const normDomain = domain.toLowerCase()
  const normLevel = level ? (level.charAt(0).toUpperCase() + level.slice(1).toLowerCase()) : 'Intermediate'

  // Filter by domain first
  let candidates = QUESTION_BANK.filter((q) => q.domain === normDomain)
  if (candidates.length === 0) {
    candidates = QUESTION_BANK.filter((q) => q.domain === 'technical')
  }

  // Filter or prioritize department if technical
  if (normDomain === 'technical' && department) {
    const deptMatches = candidates.filter((q) => q.department === department || q.department === 'All')
    if (deptMatches.length >= 3) {
      candidates = deptMatches
    }
  }

  // Filter or prioritize level
  const levelMatches = candidates.filter((q) => q.level === normLevel)
  if (levelMatches.length >= 3) {
    candidates = levelMatches
  }

  // Prioritize matching resume skills if candidate provided a resume
  if (resumeSkills.length > 0) {
    const scored = candidates.map((q) => {
      const matchScore = q.expectedKeywords.filter((kw) =>
        resumeSkills.some((skill) => skill.toLowerCase().includes(kw.toLowerCase()) || kw.toLowerCase().includes(skill.toLowerCase()))
      ).length
      return { question: q, score: matchScore }
    })
    scored.sort((a, b) => b.score - a.score)
    return scored.map((s) => s.question)
  }

  return candidates
}

/**
 * Returns a specific question node by ID
 */
export function findQuestionById(id: string): QuestionNode | undefined {
  return QUESTION_BANK.find((q) => q.id === id)
}
