import { useState, useRef, useCallback } from 'react'
import InputScreen from './components/InputScreen'
import AgentTracePanel from './components/AgentTracePanel'
import DependencyGraphView from './components/DependencyGraphView'
import StartHerePanel from './components/StartHerePanel'
import FlowTraceView from './components/FlowTraceView'
import BlastRadiusPanel from './components/BlastRadiusPanel'
import RepoHealthCard from './components/RepoHealthCard'
import FileExplainPopover from './components/FileExplainPopover'
import ReAskBox from './components/ReAskBox'

const STREAM_TIMEOUT_MS = 180_000
const MODES = [
  { key: 'explore', label: 'Explore', icon: '◈' },
  { key: 'start_here', label: 'Start Here', icon: '▶' },
  { key: 'trace_flow', label: 'Trace a Flow', icon: '▸' },
]

export default function App() {
  const [phase, setPhase] = useState('input')
  const [traces, setTraces] = useState([])
  const [graph, setGraph] = useState(null)
  const [repoUrl, setRepoUrl] = useState('')
  const abortRef = useRef(null)
  const timeoutRef = useRef(null)
  const hasCompletedRef = useRef(false)
  const inputResetRef = useRef(null)

  const [mode, setMode] = useState('explore')
  const [selectedFile, setSelectedFile] = useState(null)
  const [highlightedNodes, setHighlightedNodes] = useState(null)
  const [numberedNodes, setNumberedNodes] = useState(null)
  const [flowPath, setFlowPath] = useState(null)
  const [showExplain, setShowExplain] = useState(null)

  const handleEvent = useCallback((data) => {
    if (data.event === 'complete') {
      hasCompletedRef.current = true
      setGraph(data)
      setPhase('report')
      if (inputResetRef.current) inputResetRef.current()
      return
    }

    if (data.event === 'error') {
      setTraces(prev => [...prev, { type: 'error', message: data.message }])
      if (inputResetRef.current) inputResetRef.current()
      return
    }

    if (data.event === 'progress') {
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
    hasCompletedRef.current = true
    setTraces(prev => [...prev, { type: 'error', message }])
    setPhase('report')
    if (inputResetRef.current) inputResetRef.current()
  }, [])

  const handleStart = useCallback(async (url, question) => {
    setPhase('running')
    setTraces([])
    setGraph(null)
    setSelectedFile(null)
    setHighlightedNodes(null)
    setNumberedNodes(null)
    setFlowPath(null)
    setMode('explore')
    hasCompletedRef.current = false
    setRepoUrl(url)

    const body = JSON.stringify({ repo_url: url, question: question || null })
    const abort = new AbortController()
    abortRef.current = abort

    timeoutRef.current = setTimeout(() => {
      abort.abort()
      endWithError(`Request timed out after ${STREAM_TIMEOUT_MS / 1000}s.`)
    }, STREAM_TIMEOUT_MS)

    try {
      const response = await fetch('/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: abort.signal,
      })

      if (!response.ok) {
        const text = await response.text().catch(() => 'Unknown error')
        endWithError(`Server error (${response.status}): ${text}`)
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))
            handleEvent(data)
          } catch (e) {
            console.warn('Malformed SSE line:', line.slice(0, 100), e)
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        endWithError(`Connection error: ${err.message}`)
      }
    } finally {
      clearTimeout(timeoutRef.current)
      abortRef.current = null
      if (!hasCompletedRef.current) {
        endWithError('Connection closed unexpectedly.')
      }
    }
  }, [handleEvent, endWithError])

  const handleReset = useCallback(() => {
    if (abortRef.current) abortRef.current.abort()
    clearTimeout(timeoutRef.current)
    setPhase('input')
    setTraces([])
    setGraph(null)
    setSelectedFile(null)
    setHighlightedNodes(null)
    setNumberedNodes(null)
    setFlowPath(null)
    setShowExplain(null)
    setMode('explore')
    hasCompletedRef.current = false
  }, [])

  const handleNodeClick = useCallback((nodeId) => {
    setSelectedFile((prev) => (prev === nodeId ? null : nodeId))
    if (mode === 'explore') {
      const deps = new Set()
      if (graph?.dependency_graph?.edges) {
        graph.dependency_graph.edges.forEach((e) => {
          if (e.source === nodeId) deps.add(e.target)
          if (e.target === nodeId) deps.add(e.source)
        })
      }
      deps.add(nodeId)
      setHighlightedNodes(deps)
    }
  }, [mode, graph])

  const handleNodeContextMenu = useCallback((nodeId) => {
    setShowExplain(nodeId)
  }, [])

  const handlePathUpdate = useCallback((path) => {
    const numbered = path || []
    setNumberedNodes(numbered)
    const fileSet = new Set(numbered.map((s) => s.file_path))
    setHighlightedNodes(fileSet)
  }, [])

  const handleFlowUpdate = useCallback((fileSet) => {
    setFlowPath(fileSet)
    setHighlightedNodes(fileSet)
  }, [])

  const handleReAsk = useCallback(async (question) => {
    if (!repoUrl) return
    setTraces(prev => [...prev, { type: 'progress', message: `Re-asking: ${question}...` }])

    try {
      const res = await fetch('/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: repoUrl, question }),
      })
      const data = await res.json()
      setTraces(prev => [...prev, { type: 'agent', message: data.answer }])
    } catch (err) {
      setTraces(prev => [...prev, { type: 'error', message: `Re-ask failed: ${err.message}` }])
    }
  }, [repoUrl])

  const handleModeChange = useCallback((newMode) => {
    setMode(newMode)
    setSelectedFile(null)
    if (newMode === 'explore') {
      setHighlightedNodes(null)
      setNumberedNodes(null)
      setFlowPath(null)
    }
  }, [])

  const dependencyGraph = graph?.dependency_graph
  const graphWithCandidates = dependencyGraph ? { ...dependencyGraph, flow_candidates: graph?.flow_candidates || [] } : null

  const sessionId = repoUrl

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{
        borderBottom: '1px solid var(--color-border)',
        padding: '12px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 6,
          background: 'linear-gradient(135deg, var(--color-accent), #a78bfa)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 700, color: '#fff',
        }}>C</div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.3 }}>Codebase Onboarding Agent</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', lineHeight: 1.3 }}>
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
              fontSize: 12,
            }}
          >
            New Exploration
          </button>
        )}
      </header>

      {phase === 'input' && (
        <main
          style={{
            flex: 1,
            width: '100%',
            margin: '0 auto',
            padding: '64px 24px 80px',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
          }}
        >
          <InputScreen onStart={handleStart} onResetRef={inputResetRef} />
        </main>
      )}

      {(phase === 'running' || phase === 'report') && graph && (
        <>
          <RepoHealthCard repoUrl={repoUrl} />

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '6px 12px',
            borderBottom: '1px solid var(--color-border)',
          }}>
            {MODES.map((m) => (
              <button
                key={m.key}
                onClick={() => handleModeChange(m.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '6px 12px', fontSize: 12, fontWeight: 500,
                  background: mode === m.key ? 'var(--color-surface-2)' : 'none',
                  border: 'none',
                  color: mode === m.key ? 'var(--color-accent)' : 'var(--color-text-muted)',
                  borderRadius: 6, cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <span style={{ fontSize: 13 }}>{m.icon}</span>
                {m.label}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
              {(phase === 'running') && (
                <AgentTracePanel traces={traces} />
              )}
              {phase === 'report' && traces.length > 0 && (
                <AgentTracePanel traces={traces} />
              )}
              <DependencyGraphView
                graph={graphWithCandidates}
                onNodeClick={handleNodeClick}
                onNodeContextMenu={handleNodeContextMenu}
                highlightedNodes={highlightedNodes}
                numberedNodes={numberedNodes}
                flowPath={flowPath}
                selectedFile={selectedFile}
              />
            </div>

            {phase === 'report' && mode === 'start_here' && graph && (
              <StartHerePanel
                sessionId={sessionId}
                onPathUpdate={handlePathUpdate}
                onClose={() => { setMode('explore'); setHighlightedNodes(null); setNumberedNodes(null); setSelectedFile(null) }}
              />
            )}

            {phase === 'report' && mode === 'trace_flow' && graph && (
              <FlowTraceView
                graph={graphWithCandidates}
                sessionId={sessionId}
                onFlowUpdate={handleFlowUpdate}
                onClose={() => { setMode('explore'); setFlowPath(null); setHighlightedNodes(null); setSelectedFile(null) }}
              />
            )}

            {phase === 'report' && mode === 'explore' && selectedFile && (
              <BlastRadiusPanel
                filePath={selectedFile}
                graph={graphWithCandidates}
                sessionId={sessionId}
                onClose={() => { setSelectedFile(null); setHighlightedNodes(null) }}
              />
            )}
          </div>

          {phase === 'report' && (
            <ReAskBox onAsk={handleReAsk} />
          )}
        </>
      )}

      {(phase === 'running' && !graph) && (
        <main style={{ flex: 1, maxWidth: 700, width: '100%', margin: '0 auto', padding: '24px' }}>
          <AgentTracePanel traces={traces} />
        </main>
      )}

      {showExplain && sessionId && (
        <FileExplainPopover
          filePath={showExplain}
          sessionId={sessionId}
          onClose={() => setShowExplain(null)}
        />
      )}
    </div>
  )
}
