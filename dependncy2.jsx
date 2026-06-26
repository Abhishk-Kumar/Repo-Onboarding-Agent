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

// Deterministic color for a synthetic folder node based on its own name
// (not just top-level folder), so nested folders get visually distinct
// but stable colors across re-renders.
function getFolderNodeColor(name) {
  return FOLDER_COLORS[name] || FOLDER_COLORS.default
}

const ROOT_ID = '__root__'

// ---------------------------------------------------------------------------
// HIERARCHY CONSTRUCTION
// ---------------------------------------------------------------------------
// The backend only gives us a flat file list (`graph.nodes`, each with an
// `id` that is a relative path like "app/services/auth/login.py") plus
// file-level edges. There is no folder/parent information from the server.
// So we derive a folder tree purely from path segments, then use that tree
// to decide what's visible at any given expand/collapse state.
//
// Tree shape:
//   {
//     id: "app/services" | ROOT_ID,
//     type: "folder" | "file",
//     name: "services",
//     path: "app/services",
//     depth: 1,
//     children: Map<segment, treeNode>,   // folders only
//     fileNode: <original file node>,     // only for type === "file"
//     fileCount: number,                  // total files in subtree (folders only)
//     folderCount: number,                // total subfolders in subtree (folders only)
//   }
function buildHierarchy(fileNodes) {
  const root = {
    id: ROOT_ID,
    type: 'folder',
    name: '',
    path: '',
    depth: 0,
    children: new Map(),
  }

  fileNodes.forEach((fileNode) => {
    const parts = fileNode.id.replace(/\\/g, '/').split('/').filter(Boolean)
    let cursor = root
    let pathSoFar = ''

    parts.forEach((segment, i) => {
      const isLast = i === parts.length - 1
      pathSoFar = pathSoFar ? `${pathSoFar}/${segment}` : segment

      if (isLast) {
        // Leaf: the file itself.
        cursor.children.set(segment, {
          id: pathSoFar,
          type: 'file',
          name: segment,
          path: pathSoFar,
          depth: i + 1,
          fileNode,
        })
      } else {
        if (!cursor.children.has(segment)) {
          cursor.children.set(segment, {
            id: pathSoFar,
            type: 'folder',
            name: segment,
            path: pathSoFar,
            depth: i + 1,
            children: new Map(),
          })
        }
        cursor = cursor.children.get(segment)
      }
    })
  })

  // Collapse chains of single-child folders (e.g. "src/app/components" where
  // each level has exactly one subfolder) into one node, so the overview
  // doesn't force the user through several pointless single-option clicks.
  // Stops collapsing as soon as a folder has >1 child OR contains a file
  // directly, since that's a real branching point.
  function collapseChains(node) {
    if (node.type !== 'folder') return node

    node.children.forEach((child, key) => {
      const collapsed = collapseChains(child)
      node.children.set(key, collapsed)
    })

    const childList = Array.from(node.children.values())
    const onlyOneFolderChild =
      childList.length === 1 && childList[0].type === 'folder'

    if (onlyOneFolderChild && node.id !== ROOT_ID) {
      const child = childList[0]
      return {
        ...child,
        name: `${node.name}/${child.name}`,
        // Keep the *deepest* real path as the id/path so file lookups by
        // path prefix still work, but remember the original shallow path
        // too in case we ever need it.
        depth: node.depth,
      }
    }
    return node
  }

  root.children.forEach((child, key) => {
    root.children.set(key, collapseChains(child))
  })

  // Annotate every folder with aggregate counts (own files + nested files,
  // own subfolders + nested subfolders), computed bottom-up.
  function annotate(node) {
    if (node.type === 'file') {
      return { fileCount: 1, folderCount: 0 }
    }
    let fileCount = 0
    let folderCount = 0
    node.children.forEach((child) => {
      const childStats = annotate(child)
      fileCount += childStats.fileCount
      if (child.type === 'folder') {
        folderCount += 1 + childStats.folderCount
      }
    })
    node.fileCount = fileCount
    node.folderCount = folderCount
    return { fileCount, folderCount }
  }
  annotate(root)

  return root
}

// Find a tree node by its path, searching from root. Returns null if not found.
function findTreeNode(root, path) {
  if (!path) return root
  const parts = path.split('/')
  let cursor = root
  for (const part of parts) {
    if (cursor.type !== 'folder') return null
    // Because of chain-collapsing, a single segment in `path` might not
    // exist as a direct key (the key could now be "a/b/c"). Walk children
    // and match by path prefix instead of exact segment key.
    let next = null
    for (const child of cursor.children.values()) {
      if (path === child.path || path.startsWith(child.path + '/')) {
        next = child
        break
      }
    }
    if (!next) return null
    cursor = next
    if (cursor.path === path) return cursor
  }
  return cursor
}

// Walk down from a tree node and collect every leaf file node underneath it.
function collectFiles(node, out) {
  if (node.type === 'file') {
    out.push(node.fileNode)
    return out
  }
  node.children.forEach((child) => collectFiles(child, out))
  return out
}

// ---------------------------------------------------------------------------
// VISIBLE GRAPH DERIVATION
// ---------------------------------------------------------------------------
// Given the tree and the set of currently-expanded folder paths, compute
// the flat list of visible nodes (folders shown as collapsed summary nodes,
// or their children if expanded) and the edges between them, rolling up
// any file-level edge that crosses a collapsed boundary into a single
// aggregated edge between the two nearest visible ancestors.
function deriveVisibleGraph(tree, expandedPaths, rawEdges, fileNodeIndex) {
  const visibleNodes = []
  // path -> visible tree node id, used to resolve which visible node a
  // given file "belongs to" right now (itself if visible, else nearest
  // collapsed ancestor).
  const fileToVisibleId = new Map()

  function walk(node, parentVisible) {
    if (node.id !== ROOT_ID) {
      const isFolder = node.type === 'folder'
      const isExpanded = isFolder && expandedPaths.has(node.path)

      if (!isFolder || !isExpanded) {
        // This node (file, or collapsed folder) is itself visible.
        visibleNodes.push(node)
        if (isFolder) {
          collectFiles(node, []).forEach(() => {})
          // Map every file under this collapsed folder to this folder's id.
          const files = []
          collectFiles(node, files)
          files.forEach((f) => fileToVisibleId.set(f.id, node.id))
        } else {
          fileToVisibleId.set(node.fileNode.id, node.id)
        }
        return
      }
    }

    // Root, or an expanded folder: recurse into children, don't render
    // this node itself (root is invisible; expanded folder is "opened").
    if (node.children) {
      node.children.forEach((child) => walk(child, node))
    }
  }

  walk(tree, null)

  // Roll up edges: map each raw file-level edge to the visible node ids on
  // both ends, drop self-loops (both ends collapsed into the same visible
  // folder), dedupe, and accumulate a count so the UI can show "(3 deps)".
  const edgeMap = new Map() // key "source->target" -> { source, target, count }
  rawEdges.forEach((e) => {
    const visSource = fileToVisibleId.get(e.source)
    const visTarget = fileToVisibleId.get(e.target)
    if (!visSource || !visTarget) return
    if (visSource === visTarget) return

    const key = `${visSource}->${visTarget}`
    if (!edgeMap.has(key)) {
      edgeMap.set(key, { source: visSource, target: visTarget, count: 0 })
    }
    edgeMap.get(key).count += 1
  })

  const visibleEdges = Array.from(edgeMap.values()).map((e, i) => ({
    id: `ve${i}`,
    source: e.source,
    target: e.target,
    rolledUp: e.count > 1,
    count: e.count,
  }))

  return { visibleNodes, visibleEdges }
}

function getLayoutedElements(nodes, edges, direction = 'TB', compact = false) {
  const nodeWidth = compact ? 120 : 180
  const nodeHeight = compact ? 36 : 50
  const gridGapX = compact ? 14 : 24
  const gridGapY = compact ? 10 : 16

  const connectedIds = new Set()
  edges.forEach((e) => {
    connectedIds.add(e.source)
    connectedIds.add(e.target)
  })

  const connectedNodes = nodes.filter((n) => connectedIds.has(n.id))
  const isolatedNodes = nodes.filter((n) => !connectedIds.has(n.id))

  const dagreGraph = new dagre.graphlib.Graph()
  dagreGraph.setDefaultEdgeLabel(() => ({}))
  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: compact ? 16 : 40,
    ranksep: compact ? 28 : 60,
    marginx: 20,
    marginy: 20,
    ranker: 'tight-tree',
  })

  connectedNodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight })
  })
  edges.forEach((edge) => {
    if (connectedIds.has(edge.source) && connectedIds.has(edge.target)) {
      dagreGraph.setEdge(edge.source, edge.target)
    }
  })
  dagre.layout(dagreGraph)

  const layoutedConnected = connectedNodes.map((node) => {
    const pos = dagreGraph.node(node.id)
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
        x: pos.x - nodeWidth / 2,
        y: pos.y - nodeHeight / 2,
      },
    }
  })

  const maxPerLine = 3
  const rankAxis = direction === 'LR' ? 'x' : 'y'
  const crossAxis = direction === 'LR' ? 'y' : 'x'
  const crossStep = direction === 'LR' ? nodeHeight + gridGapY : nodeWidth + gridGapX

  const rankGroups = new Map()
  layoutedConnected.forEach((n) => {
    const key = Math.round(n.position[rankAxis])
    if (!rankGroups.has(key)) rankGroups.set(key, [])
    rankGroups.get(key).push(n)
  })

  const sortedRankKeys = Array.from(rankGroups.keys()).sort((a, b) => a - b)
  let cumulativeShift = 0

  sortedRankKeys.forEach((rankKey) => {
    const group = rankGroups.get(rankKey)
    group.forEach((n) => {
      n.position[rankAxis] += cumulativeShift
    })

    if (group.length <= maxPerLine) return

    group.sort((a, b) => a.position[crossAxis] - b.position[crossAxis])

    const lines = Math.ceil(group.length / maxPerLine)
    const mainAxisStep = direction === 'LR' ? (nodeWidth + gridGapX) : (nodeHeight + gridGapY)

    group.forEach((n, i) => {
      const line = Math.floor(i / maxPerLine)
      const posInLine = i % maxPerLine
      n.position[crossAxis] = posInLine * crossStep
      n.position[rankAxis] += line * mainAxisStep
    })

    cumulativeShift += (lines - 1) * mainAxisStep
  })

  let maxX = 0
  let maxY = 0
  layoutedConnected.forEach((n) => {
    maxX = Math.max(maxX, n.position.x + nodeWidth)
    maxY = Math.max(maxY, n.position.y + nodeHeight)
  })
  if (layoutedConnected.length === 0) {
    maxX = 0
    maxY = 0
  }

  const targetColumns = Math.max(2, Math.ceil(Math.sqrt(isolatedNodes.length * 1.6)))

  const isolatedStartX = direction === 'LR' ? 0 : maxX + (nodeWidth + gridGapX) * 1.5
  const isolatedStartY = direction === 'LR' ? maxY + (nodeHeight + gridGapY) * 1.5 : 0

  const layoutedIsolated = isolatedNodes.map((node, i) => {
    const col = i % targetColumns
    const row = Math.floor(i / targetColumns)
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
        x: isolatedStartX + col * (nodeWidth + gridGapX),
        y: isolatedStartY + row * (nodeHeight + gridGapY),
      },
    }
  })

  return { nodes: [...layoutedConnected, ...layoutedIsolated], edges }
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

  // Folder paths that are currently expanded. Empty set = Level 1 overview
  // (only top-level folders + any root-level files visible).
  const [expandedPaths, setExpandedPaths] = useState(() => new Set())

  // Reset expand state whenever a genuinely new graph loads (different repo),
  // so switching repos doesn't carry over a stale expand state. We key this
  // off node count + first node id as a cheap "is this a new graph" check.
  const graphIdentityRef = useRef(null)
  useEffect(() => {
    if (!graph || !graph.nodes) return
    const identity = `${graph.nodes.length}:${graph.nodes[0]?.id || ''}`
    if (graphIdentityRef.current !== null && graphIdentityRef.current !== identity) {
      setExpandedPaths(new Set())
    }
    graphIdentityRef.current = identity
  }, [graph])

  const fileNodeIndex = useMemo(() => {
    const idx = new Map()
    if (graph?.nodes) graph.nodes.forEach((n) => idx.set(n.id, n))
    return idx
  }, [graph])

  const tree = useMemo(() => {
    if (!graph || !graph.nodes) return null
    return buildHierarchy(graph.nodes)
  }, [graph])

  // If the user (or a "Start Here"/flow-trace feature) highlights specific
  // files that are currently hidden inside a collapsed folder, auto-expand
  // just enough ancestors so those files become visible. This keeps the
  // "jump to result" behavior working even though most of the graph stays
  // collapsed by default.
  useEffect(() => {
    if (!tree) return
    const idsToReveal = new Set()
    if (highlightedNodes) highlightedNodes.forEach((id) => idsToReveal.add(id))
    if (flowPath) flowPath.forEach((id) => idsToReveal.add(id))
    if (selectedFile) idsToReveal.add(selectedFile)
    if (idsToReveal.size === 0) return

    setExpandedPaths((prev) => {
      let changed = false
      const next = new Set(prev)
      idsToReveal.forEach((filePath) => {
        const segments = filePath.replace(/\\/g, '/').split('/').filter(Boolean)
        // Expand every ancestor folder of this file, except the file itself.
        let pathSoFar = ''
        for (let i = 0; i < segments.length - 1; i++) {
          pathSoFar = pathSoFar ? `${pathSoFar}/${segments[i]}` : segments[i]
          if (!next.has(pathSoFar)) {
            next.add(pathSoFar)
            changed = true
          }
        }
      })
      return changed ? next : prev
    })
    // tree is stable per-graph; re-running this when expandedPaths itself
    // changes would loop, so it's intentionally excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, highlightedNodes, flowPath, selectedFile])

  const { visibleNodes, visibleEdges } = useMemo(() => {
    if (!tree) return { visibleNodes: [], visibleEdges: [] }
    return deriveVisibleGraph(tree, expandedPaths, graph?.edges || [], fileNodeIndex)
  }, [tree, expandedPaths, graph, fileNodeIndex])

  const rawNodes = useMemo(() => {
    return visibleNodes.map((vn) => {
      if (vn.type === 'file') {
        const n = vn.fileNode
        const color = getNodeColor(n.folder)
        const isHighlighted = highlightedNodes?.has(n.id)
        const stepNum = numberedNodes?.find((s) => s.file_path === n.id)
        const isInFlow = flowPath?.has(n.id)
        const isSelected = selectedFile === n.id

        return {
          id: n.id,
          type: 'default',
          data: {
            kind: 'file',
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
      }

      // Collapsed folder summary node.
      const color = getFolderNodeColor(vn.name.split('/').pop())
      const isHighlighted = highlightedNodes?.has(vn.path)
      const containsHighlight =
        highlightedNodes &&
        Array.from(highlightedNodes).some((id) => id === vn.path || id.startsWith(vn.path + '/'))

      return {
        id: vn.id,
        type: 'default',
        data: {
          kind: 'folder',
          label: vn.name,
          fileCount: vn.fileCount,
          folderCount: vn.folderCount,
        },
        style: {
          background: '#1a1a28',
          border: `2px dashed ${containsHighlight ? '#6366f1' : color}`,
          borderRadius: 10,
          padding: '8px 12px',
          color: '#e4e4ec',
          fontSize: 12,
          fontWeight: 600,
          fontFamily: "'JetBrains Mono', monospace",
          width: 180,
          cursor: 'pointer',
          opacity: highlightedNodes && !containsHighlight ? 0.35 : 1,
          transition: 'all 0.3s ease',
        },
      }
    })
  }, [visibleNodes, highlightedNodes, numberedNodes, flowPath, selectedFile])

  const rawEdges = useMemo(() => {
    return visibleEdges.map((e) => {
      const isInFlow = flowPath?.has(e.source) && flowPath?.has(e.target)
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        animated: isInFlow,
        label: e.rolledUp ? `${e.count}` : undefined,
        labelStyle: { fill: '#8888a0', fontSize: 9 },
        labelBgStyle: { fill: '#14141f' },
        style: {
          stroke: isInFlow ? '#34d399' : e.rolledUp ? '#44446a' : '#2a2a3e',
          strokeWidth: isInFlow ? 2.5 : e.rolledUp ? 1.5 : 1,
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
  }, [visibleEdges, highlightedNodes, flowPath])

  const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(
    () => getLayoutedElements(rawNodes, rawEdges, direction, compact),
    [rawNodes, rawEdges, direction, compact]
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes)
  const [edgesState, setEdges, onEdgesChange] = useEdgesState(layoutedEdges)
  const { fitView } = useReactFlow()

  useEffect(() => {
    setNodes(layoutedNodes)
    setEdges(layoutedEdges)
  }, [layoutedNodes, layoutedEdges, setNodes, setEdges])

  useEffect(() => {
    if (nodes.length > 0) {
      setTimeout(() => {
        fitView({ padding: 0.3, duration: 350 })
      }, 50)
    }
    // Re-fit any time the visible node SET changes shape (expand/collapse
    // changes nodes.length), or the user flips direction/compact.
  }, [nodes.length, direction, compact, fitView])

  useEffect(() => {
    const idsToFocus = new Set()
    if (highlightedNodes) highlightedNodes.forEach((id) => idsToFocus.add(id))
    if (flowPath) flowPath.forEach((id) => idsToFocus.add(id))
    if (idsToFocus.size === 0) return

    // Highlighted ids are always *file* paths, but the visible node holding
    // that file might now be a collapsed ancestor folder (if our auto-expand
    // effect hasn't applied yet on this exact render). Resolve to whichever
    // currently-visible node id actually contains each target.
    const visibleIdSet = new Set(nodes.map((n) => n.id))
    const resolvedIds = new Set()
    idsToFocus.forEach((id) => {
      if (visibleIdSet.has(id)) {
        resolvedIds.add(id)
        return
      }
      const ancestor = Array.from(visibleIdSet).find(
        (vid) => id.startsWith(vid + '/')
      )
      if (ancestor) resolvedIds.add(ancestor)
    })
    if (resolvedIds.size === 0) return

    setTimeout(() => {
      fitView({
        padding: 0.4,
        duration: 400,
        nodes: Array.from(resolvedIds).map((id) => ({ id })),
      })
    }, 60)
  }, [highlightedNodes, flowPath, nodes, fitView])

  const handleNodeClick = useCallback(
    (event, node) => {
      const vn = visibleNodes.find((v) => v.id === node.id)
      if (vn && vn.type === 'folder') {
        // Folder nodes toggle expand/collapse instead of bubbling up as a
        // file selection. Clicking an already-expanded folder's summary
        // node can't happen (it wouldn't be rendered as a folder node
        // anymore), so this is always an "expand" action.
        setExpandedPaths((prev) => {
          const next = new Set(prev)
          next.add(vn.path)
          return next
        })
        return
      }
      if (onNodeClick) onNodeClick(node.id)
    },
    [visibleNodes, onNodeClick]
  )

  const handleContextMenu = useCallback(
    (event, node) => {
      event.preventDefault()
      const vn = visibleNodes.find((v) => v.id === node.id)
      if (vn && vn.type === 'folder') {
        // Right-click on a folder is repurposed as collapse, but folders
        // only ever render in their collapsed form, so right-click on a
        // folder summary node collapses its nearest expanded ancestor
        // instead — i.e. "go back up one level" from here.
        const parentPath = vn.path.includes('/')
          ? vn.path.slice(0, vn.path.lastIndexOf('/'))
          : ''
        setExpandedPaths((prev) => {
          const next = new Set(prev)
          if (parentPath) next.delete(parentPath)
          return next
        })
        return
      }
      if (onNodeContextMenu) onNodeContextMenu(node.id)
    },
    [visibleNodes, onNodeContextMenu]
  )

  const collapseFolder = useCallback((path) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev)
      // Collapse this folder and everything nested under it, so re-expanding
      // a parent later doesn't unexpectedly reveal grandchildren that were
      // previously opened.
      next.forEach((p) => {
        if (p === path || p.startsWith(path + '/')) next.delete(p)
      })
      return next
    })
  }, [])

  const collapseAll = useCallback(() => setExpandedPaths(new Set()), [])

  // Breadcrumb-ish list of currently expanded folders, sorted by depth, so
  // the user has an explicit way to collapse a specific level rather than
  // relying only on right-click (which is easy to miss on touch/trackpad).
  const expandedList = useMemo(
    () => Array.from(expandedPaths).sort((a, b) => a.split('/').length - b.split('/').length),
    [expandedPaths]
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
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span>{graph.nodes.length} files</span>
          <span style={{ color: 'var(--color-border)' }}>|</span>
          <span>{graph.edges.length} dependencies</span>
          <span style={{ color: 'var(--color-border)' }}>|</span>
          <span>{nodes.length} shown</span>

          {expandedList.length > 0 && (
            <>
              <span style={{ color: 'var(--color-border)' }}>|</span>
              <button
                onClick={collapseAll}
                title="Collapse everything back to the top-level overview"
                style={{
                  background: 'transparent',
                  border: '1px solid var(--color-border)',
                  borderRadius: 6,
                  color: 'var(--color-text-muted)',
                  fontSize: 11,
                  fontFamily: 'inherit',
                  padding: '3px 8px',
                  cursor: 'pointer',
                }}
              >
                Collapse all
              </button>
              {expandedList.map((p) => (
                <button
                  key={p}
                  onClick={() => collapseFolder(p)}
                  title={`Collapse ${p}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    background: 'rgba(99,102,241,0.12)',
                    border: '1px solid #3a3a5c',
                    borderRadius: 6,
                    color: '#a5b4fc',
                    fontSize: 10,
                    fontFamily: "'JetBrains Mono', monospace",
                    padding: '3px 8px',
                    cursor: 'pointer',
                  }}
                >
                  {p}
                  <span style={{ opacity: 0.6 }}>×</span>
                </button>
              ))}
            </>
          )}
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

        <div
          style={{
            position: 'absolute',
            bottom: 12,
            left: 12,
            fontSize: 10,
            color: 'var(--color-text-muted)',
            background: 'rgba(20,20,31,0.85)',
            border: '1px solid var(--color-border)',
            borderRadius: 6,
            padding: '4px 8px',
            pointerEvents: 'none',
          }}
        >
          Click a dashed folder to expand · Right-click to collapse up a level
        </div>
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
