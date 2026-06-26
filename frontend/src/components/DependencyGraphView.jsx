import { useMemo, useCallback, useEffect, useState } from 'react'
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
import {
  getModuleName,
  getFileName,
  buildFolderTree,
  getFolderByPath,
  getModuleEdges,
  computeModuleStats,
  getInternalEdges,
  getExternalEdgesByFolder,
  getFileToFileEdgesBetweenModules,
  getNodeColor,
  getModuleColor,
} from '../utils/graphUtils'

const NODE_W = 200
const NODE_H = 76
const FOLDER_CARD_W = 160
const FOLDER_CARD_H = 56
const FILE_NODE_W = 160
const FILE_NODE_H = 36
const CONTAINER_PAD = 20
const CONTAINER_HEADER_H = 36
const CONTAINER_FOOTER_H = 36
const GRID_GAP = 14

const externalDepsHandlerRef = { current: null }

function ContainerNode({ data }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: 'var(--color-surface)',
        border: `2px solid ${data.color}`,
        borderRadius: 12,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: `0 0 30px ${data.color}22, inset 0 0 60px ${data.color}08`,
        transition: 'all 0.35s ease',
      }}
    >
      <div
        style={{
          padding: '6px 14px',
          borderBottom: `1px solid ${data.color}33`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          background: `${data.color}11`,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
            fontWeight: 600,
            color: data.color,
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          <span style={{ fontSize: 15 }}>{data.icon || '📂'}</span>
          {data.title}
        </div>
        {data.stats && (
          <div
            style={{
              fontSize: 10,
              color: '#8888a0',
              fontFamily: "'JetBrains Mono', monospace",
              display: 'flex',
              gap: 10,
            }}
          >
            <span>{data.stats.files} files</span>
            <span>{data.stats.subfolders} folders</span>
            <span>{data.stats.internal} internal</span>
          </div>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0, position: 'relative' }} />

      {data.externalDepCount > 0 && (
        <div
          onClick={(e) => {
            e.stopPropagation()
            if (externalDepsHandlerRef.current) externalDepsHandlerRef.current()
          }}
          style={{
            padding: '5px 14px',
            borderTop: `1px solid ${data.color}22`,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 11,
            color: '#a5b4fc',
            cursor: 'pointer',
            fontFamily: "'JetBrains Mono', monospace",
            background: `${data.color}08`,
            transition: 'background 0.15s',
            flexShrink: 0,
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = `${data.color}22`)
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = `${data.color}08`)
          }
        >
          <span style={{ fontSize: 12 }}>🔗</span>
          <span style={{ fontWeight: 600 }}>{data.externalDepCount}</span>
          <span>external deps ·</span>
          <span>{data.externalModuleCount} modules</span>
          <span style={{ marginLeft: 'auto', fontSize: 9, opacity: 0.6 }}>
            click to view
          </span>
        </div>
      )}
    </div>
  )
}

function Breadcrumb({ focusStack, onNavigate, comparisonTarget }) {
  const segments = [{ name: 'Repository', path: '' }]

  if (comparisonTarget) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 14px',
          fontSize: 12,
          color: '#8888a0',
          fontFamily: "'JetBrains Mono', monospace",
          borderBottom: '1px solid var(--color-border)',
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => onNavigate(0)}
          style={{
            background: 'none',
            border: 'none',
            color: '#6366f1',
            cursor: 'pointer',
            fontSize: 12,
            fontFamily: 'inherit',
            padding: '2px 6px',
            borderRadius: 4,
          }}
        >
          🏠 Repository
        </button>
        <span style={{ color: '#2a2a3e' }}>/</span>
        <span style={{ color: '#e4e4ec', fontWeight: 600, padding: '2px 6px' }}>
          {focusStack[0] || '...'}
        </span>
        <span style={{ color: '#2a2a3e' }}>↔</span>
        <span style={{ color: '#f472b6', fontWeight: 600, padding: '2px 6px' }}>
          {comparisonTarget}
        </span>
      </div>
    )
  }

  focusStack.forEach((s, i) => {
    segments.push({
      name: s,
      path: focusStack.slice(0, i + 1).join('/'),
    })
  })

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 14px',
        fontSize: 12,
        color: '#8888a0',
        fontFamily: "'JetBrains Mono', monospace",
        borderBottom: '1px solid var(--color-border)',
        flexShrink: 0,
        overflowX: 'auto',
        whiteSpace: 'nowrap',
      }}
    >
      {segments.map((seg, i) => (
        <span
          key={seg.path}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          {i > 0 && <span style={{ color: '#2a2a3e' }}>/</span>}
          <button
            onClick={() => onNavigate(i)}
            style={{
              background: 'none',
              border: 'none',
              color: i === segments.length - 1 ? '#e4e4ec' : '#6366f1',
              cursor: i < segments.length - 1 ? 'pointer' : 'default',
              fontSize: 12,
              fontFamily: 'inherit',
              padding: '2px 6px',
              borderRadius: 4,
              fontWeight: i === segments.length - 1 ? 600 : 400,
              transition: 'color 0.15s',
            }}
          >
            {i === 0 ? '🏠 ' : ''}
            {seg.name}
          </button>
        </span>
      ))}
    </div>
  )
}

function Sidebar({ fileData, nodes, edges, onNodeClick, onClose }) {
  if (!fileData) return null

  const safeNodes = nodes || []
  const safeEdges = edges || []

  const imports = safeEdges
    .filter((e) => e && e.source === fileData.id)
    .map((e) => {
      const targetNode = safeNodes.find((n) => n && n.id === e.target)
      return {
        id: e.target,
        label:
          targetNode?.label ||
          targetNode?.data?.label ||
          getFileName(e.target),
        folder: targetNode?.folder || targetNode?.data?.folder || 'default',
      }
    })

  const importedBy = safeEdges
    .filter((e) => e && e.target === fileData.id)
    .map((e) => {
      const sourceNode = safeNodes.find((n) => n && n.id === e.source)
      return {
        id: e.source,
        label:
          sourceNode?.label ||
          sourceNode?.data?.label ||
          getFileName(e.source),
        folder: sourceNode?.folder || sourceNode?.data?.folder || 'default',
      }
    })

  const relatedSet = new Set()
  imports.forEach((imp) => {
    safeEdges
      .filter((e) => e && e.source === imp.id)
      .forEach((e) => relatedSet.add(e.target))
  })
  importedBy.forEach((imp) => {
    safeEdges
      .filter((e) => e && e.target === imp.id)
      .forEach((e) => relatedSet.add(e.source))
  })
  relatedSet.delete(fileData.id)

  const related = Array.from(relatedSet)
    .slice(0, 5)
    .map((id) => {
      const node = safeNodes.find((n) => n && n.id === id)
      return {
        id,
        label: node?.label || node?.data?.label || getFileName(id),
        folder: node?.folder || node?.data?.folder || 'default',
      }
    })

  return (
    <div
      style={{
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
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <h3
          style={{
            margin: 0,
            color: '#e4e4ec',
            fontSize: 13,
            fontWeight: 600,
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
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

      <div
        style={{
          color: '#8888a0',
          fontSize: 10,
          marginBottom: 16,
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        {fileData.id}
      </div>

      <div style={{ marginBottom: 16 }}>
        <div
          style={{
            color: '#E74C3C',
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            marginBottom: 8,
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          Imports From ({imports.length})
        </div>
        {imports.length === 0 ? (
          <div
            style={{
              color: '#8888a0',
              fontSize: 11,
              fontStyle: 'italic',
            }}
          >
            No outgoing dependencies
          </div>
        ) : (
          imports.map((imp) => (
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
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = '#1c1c2e')
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = '#14141f')
              }
            >
              {getFileName(imp.label)}
              <div
                style={{
                  fontSize: 9,
                  color: '#8888a0',
                  marginTop: 2,
                }}
              >
                {imp.folder}
              </div>
            </div>
          ))
        )}
      </div>

      <div style={{ marginBottom: 16 }}>
        <div
          style={{
            color: '#3498DB',
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            marginBottom: 8,
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          Imported By ({importedBy.length})
        </div>
        {importedBy.length === 0 ? (
          <div
            style={{
              color: '#8888a0',
              fontSize: 11,
              fontStyle: 'italic',
            }}
          >
            No incoming dependencies
          </div>
        ) : (
          importedBy.map((imp) => (
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
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = '#1c1c2e')
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = '#14141f')
              }
            >
              {getFileName(imp.label)}
              <div
                style={{
                  fontSize: 9,
                  color: '#8888a0',
                  marginTop: 2,
                }}
              >
                {imp.folder}
              </div>
            </div>
          ))
        )}
      </div>

      {related.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              color: '#9B59B6',
              fontSize: 10,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              marginBottom: 8,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            Most Related ({related.length})
          </div>
          {related.map((rel) => (
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
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = '#1c1c2e')
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = '#14141f')
              }
            >
              {getFileName(rel.label)}
              <div
                style={{
                  fontSize: 9,
                  color: '#8888a0',
                  marginTop: 2,
                }}
              >
                {rel.folder}
              </div>
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          borderTop: '1px solid #2a2a3e',
          paddingTop: 12,
          fontSize: 10,
          color: '#8888a0',
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        <div>
          Functions:{' '}
          {fileData.functions && Array.isArray(fileData.functions)
            ? fileData.functions.length
            : 0}
        </div>
        <div>Purpose: {fileData.purpose || 'N/A'}</div>
      </div>
    </div>
  )
}

function ExternalBreakdownPanel({ breakdown, onModuleClick, onClose }) {
  const entries = Object.entries(breakdown).sort(
    (a, b) => b[1].count - a[1].count
  )

  return (
    <div
      style={{
        position: 'absolute',
        right: 12,
        top: 52,
        width: 300,
        maxHeight: 'calc(100% - 64px)',
        background: '#1a1a2e',
        border: '1px solid #2a2a3e',
        borderRadius: 12,
        padding: '16px',
        overflowY: 'auto',
        zIndex: 10,
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <h3
          style={{
            margin: 0,
            color: '#a5b4fc',
            fontSize: 13,
            fontWeight: 600,
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          🔗 External Connections
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

      <div
        style={{
          fontSize: 10,
          color: '#8888a0',
          marginBottom: 12,
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        {entries.length} connected modules ·{' '}
        {entries.reduce((s, [, v]) => s + v.count, 0)} total imports
      </div>

      {entries.map(([mod, data]) => {
        const color = getModuleColor(mod)
        return (
          <div
            key={mod}
            onClick={() => onModuleClick(mod)}
            style={{
              padding: '8px 10px',
              marginBottom: 4,
              background: '#14141f',
              borderRadius: 8,
              borderLeft: `3px solid ${color}`,
              cursor: 'pointer',
              transition: 'background 0.15s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = '#1c1c2e')
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = '#14141f')
            }
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                color: '#e4e4ec',
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: color,
                }}
              />
              {mod}
            </div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: color,
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              {data.count} imports
            </div>
          </div>
        )
      })}

      <div
        style={{
          marginTop: 12,
          fontSize: 10,
          color: '#8888a0',
          fontFamily: "'JetBrains Mono', monospace",
          textAlign: 'center',
        }}
      >
        Click a module to compare files
      </div>
    </div>
  )
}

function computeOverviewLayout(
  nodes,
  edges,
  moduleStats,
  highlightedNodes,
  flowPath,
  numberedNodes,
  selectedFile
) {
  if (!nodes || nodes.length === 0) return { rfNodes: [], rfEdges: [], modulePositions: {} }

  const modules = new Map()
  nodes.forEach((n) => {
    if (!n || !n.id) return
    const mod = n.folder || getModuleName(n.id)
    if (!modules.has(mod)) {
      modules.set(mod, { id: `module:${mod}`, fileIds: [], folder: mod })
    }
    modules.get(mod).fileIds.push(n.id)
  })

  const moduleNames = Array.from(modules.keys())

  let modulePositions
  if (moduleNames.length <= 12) {
    modulePositions = {}
    const cols = Math.min(moduleNames.length, 4)
    const rows = Math.ceil(moduleNames.length / cols)
    const totalW = cols * (NODE_W + 40) - 40
    const totalH = rows * (NODE_H + 30) - 30
    const startX = -totalW / 2
    const startY = -totalH / 2

    moduleNames.forEach((mod, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      modulePositions[mod] = {
        x: startX + col * (NODE_W + 40),
        y: startY + row * (NODE_H + 30),
      }
    })
  } else {
    const dagreGraph = new dagre.graphlib.Graph()
    dagreGraph.setDefaultEdgeLabel(() => ({}))
    dagreGraph.setGraph({
      rankdir: 'TB',
      nodesep: 50,
      ranksep: 80,
      marginx: 30,
      marginy: 30,
    })

    moduleNames.forEach((mod) => {
      dagreGraph.setNode(mod, { width: NODE_W, height: NODE_H })
    })

    const me = getModuleEdges(edges)
    me.forEach((e) => {
      if (moduleNames.includes(e.source) && moduleNames.includes(e.target)) {
        dagreGraph.setEdge(e.source, e.target)
      }
    })

    dagre.layout(dagreGraph)

    modulePositions = {}
    moduleNames.forEach((mod) => {
      const pos = dagreGraph.node(mod)
      if (pos) {
        modulePositions[mod] = {
          x: pos.x - NODE_W / 2,
          y: pos.y - NODE_H / 2,
        }
      }
    })
  }

  const flowSet = flowPath instanceof Set ? flowPath : new Set()
  const highlightSet = highlightedNodes instanceof Set ? highlightedNodes : new Set()
  const allActive = new Set([...flowSet, ...highlightSet])
  if (selectedFile) allActive.add(selectedFile)

  const rfNodes = moduleNames.map((mod) => {
    const stats = moduleStats.get(mod) || {
      fileCount: 0,
      subfolderCount: 0,
      internalDeps: 0,
    }
    const color = getModuleColor(mod)
    const pos = modulePositions[mod] || { x: 0, y: 0 }

    const hasActivity = Array.from(allActive).some(
      (id) => getModuleName(id) === mod
    )

    return {
      id: `module:${mod}`,
      type: 'default',
      position: pos,
      data: {
        label: mod,
        color,
        fileCount: stats.fileCount,
        subfolderCount: stats.subfolderCount,
        internalDeps: stats.internalDeps,
        isModule: true,
      },
      style: {
        background: hasActivity
          ? `linear-gradient(135deg, ${color}, ${color}88)`
          : `${color}15`,
        border: `2px solid ${hasActivity ? color : `${color}44`}`,
        borderRadius: 12,
        padding: '10px 14px',
        color: hasActivity ? '#fff' : '#e4e4ec',
        fontSize: 13,
        fontWeight: 600,
        fontFamily: "'JetBrains Mono', monospace",
        width: NODE_W,
        boxShadow: hasActivity ? `0 0 20px ${color}44` : 'none',
        cursor: 'pointer',
        transition: 'all 0.25s ease',
        opacity: allActive.size > 0 && !hasActivity ? 0.25 : 1,
      },
    }
  })

  const me = getModuleEdges(edges)
  const rfEdges = me
    .filter(
      (e) => moduleNames.includes(e.source) && moduleNames.includes(e.target)
    )
    .map((e, i) => {
      const isInFlow = flowSet.has(e.source) && flowSet.has(e.target)
      const srcModActive = Array.from(allActive).some(
        (id) => getModuleName(id) === e.source
      )
      const tgtModActive = Array.from(allActive).some(
        (id) => getModuleName(id) === e.target
      )
      const edgeActive = isInFlow || (srcModActive && tgtModActive)

      return {
        id: `mod-e${i}`,
        source: `module:${e.source}`,
        target: `module:${e.target}`,
        animated: isInFlow,
        label: `${e.weight}`,
        labelStyle: {
          fill: '#8888a0',
          fontSize: 10,
          fontFamily: "'JetBrains Mono', monospace",
        },
        labelBgStyle: { fill: '#1a1a2e', opacity: 0.8 },
        labelBgPadding: [4, 4],
        style: {
          stroke: edgeActive ? '#6366f1' : '#2a2a3e',
          strokeWidth: Math.min(e.weight * 0.6 + 1, 5),
          opacity: allActive.size > 0 && !edgeActive ? 0.06 : 0.65,
          transition: 'all 0.3s ease',
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: edgeActive ? '#6366f1' : '#2a2a3e',
          width: 14,
          height: 14,
        },
      }
    })

  return { rfNodes, rfEdges, modulePositions }
}

function computeFocusLayout(
  focusStack,
  folderTree,
  nodes,
  edges,
  moduleStats,
  overviewPositions,
  highlightedNodes,
  flowPath,
  numberedNodes,
  selectedFile
) {
  const folderPath = focusStack.join('/')
  const focusedFolder = getFolderByPath(folderTree, focusStack)

  if (!focusedFolder) {
    return { rfNodes: [], rfEdges: [], externalBreakdown: {} }
  }

  const focusedFilePaths = focusedFolder.filePaths
  const childFolders = focusedFolder.children || []
  const childFiles = focusedFolder.files || []

  const color = getModuleColor(focusStack[0] || 'default')

  const flowSet = flowPath instanceof Set ? flowPath : new Set()
  const highlightSet = highlightedNodes instanceof Set ? highlightedNodes : new Set()
  const allActive = new Set([...flowSet, ...highlightSet])
  if (selectedFile) allActive.add(selectedFile)

  const internalEdges = getInternalEdges(edges, focusedFilePaths)

  const fileNameFocused = (fid) => childFiles.some((cf) => cf.id === fid)
  const visibleInternalEdges = internalEdges.filter(
    (e) => fileNameFocused(e.source) && fileNameFocused(e.target)
  )

  const subfolderRfNodes = []
  const fileRfNodes = []

  let sfX = CONTAINER_PAD
  const sfY = CONTAINER_PAD

  childFolders.forEach((child) => {
    const childColor = getModuleColor(child.name)
    const hasActivity = Array.from(allActive).some(
      (id) => id.startsWith(child.path + '/') || id === child.path
    )

    subfolderRfNodes.push({
      id: `folder:${child.path}`,
      type: 'default',
      position: { x: sfX, y: sfY },
      data: {
        label: child.name,
        color: childColor,
        fileCount: child.fileCount,
        subfolderCount: child.subfolderCount,
        isFolder: true,
        path: child.path,
        isModule: false,
      },
      style: {
        background: hasActivity ? `${childColor}33` : `${childColor}12`,
        border: `2px solid ${hasActivity ? childColor : `${childColor}33`}`,
        borderRadius: 8,
        padding: '6px 10px',
        color: hasActivity ? childColor : '#c4c4d0',
        fontSize: 12,
        fontWeight: 600,
        fontFamily: "'JetBrains Mono', monospace",
        width: FOLDER_CARD_W,
        height: FOLDER_CARD_H,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      },
    })
    sfX += FOLDER_CARD_W + GRID_GAP
  })

  const fileCols = Math.max(1, Math.min(3, childFiles.length))
  const fileStartY =
    childFolders.length > 0
      ? CONTAINER_PAD + FOLDER_CARD_H + GRID_GAP + 6
      : CONTAINER_PAD

  childFiles.forEach((f, i) => {
    const col = i % fileCols
    const row = Math.floor(i / fileCols)
    const fx = CONTAINER_PAD + col * (FILE_NODE_W + GRID_GAP)
    const fy = fileStartY + row * (FILE_NODE_H + GRID_GAP)

    const isHighlighted = highlightSet.has(f.id)
    const isInFlow = flowSet.has(f.id)
    const isSelected = selectedFile === f.id

    let borderColor = getNodeColor(f.folder || 'default')
    let bgGradient = '#14141f'
    let glow = 'none'
    let textColor = '#e4e4ec'

    if (isInFlow) {
      borderColor = '#34d399'
      bgGradient = 'linear-gradient(135deg, #34d39922, #05966922)'
      textColor = '#34d399'
    } else if (isSelected) {
      borderColor = '#6366f1'
      bgGradient = 'linear-gradient(135deg, #6366f122, #7c3aed22)'
      textColor = '#a5b4fc'
      glow = '0 0 12px #6366f144'
    } else if (isHighlighted) {
      borderColor = '#6366f1'
      bgGradient = '#6366f115'
    }

    fileRfNodes.push({
      id: f.id,
      type: 'default',
      position: { x: fx, y: fy },
      data: {
        label: f.label || getFileName(f.id),
        folder: f.folder || 'default',
        purpose: f.purpose || '',
        functions: (f.functions && Array.isArray(f.functions))
          ? f.functions.slice(0, 2)
          : [],
        isFile: true,
        filePath: f.id,
        isModule: false,
      },
      style: {
        background: bgGradient,
        border: `1.5px solid ${borderColor}`,
        borderRadius: 6,
        padding: '5px 8px',
        color: textColor,
        fontSize: 10,
        fontFamily: "'JetBrains Mono', monospace",
        width: FILE_NODE_W,
        height: FILE_NODE_H,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        boxShadow: glow,
      },
    })
  })

  const childrenContentW = Math.max(
    childFolders.length > 0
      ? childFolders.length * (FOLDER_CARD_W + GRID_GAP) - GRID_GAP
      : 0,
    Math.min(fileCols, childFiles.length) * (FILE_NODE_W + GRID_GAP) - GRID_GAP
  )

  const totalChildrenW = Math.max(
    childrenContentW + CONTAINER_PAD * 2,
    NODE_W * 2 + CONTAINER_PAD * 2
  )

  const lastContentY =
    childFiles.length > 0
      ? fileStartY +
        Math.ceil(childFiles.length / fileCols) * (FILE_NODE_H + GRID_GAP)
      : fileStartY

  const innerH = Math.max(
    lastContentY + CONTAINER_PAD,
    childFolders.length > 0 || childFiles.length > 0 ? CONTAINER_PAD * 2 : CONTAINER_PAD * 2
  )

  const containerW = totalChildrenW
  const containerH = innerH + CONTAINER_HEADER_H + CONTAINER_FOOTER_H

  const modName = focusStack[0] || 'root'
  const overviewPos = overviewPositions?.[modName]

  let containerX
  let containerY

  if (overviewPos) {
    containerX = overviewPos.x - CONTAINER_PAD
    containerY = overviewPos.y - CONTAINER_HEADER_H - CONTAINER_PAD - 10
  } else {
    containerX = -containerW / 2
    containerY = -containerH / 2 + 60
  }

  const offsetX = containerX + CONTAINER_PAD
  const offsetY = containerY + CONTAINER_HEADER_H

  const positionedSfNodes = subfolderRfNodes.map((n) => ({
    ...n,
    position: { x: n.position.x + offsetX, y: n.position.y + offsetY },
    targetPosition: Position.Top,
    sourcePosition: Position.Bottom,
  }))

  const positionedFileNodes = fileRfNodes.map((n) => ({
    ...n,
    position: { x: n.position.x + offsetX, y: n.position.y + offsetY },
    targetPosition: Position.Top,
    sourcePosition: Position.Bottom,
  }))

  const externalBreakdown = getExternalEdgesByFolder(edges, folderPath)
  const externalCount = Object.values(externalBreakdown).reduce(
    (s, v) => s + v.count,
    0
  )
  const externalModuleCount = Object.keys(externalBreakdown).length

  const containerNode = {
    id: `container:${folderPath}`,
    type: 'container',
    position: { x: containerX, y: containerY },
    style: { width: containerW, height: containerH },
    draggable: false,
    selectable: false,
    data: {
      title: focusStack.join(' / '),
      color,
      icon: focusStack.length === 1 ? '📦' : '📂',
      externalDepCount: externalCount,
      externalModuleCount: externalModuleCount,
      stats: {
        files: focusedFolder.fileCount,
        subfolders: focusedFolder.subfolderCount,
        internal: visibleInternalEdges.length,
      },
    },
  }

  const hiddenModules = Array.from(
    new Set(nodes.map((n) => n.folder || getModuleName(n.id)))
  ).filter((m) => m !== focusStack[0])

  const fadedModuleNodes = hiddenModules
    .map((mod) => {
      const color = getModuleColor(mod)
      const pos = overviewPositions?.[mod]
      if (!pos) return null

      return {
        id: `faded:${mod}`,
        type: 'default',
        position: { x: pos.x, y: pos.y },
        draggable: false,
        selectable: false,
        data: { label: mod, isFaded: true, isModule: false },
        style: {
          background: `${color}08`,
          border: `1px solid ${color}22`,
          borderRadius: 8,
          padding: '6px 10px',
          color: `${color}44`,
          fontSize: 11,
          fontWeight: 500,
          fontFamily: "'JetBrains Mono', monospace",
          width: NODE_W * 0.6,
          height: NODE_H * 0.6,
          cursor: 'default',
          opacity: 0.2,
          pointerEvents: 'none',
          transition: 'all 0.3s ease',
        },
      }
    })
    .filter(Boolean)

  const rfEdges = visibleInternalEdges.map((e, i) => ({
    id: `int-e${i}`,
    source: e.source,
    target: e.target,
    animated: flowSet.has(e.source) && flowSet.has(e.target),
    style: {
      stroke: '#2a2a3e',
      strokeWidth: 1,
      opacity: 0.5,
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: '#2a2a3e',
      width: 10,
      height: 10,
    },
  }))

  const rfNodes = [
    containerNode,
    ...positionedSfNodes,
    ...positionedFileNodes,
    ...fadedModuleNodes,
  ]

  return { rfNodes, rfEdges, externalBreakdown }
}

function computeComparisonLayout(moduleA, moduleB, edges, nodes) {
  const connectedEdges = getFileToFileEdgesBetweenModules(
    edges,
    moduleA,
    moduleB
  )

  const filesA = []
  const filesB = []
  const seenA = new Set()
  const seenB = new Set()

  connectedEdges.forEach((e) => {
    if (getModuleName(e.source) === moduleA && !seenA.has(e.source)) {
      filesA.push(e.source)
      seenA.add(e.source)
    } else if (getModuleName(e.target) === moduleA && !seenA.has(e.target)) {
      filesA.push(e.target)
      seenA.add(e.target)
    }
    if (getModuleName(e.target) === moduleB && !seenB.has(e.target)) {
      filesB.push(e.target)
      seenB.add(e.target)
    } else if (getModuleName(e.source) === moduleB && !seenB.has(e.source)) {
      filesB.push(e.source)
      seenB.add(e.source)
    }
  })

  const nodeW = 180
  const nodeH = 34
  const gap = 8
  const colGap = 100
  const leftX = 0
  const rightX = nodeW + colGap

  const rfNodes = []

  const layoutedAs = filesA.map((fid, i) => {
    const node = nodes.find((n) => n.id === fid)
    return {
      id: `cmp:${fid}`,
      type: 'default',
      position: { x: leftX, y: i * (nodeH + gap) },
      data: {
        label: node?.label || getFileName(fid),
        isFile: true,
        filePath: fid,
        folder: node?.folder || getModuleName(fid),
        isModule: false,
      },
      style: {
        background: '#14141f',
        border: `1.5px solid ${getNodeColor(node?.folder || '')}`,
        borderRadius: 6,
        padding: '4px 8px',
        color: '#e4e4ec',
        fontSize: 10,
        fontFamily: "'JetBrains Mono', monospace",
        width: nodeW,
        height: nodeH,
        cursor: 'pointer',
      },
    }
  })

  const layoutedBs = filesB.map((fid, i) => {
    const node = nodes.find((n) => n.id === fid)
    return {
      id: `cmp:${fid}`,
      type: 'default',
      position: { x: rightX, y: i * (nodeH + gap) },
      data: {
        label: node?.label || getFileName(fid),
        isFile: true,
        filePath: fid,
        folder: node?.folder || getModuleName(fid),
        isModule: false,
      },
      style: {
        background: '#14141f',
        border: `1.5px solid ${getNodeColor(node?.folder || '')}`,
        borderRadius: 6,
        padding: '4px 8px',
        color: '#e4e4ec',
        fontSize: 10,
        fontFamily: "'JetBrains Mono', monospace",
        width: nodeW,
        height: nodeH,
        cursor: 'pointer',
      },
    }
  })

  rfNodes.push(...layoutedAs, ...layoutedBs)

  const rfEdges = connectedEdges.map((e, i) => ({
    id: `cmp-e${i}`,
    source: `cmp:${e.source}`,
    target: `cmp:${e.target}`,
    style: {
      stroke: '#6366f1',
      strokeWidth: 1.5,
      opacity: 0.7,
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: '#6366f1',
      width: 12,
      height: 12,
    },
  }))

  return { rfNodes, rfEdges }
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
  const [focusStack, setFocusStack] = useState([])
  const [sidebarFile, setSidebarFile] = useState(null)
  const [showExternalBreakdown, setShowExternalBreakdown] = useState(false)
  const [comparisonTarget, setComparisonTarget] = useState(null)
  const [showComparison, setShowComparison] = useState(false)

  const { fitView } = useReactFlow()

  const safeGraph = useMemo(() => {
    if (!graph) return { nodes: [], edges: [] }
    return {
      nodes: Array.isArray(graph.nodes) ? graph.nodes : [],
      edges: Array.isArray(graph.edges) ? graph.edges : [],
    }
  }, [graph])

  const folderTree = useMemo(
    () => buildFolderTree(safeGraph.nodes),
    [safeGraph.nodes]
  )

  const moduleStats = useMemo(
    () => computeModuleStats(safeGraph.nodes, safeGraph.edges),
    [safeGraph]
  )

  const uniqueModules = useMemo(() => {
    const mods = new Set()
    safeGraph.nodes.forEach((n) => {
      if (n && n.id) mods.add(n.folder || getModuleName(n.id))
    })
    return mods.size
  }, [safeGraph])

  const inOverviewMode = focusStack.length === 0 && !showComparison
  const inFocusMode = focusStack.length > 0 && !showComparison

  // Separate layout computations for each mode to avoid refs during render
  // Compute overview positions independent of view mode
  // Used by focusLayout to position faded module nodes
  const overviewPositions = useMemo(() => {
    if (!safeGraph.nodes || safeGraph.nodes.length === 0) return {}
    const { modulePositions } = computeOverviewLayout(
      safeGraph.nodes, safeGraph.edges, moduleStats,
      new Set(), new Set(), null, null
    )
    return modulePositions
  }, [safeGraph, moduleStats])

  const overviewResult = useMemo(() => {
    if (!inOverviewMode) return null
    if (!safeGraph.nodes || safeGraph.nodes.length === 0) return null
    return computeOverviewLayout(
      safeGraph.nodes,
      safeGraph.edges,
      moduleStats,
      highlightedNodes,
      flowPath,
      numberedNodes,
      selectedFile
    )
  }, [inOverviewMode, safeGraph, moduleStats, highlightedNodes, flowPath, numberedNodes, selectedFile])

  const focusResult = useMemo(() => {
    if (!inFocusMode) return null
    if (!safeGraph.nodes || safeGraph.nodes.length === 0) return null
    return computeFocusLayout(
      focusStack,
      folderTree,
      safeGraph.nodes,
      safeGraph.edges,
      moduleStats,
      overviewPositions,
      highlightedNodes,
      flowPath,
      numberedNodes,
      selectedFile
    )
  }, [
    inFocusMode, focusStack, folderTree, safeGraph, moduleStats,
    overviewPositions, highlightedNodes, flowPath, numberedNodes, selectedFile,
  ])

  const comparisonResult = useMemo(() => {
    if (!showComparison || !comparisonTarget) return null
    const focusedMod = focusStack[0]
    return computeComparisonLayout(
      focusedMod,
      comparisonTarget,
      safeGraph.edges,
      safeGraph.nodes
    )
  }, [showComparison, comparisonTarget, focusStack, safeGraph])

  const { computedNodes, computedEdges, externalBreakdownData } = useMemo(() => {
    if (overviewResult) {
      return {
        computedNodes: overviewResult.rfNodes,
        computedEdges: overviewResult.rfEdges,
        externalBreakdownData: null,
      }
    }
    if (focusResult) {
      return {
        computedNodes: focusResult.rfNodes,
        computedEdges: focusResult.rfEdges,
        externalBreakdownData: focusResult.externalBreakdown,
      }
    }
    if (comparisonResult) {
      return {
        computedNodes: comparisonResult.rfNodes,
        computedEdges: comparisonResult.rfEdges,
        externalBreakdownData: null,
      }
    }
    return { computedNodes: [], computedEdges: [], externalBreakdownData: null }
  }, [overviewResult, focusResult, comparisonResult])

  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edgesState, setEdges, onEdgesChange] = useEdgesState([])

  useEffect(() => {
    setNodes(computedNodes)
    setEdges(computedEdges)
  }, [computedNodes, computedEdges, setNodes, setEdges])

  useEffect(() => {
    externalDepsHandlerRef.current = () => {
      setShowExternalBreakdown((prev) => !prev)
    }
    return () => {
      externalDepsHandlerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (
      !showComparison &&
      focusStack.length > 0 &&
      computedNodes.length > 0
    ) {
      const timer = setTimeout(() => {
        fitView({ padding: 0.25, duration: 350 })
      }, 120)
      return () => clearTimeout(timer)
    }
  }, [focusStack, showComparison, computedNodes.length, fitView])

  useEffect(() => {
    if (showComparison && computedNodes.length > 0) {
      const timer = setTimeout(() => {
        fitView({ padding: 0.5, duration: 400 })
      }, 80)
      return () => clearTimeout(timer)
    }
  }, [showComparison, computedNodes.length, fitView])

  const nodeTypes = useMemo(() => ({ container: ContainerNode }), [])

  const handleNodeClickFn = useCallback(
    (event, node) => {
      if (!node || !node.id) return

      if (
        node.id.startsWith('container:') ||
        node.id.startsWith('faded:') ||
        node.id.startsWith('cmp:')
      )
        return

      if (node.data?.isFolder) {
        setFocusStack((prev) => [...prev, node.data.label])
        setSidebarFile(null)
        setShowExternalBreakdown(false)
        setShowComparison(false)
        setComparisonTarget(null)
        return
      }

      if (node.data?.isModule) {
        const modName = node.data.label
        setFocusStack([modName])
        setSidebarFile(null)
        setShowExternalBreakdown(false)
        setShowComparison(false)
        setComparisonTarget(null)
        return
      }

      if (node.data?.isFile || node.data?.filePath) {
        const fileId = node.data.filePath || node.id
        const fileData = safeGraph.nodes.find((n) => n && n.id === fileId)
        if (fileData) {
          setSidebarFile(fileData)
        }
        if (typeof onNodeClick === 'function') {
          onNodeClick(fileId)
        }
      }
    },
    [onNodeClick, safeGraph.nodes]
  )

  const handlePaneClick = useCallback(() => {
    if (showComparison) {
      setShowComparison(false)
      setComparisonTarget(null)
      setShowExternalBreakdown(false)
      return
    }
    if (focusStack.length > 0) {
      setFocusStack([])
      setSidebarFile(null)
      setShowExternalBreakdown(false)
      setShowComparison(false)
      setComparisonTarget(null)
    }
  }, [focusStack, showComparison])

  const handleBreadcrumbNavigate = useCallback(
    (index) => {
      if (showComparison) {
        setShowComparison(false)
        setComparisonTarget(null)
      }
      if (index === 0) {
        setFocusStack([])
      } else {
        setFocusStack(focusStack.slice(0, index))
      }
      setSidebarFile(null)
      setShowExternalBreakdown(false)
    },
    [focusStack, showComparison]
  )

  const handleContextMenu = useCallback(
    (event, node) => {
      event.preventDefault()
      if (typeof onNodeContextMenu === 'function') onNodeContextMenu(node.id)
    },
    [onNodeContextMenu]
  )

  const handleExternalModuleClick = useCallback((mod) => {
    setComparisonTarget(mod)
    setShowComparison(true)
    setShowExternalBreakdown(false)
  }, [])

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
      <Breadcrumb
        focusStack={focusStack}
        onNavigate={handleBreadcrumbNavigate}
        comparisonTarget={showComparison ? comparisonTarget : null}
      />

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
          {showComparison ? (
            <>
              <span style={{ color: '#6366f1', fontWeight: 600 }}>
                {focusStack[0]}
              </span>
              <span style={{ color: '#2a2a3e' }}>↔</span>
              <span style={{ color: '#f472b6', fontWeight: 600 }}>
                {comparisonTarget}
              </span>
              <span style={{ color: 'var(--color-border)' }}>|</span>
              <span>{computedEdges.length} connections</span>
            </>
          ) : inOverviewMode ? (
            <>
              <span>{uniqueModules} top-level modules</span>
              <span style={{ color: 'var(--color-border)' }}>|</span>
              <span>
                {getModuleEdges(safeGraph.edges).length} cross-module deps
              </span>
            </>
          ) : (
            <>
              <span>
                {computedNodes.length - 1} visible nodes
              </span>
              <span style={{ color: 'var(--color-border)' }}>|</span>
              <span>
                {computedNodes.filter(
                  (n) =>
                    !n.id.startsWith('container:') &&
                    !n.id.startsWith('faded:') &&
                    n.data?.isFile
                ).length } files in view
              </span>
            </>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {showComparison && (
            <button
              onClick={() => {
                setShowComparison(false)
                setComparisonTarget(null)
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 6,
                color: 'var(--color-text-muted)',
                fontSize: 11,
                fontFamily: 'inherit',
                padding: '4px 10px',
                cursor: 'pointer',
              }}
            >
              ← Back to Focus
            </button>
          )}

          {inFocusMode && !showComparison && (
            <div
              style={{
                padding: '2px 8px',
                background: '#34d39922',
                border: '1px solid #34d399',
                borderRadius: 4,
                color: '#6ee7b7',
                fontSize: 10,
                fontWeight: 600,
              }}
            >
              📂 FOCUS MODE
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          flex: '1 1 auto',
          minHeight: 480,
          position: 'relative',
          width: '100%',
        }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edgesState}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClickFn}
          onPaneClick={handlePaneClick}
          onNodeContextMenu={handleContextMenu}
          nodeTypes={nodeTypes}
          panOnDrag={true}
          panOnScroll={true}
          zoomOnScroll={false}
          zoomOnPinch={true}
          zoomActivationKeyCode={['Meta', 'Control']}
          nodesDraggable={false}
          nodesFocusable={false}
          attributionPosition="bottom-left"
          minZoom={0.05}
          maxZoom={3}
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

        {showExternalBreakdown && externalBreakdownData && (
          <ExternalBreakdownPanel
            breakdown={externalBreakdownData}
            onModuleClick={handleExternalModuleClick}
            onClose={() => setShowExternalBreakdown(false)}
          />
        )}

        {!showComparison && (
          <Sidebar
            fileData={sidebarFile}
            nodes={safeGraph.nodes}
            edges={safeGraph.edges}
            onNodeClick={(id) => {
              const fileData = safeGraph.nodes.find((n) => n && n.id === id)
              if (fileData) {
                setSidebarFile(fileData)
              }
              if (typeof onNodeClick === 'function') onNodeClick(id)
            }}
            onClose={() => setSidebarFile(null)}
          />
        )}
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
