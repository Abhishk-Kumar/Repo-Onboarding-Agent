import { useState, useEffect } from 'react'

export default function BlastRadiusPanel({ filePath, graph, sessionId, onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!filePath) return

    async function fetchBlast() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/blast_radius', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId, file_path: filePath }),
        })
        const result = await res.json()
        if (result.error) {
          setError(result.error)
        } else {
          setData(result)
        }
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }

    fetchBlast()
  }, [filePath, sessionId])

  const nodeInfo = graph?.nodes?.find((n) => n.id === filePath)

  return (
    <div
      style={{
        width: 340,
        background: 'var(--color-surface)',
        borderLeft: '1px solid var(--color-border)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600 }}>Blast Radius</span>
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

      <div style={{ padding: 16 }}>
        <div
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12,
            color: 'var(--color-accent-hover)',
            marginBottom: 4,
            wordBreak: 'break-all',
          }}
        >
          {filePath}
        </div>
        {nodeInfo?.purpose && (
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12 }}>
            {nodeInfo.purpose}
          </div>
        )}
        {nodeInfo?.functions && nodeInfo.functions.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 4 }}>
              Functions
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {nodeInfo.functions.map((fn) => (
                <span
                  key={fn}
                  style={{
                    fontSize: 11,
                    fontFamily: "'JetBrains Mono', monospace",
                    background: 'var(--color-surface-2)',
                    padding: '2px 8px',
                    borderRadius: 4,
                    color: 'var(--color-text-muted)',
                  }}
                >
                  {fn}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {loading && (
        <div style={{ padding: '0 16px 16px', color: 'var(--color-text-muted)', fontSize: 13 }}>
          <span className="cursor-blink">Computing blast radius...</span>
        </div>
      )}

      {error && (
        <div style={{ padding: '0 16px 16px', color: 'var(--color-red)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {data && (
        <div style={{ flex: 1, overflow: 'auto', padding: '0 16px 16px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 12px',
              borderRadius: 8,
              background:
                data.dependent_count > 10
                  ? 'rgba(248,113,113,0.1)'
                  : data.dependent_count > 3
                    ? 'rgba(251,191,36,0.1)'
                    : 'rgba(52,211,153,0.1)',
              border: `1px solid ${
                data.dependent_count > 10
                  ? 'rgba(248,113,113,0.3)'
                  : data.dependent_count > 3
                    ? 'rgba(251,191,36,0.3)'
                    : 'rgba(52,211,153,0.3)'
              }`,
              marginBottom: 12,
            }}
          >
            <span
              style={{
                fontSize: 24,
                fontWeight: 700,
                color:
                  data.dependent_count > 10
                    ? 'var(--color-red)'
                    : data.dependent_count > 3
                      ? 'var(--color-yellow)'
                      : 'var(--color-green)',
              }}
            >
              {data.dependent_count}
            </span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600 }}>
                {data.dependent_count === 1 ? 'file depends on this' : 'files depend on this'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                {data.direct_dependents?.length || 0} direct,{' '}
                {data.transitive_dependents?.length || 0} transitive
              </div>
            </div>
          </div>

          {data.direct_dependents && data.direct_dependents.length > 0 && (
            <div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>
                Direct Dependents
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {data.direct_dependents.map((dep) => (
                  <div
                    key={dep}
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 11,
                      padding: '4px 8px',
                      borderRadius: 4,
                      background: 'var(--color-surface-2)',
                      color: 'var(--color-accent-hover)',
                    }}
                  >
                    {dep}
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.transitive_dependents && data.transitive_dependents.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>
                Transitive Dependents
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {data.transitive_dependents.slice(0, 20).map((dep) => (
                  <div
                    key={dep}
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 11,
                      padding: '4px 8px',
                      borderRadius: 4,
                      background: 'var(--color-surface-2)',
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    {dep}
                  </div>
                ))}
                {data.transitive_dependents.length > 20 && (
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)', padding: '4px 8px' }}>
                    ... and {data.transitive_dependents.length - 20} more
                  </div>
                )}
              </div>
            </div>
          )}

          {data.dependent_count === 0 && (
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
              No files depend on this file.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
