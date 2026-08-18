import Editor from '@monaco-editor/react'
import { T } from '../../theme'

const MONACO_LANGUAGE: Record<string, string> = {
  javascript: 'javascript',
  python: 'python',
  java: 'java',
  cpp: 'cpp',
  c: 'c',
}

export function CodeEditor({
  language,
  value,
  onChange,
  height = 420,
  readOnly = false,
}: {
  language: string
  value: string
  onChange: (value: string) => void
  height?: number | string
  readOnly?: boolean
}) {
  return (
    <div
      style={{
        border: `1px solid ${T.border}`,
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      <Editor
        height={height}
        language={MONACO_LANGUAGE[language] || 'plaintext'}
        value={value}
        theme="vs-dark"
        onChange={(v) => onChange(v ?? '')}
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          fontFamily: "'Fira Code', 'JetBrains Mono', Menlo, Consolas, monospace",
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          readOnly,
          padding: { top: 12 },
          wordWrap: 'on',
          renderLineHighlight: 'gutter',
          smoothScrolling: true,
        }}
      />
    </div>
  )
}
