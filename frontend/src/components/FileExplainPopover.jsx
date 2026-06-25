import { useState, useEffect } from 'react'

export default function FileExplainPopover({ filePath, sessionId, onClose }) {
  const [explanation, setExplanation] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!filePath) return

    async function fetchExplanation() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/explain_file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId, file_path: filePath }),
        })
        const data = await res.json()
        if (data.error) {
          setError(data.error)
        } else {
          setExplanation(data.explanation)
        }
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }

    fetchExplanation()
  }, [filePath, sessionId])

  return (
    <div
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 500,
          width: '90%',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 12,
          padding: 20,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12,
          }}
        >
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 13,
              color: 'var(--color-accent-hover)',
              wordBreak: 'break-all',
            }}
          >
            {filePath}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: 'var(--color-text-muted)',
              cursor: 'pointer', fontSize: 16, padding: '2px 6px',
            }}
          >
            ✕
          </button>
        </div>

        {loading && (
          <div style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
            <span className="cursor-blink">Loading explanation...</span>
          </div>
        )}

        {error && (
          <div style={{ color: 'var(--color-red)', fontSize: 13 }}>{error}</div>
        )}

        {explanation && (
          <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--color-text)' }}>
            {explanation}
          </div>
        )}
      </div>
    </div>
  )
}
