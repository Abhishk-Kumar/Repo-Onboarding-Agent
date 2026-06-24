import { useState, useEffect } from 'react'

export default function InputScreen({ onStart, onResetRef }) {
  const [repoUrl, setRepoUrl] = useState('')
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (onResetRef) {
      onResetRef.current = () => {
        console.log('[InputScreen] Reset loading state')
        setLoading(false)
      }
    }
  }, [onResetRef])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!repoUrl.trim()) return
    console.log('[InputScreen] Submit:', repoUrl.trim())
    setLoading(true)
    onStart(repoUrl.trim(), question.trim())
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', flex: 1,
    }}>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <h1 style={{
          fontSize: 32, fontWeight: 700, letterSpacing: '-0.5px',
          margin: '0 0 8px',
          background: 'linear-gradient(135deg, var(--color-text), var(--color-accent))',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}>
          Understand any codebase in seconds
        </h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 15, margin: 0, lineHeight: 1.5 }}>
          Paste a GitHub repo URL and get an instant architecture overview, diagram, entry points, and gotchas.
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 560 }}>
        <div style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 12,
          padding: 24,
          display: 'flex', flexDirection: 'column', gap: 16,
        }}>
          <div>
            <label style={{
              display: 'block', fontSize: 13, fontWeight: 600,
              color: 'var(--color-text-muted)', marginBottom: 6,
            }}>
              GitHub Repository URL
            </label>
            <input
              type="text"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/owner/repo"
              disabled={loading}
              style={{
                width: '100%', padding: '10px 14px', fontSize: 14,
                background: 'var(--color-bg)', color: 'var(--color-text)',
                border: '1px solid var(--color-border)',
                borderRadius: 8, outline: 'none',
                fontFamily: 'var(--font-mono)',
                boxSizing: 'border-box',
                opacity: loading ? 0.5 : 1,
              }}
              onFocus={(e) => e.target.style.borderColor = 'var(--color-accent)'}
              onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
            />
          </div>

          <div>
            <label style={{
              display: 'block', fontSize: 13, fontWeight: 600,
              color: 'var(--color-text-muted)', marginBottom: 6,
            }}>
              Specific Question <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(optional)</span>
            </label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. Where does authentication happen?"
              disabled={loading}
              style={{
                width: '100%', padding: '10px 14px', fontSize: 14,
                background: 'var(--color-bg)', color: 'var(--color-text)',
                border: '1px solid var(--color-border)',
                borderRadius: 8, outline: 'none',
                boxSizing: 'border-box',
                opacity: loading ? 0.5 : 1,
              }}
              onFocus={(e) => e.target.style.borderColor = 'var(--color-accent)'}
              onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !repoUrl.trim()}
            style={{
              padding: '12px 24px', fontSize: 15, fontWeight: 600,
              background: loading
                ? 'var(--color-surface-2)'
                : 'linear-gradient(135deg, var(--color-accent), #7c3aed)',
              color: '#fff', border: 'none', borderRadius: 8,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: repoUrl.trim() ? 1 : 0.5,
              transition: 'opacity 0.2s',
              marginTop: 4,
            }}
          >
            {loading ? 'Analyzing Repository...' : 'Start Onboarding'}
          </button>
        </div>

        <div style={{
          display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16,
          fontSize: 12, color: 'var(--color-text-muted)',
        }}>
          <span>Try:</span>
          {['tiangolo/fastapi', 'vercel/next.js', 'microsoft/vscode'].map(r => (
            <button
              key={r}
              type="button"
              disabled={loading}
              onClick={() => !loading && setRepoUrl(`https://github.com/${r}`)}
              style={{
                background: 'none', border: 'none', color: loading ? 'var(--color-text-muted)' : 'var(--color-accent)',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: 12, padding: 0,
                textDecoration: 'underline', textUnderlineOffset: 2,
                opacity: loading ? 0.5 : 1,
              }}
            >
              {r}
            </button>
          ))}
        </div>
      </form>
    </div>
  )
}
