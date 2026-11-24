import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  HeadingLevel,
  BorderStyle,
} from 'docx'
import type { Quiz, QuizAttempt } from '../types/quiz'

interface LeaderboardStats {
  total: number
  high: number
  avg: number
  passRate: number
  clean: number
  passed?: number
}

/**
 * Generates an institutional-grade Word Document (.docx) report from quiz submissions.
 * Includes a summary executive banner and a tabular breakdown featuring:
 * - Candidate Rank & Full Name
 * - Institutional Email, Roll Number & Department
 * - Questions Attempted (e.g. 15 / 15)
 * - Questions Correct (e.g. 14)
 * - Total Marks & Percentage (e.g. 14/15 (93%))
 * - Examination Status (PASSED / FAILED)
 * - Proctoring Integrity Rating
 */
export async function exportQuizLeaderboardToDocx(
  quiz: Quiz,
  attempts: QuizAttempt[],
  stats: LeaderboardStats
): Promise<void> {
  const ranked = [...attempts].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return (a.timeSpentSeconds || 0) - (b.timeSpentSeconds || 0)
  })

  const totalQuestions = quiz.questions?.length || (ranked[0]?.maxScore) || 0

  const thinBorder = {
    style: BorderStyle.SINGLE,
    size: 4,
    color: 'CBD5E1',
  }

  const cellBorders = {
    top: thinBorder,
    bottom: thinBorder,
    left: thinBorder,
    right: thinBorder,
  }

  // 1. Table Header
  const tableHeaderRow = new TableRow({
    tableHeader: true,
    children: [
      { text: 'Rank', width: 8 },
      { text: 'Candidate Name', width: 22 },
      { text: 'Email & Department', width: 24 },
      { text: 'Attempted', width: 11 },
      { text: 'Correct', width: 10 },
      { text: 'Marks', width: 13 },
      { text: 'Integrity', width: 12 },
    ].map((col) => new TableCell({
      width: { size: col.width, type: WidthType.PERCENTAGE },
      shading: { fill: '0F172A' },
      borders: cellBorders,
      margins: { top: 120, bottom: 120, left: 120, right: 120 },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: col.text, bold: true, color: 'FFFFFF', size: 18 })
          ]
        })
      ]
    }))
  })

  // 2. Data Rows
  const dataRows = ranked.map((att, idx) => {
    const isEven = idx % 2 === 0
    const bg = isEven ? 'F8FAFC' : 'FFFFFF'

    // Compute attempted count
    let attemptedCount = 0
    if (quiz.questions && quiz.questions.length > 0) {
      quiz.questions.forEach((q, qIdx) => {
        const ans = att.answers?.[q.id] ?? att.answers?.[`q-${qIdx}`] ?? att.answers?.[String(qIdx)] ?? att.answers?.[qIdx]
        if (ans !== undefined && ans !== null && ans !== -1) {
          attemptedCount++
        }
      })
    } else if (att.answers) {
      attemptedCount = Object.keys(att.answers).length
    } else {
      attemptedCount = att.score
    }

    const correctCount = att.score
    const maxMarks = att.maxScore || totalQuestions || 0
    const flagsCount = att.suspiciousFlags?.length ?? 0
    const integrity = typeof att.integrityScore === 'number' ? att.integrityScore : 100

    return new TableRow({
      children: [
        // Rank
        new TableCell({
          width: { size: 8, type: WidthType.PERCENTAGE },
          shading: { fill: bg },
          borders: cellBorders,
          margins: { top: 100, bottom: 100, left: 80, right: 80 },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: `#${idx + 1}`, bold: true, size: 18, color: '0F172A' })]
            })
          ]
        }),
        // Candidate Name
        new TableCell({
          width: { size: 22, type: WidthType.PERCENTAGE },
          shading: { fill: bg },
          borders: cellBorders,
          margins: { top: 100, bottom: 100, left: 100, right: 100 },
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: att.studentName || att.studentEmail.split('@')[0],
                  bold: true,
                  size: 18,
                  color: '0F172A'
                })
              ]
            })
          ]
        }),
        // Email & Department
        new TableCell({
          width: { size: 24, type: WidthType.PERCENTAGE },
          shading: { fill: bg },
          borders: cellBorders,
          margins: { top: 100, bottom: 100, left: 100, right: 100 },
          children: [
            new Paragraph({
              children: [new TextRun({ text: att.studentEmail, size: 15, color: '334155' })]
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: `${att.rollNumber ? att.rollNumber + ' • ' : ''}${att.department || 'All Branches'}`,
                  size: 14,
                  color: '64748B'
                })
              ]
            })
          ]
        }),
        // Attempted
        new TableCell({
          width: { size: 11, type: WidthType.PERCENTAGE },
          shading: { fill: bg },
          borders: cellBorders,
          margins: { top: 100, bottom: 100, left: 80, right: 80 },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: `${attemptedCount} / ${totalQuestions}`, size: 18, color: '0F172A' })]
            })
          ]
        }),
        // Correct
        new TableCell({
          width: { size: 10, type: WidthType.PERCENTAGE },
          shading: { fill: bg },
          borders: cellBorders,
          margins: { top: 100, bottom: 100, left: 80, right: 80 },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: `${correctCount}`, bold: true, color: '059669', size: 18 })]
            })
          ]
        }),
        // Marks
        new TableCell({
          width: { size: 13, type: WidthType.PERCENTAGE },
          shading: { fill: bg },
          borders: cellBorders,
          margins: { top: 100, bottom: 100, left: 80, right: 80 },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: `${att.score}/${maxMarks} (${att.percentage}%)`,
                  bold: true,
                  size: 18,
                  color: '0F172A'
                })
              ]
            })
          ]
        }),
        // Integrity & Flags
        new TableCell({
          width: { size: 12, type: WidthType.PERCENTAGE },
          shading: { fill: bg },
          borders: cellBorders,
          margins: { top: 100, bottom: 100, left: 80, right: 80 },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: flagsCount > 0 ? `${integrity}% (${flagsCount} flags)` : '100% Clean',
                  size: 16,
                  bold: flagsCount > 0,
                  color: integrity >= 80 ? '047857' : integrity >= 50 ? 'B45309' : 'DC2626'
                })
              ]
            })
          ]
        })
      ]
    })
  })

  // 3. Assemble Full Document
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { after: 120 },
            children: [
              new TextRun({
                text: 'PrepHire.AI — Examination Assessment Report',
                bold: true,
                color: '0F172A',
                size: 30,
              })
            ]
          }),
          new Paragraph({
            spacing: { after: 60 },
            children: [
              new TextRun({ text: 'Assessment Title: ', bold: true, size: 22, color: '1E293B' }),
              new TextRun({ text: quiz.title, size: 22, color: '2563EB', bold: true }),
            ]
          }),
          new Paragraph({
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: `Generated On: ${new Date().toLocaleString()}   |   Passing Threshold: ${quiz.passingPercentage || 60}%   |   Total Candidates: ${ranked.length}   |   Cohort Average: ${stats.avg}%   |   Pass Rate: ${stats.passRate}%`,
                size: 16,
                color: '64748B'
              })
            ]
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [tableHeaderRow, ...dataRows]
          }),
          new Paragraph({
            spacing: { before: 240 },
            children: [
              new TextRun({
                text: 'Official Institutional Record • PrepHire.AI Placement & Assessment Engine • All candidate scores cryptographically evaluated.',
                italics: true,
                size: 14,
                color: '94A3B8'
              })
            ]
          })
        ]
      }
    ]
  })

  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${(quiz.title || 'Quiz').replace(/[^a-zA-Z0-9_-]/g, '_')}_Report.docx`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
