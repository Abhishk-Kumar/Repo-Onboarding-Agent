import { useState } from 'react'
import DiagramTab from './DiagramTab'

const TABS = [
  { key: 'architecture', label: 'Architecture', icon: '◈' },
  { key: 'diagram', label: 'Diagram', icon: '⬡' },
  { key: 'entrypoints', label: 'Entry Points', icon: '▶' },
  { key: 'gotchas', label: 'Gotchas', icon: '⚠' },
]

function parseLines(text) {
  if (!text) return []
  return text.split('\n').filter(l => l.trim())
}

function parseBullets(text) {
  if (!text) return []
  return text.split('\n')
    .filter(l => l.trim())
    .map(l => l.replace(/^[-*•]\s*/, '').trim())
}

export default function ReportView({ report }) {
  const [activeTab, setActiveTab] = useState('architecture')

  if (!report) return null

  const isPartial = report.status === 'partial'

  const tabContent = (() => {
    switch (activeTab) {
      case 'architecture':
        return (
          <div style={{ lineHeight: 1.7, fontSize: 14, whiteSpace: 'pre-wrap', color: 'var(--color-text)' }}>
            {report.architecture_summary || 'No architecture summary available.'}
          </div>
        )

      case 'diagram':
        return <DiagramTab code={report.mermaid_diagram || ''} />

      case 'entrypoints':
        const entryItems = (() => {
          if (Array.isArray(report.entry_points) && report.entry_points.length > 0) {
            return report.entry_points
          }
          if (typeof report.entry_points === 'string') {
            return parseBullets(report.entry_points)
          }
          return []
        })()
        if (entryItems.length === 0) {
          return <div style={{ color: 'var(--color-text-muted)', fontSize: 14, padding: 16 }}>No entry points identified.</div>
        }
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {entryItems.map((line, i) => {
              const isPath = typeof line === 'string' && (line.includes('/') || line.includes('.') || line.includes(':'))
              return (
                <div key={i} style={{
                  display: 'flex', gap: 8, alignItems: 'flex-start',
                  padding: '10px 12px', borderRadius: 8,
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                }}>
                  <span style={{
                    color: 'var(--color-accent)', fontWeight: 700, fontSize: 12,
                    width: 20, flexShrink: 0, textAlign: 'right',
                  }}>{i + 1}.</span>
                  <span style={{
                    fontSize: 13,
                    color: isPath ? 'var(--color-accent-hover)' : 'var(--color-text)',
                    fontFamily: isPath ? 'var(--font-mono)' : undefined,
                  }}>
                    {typeof line === 'string' ? line : JSON.stringify(line)}
                  </span>
                </div>
              )
            })}
          </div>
        )

      case 'gotchas':
        const gotchaItems = Array.isArray(report.gotchas)
          ? report.gotchas
          : parseBullets(report.gotchas)

        if (gotchaItems.length === 0) {
          return (
            <div style={{
              padding: 16, textAlign: 'center',
              color: 'var(--color-text-muted)', fontSize: 14,
            }}>
              No significant issues found.
            </div>
          )
        }
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {gotchaItems.map((item, i) => {
              const severity = typeof item === 'string' && (
                item.toLowerCase().includes('secret') ||
                item.toLowerCase().includes('password') ||
                item.toLowerCase().includes('hardcoded')
              ) ? 'high'
                : typeof item === 'string' && (
                  item.toLowerCase().includes('todo') ||
                  item.toLowerCase().includes('fixme')
                ) ? 'medium'
                  : 'low'
              const badgeColor = severity === 'high'
                ? 'var(--color-red)'
                : severity === 'medium'
                  ? 'var(--color-yellow)'
                  : 'var(--color-text-muted)'
              return (
                <div key={i} style={{
                  display: 'flex', gap: 10, alignItems: 'flex-start',
                  padding: '10px 12px', borderRadius: 8,
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                }}>
                  <span style={{
                    fontSize: 10, fontWeight: 600,
                    color: '#fff', background: badgeColor,
                    padding: '2px 7px', borderRadius: 4,
                    textTransform: 'uppercase', flexShrink: 0, marginTop: 2,
                  }}>{severity}</span>
                  <span style={{ fontSize: 13, lineHeight: 1.5 }}>{typeof item === 'string' ? item : JSON.stringify(item)}</span>
                </div>
              )
            })}
          </div>
        )

      default:
        return null
    }
  })()

  const directAnswerContent = report.direct_answer && report.direct_answer !== 'None'

  return (
    <div>
      {isPartial && (
        <div style={{
          padding: '12px 16px',
          borderRadius: 10,
          background: 'rgba(234,179,8,0.1)',
          border: '1px solid rgba(234,179,8,0.3)',
          marginBottom: 20,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-yellow)', marginBottom: 4 }}>
            Partial Report
          </div>
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            {report.error || 'Some sections could not be generated due to an error.'}
          </div>
        </div>
      )}

      {/* Direct Answer Banner */}
      {directAnswerContent && (
        <div style={{
          padding: '14px 18px',
          borderRadius: 10,
          background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(124,58,237,0.1))',
          border: '1px solid rgba(99,102,241,0.3)',
          marginBottom: 20,
        }}>
          <div style={{
            fontSize: 12, fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.5px',
            color: 'var(--color-accent-hover)', marginBottom: 6,
          }}>
            Direct Answer
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--color-text)' }}>
            {report.direct_answer}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--color-border)', marginBottom: 20 }}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 16px', fontSize: 13, fontWeight: 500,
              background: 'none', border: 'none',
              color: activeTab === tab.key ? 'var(--color-accent)' : 'var(--color-text-muted)',
              borderBottom: activeTab === tab.key ? '2px solid var(--color-accent)' : '2px solid transparent',
              cursor: 'pointer', transition: 'color 0.15s, border-color 0.15s',
              marginBottom: -1,
            }}
          >
            <span style={{ fontSize: 14 }}>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{ minHeight: 200 }}>
        {tabContent}
      </div>

      {/* Timing */}
      {report.timing && (
        <div style={{
          marginTop: 24, paddingTop: 16,
          borderTop: '1px solid var(--color-border)',
        }}>
          <div style={{
            fontSize: 12, fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.5px',
            color: 'var(--color-text-muted)', marginBottom: 8,
          }}>
            Performance
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {Object.entries(report.timing).map(([key, val]) => (
              <span key={key} style={{
                fontSize: 12, fontFamily: 'var(--font-mono)',
                background: 'var(--color-surface-2)',
                color: 'var(--color-text-muted)',
                padding: '3px 10px', borderRadius: 6,
              }}>
                {key.replace('_time', '')}: {val}s
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Sources */}
      {report.sources && report.sources.length > 0 && (
        <div style={{
          marginTop: 24, paddingTop: 16,
          borderTop: '1px solid var(--color-border)',
        }}>
          <div style={{
            fontSize: 12, fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.5px',
            color: 'var(--color-text-muted)', marginBottom: 8,
          }}>
            Files Referenced
          </div>
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 6,
          }}>
            {(typeof report.sources === 'string' ? report.sources.split(',').map(s => s.trim()).filter(Boolean) : report.sources).map((src, i) => (
              <span key={i} style={{
                fontFamily: 'var(--font-mono)', fontSize: 12,
                background: 'var(--color-surface-2)',
                color: 'var(--color-text-muted)',
                padding: '3px 10px', borderRadius: 6,
              }}>
                {src}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
