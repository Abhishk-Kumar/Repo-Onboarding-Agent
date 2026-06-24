import { useRef, useEffect, useState } from 'react'

const ICONS = {
  progress: '→',
  tool: '⚡',
  agent: '◈',
  error: '✕',
  done: '✓',
}

const COLORS = {
  progress: 'var(--color-text-muted)',
  tool: 'var(--color-yellow)',
  agent: 'var(--color-green)',
  error: 'var(--color-red)',
  done: 'var(--color-green)',
}

export default function AgentTracePanel({ traces }) {
  const bottomRef = useRef(null)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [traces])

  if (traces.length === 0) return null

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: 'var(--color-green)',
            boxShadow: '0 0 8px var(--color-green)',
          }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)' }}>
            Agent Activity
          </span>
          <span style={{
            fontSize: 11, color: 'var(--color-text-muted)',
            background: 'var(--color-surface-2)',
            padding: '1px 7px', borderRadius: 10,
          }}>
            {traces.length}
          </span>
        </div>
        <button
          onClick={() => setCollapsed(c => !c)}
          style={{
            background: 'none', border: 'none', color: 'var(--color-text-muted)',
            cursor: 'pointer', fontSize: 13, padding: '2px 8px',
            borderRadius: 4,
          }}
        >
          {collapsed ? 'Expand' : 'Collapse'}
        </button>
      </div>

      {!collapsed && (
        <div style={{
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: 10,
          padding: '12px 0',
          maxHeight: 320,
          overflowY: 'auto',
          fontFamily: 'var(--font-mono)',
          fontSize: 13,
          lineHeight: 1.6,
        }}>
          {traces.map((t, i) => (
            <div
              key={i}
              className="trace-line"
              style={{
                padding: '2px 16px',
                display: 'flex',
                gap: 8,
                color: COLORS[t.type] || 'var(--color-text)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              <span style={{ flexShrink: 0, opacity: 0.7 }}>{ICONS[t.type] || '•'}</span>
              <span>{t.message}</span>
            </div>
          ))}

          {/* Show a pulsing cursor while still running */}
          {traces.length > 0 && traces[traces.length - 1].type !== 'error' && (
            <div style={{ padding: '2px 16px', display: 'flex', gap: 8 }}>
              <span style={{ color: 'var(--color-accent)' }} className="cursor-blink" />
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      )}
    </div>
  )
}
