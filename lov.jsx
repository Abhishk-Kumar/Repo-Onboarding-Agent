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

// ─────────────────────────────────────────────────────────────
// COLOR SYSTEM (Keep your existing palette)
// ─────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────
// MODULE (DISTRICT) COLORS - For top-level grouping
// ─────────────────────────────────────────────────────────────
const MODULE_COLORS = {
  backend: '#E74C3C',
  frontend: '#3498DB',
  database: '#2ECC71',
  utils: '#9B59B6',
  config: '#95A5A6',
  tests: '#F39C12',
  src: '#6366f1',
  components: '#f472b6',
  routes: '#fb923c',
  pages: '#60a5fa',
  api: '#f87171',
  lib: '#34d399',
  app: '#6366f1',
  default: '#8888a0',
}

// ─────────────────────────────────────────────────────────────
// STATE MANAGEMENT TYPES
// ─────────────────────────────────────────────────────────────
const VIEW_MODE = {
  DISTRICT: 'district',    // Layer 1: Show modules only
  EXPANDED: 'expanded',    // Layer 2: One module expanded, others dimmed
  SPOTLIGHT: 'spotlight',  // Layer 3: Single file highlighted with deps
}

// ─────────────────────────────────────────────────────────────
// HELPERS: Build module hierarchy from flat file list
// ─────────────────────────────────────────────────────────────

function getModuleName(filePath) {
  if (!filePath || typeof filePath !== 'string') return 'root'
  const parts = filePath.split('/')
  if (parts.length === 1) return 'root'
  return parts[0]
}

function getFolderFromPath(filePath) {
  if (!filePath || typeof filePath !== 'string') return 'root'
  const parts = filePath.split('/')
  return parts.length > 1 ? parts[0] : 'root'
}

function getFileName(filePath) {
  if (!filePath || typeof filePath !== 'string') return 'unknown'
  const parts = filePath.split('/')
  return parts[parts.length - 1]
}

// Calculate cross-module dependency weights
function getModuleEdges(fileEdges, nodes) {
  if (!fileEdges || !Array.isArray(fileEdges) || !nodes || !Array.isArray(nodes)) return []
  
  const moduleEdgeMap = new Map()
  
  fileEdges.forEach(edge => {
    if (!edge || !edge.source || !edge.target) return
    
    const srcModule = getModuleName(edge.source)
    const tgtModule = getModuleName(edge.target)
    
    if (srcModule === tgtModule) return // Skip internal deps
    
    const key = `${srcModule}→${tgtModule}`
    const existing = moduleEdgeMap.get(key) || { source: srcModule, target: tgtModule, weight: 0, files: [] }
    existing.weight += 1
    existing.files.push({ source: edge.source, target: edge.target })
    moduleEdgeMap.set(key, existing)
  })
  
  return Array.from(moduleEdgeMap.values())
}

// Calculate module stats
function getModuleStats(nodes, edges) {
  const stats = new Map()
  
  if (!nodes || !Array.isArray(nodes)) return stats
  
  nodes.forEach(node => {
    if (!node || !node.id) return
    const mod = getModuleName(node.id)
    if (!stats.has(mod)) {
      stats.set(mod, { fileCount: 0, internalDeps: 0, externalDeps: 0, incomingDeps: 0 })
    }
    const s = stats.get(mod)
    s.fileCount += 1
  })
  
  if (edges && Array.isArray(edges)) {
    edges.forEach(edge => {
      if (!edge || !edge.source || !edge.target) return
      const srcMod = getModuleName(edge.source)
      const tgtMod = getModuleName(edge.target)
      if (srcMod === tgtMod) {
        const s = stats.get(srcMod)
        if (s) s.internalDeps += 1
      } else {
        const s1 = stats.get(srcMod)
        const s2 = stats.get(tgtMod)
        if (s1) s1.externalDeps += 1
        if (s2) s2.incomingDeps += 1
      }
    })
  }
  
  return stats
}

// ─────────────────────────────────────────────────────────────
// LAYOUT ENGINE (Enhanced with module-aware positioning)
// ─────────────────────────────────────────────────────────────

function getLayoutedElements(nodes, edges, direction = 'TB', compact = false, viewMode = VIEW_MODE.DISTRICT, expandedModule = null) {
  if (!nodes || nodes.length === 0) return { nodes: [], edges: [] }
  
  const nodeWidth = compact ? 140 : viewMode === VIEW_MODE.DISTRICT ? 200 : 180
  const nodeHeight = compact ? 40 : viewMode === VIEW_MODE.DISTRICT ? 70 : 50
  const gridGapX = compact ? 20 : 30
  const gridGapY = compact ? 20 : 30

  const dagreGraph = new dagre.graphlib.Graph()
  dagreGraph.setDefaultEdgeLabel(() => ({}))
  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: compact ? 24 : viewMode === VIEW_MODE.DISTRICT ? 50 : 40,
    ranksep: compact ? 32 : viewMode === VIEW_MODE.DISTRICT ? 80 : 60,
    marginx: 30,
    marginy: 30,
    ranker: 'tight-tree',
  })

  nodes.forEach((node) => {
    if (!node || !node.id) return
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight })
  })
  
  if (edges && Array.isArray(edges)) {
    edges.forEach((edge) => {
      if (!edge || !edge.source || !edge.target) return
      if (nodes.find(n => n && n.id === edge.source) && nodes.find(n => n && n.id === edge.target)) {
        dagreGraph.setEdge(edge.source, edge.target)
      }
    })
  }
  
  dagre.layout(dagreGraph)

  const layoutedNodes = nodes.map((node) => {
    if (!node || !node.id) return node
    const pos = dagreGraph.node(node.id)
    if (!pos) return node
    
    return {
      ...node,
      targetPosition: direction === 'LR' ? Position.Left : Position.Top,
      sourcePosition: direction === 'LR' ? Position.Right : Position.Bottom,
      style: {
        ...node.style,
        width: nodeWidth,
        padding: compact ? '6px 8px' : viewMode === VIEW_MODE.DISTRICT ? '10px 14px' : '6px 10px',
        fontSize: compact ? 10 : viewMode === VIEW_MODE.DISTRICT ? 13 : 11,
      },
      position: {
        x: pos.x - nodeWidth / 2,
        y: pos.y - nodeHeight / 2,
      },
    }
  })

  // Wrap large ranks into grid for better aspect ratio
  const maxPerLine = viewMode === VIEW_MODE.DISTRICT ? 4 : 3
  const rankAxis = direction === 'LR' ? 'x' : 'y'
  const crossAxis = direction === 'LR' ? 'y' : 'x'
  const crossStep = direction === 'LR' ? nodeHeight + gridGapY : nodeWidth + gridGapX

  const rankGroups = new Map()
  layoutedNodes.forEach((n) => {
    if (!n || !n.position) return
    const key = Math.round(n.position[rankAxis])
    if (!rankGroups.has(key)) rankGroups.set(key, [])
    rankGroups.get(key).push(n)
  })

  const sortedRankKeys = Array.from(rankGroups.keys()).sort((a, b) => a - b)
  let cumulativeShift = 0

  sortedRankKeys.forEach((rankKey) => {
    const group = rankGroups.get(rankKey)
    if (!group || group.length === 0) return
    
    group.forEach((n) => {
      if (n && n.position) {
        n.position[rankAxis] += cumulativeShift
      }
    })

    if (group.length <= maxPerLine) return

    group.sort((a, b) => {
      if (!a || !b || !a.position || !b.position) return 0
      return a.position[crossAxis] - b.position[crossAxis]
    })
    
    const lines = Math.ceil(group.length / maxPerLine)
    const mainAxisStep = direction === 'LR' ? (nodeWidth + gridGapX) : (nodeHeight + gridGapY)

    group.forEach((n, i) => {
      if (!n || !n.position) return
      const line = Math.floor(i / maxPerLine)
      const posInLine = i % maxPerLine
      n.position[crossAxis] = posInLine * crossStep
      n.position[rankAxis] += line * mainAxisStep
    })

    cumulativeShift += (lines - 1) * mainAxisStep
  })

  return { nodes: layoutedNodes, edges: edges || [] }
}

// ─────────────────────────────────────────────────────────────
// SIDEBAR COMPONENT
// ─────────────────────────────────────────────────────────────

function Sidebar({ fileData, nodes, edges, onNodeClick, onClose }) {
  if (!fileData) return null

  const safeNodes = nodes || []
  const safeEdges = edges || []

  const imports = safeEdges.filter(e => e && e.source === fileData.id).map(e => {
    const targetNode = safeNodes.find(n => n && n.id === e.target)
    return { 
      id: e.target, 
      label: targetNode?.data?.label || targetNode?.label || e.target, 
      folder: targetNode?.data?.folder || targetNode?.folder || 'default' 
    }
  })

  const importedBy = safeEdges.filter(e => e && e.target === fileData.id).map(e => {
    const sourceNode = safeNodes.find(n => n && n.id === e.source)
    return { 
      id: e.source, 
      label: sourceNode?.data?.label || sourceNode?.label || e.source, 
      folder: sourceNode?.data?.folder || sourceNode?.folder || 'default' 
    }
  })

  // Find related files (share common imports or importers)
  const relatedSet = new Set()
  imports.forEach(imp => {
    safeEdges.filter(e => e && e.source === imp.id).forEach(e => relatedSet.add(e.target))
  })
  importedBy.forEach(imp => {
    safeEdges.filter(e => e && e.target === imp.id).forEach(e => relatedSet.add(e.source))
  })
  relatedSet.delete(fileData.id)
  
  const related = Array.from(relatedSet).slice(0, 5).map(id => {
    const node = safeNodes.find(n => n && n.id === id)
    return { 
      id, 
      label: node?.data?.label || node?.label || id, 
      folder: node?.data?.folder || node?.folder || 'default' 
    }
  })

  return (
    <div style={{
      position: 'absolute',
      right: 12,
      top: 52,
      width: 280,
      maxHeight: 'calc(100% - 64px)',
      background: '#1a1a2e',
      border: '1px solid #2a2a3e',
      borderRadius: 12,
      padding: '16px',
      overflowY: 'auto',
      zIndex: 10,
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0, color: '#e4e4ec', fontSize: 13, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>
          {getFileName(fileData.id)}
        </h3>
        <button 
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#8888a0',
            cursor: 'pointer',
            fontSize: 16,
            padding: '0 4px',
          }}
        >
          ✕
        </button>
      </div>

      <div style={{ color: '#8888a0', fontSize: 10, marginBottom: 16, fontFamily: "'JetBrains Mono', monospace" }}>
        {fileData.id}
      </div>

      {/* Imports FROM this file */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ 
          color: '#E74C3C', 
          fontSize: 10, 
          fontWeight: 700, 
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginBottom: 8,
          fontFamily: "'JetBrains Mono', monospace"
        }}>
          Imports From ({imports.length})
        </div>
        {imports.length === 0 ? (
          <div style={{ color: '#8888a0', fontSize: 11, fontStyle: 'italic' }}>No outgoing dependencies</div>
        ) : (
          imports.map(imp => (
            <div 
              key={imp.id}
              onClick={() => onNodeClick && onNodeClick(imp.id)}
              style={{
                padding: '6px 8px',
                marginBottom: 4,
                background: '#14141f',
                borderRadius: 6,
                borderLeft: `3px solid ${getNodeColor(imp.folder)}`,
                cursor: 'pointer',
                fontSize: 11,
                color: '#e4e4ec',
                fontFamily: "'JetBrains Mono', monospace",
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#1c1c2e'}
              onMouseLeave={e => e.currentTarget.style.background = '#14141f'}
            >
              {getFileName(imp.label)}
              <div style={{ fontSize: 9, color: '#8888a0', marginTop: 2 }}>{imp.folder}</div>
            </div>
          ))
        )}
      </div>

      {/* Imported BY this file */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ 
          color: '#3498DB', 
          fontSize: 10, 
          fontWeight: 700, 
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginBottom: 8,
          fontFamily: "'JetBrains Mono', monospace"
        }}>
          Imported By ({importedBy.length})
        </div>
        {importedBy.length === 0 ? (
          <div style={{ color: '#8888a0', fontSize: 11, fontStyle: 'italic' }}>No incoming dependencies</div>
        ) : (
          importedBy.map(imp => (
            <div 
              key={imp.id}
              onClick={() => onNodeClick && onNodeClick(imp.id)}
              style={{
                padding: '6px 8px',
                marginBottom: 4,
                background: '#14141f',
                borderRadius: 6,
                borderLeft: `3px solid ${getNodeColor(imp.folder)}`,
                cursor: 'pointer',
                fontSize: 11,
                color: '#e4e4ec',
                fontFamily: "'JetBrains Mono', monospace",
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#1c1c2e'}
              onMouseLeave={e => e.currentTarget.style.background = '#14141f'}
            >
              {getFileName(imp.label)}
              <div style={{ fontSize: 9, color: '#8888a0', marginTop: 2 }}>{imp.folder}</div>
            </div>
          ))
        )}
      </div>

      {/* Most Related */}
      {related.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ 
            color: '#9B59B6', 
            fontSize: 10, 
            fontWeight: 700, 
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            marginBottom: 8,
            fontFamily: "'JetBrains Mono', monospace"
          }}>
            Most Related ({related.length})
          </div>
          {related.map(rel => (
            <div 
              key={rel.id}
              onClick={() => onNodeClick && onNodeClick(rel.id)}
              style={{
                padding: '6px 8px',
                marginBottom: 4,
                background: '#14141f',
                borderRadius: 6,
                borderLeft: `3px solid ${getNodeColor(rel.folder)}`,
                cursor: 'pointer',
                fontSize: 11,
                color: '#e4e4ec',
                fontFamily: "'JetBrains Mono', monospace",
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#1c1c2e'}
              onMouseLeave={e => e.currentTarget.style.background = '#14141f'}
            >
              {getFileName(rel.label)}
              <div style={{ fontSize: 9, color: '#8888a0', marginTop: 2 }}>{rel.folder}</div>
            </div>
          ))}
        </div>
      )}

      {/* File stats */}
      <div style={{ 
        borderTop: '1px solid #2a2a3e', 
        paddingTop: 12,
        fontSize: 10,
        color: '#8888a0',
        fontFamily: "'JetBrains Mono', monospace"
      }}>
        <div>Functions: {(fileData.functions && Array.isArray(fileData.functions)) ? fileData.functions.length : 0}</div>
        <div>Purpose: {fileData.purpose || 'N/A'}</div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// BREADCRUMB / NAVIGATION BAR
// ─────────────────────────────────────────────────────────────

function Breadcrumb({ viewMode, expandedModule, spotlightFile, onDistrictClick, onModuleClick }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 12px',
      fontSize: 12,
      color: '#8888a0',
      fontFamily: "'JetBrains Mono', monospace",
      borderBottom: '1px solid var(--color-border)',
    }}>
      <button
        onClick={onDistrictClick}
        style={{
          background: 'none',
          border: 'none',
          color: viewMode === VIEW_MODE.DISTRICT ? '#e4e4ec' : '#6366f1',
          cursor: 'pointer',
          fontSize: 12,
          fontFamily: 'inherit',
          padding: '2px 6px',
          borderRadius: 4,
          fontWeight: viewMode === VIEW_MODE.DISTRICT ? 600 : 400,
        }}
      >
        🏠 Repository
      </button>
      
      {viewMode !== VIEW_MODE.DISTRICT && (
        <>
          <span style={{ color: '#2a2a3e' }}>/</span>
          <button
            onClick={onModuleClick}
            style={{
              background: 'none',
              border: 'none',
              color: viewMode === VIEW_MODE.EXPANDED ? '#e4e4ec' : '#6366f1',
              cursor: 'pointer',
              fontSize: 12,
              fontFamily: 'inherit',
              padding: '2px 6px',
              borderRadius: 4,
              fontWeight: viewMode === VIEW_MODE.EXPANDED ? 600 : 400,
            }}
          >
            {expandedModule || 'Module'}
          </button>
        </>
      )}
      
      {viewMode === VIEW_MODE.SPOTLIGHT && spotlightFile && (
        <>
          <span style={{ color: '#2a2a3e' }}>/</span>
          <span style={{ color: '#e4e4ec', fontWeight: 600, padding: '2px 6px' }}>
            {getFileName(spotlightFile)}
          </span>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// MAIN GRAPH COMPONENT
// ─────────────────────────────────────────────────────────────

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
  const [viewMode, setViewMode] = useState(VIEW_MODE.DISTRICT)
  const [expandedModule, setExpandedModule] = useState(null)
  const [spotlightFile, setSpotlightFile] = useState(null)
  const [sidebarFile, setSidebarFile] = useState(null)
  
  const { fitView } = useReactFlow()
  const initialFitDone = useRef(false)

  // ── Safety check for graph data ──
  const safeGraph = useMemo(() => {
    if (!graph) return { nodes: [], edges: [] }
    return {
      nodes: Array.isArray(graph.nodes) ? graph.nodes : [],
      edges: Array.isArray(graph.edges) ? graph.edges : [],
    }
  }, [graph])

  // ── Compute module-level data ──
  const moduleStats = useMemo(() => {
    return getModuleStats(safeGraph.nodes, safeGraph.edges)
  }, [safeGraph])

  const moduleEdges = useMemo(() => {
    return getModuleEdges(safeGraph.edges, safeGraph.nodes)
  }, [safeGraph])

  // ── Build nodes based on current view mode ──
  const rawNodes = useMemo(() => {
    if (!safeGraph.nodes || safeGraph.nodes.length === 0) return []

    // LAYER 1: DISTRICT VIEW - Show modules as nodes
    if (viewMode === VIEW_MODE.DISTRICT) {
      const modules = new Map()
      
      safeGraph.nodes.forEach((n) => {
        if (!n || !n.id) return
        const mod = getModuleName(n.id)
        if (!modules.has(mod)) {
          modules.set(mod, {
            id: `module:${mod}`,
            fileIds: [],
            folder: mod,
            label: mod,
            purpose: 'Module',
            functions: [],
          })
        }
        modules.get(mod).fileIds.push(n.id)
      })

      return Array.from(modules.values()).map((mod) => {
        const stats = moduleStats.get(mod.folder) || { fileCount: 0, internalDeps: 0, externalDeps: 0 }
        const modColor = MODULE_COLORS[mod.folder] || MODULE_COLORS.default
        
        return {
          id: mod.id,
          type: 'default',
          data: {
            label: `${mod.label}`,
            folder: mod.folder,
            purpose: `${stats.fileCount} files`,
            functions: [`${stats.internalDeps} internal`, `${stats.externalDeps} external deps`],
            fileIds: mod.fileIds,
            isModule: true,
          },
          style: {
            background: `${modColor}22`,
            border: `2px solid ${modColor}`,
            borderRadius: 12,
            padding: '12px 16px',
            color: '#e4e4ec',
            fontSize: 14,
            fontWeight: 600,
            fontFamily: "'JetBrains Mono', monospace",
            width: 200,
            boxShadow: `0 0 20px ${modColor}33`,
            cursor: 'pointer',
          },
        }
      })
    }

    // LAYER 2 & 3: EXPANDED or SPOTLIGHT - Show actual files
    const currentModule = expandedModule
    const isInExpandedModule = (id) => getModuleName(id) === currentModule

    return safeGraph.nodes.map((n) => {
      if (!n || !n.id) return null
      
      const color = getNodeColor(n.folder)
      const isHighlighted = highlightedNodes instanceof Set ? highlightedNodes.has(n.id) : false
      const stepNum = Array.isArray(numberedNodes) ? numberedNodes.find((s) => s && s.file_path === n.id) : null
      const isInFlow = flowPath instanceof Set ? flowPath.has(n.id) : false
      const isSelected = selectedFile === n.id
      
      const isInExpanded = isInExpandedModule(n.id)
      const isDimmed = viewMode === VIEW_MODE.EXPANDED && !isInExpanded && !isInFlow
      
      let isSpotlighted = false
      let isSpotlightConnected = false
      
      if (viewMode === VIEW_MODE.SPOTLIGHT && spotlightFile) {
        isSpotlighted = n.id === spotlightFile
        const connected = safeGraph.edges.some(e => 
          e && ((e.source === spotlightFile && e.target === n.id) ||
          (e.target === spotlightFile && e.source === n.id))
        )
        isSpotlightConnected = connected && !isSpotlighted
      }

      const opacity = isDimmed ? 0.15 : 
                     (viewMode === VIEW_MODE.SPOTLIGHT && !isSpotlighted && !isSpotlightConnected && spotlightFile) ? 0.1 : 
                     (highlightedNodes instanceof Set && !isHighlighted && !isSelected) ? 0.25 : 1

      const borderColor = isSpotlighted ? '#FFD700' :
                         isSpotlightConnected ? '#E74C3C' :
                         isInFlow ? '#34d399' : 
                         isSelected ? '#6366f1' : 
                         isHighlighted ? '#6366f1' : 
                         color

      const bgGradient = isSpotlighted 
        ? 'linear-gradient(135deg, #FFD700, #F39C12)'
        : isSpotlightConnected
          ? 'linear-gradient(135deg, #E74C3C, #C0392B)'
          : isInFlow
            ? 'linear-gradient(135deg, #34d399, #059669)'
            : isSelected
              ? 'linear-gradient(135deg, #6366f1, #7c3aed)'
              : isHighlighted
                ? '#1c1c2e'
                : '#14141f'

      return {
        id: n.id,
        type: 'default',
        data: {
          label: n.label || getFileName(n.id),
          folder: n.folder || 'default',
          purpose: n.purpose || '',
          functions: (n.functions && Array.isArray(n.functions)) ? n.functions.slice(0, 3) : [],
          stepNumber: stepNum?.step_number,
          isModule: false,
        },
        style: {
          background: bgGradient,
          border: `2px solid ${borderColor}`,
          borderRadius: 8,
          padding: '6px 10px',
          color: isSpotlighted ? '#1a1a2e' : '#e4e4ec',
          fontSize: 11,
          fontFamily: "'JetBrains Mono', monospace",
          width: 180,
          opacity: opacity,
          transition: 'all 0.3s ease',
          boxShadow: isSpotlighted ? '0 0 30px #FFD70066' : isSpotlightConnected ? '0 0 20px #E74C3C44' : 'none',
          cursor: 'pointer',
        },
      }
    }).filter(Boolean) // Remove null entries
  }, [safeGraph, viewMode, expandedModule, spotlightFile, highlightedNodes, numberedNodes, flowPath, selectedFile, moduleStats])

  // ── Build edges based on current view mode ──
  const rawEdges = useMemo(() => {
    if (!safeGraph.edges || safeGraph.edges.length === 0) return []

    // LAYER 1: Module-to-module edges
    if (viewMode === VIEW_MODE.DISTRICT) {
      return moduleEdges.map((me, i) => {
        const srcMod = `module:${me.source}`
        const tgtMod = `module:${me.target}`
        const isInFlow = flowPath instanceof Set ? flowPath.has(me.source) && flowPath.has(me.target) : false
        
        return {
          id: `mod-e${i}`,
          source: srcMod,
          target: tgtMod,
          animated: isInFlow,
          label: `${me.weight}`,
          labelStyle: { fill: '#8888a0', fontSize: 10, fontFamily: "'JetBrains Mono', monospace" },
          labelBgStyle: { fill: '#1a1a2e', opacity: 0.8 },
          labelBgPadding: [4, 4],
          style: {
            stroke: isInFlow ? '#34d399' : '#2a2a3e',
            strokeWidth: Math.min(me.weight * 0.8 + 1, 6),
            opacity: (highlightedNodes instanceof Set && !isInFlow) ? 0.1 : 0.7,
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
    }

    // LAYER 2 & 3: File-to-file edges
    return safeGraph.edges.map((e, i) => {
      if (!e || !e.source || !e.target) return null
      
      const isInFlow = flowPath instanceof Set ? flowPath.has(e.source) && flowPath.has(e.target) : false
      
      let isSpotlightEdge = false
      if (viewMode === VIEW_MODE.SPOTLIGHT && spotlightFile) {
        isSpotlightEdge = e.source === spotlightFile || e.target === spotlightFile
      }

      const opacity = viewMode === VIEW_MODE.SPOTLIGHT && spotlightFile && !isSpotlightEdge ? 0.05 :
                     (highlightedNodes instanceof Set && !isInFlow) ? 0.1 : 1

      return {
        id: e.id || `e${i}`,
        source: e.source,
        target: e.target,
        animated: isInFlow || (viewMode === VIEW_MODE.SPOTLIGHT && isSpotlightEdge),
        style: {
          stroke: isInFlow ? '#34d399' : isSpotlightEdge ? '#E74C3C' : '#2a2a3e',
          strokeWidth: isInFlow ? 2.5 : isSpotlightEdge ? 3 : 1,
          opacity: opacity,
          transition: 'all 0.3s ease',
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isInFlow ? '#34d399' : isSpotlightEdge ? '#E74C3C' : '#2a2a3e',
          width: isSpotlightEdge ? 20 : 16,
          height: isSpotlightEdge ? 20 : 16,
        },
      }
    }).filter(Boolean)
  }, [safeGraph, viewMode, moduleEdges, highlightedNodes, flowPath, spotlightFile])

  // ── Layout computation ──
  const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(
    () => getLayoutedElements(rawNodes, rawEdges, direction, compact, viewMode, expandedModule),
    [rawNodes, rawEdges, direction, compact, viewMode, expandedModule]
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes)
  const [edgesState, setEdges, onEdgesChange] = useEdgesState(layoutedEdges)

  useEffect(() => {
    setNodes(layoutedNodes)
    setEdges(layoutedEdges)
  }, [layoutedNodes, layoutedEdges, setNodes, setEdges])

  // ── Fit view on layout changes ──
  useEffect(() => {
    if (nodes.length > 0) {
      setTimeout(() => {
        fitView({ padding: 0.3, duration: 400 })
        initialFitDone.current = true
      }, 50)
    }
  }, [nodes.length, direction, compact, viewMode, expandedModule, fitView])

  // ── Focus on highlights ──
  useEffect(() => {
    if (!(highlightedNodes instanceof Set) || highlightedNodes.size === 0) return
    
    const idsToFocus = new Set()
    highlightedNodes.forEach((id) => idsToFocus.add(id))
    if (flowPath instanceof Set) {
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

  // ── Click handlers ──
  const handleNodeClick = useCallback(
    (event, node) => {
      if (!node || !node.data) return
      
      const nodeData = node.data

      // LAYER 1 → LAYER 2: Click module to expand it
      if (viewMode === VIEW_MODE.DISTRICT && nodeData.isModule) {
        const modName = nodeData.folder
        setExpandedModule(modName)
        setViewMode(VIEW_MODE.EXPANDED)
        setSpotlightFile(null)
        setSidebarFile(null)
        return
      }

      // LAYER 2 → LAYER 3: Click file to spotlight
      if (viewMode === VIEW_MODE.EXPANDED && !nodeData.isModule) {
        setSpotlightFile(node.id)
        setViewMode(VIEW_MODE.SPOTLIGHT)
        setSidebarFile(nodeData)
        if (typeof onNodeClick === 'function') onNodeClick(node.id)
        return
      }

      // LAYER 3: Click another file while in spotlight
      if (viewMode === VIEW_MODE.SPOTLIGHT) {
        if (node.id === spotlightFile) {
          setSidebarFile(nodeData)
        } else {
          setSpotlightFile(node.id)
          setSidebarFile(nodeData)
          if (typeof onNodeClick === 'function') onNodeClick(node.id)
        }
        return
      }

      if (typeof onNodeClick === 'function') onNodeClick(node.id)
    },
    [viewMode, spotlightFile, onNodeClick]
  )

  // Background click → go back one level
  const handlePaneClick = useCallback(() => {
    if (viewMode === VIEW_MODE.SPOTLIGHT) {
      setViewMode(VIEW_MODE.EXPANDED)
      setSpotlightFile(null)
      setSidebarFile(null)
    } else if (viewMode === VIEW_MODE.EXPANDED) {
      setViewMode(VIEW_MODE.DISTRICT)
      setExpandedModule(null)
      setSpotlightFile(null)
      setSidebarFile(null)
    }
  }, [viewMode])

  const handleContextMenu = useCallback(
    (event, node) => {
      event.preventDefault()
      if (typeof onNodeContextMenu === 'function') onNodeContextMenu(node.id)
    },
    [onNodeContextMenu]
  )

  // ── Navigation handlers ──
  const goToDistrict = useCallback(() => {
    setViewMode(VIEW_MODE.DISTRICT)
    setExpandedModule(null)
    setSpotlightFile(null)
    setSidebarFile(null)
  }, [])

  const goToModule = useCallback(() => {
    if (expandedModule) {
      setViewMode(VIEW_MODE.EXPANDED)
      setSpotlightFile(null)
      setSidebarFile(null)
    }
  }, [expandedModule])

  if (!safeGraph.nodes || safeGraph.nodes.length === 0) {
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

  // Count unique modules safely
  const uniqueModules = useMemo(() => {
    const mods = new Set()
    safeGraph.nodes.forEach(n => {
      if (n && n.id) mods.add(getModuleName(n.id))
    })
    return mods.size
  }, [safeGraph])

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
      {/* Breadcrumb Navigation */}
      <Breadcrumb 
        viewMode={viewMode} 
        expandedModule={expandedModule} 
        spotlightFile={spotlightFile}
        onDistrictClick={goToDistrict}
        onModuleClick={goToModule}
      />

      {/* Toolbar */}
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
          <span>
            {viewMode === VIEW_MODE.DISTRICT 
              ? `${uniqueModules} modules`
              : `${safeGraph.nodes.length} files`
            }
          </span>
          <span style={{ color: 'var(--color-border)' }}>|</span>
          <span>
            {viewMode === VIEW_MODE.DISTRICT 
              ? `${moduleEdges.length} cross-module deps`
              : `${safeGraph.edges.length} dependencies`
            }
          </span>
          {viewMode !== VIEW_MODE.DISTRICT && expandedModule && (
            <>
              <span style={{ color: 'var(--color-border)' }}>|</span>
              <span style={{ color: '#6366f1' }}>Viewing: {expandedModule}</span>
            </>
          )}
          {viewMode === VIEW_MODE.SPOTLIGHT && spotlightFile && (
            <>
              <span style={{ color: 'var(--color-border)' }}>|</span>
              <span style={{ color: '#FFD700' }}>Spotlight: {getFileName(spotlightFile)}</span>
            </>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* View mode indicator */}
          <div style={{
            padding: '2px 8px',
            background: viewMode === VIEW_MODE.DISTRICT ? '#6366f122' : viewMode === VIEW_MODE.EXPANDED ? '#34d39922' : '#FFD70022',
            border: `1px solid ${viewMode === VIEW_MODE.DISTRICT ? '#6366f1' : viewMode === VIEW_MODE.EXPANDED ? '#34d399' : '#FFD700'}`,
            borderRadius: 4,
            color: viewMode === VIEW_MODE.DISTRICT ? '#a5b4fc' : viewMode === VIEW_MODE.EXPANDED ? '#6ee7b7' : '#F1C40F',
            fontSize: 10,
            fontWeight: 600,
          }}>
            {viewMode === VIEW_MODE.DISTRICT ? '🏠 DISTRICT' : viewMode === VIEW_MODE.EXPANDED ? '📂 EXPANDED' : '🔦 SPOTLIGHT'}
          </div>

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

      {/* Graph Area */}
      <div style={{ flex: '1 1 auto', minHeight: 480, position: 'relative', width: '100%' }}>
        <ReactFlow
          nodes={nodes}
          edges={edgesState}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          onPaneClick={handlePaneClick}
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

        {/* Sidebar Panel */}
        <Sidebar 
          fileData={sidebarFile}
          nodes={safeGraph.nodes}
          edges={safeGraph.edges}
          onNodeClick={(id) => {
            setSpotlightFile(id)
            const nodeData = safeGraph.nodes.find(n => n && n.id === id)
            setSidebarFile(nodeData)
          }}
          onClose={() => setSidebarFile(null)}
        />
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