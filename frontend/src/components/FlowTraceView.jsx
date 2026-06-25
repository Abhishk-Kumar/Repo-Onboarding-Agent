import { useState } from 'react'

export default function FlowTraceView({ graph, sessionId, onFlowUpdate, onClose }) {
  const [candidates] = useState(graph?.flow_candidates || [])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(false)
  const [trace, setTrace] = useState(null)
  const [error, setError] = useState(null)
  const [activeStep, setActiveStep] = useState(0)

  const handleTrace = async (candidate) => {
    setSelected(candidate)
    setLoading(true)
    setError(null)
    setTrace(null)
    setActiveStep(0)

    try {
      const res = await fetch('/trace_flow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          starting_file: candidate.file,
        }),
      })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
      } else {
        setTrace(data)
        const fileSet = new Set((data.steps || []).map((s) => s.file_path))
        if (onFlowUpdate) onFlowUpdate(fileSet)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleStepHover = (index) => {
    setActiveStep(index)
    if (trace && onFlowUpdate) {
      const fileSet = new Set((trace.steps || []).slice(0, index + 1).map((s) => s.file_path))
      onFlowUpdate(fileSet)
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
        <span style={{ fontSize: 13, fontWeight: 600 }}>Trace a Flow</span>
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

      {!trace && !loading && (
        <div style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12 }}>
            Choose a starting point to trace through the codebase:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {(candidates || []).map((c, i) => (
              <button
                key={i}
                onClick={() => handleTrace(c)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: selected?.file === c.file ? 'rgba(52,211,153,0.15)' : 'var(--color-surface-2)',
                  border: selected?.file === c.file ? '1px solid #34d399' : '1px solid var(--color-border)',
                  color: 'var(--color-text)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: 12,
                  fontFamily: "'JetBrains Mono', monospace",
                  transition: 'all 0.15s',
                }}
              >
                <span style={{ color: '#34d399', fontSize: 14 }}>▸</span>
                {c.label}
              </button>
            ))}
            {candidates.length === 0 && (
              <div style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
                No flow starting points detected in this codebase.
              </div>
            )}
          </div>
        </div>
      )}

      {loading && (
        <div style={{ padding: '16px', color: 'var(--color-text-muted)', fontSize: 13 }}>
          <span className="cursor-blink">Tracing flow...</span>
        </div>
      )}

      {error && (
        <div style={{ padding: '12px 16px', color: 'var(--color-red)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {trace && trace.steps && trace.steps.length > 0 && (
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 16px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
            {trace.flow_name}
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 12 }}>
            {trace.steps.length} steps — hover to highlight on graph
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {trace.steps.map((step, i) => (
              <div
                key={i}
                onMouseEnter={() => handleStepHover(i)}
                onMouseLeave={() => handleStepHover(trace.steps.length - 1)}
                style={{
                  display: 'flex',
                  gap: 10,
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: i <= activeStep ? 'rgba(52,211,153,0.08)' : 'var(--color-surface-2)',
                  border: `1px solid ${i <= activeStep ? 'rgba(52,211,153,0.3)' : 'var(--color-border)'}`,
                  fontSize: 12,
                  lineHeight: 1.5,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: i <= activeStep ? '#34d399' : 'var(--color-border)',
                    color: i <= activeStep ? '#000' : 'var(--color-text-muted)',
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
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", color: '#34d399' }}>
                    {step.file_path}
                  </div>
                  {step.function_or_symbol && (
                    <div style={{ color: 'var(--color-accent-hover)', fontSize: 11, marginTop: 2 }}>
                      {step.function_or_symbol}
                    </div>
                  )}
                  {step.explanation && (
                    <div style={{ color: 'var(--color-text-muted)', marginTop: 4 }}>
                      {step.explanation}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {trace && trace.steps && trace.steps.length === 0 && !loading && (
        <div style={{ padding: '16px', color: 'var(--color-text-muted)', fontSize: 13 }}>
          Could not trace flow from this starting point.
        </div>
      )}
    </div>
  )
}
