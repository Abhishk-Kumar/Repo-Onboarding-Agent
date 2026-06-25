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
  const [collapsed, setCollapsed] = useState(true)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [traces])

  if (traces.length === 0) return null

  return (
    <div style={{
      borderBottom: '1px solid var(--color-border)',
      background: 'var(--color-surface)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: 'var(--color-green)',
            boxShadow: '0 0 6px var(--color-green)',
          }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)' }}>
            Agent Activity
          </span>
          <span style={{
            fontSize: 10, color: 'var(--color-text-muted)',
            background: 'var(--color-surface-2)',
            padding: '1px 6px', borderRadius: 8,
          }}>
            {traces.length}
          </span>
        </div>
        <button
          onClick={() => setCollapsed(c => !c)}
          style={{
            background: 'none', border: 'none', color: 'var(--color-text-muted)',
            cursor: 'pointer', fontSize: 11, padding: '2px 6px',
            borderRadius: 4,
          }}
        >
          {collapsed ? 'Show' : 'Hide'}
        </button>
      </div>

      {!collapsed && (
        <div style={{
          padding: '4px 0',
          maxHeight: 180,
          overflowY: 'auto',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          lineHeight: 1.5,
        }}>
          {traces.map((t, i) => (
            <div
              key={i}
              className="trace-line"
              style={{
                padding: '1px 12px',
                display: 'flex',
                gap: 6,
                color: COLORS[t.type] || 'var(--color-text)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              <span style={{ flexShrink: 0, opacity: 0.7 }}>{ICONS[t.type] || '•'}</span>
              <span>{t.message}</span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  )
}
