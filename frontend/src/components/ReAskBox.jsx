import { useState } from 'react'

export default function ReAskBox({ onAsk }) {
  const [question, setQuestion] = useState('')
  const [sending, setSending] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!question.trim() || sending) return
    setSending(true)
    await onAsk(question.trim())
    setQuestion('')
    setSending(false)
  }

  return (
    <div style={{
      padding: '12px 16px',
      borderTop: '1px solid var(--color-border)',
      background: 'var(--color-surface)',
    }}>
      <div style={{
        fontSize: 11, fontWeight: 600, marginBottom: 4,
        color: 'var(--color-text-muted)',
      }}>
        Follow-up Question
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 6 }}>
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask anything about this codebase..."
          style={{
            flex: 1, padding: '8px 12px', fontSize: 13,
            background: 'var(--color-bg)', color: 'var(--color-text)',
            border: '1px solid var(--color-border)',
            borderRadius: 6, outline: 'none',
            boxSizing: 'border-box',
          }}
          onFocus={(e) => e.target.style.borderColor = 'var(--color-accent)'}
          onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
        />
        <button
          type="submit"
          disabled={sending || !question.trim()}
          style={{
            padding: '8px 16px', fontSize: 13, fontWeight: 600,
            background: 'var(--color-accent)', color: '#fff',
            border: 'none', borderRadius: 6, cursor: 'pointer',
            opacity: question.trim() ? 1 : 0.5,
            whiteSpace: 'nowrap',
          }}
        >
          Ask
        </button>
      </form>
    </div>
  )
}
