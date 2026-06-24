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
      marginTop: 32, paddingTop: 24,
      borderTop: '1px solid var(--color-border)',
    }}>
      <div style={{
        fontSize: 13, fontWeight: 600, marginBottom: 8,
        color: 'var(--color-text-muted)',
      }}>
        Follow-up Question
      </div>
      <div style={{
        fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12,
      }}>
        Ask a follow-up about this codebase. It will search the already-built vector index — no need to re-explore.
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. How are errors handled?"
          style={{
            flex: 1, padding: '10px 14px', fontSize: 14,
            background: 'var(--color-bg)', color: 'var(--color-text)',
            border: '1px solid var(--color-border)',
            borderRadius: 8, outline: 'none',
            boxSizing: 'border-box',
          }}
          onFocus={(e) => e.target.style.borderColor = 'var(--color-accent)'}
          onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
        />
        <button
          type="submit"
          disabled={sending || !question.trim()}
          style={{
            padding: '10px 20px', fontSize: 14, fontWeight: 600,
            background: 'var(--color-accent)', color: '#fff',
            border: 'none', borderRadius: 8, cursor: 'pointer',
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
