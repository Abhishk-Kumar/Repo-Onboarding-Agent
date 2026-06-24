import { useEffect, useState } from 'react'

export default function DiagramTab({ code }) {
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [svgHtml, setSvgHtml] = useState('')

  useEffect(() => {
    if (!code || !code.trim()) {
      setStatus('empty')
      return
    }

    let cancelled = false

    async function renderMermaid() {
      setStatus('loading')
      setSvgHtml('')

      if (typeof window.mermaid === 'undefined') {
        try {
          await loadScript('https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js')
        } catch (e) {
          if (!cancelled) {
            setError(`Failed to load Mermaid renderer: ${e.message}`)
            setStatus('error')
          }
          return
        }
      }

      if (cancelled) return

      try {
        window.mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          themeVariables: {
            primaryColor: '#1c1c2e',
            primaryBorderColor: '#6366f1',
            primaryTextColor: '#e4e4ec',
            lineColor: '#6366f1',
            secondaryColor: '#14141f',
            tertiaryColor: '#2a2a3e',
            fontSize: '14px',
          },
        })

        const { svg } = await window.mermaid.render('mermaid-svg-' + Date.now(), code)
        if (!cancelled) {
          setSvgHtml(svg)
          setStatus('rendered')
        }
      } catch (e) {
        if (!cancelled) {
          setError(`Diagram syntax error: ${e.message}. Try viewing the raw diagram below.`)
          setStatus('error')
        }
      }
    }

    renderMermaid()
    return () => { cancelled = true }
  }, [code])

  return (
    <div>
      <div
        style={{
          minHeight: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--color-surface)', borderRadius: 10,
          border: '1px solid var(--color-border)',
          padding: 24,
          overflow: 'auto',
        }}
      >
        {status === 'loading' && (
          <div style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>
            <span className="cursor-blink">Rendering diagram...</span>
          </div>
        )}

        {status === 'rendered' && (
          <div dangerouslySetInnerHTML={{ __html: svgHtml }} />
        )}

        {status === 'empty' && (
          <div style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>
            No diagram was generated for this repository.
          </div>
        )}

        {status === 'error' && (
          <div style={{ textAlign: 'center', color: 'var(--color-yellow)', fontSize: 13, maxWidth: 500 }}>
            <div style={{ marginBottom: 8 }}>⚠ {error || 'Failed to render diagram'}</div>
          </div>
        )}
      </div>

      {code && (
        <details style={{ marginTop: 12 }}>
          <summary style={{
            fontSize: 12, color: 'var(--color-text-muted)',
            cursor: 'pointer', userSelect: 'none',
          }}>
            Raw Mermaid Code
          </summary>
          <pre style={{
            margin: '8px 0 0', padding: 12,
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            fontSize: 12, lineHeight: 1.5,
            overflow: 'auto',
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-text-muted)',
            whiteSpace: 'pre-wrap',
          }}>
            {code}
          </pre>
        </details>
      )}
    </div>
  )
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = src
    script.onload = resolve
    script.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.head.appendChild(script)
  })
}
