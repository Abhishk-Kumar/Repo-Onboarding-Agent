import { useState } from 'react'

const GOALS = [
  { key: 'big_picture', label: 'Big Picture', icon: '◈', desc: 'Understand the overall architecture' },
  { key: 'add_a_feature', label: 'Add a Feature', icon: '+', desc: 'Find hub files for new features' },
  { key: 'fix_a_bug', label: 'Fix a Bug', icon: '⚡', desc: 'Find fragile, high-impact files' },
]

export default function StartHerePanel({ sessionId, onPathUpdate, onClose }) {
  const [selectedGoal, setSelectedGoal] = useState(null)
  const [loading, setLoading] = useState(false)
  const [path, setPath] = useState(null)
  const [error, setError] = useState(null)

  const handleGoalSelect = async (goal) => {
    setSelectedGoal(goal)
    setLoading(true)
    setError(null)
    setPath(null)

    try {
      const res = await fetch('/start_here', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, goal }),
      })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
      } else {
        setPath(data.path || [])
        if (onPathUpdate) onPathUpdate(data.path || [])
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

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
        <span style={{ fontSize: 13, fontWeight: 600 }}>Start Here</span>
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

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 4 }}>
          What are you onboarding for?
        </div>
        {GOALS.map((g) => (
          <button
            key={g.key}
            onClick={() => handleGoalSelect(g.key)}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              borderRadius: 8,
              background: selectedGoal === g.key ? 'rgba(99,102,241,0.15)' : 'var(--color-surface-2)',
              border: selectedGoal === g.key ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
              color: 'var(--color-text)',
              cursor: loading ? 'not-allowed' : 'pointer',
              textAlign: 'left',
              fontSize: 13,
              transition: 'all 0.15s',
              opacity: loading ? 0.6 : 1,
            }}
          >
            <span style={{ fontSize: 16, width: 20, textAlign: 'center' }}>{g.icon}</span>
            <div>
              <div style={{ fontWeight: 600 }}>{g.label}</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>{g.desc}</div>
            </div>
          </button>
        ))}
      </div>

      {loading && (
        <div style={{ padding: '16px', color: 'var(--color-text-muted)', fontSize: 13 }}>
          <span className="cursor-blink">Computing reading path...</span>
        </div>
      )}

      {error && (
        <div style={{ padding: '12px 16px', color: 'var(--color-red)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {path && path.length > 0 && (
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 16px' }}>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 8 }}>
            Reading Path ({path.length} steps)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {path.map((step, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  gap: 10,
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: 'var(--color-surface-2)',
                  border: '1px solid var(--color-border)',
                  fontSize: 12,
                  lineHeight: 1.5,
                }}
              >
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: 'var(--color-accent)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 10,
                    fontWeight: 700,
                    flexShrink: 0,
                    marginTop: 1,
                  }}
                >
                  {step.step_number}
                </span>
                <div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", color: 'var(--color-accent-hover)' }}>
                    {step.file_path}
                  </div>
                  {step.reasoning && (
                    <div style={{ color: 'var(--color-text-muted)', marginTop: 4 }}>
                      {step.reasoning}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {path && path.length === 0 && !loading && (
        <div style={{ padding: '16px', color: 'var(--color-text-muted)', fontSize: 13 }}>
          No reading path could be computed for this goal.
        </div>
      )}
    </div>
  )
}
