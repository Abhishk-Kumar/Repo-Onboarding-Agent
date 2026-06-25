import { useMemo, useCallback, useEffect, useRef, useState } from 'react'
import ReactFlow, {
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  useReactFlow,
  Controls,
  Background,
  MarkerType,
  Position,
} from 'reactflow'
import 'reactflow/dist/style.css'
import dagre from 'dagre'

const FOLDER_COLORS = {
  app: '#6366f1',
  src: '#a78bfa',
  lib: '#34d399',
  components: '#f472b6',
  utils: '#fbbf24',
  routes: '#fb923c',
  pages: '#60a5fa',
  api: '#f87171',
  config: '#a1a1aa',
  tests: '#4ade80',
  default: '#8888a0',
}

function getNodeColor(folder) {
  return FOLDER_COLORS[folder] || FOLDER_COLORS.default
}

function getLayoutedElements(nodes, edges, direction = 'TB', compact = false) {
  const dagreGraph = new dagre.graphlib.Graph()
  dagreGraph.setDefaultEdgeLabel(() => ({}))

  // Compact mode tightens spacing and shrinks node footprint so a large
  // graph can fit on screen in one glance, without requiring the user to
  // scroll to see which files lit up after clicking something. Zoom/pan
  // stay fully available either way — this only changes the *default*
  // density of the layout, not what the user is allowed to do afterward.
  const nodeWidth = compact ? 120 : 180
  const nodeHeight = compact ? 36 : 50

  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: compact ? 16 : 40,
    ranksep: compact ? 28 : 60,
    marginx: 20,
    marginy: 20,
  })

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight })
  })

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target)
  })

  dagre.layout(dagreGraph)

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id)
    return {
      ...node,
      targetPosition: direction === 'LR' ? Position.Left : Position.Top,
      sourcePosition: direction === 'LR' ? Position.Right : Position.Bottom,
      style: {
        ...node.style,
        width: nodeWidth,
        padding: compact ? '4px 6px' : '6px 10px',
        fontSize: compact ? 9 : 11,
      },
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
    }
  })

  return { nodes: layoutedNodes, edges }
}

function GraphInner({
  graph,
  onNodeClick,
  onNodeContextMenu,
  highlightedNodes,
  numberedNodes,
  flowPath,
  selectedFile,
}) {
  const [direction, setDirection] = useState('TB')
  const [compact, setCompact] = useState(false)
  const rawNodes = useMemo(() => {
    if (!graph || !graph.nodes) return []
    return graph.nodes.map((n) => {
      const color = getNodeColor(n.folder)
      const isHighlighted = highlightedNodes?.has(n.id)
      const stepNum = numberedNodes?.find((s) => s.file_path === n.id)
      const isInFlow = flowPath?.has(n.id)
      const isSelected = selectedFile === n.id

      return {
        id: n.id,
        type: 'default',
        data: {
          label: n.label,
          folder: n.folder,
          purpose: n.purpose,
          functions: n.functions?.slice(0, 3) || [],
          stepNumber: stepNum?.step_number,
        },
        style: {
          background: isSelected
            ? 'linear-gradient(135deg, #6366f1, #7c3aed)'
            : isInFlow
              ? 'linear-gradient(135deg, #34d399, #059669)'
              : isHighlighted
                ? '#1c1c2e'
                : '#14141f',
          border: `2px solid ${
            isInFlow ? '#34d399' : isSelected ? '#6366f1' : isHighlighted ? '#6366f1' : color
          }`,
          borderRadius: 8,
          padding: '6px 10px',
          color: '#e4e4ec',
          fontSize: 11,
          fontFamily: "'JetBrains Mono', monospace",
          width: 180,
          opacity: highlightedNodes && !isHighlighted && !isSelected ? 0.25 : 1,
          transition: 'all 0.3s ease',
        },
      }
    })
  }, [graph, highlightedNodes, numberedNodes, flowPath, selectedFile])

  const rawEdges = useMemo(() => {
    if (!graph || !graph.edges) return []
    return graph.edges.map((e, i) => {
      const isInFlow = flowPath?.has(e.source) && flowPath?.has(e.target)
      return {
        id: e.id || `e${i}`,
        source: e.source,
        target: e.target,
        animated: isInFlow,
        style: {
          stroke: isInFlow ? '#34d399' : '#2a2a3e',
          strokeWidth: isInFlow ? 2.5 : 1,
          opacity: highlightedNodes && !isInFlow ? 0.1 : 1,
          transition: 'all 0.3s ease',
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isInFlow ? '#34d399' : '#2a2a3e',
          width: 16,
          height: 16,
        },
      }
    })
  }, [graph, highlightedNodes, flowPath])

  const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(
    () => getLayoutedElements(rawNodes, rawEdges, direction, compact),
    [rawNodes, rawEdges, direction, compact]
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes)
  const [edgesState, setEdges, onEdgesChange] = useEdgesState(layoutedEdges)
  const { fitView } = useReactFlow()
  const initialFitDone = useRef(false)

  useEffect(() => {
    setNodes(layoutedNodes)
    setEdges(layoutedEdges)
  }, [layoutedNodes, layoutedEdges, setNodes, setEdges])

  useEffect(() => {
    if (nodes.length > 0) {
      setTimeout(() => {
        fitView({ padding: 0.3 })
        initialFitDone.current = true
      }, 50)
    }
    // direction and compact are included here on purpose: whenever the user
    // flips horizontal/vertical or toggles compact mode, the whole layout
    // reshapes (dagre recomputes every node position), so the camera needs
    // to re-fit to the new shape instead of staying zoomed into wherever it
    // was for the old layout.
  }, [nodes.length, direction, compact, fitView])

  // When a highlight set changes (a feature lit up a specific group of
  // files — e.g. clicking a node, running Start Here, or tracing a flow),
  // automatically frame the camera around just those highlighted nodes so
  // the user sees the result immediately without manually scrolling to find
  // where on the (possibly large) graph the highlight actually landed.
  // Pan/zoom remain fully available afterward for the user to look closer.
  useEffect(() => {
    const idsToFocus = new Set()
    if (highlightedNodes) {
      highlightedNodes.forEach((id) => idsToFocus.add(id))
    }
    if (flowPath) {
      flowPath.forEach((id) => idsToFocus.add(id))
    }
    if (idsToFocus.size === 0) return

    setTimeout(() => {
      fitView({
        padding: 0.4,
        duration: 400,
        nodes: Array.from(idsToFocus).map((id) => ({ id })),
      })
    }, 60)
  }, [highlightedNodes, flowPath, fitView])

  const handleNodeClick = useCallback(
    (event, node) => {
      if (onNodeClick) onNodeClick(node.id)
    },
    [onNodeClick]
  )

  const handleContextMenu = useCallback(
    (event, node) => {
      event.preventDefault()
      if (onNodeContextMenu) onNodeContextMenu(node.id)
    },
    [onNodeContextMenu]
  )

  if (!graph || !graph.nodes || graph.nodes.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-text-muted)',
          fontSize: 14,
        }}
      >
        No dependency graph data available.
      </div>
    )
  }

  return (
    <div
      style={{
        flex: '1 1 auto',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        height: '100%',
        width: '100%',
        position: 'relative',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '6px 12px',
          borderBottom: '1px solid var(--color-border)',
          fontSize: 11,
          color: 'var(--color-text-muted)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{graph.nodes.length} files</span>
          <span style={{ color: 'var(--color-border)' }}>|</span>
          <span>{graph.edges.length} dependencies</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => setCompact((c) => !c)}
            title={compact ? 'Switch back to normal spacing' : 'Shrink layout so the whole graph fits on screen at once'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: compact ? 'rgba(99,102,241,0.15)' : 'var(--color-surface)',
              border: `1px solid ${compact ? '#6366f1' : 'var(--color-border)'}`,
              borderRadius: 6,
              color: compact ? '#a5b4fc' : 'var(--color-text-muted)',
              fontSize: 11,
              fontFamily: 'inherit',
              padding: '4px 10px',
              cursor: 'pointer',
              transition: 'border-color 0.15s ease, color 0.15s ease, background 0.15s ease',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path
                d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {compact ? 'Fitted' : 'Fit Whole Graph'}
          </button>

          <button
            onClick={() => setDirection((d) => (d === 'TB' ? 'LR' : 'TB'))}
            title={direction === 'TB' ? 'Switch to horizontal layout' : 'Switch to vertical layout'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 6,
              color: 'var(--color-text-muted)',
              fontSize: 11,
              fontFamily: 'inherit',
              padding: '4px 10px',
              cursor: 'pointer',
              transition: 'border-color 0.15s ease, color 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#6366f1'
              e.currentTarget.style.color = '#e4e4ec'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-border)'
              e.currentTarget.style.color = 'var(--color-text-muted)'
            }}
          >
            {direction === 'TB' ? (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Horizontal
              </>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M6 13l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Vertical
              </>
            )}
          </button>
        </div>
      </div>

      {/* This wrapper has a hard minHeight floor in px (not %) so React Flow's
          canvas can never collapse to 0 height, regardless of what any ancestor
          does or forgets to do with its own height. position: relative + the
          ReactFlow style below (position: absolute, inset 0) is what makes
          ReactFlow always fill exactly this box, no more, no less. */}
      <div style={{ flex: '1 1 auto', minHeight: 480, position: 'relative', width: '100%' }}>
        <ReactFlow
          nodes={nodes}
          edges={edgesState}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          onNodeContextMenu={handleContextMenu}
          panOnDrag={true}
          panOnScroll={true}
          zoomOnScroll={false}
          zoomOnPinch={true}
          zoomActivationKeyCode={['Meta', 'Control']}
          nodesDraggable={true}
          attributionPosition="bottom-left"
          minZoom={0.05}
          maxZoom={2}
          style={{
            background: 'var(--color-bg)',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
        >
          <Controls
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
            }}
          />
          <Background color="#1a1a2e" gap={20} />
        </ReactFlow>
      </div>
    </div>
  )
}

export default function DependencyGraphView(props) {
  return (
    <ReactFlowProvider>
      <GraphInner {...props} />
    </ReactFlowProvider>
  )
}
