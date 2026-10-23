import React, { useState, useEffect } from 'react'
import { FileCheck, Sparkles, AlertCircle, CheckCircle, X, ArrowRight, Target } from 'lucide-react'
import { analyzeResumeAgainstJD, type AtsAnalysisResult } from '../../utils/atsAnalyzer'
import { T } from '../../theme'

interface AtsScannerModalProps {
  isOpen: boolean
  onClose: () => void
  resumeText: string
  onApplyKeywordsToInterview?: (keywords: string[]) => void
}

export const AtsScannerModal: React.FC<AtsScannerModalProps> = ({
  isOpen,
  onClose,
  resumeText,
  onApplyKeywordsToInterview,
}) => {
  const [jobDescription, setJobDescription] = useState('')
  const [analysis, setAnalysis] = useState<AtsAnalysisResult | null>(null)
  const [isScanning, setIsScanning] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleScan = () => {
    if (!jobDescription.trim()) return
    setIsScanning(true)
    setTimeout(() => {
      const result = analyzeResumeAgainstJD(resumeText || 'Python JavaScript React SQL Git Computer Science', jobDescription)
      setAnalysis(result)
      setIsScanning(false)
    }, 150)
  }

  const scoreColor = (score: number) => {
    if (score >= 80) return T.green
    if (score >= 60) return T.amber
    return T.error
  }

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ats-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.2s ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 680,
          maxHeight: '90vh',
          background: T.bgWhite,
          borderRadius: 16,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: `1px solid ${T.border}`,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: `1px solid ${T.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: T.bg,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: `${T.primary}1A`,
                color: T.primary,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Target size={20} />
            </div>
            <div>
              <h3 id="ats-modal-title" style={{ margin: 0, fontSize: 16, fontWeight: 700, color: T.primary }}>
                AI Resume ATS &amp; Job Description Matcher
              </h3>
              <p style={{ margin: 0, fontSize: 12, color: T.txtSec }}>
                Benchmark your resume against target company JD requirements
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: T.txtMut,
              padding: 4,
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {!analysis ? (
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: T.txtPri, marginBottom: 8 }}>
                Paste Target Job Description (JD):
              </label>
              <textarea
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                placeholder="Paste the job requirements, qualifications, or company JD here (e.g. TCS, Infosys, Amazon, Barclays)..."
                style={{
                  width: '100%',
                  height: 180,
                  borderRadius: 10,
                  border: `1px solid ${T.border}`,
                  padding: 12,
                  fontSize: 13,
                  fontFamily: 'inherit',
                  lineHeight: 1.5,
                  resize: 'none',
                  boxSizing: 'border-box',
                  background: T.bg,
                  color: T.txtPri,
                  marginBottom: 16,
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: T.txtMut }}>
                  {resumeText ? '✓ Your resume profile is loaded' : 'ℹ️ Using standard profile keywords'}
                </span>
                <button
                  onClick={handleScan}
                  disabled={!jobDescription.trim() || isScanning}
                  style={{
                    padding: '10px 20px',
                    borderRadius: 10,
                    background: T.primary,
                    color: '#FFFFFF',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: jobDescription.trim() ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    opacity: jobDescription.trim() ? 1 : 0.6,
                  }}
                >
                  <Sparkles size={15} />
                  {isScanning ? 'Analyzing ATS Alignment...' : 'Scan & Benchmark'}
                </button>
              </div>
            </div>
          ) : (
            <div>
              {/* Score Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px 20px',
                  borderRadius: 12,
                  background: T.bg,
                  border: `1px solid ${T.border}`,
                  marginBottom: 18,
                }}
              >
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.txtSec, textTransform: 'uppercase' }}>
                    ATS Keyword Match Rate
                  </div>
                  <div style={{ fontSize: 13, color: T.txtSec, marginTop: 4 }}>
                    {analysis.executiveSummary}
                  </div>
                </div>
                <div style={{ textAlign: 'center', marginLeft: 16 }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: scoreColor(analysis.matchScore) }}>
                    {analysis.matchScore}%
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: T.txtMut, textTransform: 'uppercase' }}>
                    Match Score
                  </div>
                </div>
              </div>

              {/* Keyword Breakdown */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
                {/* Found Keywords */}
                <div style={{ background: '#F0FDF4', borderRadius: 10, padding: 14, border: '1px solid #BBF7D0' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#166534', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CheckCircle size={14} /> Found in Resume ({analysis.foundKeywords.length})
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {analysis.foundKeywords.length > 0 ? (
                      analysis.foundKeywords.map((kw) => (
                        <span key={kw} style={{ fontSize: 11, fontWeight: 600, background: '#DCFCE7', color: '#15803D', padding: '3px 8px', borderRadius: 6 }}>
                          {kw}
                        </span>
                      ))
                    ) : (
                      <span style={{ fontSize: 12, color: T.txtMut }}>No direct technical matches.</span>
                    )}
                  </div>
                </div>

                {/* Missing Keywords */}
                <div style={{ background: '#FFF7ED', borderRadius: 10, padding: 14, border: '1px solid #FED7AA' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#9A3412', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AlertCircle size={14} /> Missing from Resume ({analysis.missingKeywords.length})
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {analysis.missingKeywords.length > 0 ? (
                      analysis.missingKeywords.map((kw) => (
                        <span key={kw} style={{ fontSize: 11, fontWeight: 600, background: '#FFEDD5', color: '#C2410C', padding: '3px 8px', borderRadius: 6 }}>
                          {kw}
                        </span>
                      ))
                    ) : (
                      <span style={{ fontSize: 12, color: T.green }}>All core JD keywords present!</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Recommendations */}
              <div style={{ background: T.bg, borderRadius: 10, padding: 14, border: `1px solid ${T.border}`, marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.primary, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <FileCheck size={14} /> ATS Action Items:
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: T.txtSec, lineHeight: 1.6 }}>
                  {analysis.formattingRecommendations.map((rec, i) => (
                    <li key={i}>{rec}</li>
                  ))}
                </ul>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <button
                  onClick={() => setAnalysis(null)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    background: 'transparent',
                    border: `1px solid ${T.border}`,
                    color: T.txtSec,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Scan Another JD
                </button>
                {onApplyKeywordsToInterview && analysis.missingKeywords.length > 0 && (
                  <button
                    onClick={() => {
                      onApplyKeywordsToInterview(analysis.missingKeywords)
                      onClose()
                    }}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 8,
                      background: T.primary,
                      border: 'none',
                      color: '#FFFFFF',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    Practice These Missing Topics <ArrowRight size={13} />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
