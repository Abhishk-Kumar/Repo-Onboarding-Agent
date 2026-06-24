import { useState, useRef, useCallback } from 'react'
import InputScreen from './components/InputScreen'
import AgentTracePanel from './components/AgentTracePanel'
import ReportView from './components/ReportView'
import ReAskBox from './components/ReAskBox'

const STREAM_TIMEOUT_MS = 180_000

export default function App() {
  const [phase, setPhase] = useState('input')
  const [traces, setTraces] = useState([])
  const [report, setReport] = useState(null)
  const [sessionId] = useState(() => crypto.randomUUID())
  const abortRef = useRef(null)
  const timeoutRef = useRef(null)
  const hasCompletedRef = useRef(false)
  const inputResetRef = useRef(null)

  const handleEvent = useCallback((data) => {
    if (data.event === 'complete') {
      console.log('[App] EVENT: complete', data.status)
      hasCompletedRef.current = true
      setReport(data)
      setPhase('report')
      if (inputResetRef.current) inputResetRef.current()
      return
    }

    if (data.event === 'error') {
      console.warn('[App] EVENT: error', data.message)
      setTraces(prev => [...prev, { type: 'error', message: data.message }])
      if (inputResetRef.current) inputResetRef.current()
      return
    }

    if (data.event === 'progress') {
      console.log('[App] EVENT: progress', data.message)
      setTraces(prev => [...prev, { type: 'progress', message: data.message }])
      return
    }

    if (data.event === 'agent_message') {
      setTraces(prev => [...prev, {
        type: data.role === 'tool' ? 'tool' : 'agent',
        message: data.content,
      }])
      return
    }
  }, [])

  const endWithError = useCallback((message) => {
    if (hasCompletedRef.current) return
    console.warn('[App] endWithError:', message)
    hasCompletedRef.current = true
    setTraces(prev => [...prev, { type: 'error', message }])
    setPhase('report')
    if (inputResetRef.current) inputResetRef.current()
  }, [])

  const handleStart = useCallback(async (repoUrl, question) => {
    console.log('[App] REQUEST START:', repoUrl, question ? `(question: ${question})` : '')

    setPhase('running')
    setTraces([])
    setReport(null)
    hasCompletedRef.current = false

    const body = JSON.stringify({ repo_url: repoUrl, question: question || null })
    const abort = new AbortController()
    abortRef.current = abort

    timeoutRef.current = setTimeout(() => {
      console.warn('[App] TIMEOUT: request exceeded', STREAM_TIMEOUT_MS / 1000, 'seconds')
      abort.abort()
      endWithError(`Request timed out after ${STREAM_TIMEOUT_MS / 1000}s. The analysis may be too large or the backend is unresponsive.`)
    }, STREAM_TIMEOUT_MS)

    try {
      const response = await fetch('/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: abort.signal,
      })

      console.log('[App] RESPONSE STATUS:', response.status, response.statusText)

      if (!response.ok) {
        const text = await response.text().catch(() => 'Unknown error')
        console.error('[App] RESPONSE ERROR:', response.status, text)
        endWithError(`Server error (${response.status}): ${text}`)
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let eventCount = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          console.log('[App] STREAM DONE, events:', eventCount)
          break
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          eventCount++
          try {
            const data = JSON.parse(line.slice(6))
            handleEvent(data)
          } catch (e) {
            console.warn('[App] Malformed SSE line:', line.slice(0, 100), e)
          }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('[App] Request aborted')
      } else {
        console.error('[App] FETCH ERROR:', err.message)
        endWithError(`Connection error: ${err.message}`)
      }
    } finally {
      clearTimeout(timeoutRef.current)
      abortRef.current = null
      if (!hasCompletedRef.current) {
        console.warn('[App] Stream closed without completion event')
        endWithError('Connection closed unexpectedly. The report may be incomplete.')
      }
    }
  }, [handleEvent, endWithError])

  const handleReset = useCallback(() => {
    console.log('[App] Reset')
    if (abortRef.current) abortRef.current.abort()
    clearTimeout(timeoutRef.current)
    setPhase('input')
    setTraces([])
    setReport(null)
    hasCompletedRef.current = false
  }, [])

  const handleReAsk = useCallback(async (question) => {
    console.log('[App] Re-ask:', question)
    setTraces(prev => [...prev, { type: 'progress', message: `Re-asking: ${question}...` }])

    try {
      const res = await fetch('/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, question }),
      })
      const data = await res.json()
      console.log('[App] Re-ask response:', data)
      setTraces(prev => [...prev, { type: 'agent', message: data.answer }])
    } catch (err) {
      console.error('[App] Re-ask error:', err)
      setTraces(prev => [...prev, { type: 'error', message: `Re-ask failed: ${err.message}` }])
    }
  }, [sessionId])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{
        borderBottom: '1px solid var(--color-border)',
        padding: '16px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: 'linear-gradient(135deg, var(--color-accent), #a78bfa)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, fontWeight: 700, color: '#fff',
        }}>C</div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Codebase Onboarding Agent</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            AI-powered repository exploration
          </div>
        </div>
        {(phase === 'running' || phase === 'report') && (
          <button
            onClick={handleReset}
            style={{
              marginLeft: 'auto',
              background: 'var(--color-surface-2)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-muted)',
              padding: '6px 14px',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            New Exploration
          </button>
        )}
      </header>

      <main style={{
        flex: 1, maxWidth: 900, width: '100%', margin: '0 auto',
        padding: phase === 'input' ? '80px 24px' : '24px',
        display: 'flex', flexDirection: 'column',
        transition: 'padding 0.3s ease',
      }}>
        {phase === 'input' && (
          <InputScreen onStart={handleStart} onResetRef={inputResetRef} />
        )}

        {(phase === 'running' || phase === 'report') && (
          <>
            <AgentTracePanel traces={traces} />
            {phase === 'report' && report && (
              <>
                <ReportView report={report} />
                <ReAskBox onAsk={handleReAsk} />
              </>
            )}
          </>
        )}
      </main>
    </div>
  )
}
