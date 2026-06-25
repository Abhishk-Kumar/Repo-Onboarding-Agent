import { useState, useEffect } from 'react'

const EXAMPLE_REPOS = [
  { name: 'tiangolo/fastapi', desc: 'Python web framework' },
  { name: 'vercel/next.js', desc: 'React framework' },
  { name: 'microsoft/vscode', desc: 'Code editor' },
  { name: 'axios/axios', desc: 'HTTP client' },
]

const FEATURES = [
  {
    icon: '◈',
    color: '#6366f1',
    title: 'The Map',
    desc: 'A real dependency graph extracted via static analysis — not an LLM guess. Every edge is an actual import.',
  },
  {
    icon: '▶',
    color: '#34d399',
    title: 'Start Here',
    desc: 'Tell it your goal — fix a bug, ship a feature, or get the big picture — and get a reading path built for that.',
  },
  {
    icon: '▸',
    color: '#fb923c',
    title: 'Trace a Flow',
    desc: 'Pick a real entry point and watch the actual request path animate across the graph, narrated step by step.',
  },
  {
    icon: '◉',
    color: '#f472b6',
    title: 'Blast Radius',
    desc: 'Click any file to see exactly what depends on it before you touch it — pure graph math, zero guessing.',
  },
]

export default function InputScreen({ onStart, onResetRef }) {
  const [repoUrl, setRepoUrl] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (onResetRef) {
      onResetRef.current = () => {
        setLoading(false)
      }
    }
  }, [onResetRef])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!repoUrl.trim()) return
    setLoading(true)
    onStart(repoUrl.trim())
  }

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* ---- Hero ---- */}
      <div style={{ textAlign: 'center', maxWidth: 680, marginBottom: 36 }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 20,
            padding: '5px 14px',
            fontSize: 12,
            color: 'var(--color-text-muted)',
            marginBottom: 20,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399', display: 'inline-block' }} />
          Real static analysis, not LLM-guessed diagrams
        </div>

        <h1
          style={{
            fontSize: 40,
            fontWeight: 700,
            letterSpacing: '-1px',
            margin: '0 0 14px',
            lineHeight: 1.15,
            background: 'linear-gradient(135deg, var(--color-text), var(--color-accent))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          Drop into any codebase like you've owned it for years
        </h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 15, margin: 0, lineHeight: 1.6 }}>
          Paste a GitHub repo URL. Get a real, interactive dependency graph — then trace one
          actual request end-to-end, find where to start for the task you have, and see what
          breaks before you touch anything.
        </p>
      </div>

      {/* ---- Input card ---- */}
      <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 600 }}>
        <div
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 12,
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
          }}
        >
          <div>
            <label
              style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--color-text-muted)',
                marginBottom: 6,
              }}
            >
              GitHub Repository URL
            </label>
            <input
              type="text"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/owner/repo"
              disabled={loading}
              style={{
                width: '100%',
                padding: '12px 14px',
                fontSize: 14,
                background: 'var(--color-bg)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                outline: 'none',
                fontFamily: 'var(--font-mono)',
                boxSizing: 'border-box',
                opacity: loading ? 0.5 : 1,
              }}
              onFocus={(e) => (e.target.style.borderColor = 'var(--color-accent)')}
              onBlur={(e) => (e.target.style.borderColor = 'var(--color-border)')}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !repoUrl.trim()}
            style={{
              padding: '13px 24px',
              fontSize: 15,
              fontWeight: 600,
              background: loading
                ? 'var(--color-surface-2)'
                : 'linear-gradient(135deg, var(--color-accent), #7c3aed)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: repoUrl.trim() ? 1 : 0.5,
              transition: 'opacity 0.2s',
            }}
          >
            {loading ? 'Cloning & analyzing repository…' : 'Start Onboarding →'}
          </button>

          <div
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              flexWrap: 'wrap',
              fontSize: 12,
              color: 'var(--color-text-muted)',
              paddingTop: 4,
            }}
          >
            <span>Try:</span>
            {EXAMPLE_REPOS.map((r) => (
              <button
                key={r.name}
                type="button"
                disabled={loading}
                onClick={() => !loading && setRepoUrl(`https://github.com/${r.name}`)}
                title={r.desc}
                style={{
                  background: 'var(--color-bg)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 14,
                  color: loading ? 'var(--color-text-muted)' : 'var(--color-text)',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: 12,
                  padding: '4px 10px',
                  opacity: loading ? 0.5 : 1,
                  transition: 'border-color 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  if (!loading) e.currentTarget.style.borderColor = 'var(--color-accent)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-border)'
                }}
              >
                {r.name}
              </button>
            ))}
          </div>
        </div>
      </form>

      {/* ---- Feature showcase ---- */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 14,
          width: '100%',
          maxWidth: 880,
          marginTop: 56,
        }}
      >
        {FEATURES.map((f) => (
          <div
            key={f.title}
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 10,
              padding: '18px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              transition: 'border-color 0.2s ease, transform 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = f.color
              e.currentTarget.style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-border)'
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: `${f.color}1f`,
                color: f.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 15,
              }}
            >
              {f.icon}
            </div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-text)' }}>{f.title}</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>{f.desc}</div>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 28, marginBottom: 0 }}>
        Works on any public GitHub repo · Python &amp; JavaScript/TypeScript supported
      </p>
    </div>
  )
}
