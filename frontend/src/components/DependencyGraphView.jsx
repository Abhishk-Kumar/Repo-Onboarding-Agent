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
  Handle,
} from 'reactflow'
import 'reactflow/dist/style.css'
import dagre from 'dagre'

// ─────────────────────────────────────────────────────────────────────────
// COLORS
// ─────────────────────────────────────────────────────────────────────────
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
  agents: '#34d399',
  storage: '#a78bfa',
  schemas: '#60a5fa',
  tools: '#fbbf24',
  default: '#8888a0',
}
function colorFor(name) {
  return FOLDER_COLORS[name] || FOLDER_COLORS.default
}

const EDGE_COLORS = {
  internal: '#3a8c6e', // green-ish: import within the same focused container
  cross: '#6366f1', // indigo: crosses between two visible containers/modules
  aggregated: '#d4992f', // amber: rolled-up many-files-to-one-module link
  flow: '#34d399',
  dim: '#2a2a3e',
}

// ─────────────────────────────────────────────────────────────────────────
// PATH / HIERARCHY HELPERS
// Backend only gives a flat file list where node.id is a relative path
// ("agents/services/auth/login.py"). Everything below is derived from that
// string — there is no folder/tree data from the server.
// ─────────────────────────────────────────────────────────────────────────
function pathParts(p) {
  return (p || '').replace(/\\/g, '/').split('/').filter(Boolean)
}
function topModule(p) {
  const parts = pathParts(p)
  return parts.length ? parts[0] : 'root'
}
function fileName(p) {
  const parts = pathParts(p)
  return parts.length ? parts[parts.length - 1] : p
}
// First-level subfolder *inside* a given module, e.g. inside "agents",
// "agents/services/auth/login.py" -> "services". Files directly under the
// module root (no subfolder) map to null (rendered as direct file nodes).
function subfolderInModule(p, moduleName) {
  const parts = pathParts(p)
  if (parts.length <= 2) return null // module/file.ext — no subfolder
  return parts[1]
}

// Build, for one module, the list of "level-2 groups": either a subfolder
// name (with its own file list) or a direct file. This is what Focus Mode
// (panel 2/3) renders inside the bounded container.
function buildModuleComposition(allFiles, moduleName) {
  const filesInModule = allFiles.filter((f) => topModule(f.id) === moduleName)
  const subfolders = new Map() // name -> file[]
  const directFiles = []

  filesInModule.forEach((f) => {
    const sf = subfolderInModule(f.id, moduleName)
    if (sf === null) {
      directFiles.push(f)
    } else {
      if (!subfolders.has(sf)) subfolders.set(sf, [])
      subfolders.get(sf).push(f)
    }
  })

  return { filesInModule, subfolders, directFiles }
}

// ─────────────────────────────────────────────────────────────────────────
// MODULE-LEVEL AGGREGATION (Overview panel + External door panel)
// ─────────────────────────────────────────────────────────────────────────
function buildModuleSummaries(allFiles) {
  const mods = new Map() // name -> { fileCount, folderSet }
  allFiles.forEach((f) => {
    const mod = topModule(f.id)
    if (!mods.has(mod)) mods.set(mod, { name: mod, fileCount: 0, folderSet: new Set() })
    const m = mods.get(mod)
    m.fileCount += 1
    const sf = subfolderInModule(f.id, mod)
    if (sf) m.folderSet.add(sf)
  })
  return Array.from(mods.values()).map((m) => ({
    name: m.name,
    fileCount: m.fileCount,
    folderCount: m.folderSet.size,
  }))
}

// Aggregate raw file-to-file edges up to module-to-module weighted edges,
// dropping intra-module edges (those are "internal", shown only once focused).
function buildModuleEdges(edges) {
  const map = new Map() // "a->b" -> count
  edges.forEach((e) => {
    const a = topModule(e.source)
    const b = topModule(e.target)
    if (a === b) return
    const key = `${a}->${b}`
    map.set(key, (map.get(key) || 0) + 1)
  })
  return Array.from(map.entries()).map(([key, count]) => {
    const [source, target] = key.split('->')
    return { source, target, count }
  })
}

// For one focused module, how many imports go FROM it TO each other module,
// grouped — this is the data behind the "External Dependencies" door/badge.
function buildExternalBreakdown(edges, moduleName) {
  const map = new Map() // otherModule -> { count, files: Set }
  edges.forEach((e) => {
    const srcMod = topModule(e.source)
    const tgtMod = topModule(e.target)
    let other = null
    let direction = null
    if (srcMod === moduleName && tgtMod !== moduleName) {
      other = tgtMod
      direction = 'out'
    } else if (tgtMod === moduleName && srcMod !== moduleName) {
      other = tgtMod === moduleName ? srcMod : null
      other = srcMod
      direction = 'in'
    }
    if (!other) return
    if (!map.has(other)) map.set(other, { module: other, count: 0, fileEdges: [] })
    const entry = map.get(other)
    entry.count += 1
    entry.fileEdges.push({ source: e.source, target: e.target, direction })
  })
  return Array.from(map.values()).sort((a, b) => b.count - a.count)
}

// ─────────────────────────────────────────────────────────────────────────
// STABLE OVERVIEW LAYOUT — computed once per graph, never recalculated on
// focus/expand. This is what makes modules "stay where they are" while the
// user drills in elsewhere (the single biggest complaint with the old
// implementation, which re-ran dagre on every click and reshuffled
// everything).
// ─────────────────────────────────────────────────────────────────────────
function computeOverviewPositions(moduleSummaries, width = 1000, height = 560) {
  const n = moduleSummaries.length
  const cx = width / 2
  const cy = height / 2
  const rx = Math.max(260, width * 0.36)
  const ry = Math.max(160, height * 0.32)
  const positions = new Map()
  moduleSummaries.forEach((m, i) => {
    const angle = (i / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2
    positions.set(m.name, {
      x: cx + Math.cos(angle) * rx - 90,
      y: cy + Math.sin(angle) * ry - 40,
    })
  })
  return positions
}

// ─────────────────────────────────────────────────────────────────────────
// SMALL DAGRE PASS — used only for laying out the contents *inside* a
// bounded container (the module's subfolders/files, or two file columns in
// the drilldown view). Always scoped to a tiny node set, so it never
// produces the "long edge across an empty canvas" problem.
// ─────────────────────────────────────────────────────────────────────────
function microLayout(nodeIds, edgePairs, direction = 'TB', nodeWidth = 116, nodeHeight = 34, gapX = 14, gapY = 12) {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: direction, nodesep: gapX, ranksep: gapY, marginx: 8, marginy: 8, ranker: 'tight-tree' })
  nodeIds.forEach((id) => g.setNode(id, { width: nodeWidth, height: nodeHeight }))
  const idSet = new Set(nodeIds)
  edgePairs.forEach(([a, b]) => {
    if (idSet.has(a) && idSet.has(b) && a !== b) g.setEdge(a, b)
  })
  dagre.layout(g)
  const positions = new Map()
  let maxX = 0
  let maxY = 0
  nodeIds.forEach((id) => {
    const p = g.node(id)
    const x = p.x - nodeWidth / 2
    const y = p.y - nodeHeight / 2
    positions.set(id, { x, y })
    maxX = Math.max(maxX, x + nodeWidth)
    maxY = Math.max(maxY, y + nodeHeight)
  })
  return { positions, width: maxX + 8, height: maxY + 8 }
}

// ─────────────────────────────────────────────────────────────────────────
// CUSTOM NODE RENDERERS
// ReactFlow's built-in "default" node only shows `data.label` as plain
// text — it can't lay out an icon row, a name, and a small stat line the
// way the target design needs. Each node "kind" below gets its own small
// component instead, all reusing the box `style` computed above for that
// node (passed straight through from React Flow's node.style -> wrapped
// node style prop).
// ─────────────────────────────────────────────────────────────────────────
const fillBox = { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }

function ModuleCardNode({ data }) {
  const { module } = data
  return (
    <div style={{ ...fillBox, flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 4 }}>
      <Handle type="target" position={Position.Top} style={handleDot} />
      <Handle type="source" position={Position.Bottom} style={handleDot} />
      <div style={{ fontSize: 13, fontWeight: 700 }}>{module.name}</div>
      <div style={{ fontSize: 10, fontWeight: 500, opacity: 0.75 }}>
        {module.fileCount} files · {module.folderCount} folders
      </div>
    </div>
  )
}

function ContainerLabelNode({ data }) {
  return (
    <div style={{ ...fillBox, flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center' }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#f0f0f7' }}>{data.module}</div>
      <div style={{ fontSize: 10.5, color: '#8888a0', marginTop: 2 }}>
        {data.fileCount} files · {data.folderCount} folders
      </div>
    </div>
  )
}

function SubfolderNode({ data }) {
  return (
    <div style={fillBox}>
      <Handle type="target" position={Position.Left} style={handleDot} />
      <Handle type="source" position={Position.Right} style={handleDot} />
      <Handle type="target" position={Position.Top} style={handleDot} />
      <Handle type="source" position={Position.Bottom} style={handleDot} />
      <span>📁 {data.name}</span>
      <span style={{ opacity: 0.6, marginLeft: 4 }}>({data.fileCount})</span>
    </div>
  )
}

function FileNode({ data }) {
  return (
    <div style={fillBox}>
      <Handle type="target" position={Position.Left} style={handleDot} />
      <Handle type="source" position={Position.Right} style={handleDot} />
      <Handle type="target" position={Position.Top} style={handleDot} />
      <Handle type="source" position={Position.Bottom} style={handleDot} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 6px' }}>
        {fileName(data.file.id)}
      </span>
    </div>
  )
}

function DoorNode({ data }) {
  return (
    <div style={{ ...fillBox, gap: 6 }}>
      <Handle type="target" position={Position.Left} style={handleDot} />
      <Handle type="source" position={Position.Right} style={handleDot} />
      <span>🔗 External Dependencies</span>
      <span style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 4, padding: '1px 6px', fontSize: 9 }}>{data.count}</span>
    </div>
  )
}

function ExternalBadgeNode({ data }) {
  return (
    <div style={{ ...fillBox, flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center' }}>
      <Handle type="target" position={Position.Left} style={handleDot} />
      <Handle type="source" position={Position.Right} style={handleDot} />
      <span>{data.module}</span>
      <span style={{ opacity: 0.65, fontSize: 9 }}>{data.count} imports</span>
    </div>
  )
}

function DrillFileNode({ data }) {
  return (
    <div style={{ ...fillBox, justifyContent: 'flex-start', paddingLeft: 8 }}>
      <Handle type="target" position={Position.Left} style={handleDot} />
      <Handle type="source" position={Position.Right} style={handleDot} />
      {fileName(data.file.id)}
    </div>
  )
}

const handleDot = { width: 6, height: 6, background: '#4a4a68', border: 'none' }

const NODE_TYPES = {
  'module-card': ModuleCardNode,
  'container-label': ContainerLabelNode,
  'subfolder-node': SubfolderNode,
  'file-node': FileNode,
  door: DoorNode,
  'external-badge': ExternalBadgeNode,
  'drill-file': DrillFileNode,
}

// ─────────────────────────────────────────────────────────────────────────
// FILE SNIPPET / SPOTLIGHT PANEL
// Shown when the user clicks an individual file node, at any level. Shows
// what the file is for, its functions, and its direct dependency lines —
// this is the part that has to stay, per the brief.
// ─────────────────────────────────────────────────────────────────────────
function FileSnippetPanel({ file, edges, allFiles, onClose, onJumpTo }) {
  if (!file) return null

  const outgoing = edges.filter((e) => e.source === file.id)
  const incoming = edges.filter((e) => e.target === file.id)

  const lookup = (id) => allFiles.find((f) => f.id === id)

  return (
    <div
      style={{
        position: 'absolute',
        right: 14,
        top: 14,
        width: 300,
        maxHeight: 'calc(100% - 28px)',
        background: '#15151f',
        border: '1px solid #2a2a3e',
        borderRadius: 12,
        padding: 16,
        overflowY: 'auto',
        zIndex: 20,
        boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
        fontFamily: "'JetBrains Mono', monospace",
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <div>
          <div style={{ color: '#e4e4ec', fontSize: 13, fontWeight: 700 }}>{fileName(file.id)}</div>
          <div style={{ color: '#6e6e85', fontSize: 10, marginTop: 2 }}>{file.id}</div>
        </div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#6e6e85', cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: 2 }}
        >
          ×
        </button>
      </div>

      {file.purpose ? (
        <div style={{ marginTop: 10, fontSize: 11.5, color: '#c7c7d6', lineHeight: 1.5 }}>{file.purpose}</div>
      ) : (
        <div style={{ marginTop: 10, fontSize: 11, color: '#6e6e85', fontStyle: 'italic' }}>
          No summary extracted for this file yet.
        </div>
      )}

      {file.functions && file.functions.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 9.5, color: '#8888a0', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>
            Functions
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {file.functions.slice(0, 10).map((fn) => (
              <span
                key={fn}
                style={{
                  fontSize: 10.5,
                  color: '#a5b4fc',
                  background: 'rgba(99,102,241,0.12)',
                  border: '1px solid rgba(99,102,241,0.3)',
                  borderRadius: 5,
                  padding: '2px 7px',
                }}
              >
                {fn}
              </span>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 9.5, color: EDGE_COLORS.cross, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>
          Imports ({outgoing.length})
        </div>
        {outgoing.length === 0 ? (
          <div style={{ fontSize: 10.5, color: '#5d5d70', fontStyle: 'italic' }}>Nothing — a leaf file.</div>
        ) : (
          outgoing.slice(0, 12).map((e) => {
            const tgt = lookup(e.target)
            return (
              <div
                key={e.target}
                onClick={() => onJumpTo(e.target)}
                style={{
                  fontSize: 10.5,
                  color: '#dcdce6',
                  padding: '4px 8px',
                  marginBottom: 3,
                  borderLeft: `2px solid ${colorFor(topModule(e.target))}`,
                  background: '#1b1b29',
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
              >
                {fileName(e.target)}
                <span style={{ color: '#6e6e85', marginLeft: 6, fontSize: 9 }}>{topModule(e.target)}</span>
              </div>
            )
          })
        )}
      </div>

      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 9.5, color: EDGE_COLORS.aggregated, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>
          Imported by ({incoming.length})
        </div>
        {incoming.length === 0 ? (
          <div style={{ fontSize: 10.5, color: '#5d5d70', fontStyle: 'italic' }}>Nothing depends on this file.</div>
        ) : (
          incoming.slice(0, 12).map((e) => (
            <div
              key={e.source}
              onClick={() => onJumpTo(e.source)}
              style={{
                fontSize: 10.5,
                color: '#dcdce6',
                padding: '4px 8px',
                marginBottom: 3,
                borderLeft: `2px solid ${colorFor(topModule(e.source))}`,
                background: '#1b1b29',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              {fileName(e.source)}
              <span style={{ color: '#6e6e85', marginLeft: 6, fontSize: 9 }}>{topModule(e.source)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// EXTERNAL DEPENDENCIES PANEL (the "door")
// Three states: closed (just the badge on the container), open showing the
// per-module breakdown, or drilled into one module showing exact file pairs.
// ─────────────────────────────────────────────────────────────────────────
function ExternalDoorPanel({ moduleName, breakdown, drilldownModule, onSelectModule, onBack, onClose, fileLookup }) {
  if (!drilldownModule) {
    const total = breakdown.reduce((s, b) => s + b.count, 0)
    return (
      <div
        style={{
          position: 'absolute',
          right: 14,
          top: 14,
          width: 270,
          background: '#15151f',
          border: '1px solid #2a2a3e',
          borderRadius: 12,
          padding: 16,
          zIndex: 20,
          boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ color: '#e4e4ec', fontSize: 12, fontWeight: 700 }}>External Connections</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6e6e85', cursor: 'pointer', fontSize: 15 }}>×</button>
        </div>
        <div style={{ fontSize: 10.5, color: '#9090a8', marginBottom: 12, lineHeight: 1.5 }}>
          <b style={{ color: '#dcdce6' }}>{moduleName}</b> has {total} total imports to {breakdown.length} module
          {breakdown.length === 1 ? '' : 's'}. Click one to see file-level connections.
        </div>
        {breakdown.map((b) => (
          <div
            key={b.module}
            onClick={() => onSelectModule(b.module)}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '8px 10px',
              marginBottom: 6,
              background: '#1b1b29',
              border: `1px solid ${colorFor(b.module)}55`,
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            <span style={{ color: colorFor(b.module), fontSize: 11, fontWeight: 600 }}>{b.module}</span>
            <span style={{ color: '#9090a8', fontSize: 10.5 }}>{b.count} imports ›</span>
          </div>
        ))}
      </div>
    )
  }

  // Drilled into one specific external module — show exact file pairs as a
  // short two-column list (positions handled by the caller in-canvas; this
  // panel just shows the textual connection details alongside it).
  const entry = breakdown.find((b) => b.module === drilldownModule)
  const pairs = entry ? entry.fileEdges : []
  return (
    <div
      style={{
        position: 'absolute',
        right: 14,
        top: 14,
        width: 270,
        background: '#15151f',
        border: '1px solid #2a2a3e',
        borderRadius: 12,
        padding: 16,
        zIndex: 20,
        boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
        fontFamily: "'JetBrains Mono', monospace",
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#6e6e85', cursor: 'pointer', fontSize: 11 }}>‹ Back</button>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6e6e85', cursor: 'pointer', fontSize: 15 }}>×</button>
      </div>
      <div style={{ color: '#e4e4ec', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
        {moduleName} → {drilldownModule}
      </div>
      <div style={{ fontSize: 10.5, color: '#9090a8', marginBottom: 12, lineHeight: 1.5 }}>
        {pairs.length} file-level import{pairs.length === 1 ? '' : 's'} between these modules.
      </div>
      {pairs.slice(0, 14).map((p, i) => (
        <div key={i} style={{ fontSize: 10, color: '#c7c7d6', padding: '4px 0', borderBottom: '1px solid #232333' }}>
          {fileName(p.source)} <span style={{ color: '#5d5d70' }}>→</span> {fileName(p.target)}
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// MAIN GRAPH
// ─────────────────────────────────────────────────────────────────────────
function GraphInner({ graph, onNodeClick, onNodeContextMenu, highlightedNodes, numberedNodes, flowPath, selectedFile }) {
  const allFiles = useMemo(() => (graph && Array.isArray(graph.nodes) ? graph.nodes : []), [graph])
  const allEdges = useMemo(() => (graph && Array.isArray(graph.edges) ? graph.edges : []), [graph])

  const moduleSummaries = useMemo(() => buildModuleSummaries(allFiles), [allFiles])
  const moduleEdges = useMemo(() => buildModuleEdges(allEdges), [allEdges])

  // Overview positions are computed ONCE per graph (keyed by module name
  // set) and never touched again — this is what keeps every module
  // anchored in place while the user focuses/unfocuses others.
  const overviewPositionsRef = useRef(null)
  const overviewKeyRef = useRef(null)
  const overviewPositions = useMemo(() => {
    const key = moduleSummaries.map((m) => m.name).sort().join(',')
    if (overviewKeyRef.current !== key) {
      overviewPositionsRef.current = computeOverviewPositions(moduleSummaries)
      overviewKeyRef.current = key
    }
    return overviewPositionsRef.current
  }, [moduleSummaries])

  // ── Navigation state ──
  const [focusModule, setFocusModule] = useState(null) // Layer 1 -> 2
  const [openSubfolder, setOpenSubfolder] = useState(null) // Layer 2 -> 3 (within focusModule)
  const [doorOpen, setDoorOpen] = useState(false) // external badge clicked
  const [doorDrilldown, setDoorDrilldown] = useState(null) // a specific external module selected
  const [spotlightFile, setSpotlightFile] = useState(null) // file-click snippet panel
  const [direction, setDirection] = useState('TB')

  const { fitView } = useReactFlow()

  // Reset all drill state when a genuinely new repo graph loads.
  const identityRef = useRef(null)
  useEffect(() => {
    const id = `${allFiles.length}:${allFiles[0]?.id || ''}`
    if (identityRef.current !== null && identityRef.current !== id) {
      setFocusModule(null)
      setOpenSubfolder(null)
      setDoorOpen(false)
      setDoorDrilldown(null)
      setSpotlightFile(null)
    }
    identityRef.current = id
  }, [allFiles])

  const exitFocus = useCallback(() => {
    setFocusModule(null)
    setOpenSubfolder(null)
    setDoorOpen(false)
    setDoorDrilldown(null)
  }, [])

  const goBackOneLevel = useCallback(() => {
    if (doorDrilldown) return setDoorDrilldown(null)
    if (doorOpen) return setDoorOpen(false)
    if (openSubfolder) return setOpenSubfolder(null)
    if (focusModule) return exitFocus()
  }, [doorDrilldown, doorOpen, openSubfolder, focusModule, exitFocus])

  // If something external (search, "start here", flow trace) selects a file
  // that lives in a module/subfolder we're not currently focused on, jump
  // the view there so the result is never hidden.
  useEffect(() => {
    if (!selectedFile) return
    const mod = topModule(selectedFile)
    if (mod && mod !== focusModule) {
      setFocusModule(mod)
      const sf = subfolderInModule(selectedFile, mod)
      setOpenSubfolder(sf)
    }
    setSpotlightFile(allFiles.find((f) => f.id === selectedFile) || null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFile])

  // ── Composition of the currently focused module (subfolders + direct files) ──
  const composition = useMemo(() => {
    if (!focusModule) return null
    return buildModuleComposition(allFiles, focusModule)
  }, [allFiles, focusModule])

  const externalBreakdown = useMemo(() => {
    if (!focusModule) return []
    return buildExternalBreakdown(allEdges, focusModule)
  }, [allEdges, focusModule])

  // ── Build the node/edge set for whichever view is active ──
  const built = useMemo(() => {
    const nodes = []
    const edges = []
    const CARD_W = 220
    const CARD_H = 86

    if (!focusModule) {
      // ─── OVERVIEW: every module as a stable card, aggregated cross-module
      // lines only (panel 1) ───
      moduleSummaries.forEach((m) => {
        const pos = overviewPositions.get(m.name) || { x: 0, y: 0 }
        nodes.push({
          id: `mod:${m.name}`,
          type: 'default',
          position: pos,
          data: { kind: 'module-card', module: m },
          style: moduleCardStyle(m.name, false, false),
        })
      })
      moduleEdges.forEach((me, i) => {
        edges.push({
          id: `me${i}`,
          source: `mod:${me.source}`,
          target: `mod:${me.target}`,
          label: `${me.count}`,
          labelStyle: { fill: '#8888a0', fontSize: 9 },
          labelBgStyle: { fill: '#101018' },
          style: { stroke: EDGE_COLORS.aggregated, strokeWidth: Math.min(1 + me.count * 0.3, 4), opacity: 0.55, curvature: 0.5 },
          type: 'default',
          markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_COLORS.aggregated, width: 14, height: 14 },
        })
      })
      return { nodes: nodes.map((n) => ({ ...n, type: n.data?.kind || 'default' })), edges, containerBox: null }
    }

    // ─── FOCUS MODE: faded module cards in their stable overview positions
    // + one bounded container for the focused module (panels 2-4) ───
    const focusPos = overviewPositions.get(focusModule) || { x: 0, y: 0 }
    // Container sits centered near the focused module's anchor point, large
    // enough to hold its internal mini-layout.
    const containerX = Math.max(40, focusPos.x - 140)
    const containerY = Math.max(40, focusPos.y - 60)

    moduleSummaries.forEach((m) => {
      if (m.name === focusModule) return // rendered as the container itself, not a card
      const pos = overviewPositions.get(m.name) || { x: 0, y: 0 }
      nodes.push({
        id: `mod:${m.name}`,
        type: 'default',
        position: pos,
        data: { kind: 'module-card', module: m },
        style: moduleCardStyle(m.name, true, false),
      })
    })

    // Internal composition group ids: subfolders + direct files, in stable
    // alphabetical order so re-renders don't jitter ordering.
    const groupIds = []
    const groupMeta = new Map()
    Array.from(composition.subfolders.keys())
      .sort()
      .forEach((sf) => {
        const id = `sf:${focusModule}/${sf}`
        groupIds.push(id)
        groupMeta.set(id, { kind: 'subfolder', name: sf, files: composition.subfolders.get(sf) })
      })
    composition.directFiles
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))
      .forEach((f) => {
        groupIds.push(f.id)
        groupMeta.set(f.id, { kind: 'file', file: f })
      })

    // If a subfolder is opened, swap it out for its individual files
    // (Layer 3 — internal logic). Only that one subfolder expands; siblings
    // remain as single summary nodes.
    let innerIds = groupIds
    let innerMeta = groupMeta
    if (openSubfolder) {
      innerIds = []
      innerMeta = new Map()
      groupIds.forEach((id) => {
        const meta = groupMeta.get(id)
        if (meta.kind === 'subfolder' && meta.name === openSubfolder) {
          meta.files
            .slice()
            .sort((a, b) => a.id.localeCompare(b.id))
            .forEach((f) => {
              innerIds.push(f.id)
              innerMeta.set(f.id, { kind: 'file', file: f, fromSubfolder: openSubfolder })
            })
        } else {
          innerIds.push(id)
          innerMeta.set(id, meta)
        }
      })
    }

    // Internal-only edges: both endpoints currently represented inside this
    // container (file<->file if both visible as files, or rolled up to the
    // subfolder summary node if one/both endpoints are inside a still-
    // collapsed subfolder).
    const idForFile = (fid) => {
      if (innerMeta.has(fid)) return fid // visible directly (direct file, or inside opened subfolder)
      // otherwise it belongs to a still-collapsed subfolder within this module
      const sf = subfolderInModule(fid, focusModule)
      const candidate = `sf:${focusModule}/${sf}`
      return innerMeta.has(candidate) ? candidate : null
    }

    const internalEdgeMap = new Map()
    allEdges.forEach((e) => {
      if (topModule(e.source) !== focusModule || topModule(e.target) !== focusModule) return
      const a = idForFile(e.source)
      const b = idForFile(e.target)
      if (!a || !b || a === b) return
      const key = `${a}->${b}`
      internalEdgeMap.set(key, (internalEdgeMap.get(key) || 0) + 1)
    })

    const microPairs = Array.from(internalEdgeMap.keys()).map((k) => k.split('->'))
    const { positions: microPos, width: microW, height: microH } = microLayout(innerIds, microPairs, direction)

    const containerW = Math.max(CARD_W + 40, microW + 60)
    const containerH = Math.max(CARD_H + 40, microH + 150)

    nodes.push({
      id: `container:${focusModule}`,
      type: 'default',
      position: { x: containerX, y: containerY },
      data: { kind: 'container-label', module: focusModule, fileCount: composition.filesInModule.length, folderCount: composition.subfolders.size },
      style: containerLabelStyle(containerW),
      draggable: false,
      selectable: false,
    })

    innerIds.forEach((id) => {
      const meta = innerMeta.get(id)
      const p = microPos.get(id) || { x: 0, y: 0 }
      const absPos = { x: containerX + p.x + 20, y: containerY + p.y + 64 }
      if (meta.kind === 'subfolder') {
        nodes.push({
          id,
          type: 'default',
          position: absPos,
          data: { kind: 'subfolder-node', name: meta.name, fileCount: meta.files.length },
          style: subfolderNodeStyle(),
        })
      } else {
        const f = meta.file
        nodes.push({
          id,
          type: 'default',
          position: absPos,
          data: { kind: 'file-node', file: f },
          style: fileNodeStyle(f, highlightedNodes, flowPath, selectedFile, spotlightFile),
        })
      }
    })

    Array.from(internalEdgeMap.entries()).forEach(([key, count], i) => {
      const [a, b] = key.split('->')
      const isFlow = flowPath?.has(a) && flowPath?.has(b)
      edges.push({
        id: `ie${i}`,
        source: a,
        target: b,
        animated: isFlow,
        label: count > 1 ? `${count}` : undefined,
        labelStyle: { fill: '#8888a0', fontSize: 8 },
        labelBgStyle: { fill: '#101018' },
        style: { stroke: isFlow ? EDGE_COLORS.flow : EDGE_COLORS.internal, strokeWidth: isFlow ? 2.2 : 1.3, opacity: 0.85 },
        markerEnd: { type: MarkerType.ArrowClosed, color: isFlow ? EDGE_COLORS.flow : EDGE_COLORS.internal, width: 10, height: 10 },
        zIndex: 5,
      })
    })

    // "Door" node fixed to the container's right edge.
    const doorId = `door:${focusModule}`
    const doorPos = { x: containerX + containerW - 6, y: containerY + containerH - 34 }
    nodes.push({
      id: doorId,
      type: 'default',
      position: doorPos,
      data: { kind: 'door', count: externalBreakdown.reduce((s, b) => s + b.count, 0), moduleCount: externalBreakdown.length },
      style: doorNodeStyle(containerW),
    })

    if (doorOpen && !doorDrilldown) {
      // Fan out badge nodes for each external module, fixed short distance
      // to the right of the door — never touching the far side of the
      // canvas, edges stay short by construction.
      externalBreakdown.forEach((b, i) => {
        const bx = doorPos.x + 230
        const by = doorPos.y - (externalBreakdown.length - 1) * 22 + i * 44
        const badgeId = `badge:${b.module}`
        nodes.push({
          id: badgeId,
          type: 'default',
          position: { x: bx, y: by },
          data: { kind: 'external-badge', module: b.module, count: b.count },
          style: externalBadgeStyle(b.module),
        })
        edges.push({
          id: `de${i}`,
          source: doorId,
          target: badgeId,
          style: { stroke: EDGE_COLORS.aggregated, strokeWidth: 1.4, opacity: 0.8 },
          markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_COLORS.aggregated, width: 10, height: 10 },
        })
      })
    }

    if (doorDrilldown) {
      // Two short columns: focused module's files (that actually import the
      // target) on the left, target module's files on the right — close
      // together so connecting edges stay short.
      const entry = externalBreakdown.find((b) => b.module === doorDrilldown)
      const pairs = entry ? entry.fileEdges : []
      const leftFiles = Array.from(new Set(pairs.map((p) => p.source)))
      const rightFiles = Array.from(new Set(pairs.map((p) => p.target)))

      const colX1 = doorPos.x + 200
      const colX2 = colX1 + 200
      const rowH = 30
      const startY = doorPos.y - (Math.max(leftFiles.length, rightFiles.length) * rowH) / 2

      const leftPosById = new Map()
      leftFiles.forEach((fid, i) => {
        const id = `dl:${fid}`
        leftPosById.set(fid, id)
        nodes.push({
          id,
          type: 'default',
          position: { x: colX1, y: startY + i * rowH },
          data: { kind: 'drill-file', file: allFiles.find((f) => f.id === fid) || { id: fid } },
          style: drillFileStyle(focusModule),
        })
      })
      const rightPosById = new Map()
      rightFiles.forEach((fid, i) => {
        const id = `dr:${fid}`
        rightPosById.set(fid, id)
        nodes.push({
          id,
          type: 'default',
          position: { x: colX2, y: startY + i * rowH },
          data: { kind: 'drill-file', file: allFiles.find((f) => f.id === fid) || { id: fid } },
          style: drillFileStyle(doorDrilldown),
        })
      })
      pairs.forEach((p, i) => {
        const s = leftPosById.get(p.source)
        const t = rightPosById.get(p.target)
        if (!s || !t) return
        edges.push({
          id: `dfe${i}`,
          source: s,
          target: t,
          style: { stroke: EDGE_COLORS.cross, strokeWidth: 1.2, opacity: 0.7 },
          markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_COLORS.cross, width: 9, height: 9 },
        })
      })
    }

    const normalizedNodes = nodes.map((n) => ({ ...n, type: n.data?.kind || 'default' }))
    return { nodes: normalizedNodes, edges, containerBox: { x: containerX, y: containerY, w: containerW, h: containerH } }
  }, [
    focusModule,
    openSubfolder,
    doorOpen,
    doorDrilldown,
    composition,
    externalBreakdown,
    moduleSummaries,
    moduleEdges,
    overviewPositions,
    allEdges,
    allFiles,
    direction,
    highlightedNodes,
    flowPath,
    selectedFile,
    spotlightFile,
  ])

  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edgesState, setEdges, onEdgesChange] = useEdgesState([])

  useEffect(() => {
    setNodes(built.nodes)
    setEdges(built.edges)
  }, [built, setNodes, setEdges])

  const fittedKeyRef = useRef(null)
  useEffect(() => {
    const key = `${focusModule || ''}|${openSubfolder || ''}|${doorOpen}|${doorDrilldown || ''}`
    if (fittedKeyRef.current !== key && nodes.length > 0) {
      fittedKeyRef.current = key
      setTimeout(() => fitView({ padding: 0.25, duration: 450 }), 40)
    }
  }, [focusModule, openSubfolder, doorOpen, doorDrilldown, nodes.length, fitView])

  // ── Click handling ──
  const handleNodeClick = useCallback(
    (event, node) => {
      const kind = node.data?.kind
      if (kind === 'module-card') {
        const modName = node.data.module.name
        if (modName === focusModule) return
        setFocusModule(modName)
        setOpenSubfolder(null)
        setDoorOpen(false)
        setDoorDrilldown(null)
        return
      }
      if (kind === 'subfolder-node') {
        setOpenSubfolder(node.data.name)
        return
      }
      if (kind === 'door') {
        setDoorOpen((v) => !v)
        setDoorDrilldown(null)
        return
      }
      if (kind === 'external-badge') {
        setDoorDrilldown(node.data.module)
        return
      }
      if (kind === 'file-node' || kind === 'drill-file') {
        const f = node.data.file
        setSpotlightFile(f)
        if (typeof onNodeClick === 'function') onNodeClick(f.id)
        return
      }
      if (typeof onNodeClick === 'function') onNodeClick(node.id)
    },
    [focusModule, onNodeClick]
  )

  const handleContextMenu = useCallback(
    (event, node) => {
      event.preventDefault()
      const kind = node.data?.kind
      if (kind === 'file-node' || kind === 'drill-file' || kind === 'subfolder-node' || kind === 'module-card') {
        goBackOneLevel()
        return
      }
      if (typeof onNodeContextMenu === 'function') onNodeContextMenu(node.id)
    },
    [goBackOneLevel, onNodeContextMenu]
  )

  const jumpToFile = useCallback(
    (fid) => {
      const mod = topModule(fid)
      if (mod !== focusModule) {
        setFocusModule(mod)
        setOpenSubfolder(subfolderInModule(fid, mod))
        setDoorOpen(false)
        setDoorDrilldown(null)
      }
      setSpotlightFile(allFiles.find((f) => f.id === fid) || { id: fid })
    },
    [focusModule, allFiles]
  )

  if (allFiles.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: 14 }}>
        No dependency graph data available.
      </div>
    )
  }

  return (
    <div style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%', width: '100%', position: 'relative' }}>
      {/* Breadcrumb */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 14px',
          fontSize: 11.5,
          color: '#8888a0',
          fontFamily: "'JetBrains Mono', monospace",
          borderBottom: '1px solid var(--color-border)',
          flexShrink: 0,
        }}
      >
        <button onClick={exitFocus} style={crumbBtnStyle(!focusModule)}>
          🏠 Repository
        </button>
        {focusModule && (
          <>
            <span style={{ color: '#33334a' }}>/</span>
            <button onClick={() => { setOpenSubfolder(null); setDoorOpen(false); setDoorDrilldown(null) }} style={crumbBtnStyle(!openSubfolder && !doorOpen)}>
              {focusModule}
            </button>
          </>
        )}
        {openSubfolder && (
          <>
            <span style={{ color: '#33334a' }}>/</span>
            <span style={crumbBtnStyle(true)}>{openSubfolder}</span>
          </>
        )}
        {doorOpen && !doorDrilldown && (
          <>
            <span style={{ color: '#33334a' }}>/</span>
            <span style={crumbBtnStyle(true)}>external ▸</span>
          </>
        )}
        {doorDrilldown && (
          <>
            <span style={{ color: '#33334a' }}>/</span>
            <span style={crumbBtnStyle(true)}>external ▸ {doorDrilldown}</span>
          </>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>{allFiles.length} files</span>
          <span style={{ color: '#33334a' }}>|</span>
          <span>{allEdges.length} dependencies</span>
          {focusModule && (
            <button onClick={() => setDirection((d) => (d === 'TB' ? 'LR' : 'TB'))} style={ghostBtnStyle}>
              {direction === 'TB' ? '→ Horizontal' : '↓ Vertical'}
            </button>
          )}
          {focusModule && (
            <button onClick={exitFocus} style={primaryBtnStyle}>
              Exit Focus Mode
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: '1 1 auto', minHeight: 480, position: 'relative', width: '100%' }}>
        <ReactFlow
          nodes={nodes}
          edges={edgesState}
          nodeTypes={NODE_TYPES}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          onNodeContextMenu={handleContextMenu}
          panOnDrag
          panOnScroll
          zoomOnScroll={false}
          zoomOnPinch
          zoomActivationKeyCode={['Meta', 'Control']}
          nodesDraggable={false}
          attributionPosition="bottom-left"
          minZoom={0.08}
          maxZoom={2}
          style={{ background: 'var(--color-bg)', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        >
          <Controls style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8 }} />
          <Background color="#1a1a2e" gap={20} />
        </ReactFlow>

        {!focusModule && (
          <div style={hintBoxStyle}>Click a module to focus on it</div>
        )}
        {focusModule && !doorOpen && !doorDrilldown && !spotlightFile && (
          <div style={hintBoxStyle}>Click a folder to look inside · click the door for external links · right-click to go back</div>
        )}

        {doorOpen && (
          <ExternalDoorPanel
            moduleName={focusModule}
            breakdown={externalBreakdown}
            drilldownModule={doorDrilldown}
            onSelectModule={setDoorDrilldown}
            onBack={() => setDoorDrilldown(null)}
            onClose={() => {
              setDoorOpen(false)
              setDoorDrilldown(null)
            }}
          />
        )}

        {!doorOpen && spotlightFile && (
          <FileSnippetPanel file={spotlightFile} edges={allEdges} allFiles={allFiles} onClose={() => setSpotlightFile(null)} onJumpTo={jumpToFile} />
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// STYLE HELPERS
// ─────────────────────────────────────────────────────────────────────────
function moduleCardStyle(name, faded, active) {
  const c = colorFor(name)
  return {
    width: 220,
    minHeight: 80,
    background: faded ? '#13131c' : `${c}14`,
    border: `2px solid ${faded ? '#26263a' : c}`,
    borderRadius: 14,
    padding: '10px 14px',
    color: faded ? '#55556b' : '#e9e9f2',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 13,
    fontWeight: 700,
    cursor: faded ? 'default' : 'pointer',
    opacity: faded ? 0.45 : 1,
    transition: 'opacity 0.35s ease, border-color 0.35s ease',
    boxShadow: faded ? 'none' : `0 0 24px ${c}22`,
    pointerEvents: faded ? 'none' : 'auto',
  }
}

function containerLabelStyle(width) {
  return {
    width,
    height: 56,
    background: 'transparent',
    border: 'none',
    color: '#dcdce6',
    fontFamily: "'JetBrains Mono', monospace",
    pointerEvents: 'none',
    padding: 0,
  }
}

function subfolderNodeStyle() {
  return {
    width: 116,
    height: 34,
    background: '#181826',
    border: '1.5px dashed #4a4a68',
    borderRadius: 8,
    color: '#c7c7d6',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }
}

function fileNodeStyle(f, highlightedNodes, flowPath, selectedFile, spotlightFile) {
  const c = colorFor(topModule(f.id))
  const isHighlighted = highlightedNodes?.has(f.id)
  const isFlow = flowPath?.has(f.id)
  const isSelected = selectedFile === f.id
  const isSpotlit = spotlightFile?.id === f.id
  return {
    width: 116,
    height: 34,
    background: isSpotlit
      ? 'linear-gradient(135deg,#6366f1,#7c3aed)'
      : isFlow
      ? 'linear-gradient(135deg,#34d399,#059669)'
      : isSelected
      ? 'linear-gradient(135deg,#6366f1,#7c3aed)'
      : '#14141f',
    border: `1.5px solid ${isFlow ? EDGE_COLORS.flow : isSpotlit || isSelected ? '#8b8bf5' : isHighlighted ? '#6366f1' : c}`,
    borderRadius: 7,
    color: '#e4e4ec',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 9.5,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: highlightedNodes && highlightedNodes.size > 0 && !isHighlighted && !isSelected ? 0.3 : 1,
    transition: 'all 0.25s ease',
  }
}

function doorNodeStyle(containerW) {
  return {
    width: 200,
    height: 30,
    background: 'rgba(212,153,47,0.1)',
    border: `1.5px dashed ${EDGE_COLORS.aggregated}`,
    borderRadius: 8,
    color: '#e0b658',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 9.5,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  }
}

function externalBadgeStyle(moduleName) {
  const c = colorFor(moduleName)
  return {
    width: 150,
    height: 38,
    background: '#181826',
    border: `1.5px solid ${c}`,
    borderRadius: 8,
    color: '#e4e4ec',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10.5,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '0 10px',
  }
}

function drillFileStyle(moduleName) {
  const c = colorFor(moduleName)
  return {
    width: 168,
    height: 24,
    background: '#14141f',
    border: `1px solid ${c}88`,
    borderRadius: 6,
    color: '#dcdce6',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 9,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    paddingLeft: 8,
  }
}

function crumbBtnStyle(active) {
  return {
    background: 'none',
    border: 'none',
    color: active ? '#e9e9f2' : '#8888a0',
    fontWeight: active ? 700 : 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 'inherit',
    padding: '2px 4px',
  }
}

const ghostBtnStyle = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 6,
  color: 'var(--color-text-muted)',
  fontSize: 11,
  fontFamily: 'inherit',
  padding: '4px 10px',
  cursor: 'pointer',
}

const primaryBtnStyle = {
  background: 'rgba(99,102,241,0.15)',
  border: '1px solid #6366f1',
  borderRadius: 6,
  color: '#a5b4fc',
  fontSize: 11,
  fontFamily: 'inherit',
  padding: '4px 10px',
  cursor: 'pointer',
}

const hintBoxStyle = {
  position: 'absolute',
  bottom: 12,
  left: 12,
  fontSize: 10,
  color: 'var(--color-text-muted)',
  background: 'rgba(20,20,31,0.85)',
  border: '1px solid var(--color-border)',
  borderRadius: 6,
  padding: '4px 9px',
  pointerEvents: 'none',
  fontFamily: "'JetBrains Mono', monospace",
}

export default function DependencyGraphView(props) {
  return (
    <ReactFlowProvider>
      <GraphInner {...props} />
    </ReactFlowProvider>
  )
}
