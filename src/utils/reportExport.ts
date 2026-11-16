// ── PrepHire-AI Evaluation Report & Data Export Utility ────────────────────
// Generates styled print/PDF-ready evaluation sheets and batch CSV exports.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * HTML-escapes any value before it is interpolated into the report markup.
 * SECURITY: the report is written into a popup opened with window.open('') which
 * inherits THIS app's origin. Names, AI-generated text and faculty remarks were
 * previously interpolated raw, so a student registering with a name like
 * `<img src=x onerror=...>` got script execution in the origin of whichever
 * Faculty/Admin printed their report (stored XSS -> privilege escalation).
 */
const esc = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

/** Numeric fields are coerced so a string payload can never reach the markup. */
const num = (value: unknown, fallback = 0): number => {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

/**
 * CSV cell: quotes the value and neutralises spreadsheet formula injection
 * (cells starting with = + - @ TAB CR are executed by Excel/Sheets).
 */
const csvCell = (value: unknown): string => {
  let text = String(value ?? '')
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

export interface ExportableSession {
  studentName: string
  studentEmail: string
  department?: string
  domain: string
  level: string
  score: number
  date: string
  warnings: number
  report: {
    overallScore: number
    technical: number
    communication: number
    confidence: number
    clarity: number
    relevance: number
    strengths: string[]
    improvements: string[]
    tip?: string
    proctoringNote?: string
    actionPlan?: string[]
    speechMetrics?: {
      wpm: number
      pacingFeedback: string
      fillerCount: number
      deliveryScore: number
    }
  }
  facultyRemarks?: string
  placementReady?: boolean
}

/**
 * Opens a clean, branded print window designed specifically for Save to PDF / A4 paper.
 */
export function exportReportToPdf(session: ExportableSession): void {
  const printWindow = window.open('', '_blank', 'width=900,height=1000')
  if (!printWindow) {
    alert('Please allow popups to download or print your evaluation report.')
    return
  }

  const r = session.report
  const sm = r.speechMetrics

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>PrepHire AI Assessment Report - ${esc(session.studentName)}</title>
  <style>
    @page { size: A4; margin: 16mm; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #0F172A;
      background: #FFFFFF;
      margin: 0;
      padding: 0;
      line-height: 1.5;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .header {
      border-bottom: 2px solid #3B82F6;
      padding-bottom: 14px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .logo-title {
      font-size: 24px;
      font-weight: 800;
      color: #1E3A8A;
      letter-spacing: -0.5px;
    }
    .subtitle {
      font-size: 13px;
      color: #64748B;
      margin-top: 2px;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 8px;
      padding: 14px;
      margin-bottom: 24px;
      font-size: 13px;
    }
    .meta-item strong { display: block; color: #475569; font-size: 11px; text-transform: uppercase; margin-bottom: 2px; }
    .score-banner {
      display: flex;
      gap: 16px;
      margin-bottom: 24px;
    }
    .overall-card {
      background: linear-gradient(135deg, #1E3A8A, #3B82F6);
      color: white;
      border-radius: 10px;
      padding: 18px 24px;
      min-width: 140px;
      text-align: center;
    }
    .overall-card .num { font-size: 44px; font-weight: 800; line-height: 1; }
    .overall-card .lbl { font-size: 12px; opacity: 0.9; margin-top: 4px; text-transform: uppercase; }
    .subscores-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      flex-grow: 1;
    }
    .subscore-box {
      background: #F1F5F9;
      border-radius: 8px;
      padding: 10px 14px;
    }
    .subscore-box .label { font-size: 12px; color: #64748B; font-weight: 600; }
    .subscore-box .val { font-size: 20px; font-weight: 700; color: #0F172A; }
    .section-title {
      font-size: 15px;
      font-weight: 700;
      color: #1E293B;
      border-bottom: 1px solid #E2E8F0;
      padding-bottom: 6px;
      margin: 20px 0 10px 0;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .list-box {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .list-box li {
      position: relative;
      padding-left: 18px;
      margin-bottom: 6px;
      font-size: 13px;
      color: #334155;
    }
    .list-box.strengths li::before {
      content: "✓";
      position: absolute;
      left: 0;
      color: #10B981;
      font-weight: 800;
    }
    .list-box.improvements li::before {
      content: "•";
      position: absolute;
      left: 0;
      color: #F59E0B;
      font-weight: 800;
    }
    .tip-box {
      background: #EFF6FF;
      border-left: 4px solid #3B82F6;
      padding: 10px 14px;
      border-radius: 4px;
      font-size: 13px;
      color: #1E40AF;
      margin-top: 14px;
    }
    .footer {
      margin-top: 36px;
      border-top: 1px solid #E2E8F0;
      padding-top: 10px;
      font-size: 11px;
      color: #94A3B8;
      display: flex;
      justify-content: space-between;
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo-title">PrepHire.AI</div>
      <div class="subtitle">Official Candidate Performance Evaluation Report</div>
    </div>
    <div style="text-align: right; font-size: 12px; color: #64748B;">
      Generated on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
    </div>
  </div>

  <div class="meta-grid">
    <div class="meta-item">
      <strong>Candidate</strong>
      ${esc(session.studentName)}
    </div>
    <div class="meta-item">
      <strong>Department</strong>
      ${esc(session.department || 'Engineering')}
    </div>
    <div class="meta-item">
      <strong>Domain & Level</strong>
      ${esc(session.domain)} (${esc(session.level)})
    </div>
    <div class="meta-item">
      <strong>Placement Status</strong>
      ${session.placementReady ? '<span style="color:#10B981;font-weight:700;">Placement Ready</span>' : 'In Progress'}
    </div>
  </div>

  <div class="score-banner">
    <div class="overall-card">
      <div class="num">${num(r.overallScore || session.score)}</div>
      <div class="lbl">Overall Score</div>
    </div>
    <div class="subscores-grid">
      <div class="subscore-box"><div class="label">Technical</div><div class="val">${num(r.technical)}/100</div></div>
      <div class="subscore-box"><div class="label">Communication</div><div class="val">${num(r.communication)}/100</div></div>
      <div class="subscore-box"><div class="label">Confidence</div><div class="val">${num(r.confidence)}/100</div></div>
      <div class="subscore-box"><div class="label">Clarity</div><div class="val">${num(r.clarity)}/100</div></div>
      <div class="subscore-box"><div class="label">Relevance</div><div class="val">${num(r.relevance)}/100</div></div>
      <div class="subscore-box"><div class="label">Proctoring Warnings</div><div class="val">${num(session.warnings)}</div></div>
    </div>
  </div>

  ${sm ? `
  <div class="section-title">Speech & Delivery Analytics</div>
  <div class="meta-grid" style="grid-template-columns: repeat(4, 1fr); margin-bottom: 16px;">
    <div class="meta-item"><strong>Speaking Pace</strong>${num(sm.wpm)} WPM</div>
    <div class="meta-item"><strong>Cadence</strong>${esc(sm.pacingFeedback)}</div>
    <div class="meta-item"><strong>Verbal Fillers</strong>${num(sm.fillerCount)} detected</div>
    <div class="meta-item"><strong>Delivery Score</strong>${num(sm.deliveryScore)}/100</div>
  </div>
  ` : ''}

  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
    <div>
      <div class="section-title">Key Strengths</div>
      <ul class="list-box strengths">
        ${(r.strengths || ['Good overall foundational response']).map((s) => `<li>${esc(s)}</li>`).join('')}
      </ul>
    </div>
    <div>
      <div class="section-title">Areas for Improvement</div>
      <ul class="list-box improvements">
        ${(r.improvements || ['Continue practicing consistent pacing']).map((s) => `<li>${esc(s)}</li>`).join('')}
      </ul>
    </div>
  </div>

  ${r.actionPlan && r.actionPlan.length ? `
  <div class="section-title">Recommended Action Plan</div>
  <ul class="list-box" style="margin-top: 6px;">
    ${r.actionPlan.map((step) => `<li style="padding-left:16px;">👉 ${esc(step)}</li>`).join('')}
  </ul>
  ` : ''}

  ${r.tip ? `
  <div class="tip-box">
    <strong>Strategic Recommendation:</strong> ${esc(r.tip)}
  </div>
  ` : ''}

  ${session.facultyRemarks ? `
  <div style="margin-top: 16px; padding: 12px; background: #FEF3C7; border-radius: 6px; font-size: 13px; color: #92400E;">
    <strong>Faculty Endorsement & Remarks:</strong> ${esc(session.facultyRemarks)}
  </div>
  ` : ''}

  <div class="footer">
    <div>PrepHire-AI Campus Assessment Framework</div>
    <div>Page 1 of 1 • Confidential Candidate Report</div>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 400);
    };
  </script>
</body>
</html>`

  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()
}

/**
 * Exports session records as a standardized CSV file for Faculty/Admin placement grading.
 */
export function exportSessionsToCsv(sessions: ExportableSession[], filename = 'prephire_sessions_batch.csv'): void {
  const headers = [
    'Student Name',
    'Student Email',
    'Department',
    'Domain',
    'Level',
    'Overall Score',
    'Technical',
    'Communication',
    'Confidence',
    'Clarity',
    'Relevance',
    'Warnings',
    'Placement Ready',
    'Date',
    'Faculty Remarks',
  ]

  const rows = sessions.map((s) => {
    const r = s.report || ({} as ExportableSession['report'])
    return [
      csvCell(s.studentName),
      csvCell(s.studentEmail),
      csvCell(s.department),
      csvCell(s.domain),
      csvCell(s.level),
      s.score ?? r.overallScore ?? 0,
      r.technical ?? 0,
      r.communication ?? 0,
      r.confidence ?? 0,
      r.clarity ?? 0,
      r.relevance ?? 0,
      s.warnings ?? 0,
      s.placementReady ? 'YES' : 'NO',
      csvCell(s.date),
      csvCell(s.facultyRemarks),
    ].join(',')
  })

  const csvContent = [headers.join(','), ...rows].join('\r\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
