"use client"

import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useViewport,
  type Edge,
  type Node,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { fetchRepoGraph } from "@/lib/codeatlas/api"
import { useCodeAtlas } from "@/lib/codeatlas/context"
import type { RepoEdge, RepoFileNode, RepoGraph, TechBadge } from "@/lib/codeatlas/types"
import { NodePopover } from "./node-popover"
import { TechStackStrip } from "./tech-stack-strip"
import { GraphSkeleton } from "../skeletons"

const COLORS = {
  bg: "#0a0a12",
  surface: "#13131f",
  surfaceHover: "#1a1a2e",
  border: "#2a2a3e",
  borderHover: "#3a3a5e",
  text: "#e4e4ec",
  textMuted: "#8888a0",
  textDim: "#555570",
  accent: "#6366f1",
  accentGlow: "rgba(99,102,241,0.25)",
  success: "#34d399",
  warning: "#fbbf24",
  danger: "#f87171",
  info: "#60a5fa",
}

const MODULE_PALETTE = [
  "#6366f1", "#34d399", "#f472b6", "#fb923c", "#60a5fa",
  "#f87171", "#a78bfa", "#2dd4bf", "#fbbf24", "#e879f9",
  "#38bdf8", "#a3e635", "#fb7185", "#818cf8", "#22d3ee",
]

type GraphNode = RepoFileNode & {
  language: string
  functions: string[]
  classes: string[]
  purpose: string
}

function detectLanguage(id: string): string {
  const ext = id.split(".").pop()?.toLowerCase()
  const map: Record<string, string> = {
    py: "python",
    js: "javascript",
    jsx: "jsx",
    ts: "typescript",
    tsx: "tsx",
    java: "java",
    go: "go",
    rs: "rust",
    cpp: "cpp",
    c: "c",
    h: "c",
    hpp: "cpp",
    html: "html",
    css: "css",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    md: "markdown",
  }
  return map[ext || ""] || "unknown"
}

function enhanceGraph(graph: RepoGraph) {
  return {
    ...graph,
    nodes: graph.nodes.map(
      (n): GraphNode => ({
        ...n,
        language: detectLanguage(n.id),
        functions: [],
        classes: [],
        purpose: n.description,
      }),
    ),
  }
}

function pathParts(p: string) {
  return (p || "").replace(/\\/g, "/").split("/").filter(Boolean)
}

function topModule(p: string) {
  const parts = pathParts(p)
  return parts.length ? parts[0] : "root"
}

function fileName(p: string) {
  const parts = pathParts(p)
  return parts.length ? parts[parts.length - 1] : p
}

function subfolderInModule(p: string, moduleName: string) {
  const parts = pathParts(p)
  if (parts.length <= 2) return null
  return parts[1]
}

function getLanguageIcon(lang: string) {
  const map: Record<string, string> = {
    python: "🐍", javascript: "JS", typescript: "TS", jsx: "⚛️", tsx: "⚛️",
    java: "☕", go: "Go", rust: "🦀", cpp: "C++", c: "C",
    html: "🌐", css: "🎨", json: "{}", yaml: "📋", markdown: "📝",
  }
  return map[lang?.toLowerCase()] || "📄"
}

function getModuleColor(moduleName: string) {
  const hash = moduleName.split("").reduce((a, c) => a + c.charCodeAt(0), 0)
  return MODULE_PALETTE[hash % MODULE_PALETTE.length]
}

function buildModuleComposition(allFiles: GraphNode[], moduleName: string) {
  const filesInModule = allFiles.filter((f) => topModule(f.id) === moduleName)
  const subfolders = new Map<string, GraphNode[]>()
  const directFiles: GraphNode[] = []
  filesInModule.forEach((f) => {
    const sf = subfolderInModule(f.id, moduleName)
    if (sf === null) {
      directFiles.push(f)
    } else {
      if (!subfolders.has(sf)) subfolders.set(sf, [])
      subfolders.get(sf)!.push(f)
    }
  })
  return { filesInModule, subfolders, directFiles }
}

function buildModuleSummaries(allFiles: GraphNode[]) {
  const mods = new Map<string, { name: string; fileCount: number; folderSet: Set<string> }>()
  allFiles.forEach((f) => {
    const mod = topModule(f.id)
    if (!mods.has(mod)) mods.set(mod, { name: mod, fileCount: 0, folderSet: new Set() })
    const m = mods.get(mod)!
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

function buildModuleEdges(edges: RepoEdge[]) {
  const map = new Map<string, number>()
  edges.forEach((e) => {
    const a = topModule(e.source)
    const b = topModule(e.target)
    if (a === b) return
    const key = `${a}->${b}`
    map.set(key, (map.get(key) || 0) + 1)
  })
  return Array.from(map.entries()).map(([key, count]) => {
    const [source, target] = key.split("->")
    return { source, target, count }
  })
}

function buildExternalBreakdown(edges: RepoEdge[], moduleName: string) {
  const map = new Map<string, { module: string; count: number; fileEdges: { source: string; target: string }[] }>()
  edges.forEach((e) => {
    const srcMod = topModule(e.source)
    const tgtMod = topModule(e.target)
    let other: string | null = null
    if (srcMod === moduleName && tgtMod !== moduleName) {
      other = tgtMod
    } else if (tgtMod === moduleName && srcMod !== moduleName) {
      other = srcMod
    }
    if (!other) return
    if (!map.has(other)) map.set(other, { module: other, count: 0, fileEdges: [] })
    const entry = map.get(other)!
    entry.count += 1
    entry.fileEdges.push({ source: e.source, target: e.target })
  })
  return Array.from(map.values()).sort((a, b) => b.count - a.count)
}

function computeOverviewPositions(moduleSummaries: { name: string }[], width = 1200, height = 700) {
  const n = moduleSummaries.length
  const cx = width / 2
  const cy = height / 2
  const rx = Math.max(300, width * 0.38)
  const ry = Math.max(200, height * 0.35)
  const positions = new Map<string, { x: number; y: number }>()
  moduleSummaries.forEach((m, i) => {
    const angle = (i / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2
    positions.set(m.name, {
      x: cx + Math.cos(angle) * rx - 110,
      y: cy + Math.sin(angle) * ry - 50,
    })
  })
  return positions
}

function gridWrapLayout(items: string[], opts: {
  itemWidth?: number
  itemHeight?: number
  gapX?: number
  gapY?: number
  maxCols?: number
  startX?: number
  startY?: number
} = {}) {
  const itemW = opts.itemWidth || 164
  const itemH = opts.itemHeight || 52
  const gapX = opts.gapX || 16
  const gapY = opts.gapY || 14
  const maxCols = opts.maxCols || 4
  const startX = opts.startX || 20
  const startY = opts.startY || 60

  const positions = new Map<string, { x: number; y: number }>()
  items.forEach((id, i) => {
    const col = i % maxCols
    const row = Math.floor(i / maxCols)
    positions.set(id, {
      x: startX + col * (itemW + gapX),
      y: startY + row * (itemH + gapY),
    })
  })

  const cols = Math.min(items.length, maxCols)
  const rows = Math.ceil(items.length / maxCols)
  const width = startX + cols * (itemW + gapX) - gapX + 20
  const height = startY + rows * (itemH + gapY) + 20

  return { positions, width, height }
}

function ModuleCard({ data }: { data: Record<string, unknown> }) {
  const color = (data.color as string) || COLORS.accent
  const stats = (data.stats as { fileCount: number; folderCount: number }) || { fileCount: 0, folderCount: 0 }
  const isBackground = !!data.isBackground

  return (
    <div
      style={{
        width: 220,
        padding: "16px 18px",
        background: isBackground ? "#13131c" : `${color}14`,
        border: `2px solid ${isBackground ? "#2a2a3e" : color}`,
        borderRadius: 14,
        color: isBackground ? "#555570" : COLORS.text,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        cursor: isBackground ? "default" : "pointer",
        opacity: isBackground ? 0.85 : 1,
        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        boxShadow: isBackground ? "none" : `0 0 28px ${color}20`,
        position: "relative",
        overflow: "hidden",
        pointerEvents: isBackground ? "none" : "auto",
      }}
      onMouseEnter={(e) => {
        if (!isBackground) {
          e.currentTarget.style.background = `${color}22`
          e.currentTarget.style.boxShadow = `0 0 40px ${color}40`
          e.currentTarget.style.transform = "translateY(-3px) scale(1.02)"
        }
      }}
      onMouseLeave={(e) => {
        if (!isBackground) {
          e.currentTarget.style.background = `${color}14`
          e.currentTarget.style.boxShadow = `0 0 28px ${color}20`
          e.currentTarget.style.transform = "translateY(0) scale(1)"
        }
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{
          width: 10, height: 10, borderRadius: 3,
          background: color,
          boxShadow: `0 0 10px ${color}`,
          opacity: isBackground ? 0.3 : 1,
        }} />
        <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.3px" }}>
          {data.label as string}
        </span>
      </div>

      <div style={{ display: "flex", gap: 12, fontSize: 11, color: isBackground ? "#444455" : COLORS.textMuted }}>
        <span>{stats.fileCount} files</span>
        <span>{stats.folderCount} folders</span>
      </div>

      {(data.externalDepCount as number) > 0 && !isBackground && (
        <div style={{
          marginTop: 10,
          paddingTop: 10,
          borderTop: `1px solid ${color}30`,
          fontSize: 10,
          color: `${color}cc`,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}>
          <span>🔗</span>
          <span>{(data.externalDepCount as number)} cross-module imports</span>
        </div>
      )}

      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  )
}

function ContainerNode({ data }: { data: Record<string, unknown> }) {
  const color = (data.color as string) || COLORS.accent
  const onClose = data.onClose as (() => void) | undefined
  return (
    <div
      style={{
        width: (data.width as number) || 700,
        height: (data.height as number) || 400,
        background: `${COLORS.surface}cc`,
        border: `2px solid ${color}50`,
        borderRadius: 16,
        position: "relative",
        boxShadow: `0 0 40px ${color}15, inset 0 0 60px ${color}05`,
        pointerEvents: "none",
      }}
    >
      <div style={{
        position: "absolute",
        top: 0, left: 0, right: 0,
        height: 48,
        background: `${color}15`,
        borderBottom: `1px solid ${color}30`,
        borderRadius: "16px 16px 0 0",
        display: "flex",
        alignItems: "center",
        padding: "0 18px",
        gap: 10,
      }}>
        <div style={{ width: 10, height: 10, borderRadius: 3, background: color, boxShadow: `0 0 8px ${color}` }} />
        <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>{data.label as string}</span>
        <span style={{ fontSize: 10, color: COLORS.textMuted, marginLeft: "auto" }}>
          {(data.fileCount as number)} files · {(data.folderCount as number)} subfolders
        </span>
        {onClose && (
          <button
            onClick={(e) => { e.stopPropagation(); onClose() }}
            style={{
              background: "none",
              border: "none",
              color: COLORS.textMuted,
              cursor: "pointer",
              fontSize: 16,
              padding: "2px 6px",
              borderRadius: 4,
              pointerEvents: "auto",
              marginLeft: 4,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = COLORS.text }}
            onMouseLeave={(e) => { e.currentTarget.style.color = COLORS.textMuted }}
            title="Close"
          >
            ✕
          </button>
        )}
      </div>

      <div style={{
        position: "absolute", top: -1, left: -1, width: 20, height: 20,
        borderTop: `2px solid ${color}`, borderLeft: `2px solid ${color}`,
        borderRadius: "16px 0 0 0",
      }} />
      <div style={{
        position: "absolute", top: -1, right: -1, width: 20, height: 20,
        borderTop: `2px solid ${color}`, borderRight: `2px solid ${color}`,
        borderRadius: "0 16px 0 0",
      }} />
      <div style={{
        position: "absolute", bottom: -1, left: -1, width: 20, height: 20,
        borderBottom: `2px solid ${color}`, borderLeft: `2px solid ${color}`,
        borderRadius: "0 0 0 16px",
      }} />
      <div style={{
        position: "absolute", bottom: -1, right: -1, width: 20, height: 20,
        borderBottom: `2px solid ${color}`, borderRight: `2px solid ${color}`,
        borderRadius: "0 0 16px 0",
      }} />
    </div>
  )
}

function FileNode({ data }: { data: Record<string, unknown> }) {
  const isDimmed = !!data.isDimmed
  const isHighlighted = !!data.isHighlighted
  const isSelected = !!data.isSelected
  const isSpotlit = !!data.isSpotlit

  const borderColor = isSelected ? COLORS.accent
    : isSpotlit ? COLORS.warning
    : isHighlighted ? COLORS.info
    : (data.color as string) || COLORS.border

  const bg = isSelected ? `${COLORS.accent}18`
    : isSpotlit ? `${COLORS.warning}18`
    : isHighlighted ? `${COLORS.info}12`
    : COLORS.surface

  return (
    <div
      style={{
        width: 160,
        padding: "10px 14px",
        background: bg,
        border: `1.5px solid ${borderColor}`,
        borderRadius: 10,
        color: isDimmed ? COLORS.textDim : COLORS.text,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontSize: 11,
        cursor: "pointer",
        opacity: isDimmed ? 0.35 : 1,
        transition: "all 0.2s ease",
        position: "relative",
        boxShadow: isSpotlit ? `0 0 20px ${COLORS.warning}30` : "none",
      }}
      onMouseEnter={(e) => {
        if (!isDimmed) {
          e.currentTarget.style.background = COLORS.surfaceHover
          e.currentTarget.style.borderColor = COLORS.accent
          e.currentTarget.style.transform = "translateY(-1px)"
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = bg
        e.currentTarget.style.borderColor = borderColor
        e.currentTarget.style.transform = "translateY(0)"
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 13 }}>{getLanguageIcon(data.language as string)}</span>
        <span style={{
          fontWeight: 600,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {data.label as string}
        </span>
      </div>

      {(data.functions as string[])?.length > 0 && (
        <div style={{
          marginTop: 5,
          fontSize: 9,
          color: COLORS.textDim,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {(data.functions as string[]).slice(0, 2).join(", ")}
          {(data.functions as string[]).length > 2 && ` +${(data.functions as string[]).length - 2}`}
        </div>
      )}

      <Handle type="target" position={Position.Top} style={{ opacity: 0, width: 8, height: 8 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, width: 8, height: 8 }} />
    </div>
  )
}

function SubfolderNode({ data }: { data: Record<string, unknown> }) {
  const color = (data.color as string) || COLORS.accent
  return (
    <div
      style={{
        width: 160,
        padding: "10px 14px",
        background: `${color}10`,
        border: `1.5px dashed ${color}60`,
        borderRadius: 10,
        color: COLORS.text,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontSize: 12,
        cursor: "pointer",
        transition: "all 0.2s ease",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = `${color}18`
        e.currentTarget.style.borderStyle = "solid"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = `${color}10`
        e.currentTarget.style.borderStyle = "dashed"
      }}
    >
      <span style={{ fontSize: 14 }}>📁</span>
      <span style={{ fontWeight: 600 }}>{data.label as string}</span>
      <span style={{ marginLeft: "auto", fontSize: 10, color: COLORS.textMuted }}>
        {data.fileCount as number}
      </span>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  )
}

function DoorNode({ data }: { data: Record<string, unknown> }) {
  return (
    <div
      style={{
        padding: "10px 16px",
        background: `${COLORS.warning}12`,
        border: `1.5px dashed ${COLORS.warning}60`,
        borderRadius: 10,
        color: COLORS.warning,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontSize: 11,
        fontWeight: 600,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 8,
        transition: "all 0.2s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = `${COLORS.warning}20`
        e.currentTarget.style.borderStyle = "solid"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = `${COLORS.warning}12`
        e.currentTarget.style.borderStyle = "dashed"
      }}
    >
      <span style={{ fontSize: 14 }}>🔗</span>
      <span>External Dependencies</span>
      <span style={{
        background: "rgba(0,0,0,0.25)",
        borderRadius: 4,
        padding: "1px 7px",
        fontSize: 10,
      }}>{(data.count as number)}</span>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  )
}

function ExternalBadgeNode({ data }: { data: Record<string, unknown> }) {
  const color = (data.color as string) || COLORS.accent
  return (
    <div
      style={{
        width: 150,
        padding: "8px 12px",
        background: `${color}10`,
        border: `1.5px solid ${color}50`,
        borderRadius: 10,
        color: COLORS.text,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontSize: 11,
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 2,
        transition: "all 0.2s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = `${color}18`
        e.currentTarget.style.borderColor = color
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = `${color}10`
        e.currentTarget.style.borderColor = `${color}50`
      }}
    >
      <span style={{ fontWeight: 600 }}>{data.label as string}</span>
      <span style={{ fontSize: 9, color: COLORS.textMuted }}>{(data.count as number)} imports</span>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  )
}

const nodeTypes = {
  moduleCard: ModuleCard,
  container: ContainerNode,
  fileNode: FileNode,
  subfolder: SubfolderNode,
  door: DoorNode,
  externalBadge: ExternalBadgeNode,
}

function Breadcrumb({
  focusModule,
  openSubfolder,
  doorOpen,
  doorDrilldown,
  onNavigate,
  onExitFocus,
  fileCount,
  edgeCount,
}: {
  focusModule: string | null
  openSubfolder: string | null
  doorOpen: boolean
  doorDrilldown: string | null
  onNavigate: (mod: string) => void
  onExitFocus: () => void
  fileCount: number
  edgeCount: number
}) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 6,
      padding: "10px 16px",
      fontSize: 12,
      color: COLORS.textMuted,
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      borderBottom: `1px solid ${COLORS.border}`,
      background: COLORS.surface,
      flexShrink: 0,
    }}>
      <button onClick={onExitFocus} style={{
        background: "none", border: "none",
        color: !focusModule ? COLORS.text : COLORS.accent,
        cursor: "pointer", fontSize: 12, fontFamily: "inherit",
        padding: "2px 6px", borderRadius: 4,
        fontWeight: !focusModule ? 700 : 400,
      }}>
        🏠 Repository
      </button>

      {focusModule && (
        <>
          <span style={{ color: COLORS.border }}>/</span>
          <button onClick={() => onNavigate(focusModule)} style={{
            background: "none", border: "none",
            color: !openSubfolder && !doorOpen ? COLORS.text : COLORS.accent,
            cursor: "pointer", fontSize: 12, fontFamily: "inherit",
            padding: "2px 6px", borderRadius: 4,
            fontWeight: !openSubfolder && !doorOpen ? 700 : 400,
          }}>
            {focusModule}
          </button>
        </>
      )}

      {openSubfolder && (
        <>
          <span style={{ color: COLORS.border }}>/</span>
          <span style={{ color: COLORS.text, fontWeight: 600, padding: "2px 6px" }}>{openSubfolder}</span>
        </>
      )}

      {doorOpen && !doorDrilldown && (
        <>
          <span style={{ color: COLORS.border }}>/</span>
          <span style={{ color: COLORS.warning, fontWeight: 600, padding: "2px 6px" }}>external ▸</span>
        </>
      )}

      {doorDrilldown && (
        <>
          <span style={{ color: COLORS.border }}>/</span>
          <span style={{ color: COLORS.warning, fontWeight: 600, padding: "2px 6px" }}>external ▸ {doorDrilldown}</span>
        </>
      )}

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
        <span>{fileCount} files</span>
        <span style={{ color: COLORS.border }}>|</span>
        <span>{edgeCount} dependencies</span>
        {focusModule && (
          <button onClick={onExitFocus} style={{
            background: `${COLORS.accent}15`, border: `1px solid ${COLORS.accent}`,
            borderRadius: 6, color: COLORS.accent, fontSize: 11,
            fontFamily: "inherit", padding: "4px 10px", cursor: "pointer",
          }}>
            Exit Focus
          </button>
        )}
      </div>
    </div>
  )
}

function GraphInner({ graph }: { graph: { nodes: GraphNode[]; edges: RepoEdge[]; tech: TechBadge[] } }) {
  const allFiles = useMemo(() => (graph && Array.isArray(graph.nodes) ? graph.nodes : []), [graph])
  const allEdges = useMemo(() => (graph && Array.isArray(graph.edges) ? graph.edges : []), [graph])

  const lookup = useMemo(() => new Map(allFiles.map((f) => [f.id, f])), [allFiles])
  const moduleSummaries = useMemo(() => buildModuleSummaries(allFiles), [allFiles])
  const moduleEdges = useMemo(() => buildModuleEdges(allEdges), [allEdges])

  const overviewPositionsRef = useRef<Map<string, { x: number; y: number }> | null>(null)
  const overviewKeyRef = useRef<string | null>(null)
  const overviewPositions = useMemo(() => {
    const key = moduleSummaries.map((m) => m.name).sort().join(",")
    if (overviewKeyRef.current !== key) {
      overviewPositionsRef.current = computeOverviewPositions(moduleSummaries)
      overviewKeyRef.current = key
    }
    return overviewPositionsRef.current!
  }, [moduleSummaries])

  const [focusModule, setFocusModule] = useState<string | null>(null)
  const [openSubfolder, setOpenSubfolder] = useState<string | null>(null)
  const [doorOpen, setDoorOpen] = useState(false)
  const [doorDrilldown, setDoorDrilldown] = useState<string | null>(null)
  const [spotlightFile, setSpotlightFile] = useState<GraphNode | null>(null)
  const [selectedFile, setSelectedFile] = useState<GraphNode | null>(null)

  const { fitView } = useReactFlow()
  const viewport = useViewport()
  const canvasRef = useRef<HTMLDivElement>(null)

  const identityRef = useRef<string | null>(null)
  useEffect(() => {
    const id = `${allFiles.length}:${allFiles[0]?.id || ""}`
    if (identityRef.current !== null && identityRef.current !== id) {
      setFocusModule(null)
      setOpenSubfolder(null)
      setDoorOpen(false)
      setDoorDrilldown(null)
      setSpotlightFile(null)
      setSelectedFile(null)
    }
    identityRef.current = id
  }, [allFiles])

  const exitFocus = useCallback(() => {
    setFocusModule(null)
    setOpenSubfolder(null)
    setDoorOpen(false)
    setDoorDrilldown(null)
    setSpotlightFile(null)
    setSelectedFile(null)
  }, [])

  const composition = useMemo(() => {
    if (!focusModule) return null
    return buildModuleComposition(allFiles, focusModule)
  }, [allFiles, focusModule])

  const externalBreakdown = useMemo(() => {
    if (!focusModule) return []
    return buildExternalBreakdown(allEdges, focusModule)
  }, [allEdges, focusModule])

  const built = useMemo(() => {
    const nodes: Node[] = []
    const edges: Edge[] = []

    if (!focusModule) {
      moduleSummaries.forEach((m) => {
        const pos = overviewPositions.get(m.name) || { x: 0, y: 0 }
        const extCount = moduleEdges
          .filter((e) => e.source === m.name || e.target === m.name)
          .reduce((sum, e) => sum + e.count, 0)

        nodes.push({
          id: `mod:${m.name}`,
          type: "moduleCard",
          position: pos,
          data: {
            label: m.name,
            color: getModuleColor(m.name),
            stats: { fileCount: m.fileCount, folderCount: m.folderCount },
            externalDepCount: extCount,
            moduleName: m.name,
          },
        })
      })

      moduleEdges.forEach((me, i) => {
        const srcColor = getModuleColor(me.source)
        edges.push({
          id: `me-${i}`,
          source: `mod:${me.source}`,
          target: `mod:${me.target}`,
          animated: false,
          label: `${me.count}`,
          labelStyle: { fill: COLORS.textMuted, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" },
          labelBgStyle: { fill: COLORS.bg, opacity: 0.9 },
          labelBgPadding: [5, 5],
          style: {
            stroke: `${srcColor}60`,
            strokeWidth: Math.min(me.count * 0.5 + 1, 4),
            opacity: 0.7,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: `${getModuleColor(me.target)}80`,
            width: 14, height: 14,
          },
        })
      })

      return { nodes, edges }
    }

    const focusColor = getModuleColor(focusModule)
    const focusPos = overviewPositions.get(focusModule) || { x: 0, y: 0 }

    moduleSummaries.forEach((m) => {
      if (m.name === focusModule) return
      const pos = overviewPositions.get(m.name) || { x: 0, y: 0 }
      nodes.push({
        id: `mod:${m.name}`,
        type: "moduleCard",
        position: pos,
        data: {
          label: m.name,
          color: getModuleColor(m.name),
          stats: { fileCount: m.fileCount, folderCount: m.folderCount },
          externalDepCount: 0,
          moduleName: m.name,
          isBackground: true,
        },
      })
    })

    const groupIds: string[] = []
    const groupMeta = new Map<string, { kind: string; name?: string; file?: GraphNode; files?: GraphNode[]; fromSubfolder?: string }>()

    Array.from(composition!.subfolders.keys())
      .sort()
      .forEach((sf) => {
        const id = `sf:${focusModule}/${sf}`
        groupIds.push(id)
        groupMeta.set(id, { kind: "subfolder", name: sf, files: composition!.subfolders.get(sf) })
      })

    composition!.directFiles
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))
      .forEach((f) => {
        groupIds.push(f.id)
        groupMeta.set(f.id, { kind: "file", file: f })
      })

    let innerIds = groupIds
    let innerMeta = groupMeta
    if (openSubfolder) {
      innerIds = []
      innerMeta = new Map()
      groupIds.forEach((id) => {
        const meta = groupMeta.get(id)
        if (meta?.kind === "subfolder" && meta.name === openSubfolder) {
          meta.files!
            .slice()
            .sort((a, b) => a.id.localeCompare(b.id))
            .forEach((f) => {
              innerIds.push(f.id)
              innerMeta.set(f.id, { kind: "file", file: f, fromSubfolder: openSubfolder })
            })
        } else {
          innerIds.push(id)
          innerMeta.set(id, meta!)
        }
      })
    }

    const idForFile = (fid: string) => {
      if (innerMeta.has(fid)) return fid
      const sf = subfolderInModule(fid, focusModule)
      const candidate = `sf:${focusModule}/${sf}`
      return innerMeta.has(candidate) ? candidate : null
    }

    const internalEdgeMap = new Map<string, number>()
    allEdges.forEach((e) => {
      if (topModule(e.source) !== focusModule || topModule(e.target) !== focusModule) return
      const a = idForFile(e.source)
      const b = idForFile(e.target)
      if (!a || !b || a === b) return
      const key = `${a}->${b}`
      internalEdgeMap.set(key, (internalEdgeMap.get(key) || 0) + 1)
    })

    const sortedInnerIds = innerIds.sort((a, b) => {
      const ma = innerMeta.get(a)
      const mb = innerMeta.get(b)
      if (!ma || !mb) return a.localeCompare(b)
      if (ma.kind !== mb.kind) return ma.kind === "subfolder" ? -1 : 1
      return a.localeCompare(b)
    })

    const { positions: gridPos, width: contentW, height: contentH } = gridWrapLayout(sortedInnerIds, {
      itemWidth: 164,
      itemHeight: 52,
      gapX: 16,
      gapY: 14,
      maxCols: Math.max(3, Math.ceil(Math.sqrt(sortedInnerIds.length))),
      startX: 20,
      startY: 60,
    })

    const containerW = Math.max(400, contentW + 40)
    const containerH = Math.max(300, contentH + 80)
    const containerX = Math.max(60, focusPos.x - containerW / 2 + 110)
    const containerY = Math.max(60, focusPos.y - containerH / 2 + 50)

    nodes.push({
      id: `container:${focusModule}`,
      type: "container",
      position: { x: containerX, y: containerY },
      data: {
        label: focusModule,
        color: focusColor,
        width: containerW,
        height: containerH,
        fileCount: composition!.filesInModule.length,
        folderCount: composition!.subfolders.size,
        onClose: exitFocus,
      },
      draggable: false,
      selectable: false,
    })

    sortedInnerIds.forEach((id) => {
      const meta = innerMeta.get(id)
      if (!meta) return
      const p = gridPos.get(id) || { x: 0, y: 0 }
      const absPos = { x: containerX + p.x, y: containerY + p.y }

      if (meta.kind === "subfolder") {
        nodes.push({
          id,
          type: "subfolder",
          position: absPos,
          data: {
            label: meta.name,
            color: focusColor,
            fileCount: meta.files!.length,
          },
        })
      } else {
        const f = meta.file!
        nodes.push({
          id: f.id,
          type: "fileNode",
          position: absPos,
          data: {
            label: f.label || fileName(f.id),
            language: f.language,
            functions: f.functions || [],
            color: focusColor,
            isSelected: selectedFile?.id === f.id,
            isSpotlit: spotlightFile?.id === f.id,
            isDimmed: false,
          },
        })
      }
    })

    Array.from(internalEdgeMap.entries()).forEach(([key, count], i) => {
      const [a, b] = key.split("->")
      edges.push({
        id: `ie-${i}`,
        source: a,
        target: b,
        animated: false,
        label: count > 1 ? `${count}` : undefined,
        labelStyle: { fill: COLORS.textMuted, fontSize: 8 },
        labelBgStyle: { fill: COLORS.bg },
        style: {
          stroke: `${focusColor}60`,
          strokeWidth: 1.4,
          opacity: 0.8,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: `${focusColor}80`,
          width: 10, height: 10,
        },
        zIndex: 5,
      })
    })

    const totalExt = externalBreakdown.reduce((s, b) => s + b.count, 0)
    if (totalExt > 0) {
      const doorId = `door:${focusModule}`
      const doorPos = {
        x: containerX + containerW - 190,
        y: containerY + containerH - 40,
      }
      nodes.push({
        id: doorId,
        type: "door",
        position: doorPos,
        data: { count: totalExt, moduleCount: externalBreakdown.length },
      })

      if (doorOpen && !doorDrilldown) {
        externalBreakdown.forEach((b, i) => {
          const bx = doorPos.x + 220
          const by = doorPos.y - (externalBreakdown.length - 1) * 24 + i * 48
          const badgeId = `badge:${b.module}`
          nodes.push({
            id: badgeId,
            type: "externalBadge",
            position: { x: bx, y: by },
            data: { label: b.module, count: b.count, color: getModuleColor(b.module) },
          })
          edges.push({
            id: `de-${i}`,
            source: doorId,
            target: badgeId,
            style: { stroke: `${COLORS.warning}60`, strokeWidth: 1.4, opacity: 0.8 },
            markerEnd: { type: MarkerType.ArrowClosed, color: `${COLORS.warning}80`, width: 10, height: 10 },
          })
        })
      }

      if (doorDrilldown) {
        const entry = externalBreakdown.find((b) => b.module === doorDrilldown)
        const pairs = entry ? entry.fileEdges : []
        const leftFiles = Array.from(new Set(pairs.map((p) => p.source)))
        const rightFiles = Array.from(new Set(pairs.map((p) => p.target)))

        const colX1 = doorPos.x + 200
        const colX2 = colX1 + 220
        const rowH = 32
        const startY = doorPos.y - (Math.max(leftFiles.length, rightFiles.length) * rowH) / 2

        const leftPosById = new Map<string, string>()
        leftFiles.forEach((fid, i) => {
          const id = `dl:${fid}`
          leftPosById.set(fid, id)
          nodes.push({
            id,
            type: "fileNode",
            position: { x: colX1, y: startY + i * rowH },
            data: {
              label: fileName(fid),
              color: focusColor,
              isDimmed: false,
            },
          })
        })

        const rightPosById = new Map<string, string>()
        rightFiles.forEach((fid, i) => {
          const id = `dr:${fid}`
          rightPosById.set(fid, id)
          nodes.push({
            id,
            type: "fileNode",
            position: { x: colX2, y: startY + i * rowH },
            data: {
              label: fileName(fid),
              color: getModuleColor(doorDrilldown),
              isDimmed: false,
            },
          })
        })

        pairs.forEach((p, i) => {
          const s = leftPosById.get(p.source)
          const t = rightPosById.get(p.target)
          if (!s || !t) return
          edges.push({
            id: `dfe-${i}`,
            source: s,
            target: t,
            style: { stroke: `${COLORS.accent}60`, strokeWidth: 1.2, opacity: 0.7 },
            markerEnd: { type: MarkerType.ArrowClosed, color: `${COLORS.accent}80`, width: 9, height: 9 },
          })
        })
      }
    }

    return { nodes, edges }
  }, [
    focusModule, openSubfolder, doorOpen, doorDrilldown,
    composition, externalBreakdown, moduleSummaries, moduleEdges,
    overviewPositions, allEdges, allFiles, selectedFile, spotlightFile,
  ])

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edgesState, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  useEffect(() => {
    setNodes(built.nodes)
    setEdges(built.edges)
  }, [built, setNodes, setEdges])

  const fittedKeyRef = useRef<string | null>(null)
  useEffect(() => {
    const key = `${focusModule || ""}|${openSubfolder || ""}|${doorOpen}|${doorDrilldown || ""}`
    if (fittedKeyRef.current !== key && nodes.length > 0) {
      fittedKeyRef.current = key
      setTimeout(() => fitView({ padding: 0.2, duration: 450 }), 50)
    }
  }, [focusModule, openSubfolder, doorOpen, doorDrilldown, nodes.length, fitView])

  const handleNodeClick = useCallback((_event: React.MouseEvent, node: Record<string, unknown>) => {
    const type = node.type as string

    if (type === "moduleCard" && !(node.data as Record<string, unknown>)?.isBackground) {
      setFocusModule((node.data as Record<string, unknown>)?.moduleName as string)
      setOpenSubfolder(null)
      setDoorOpen(false)
      setDoorDrilldown(null)
      setSelectedFile(null)
      return
    }

    if (type === "subfolder") {
      setOpenSubfolder((node.data as Record<string, unknown>)?.label as string)
      setDoorOpen(false)
      setDoorDrilldown(null)
      setSelectedFile(null)
      return
    }

    if (type === "fileNode") {
      const f = allFiles.find((file) => file.id === node.id) || null
      setSpotlightFile(f)
      setSelectedFile(f)
      return
    }

    if (type === "door") {
      setDoorOpen((v) => !v)
      setDoorDrilldown(null)
      setSelectedFile(null)
      return
    }

    if (type === "externalBadge") {
      setDoorDrilldown((node.data as Record<string, unknown>)?.label as string)
      return
    }
  }, [allFiles])

  const handlePaneClick = useCallback(() => {
    setSelectedFile(null)
  }, [])

  const popoverPos = selectedFile
    ? (() => {
        const flowNode = built.nodes.find((n) => n.id === selectedFile.id)
        if (!flowNode) return null
        const fp = flowNode.position as { x: number; y: number }
        let x = fp.x * viewport.zoom + viewport.x + 14
        let y = fp.y * viewport.zoom + viewport.y + 46
        if (canvasRef.current) {
          const rect = canvasRef.current.getBoundingClientRect()
          x = Math.max(4, Math.min(x, rect.width - 264))
          y = Math.max(4, Math.min(y, rect.height - 220))
        }
        return { x, y }
      })()
    : null

  if (allFiles.length === 0) {
    return (
      <div style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
        color: COLORS.textMuted, fontSize: 14, fontFamily: "'JetBrains Mono', monospace",
      }}>
        No dependency graph data available.
      </div>
    )
  }

  return (
    <div
      ref={canvasRef}
      style={{
        flex: "1 1 auto",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        height: "100%",
        width: "100%",
        position: "relative",
        background: COLORS.bg,
      }}
    >
      <Breadcrumb
        focusModule={focusModule}
        openSubfolder={openSubfolder}
        doorOpen={doorOpen}
        doorDrilldown={doorDrilldown}
        onNavigate={(mod) => {
          setFocusModule(mod)
          setOpenSubfolder(null)
          setDoorOpen(false)
          setDoorDrilldown(null)
        }}
        onExitFocus={exitFocus}
        fileCount={allFiles.length}
        edgeCount={allEdges.length}
      />

      <div style={{ flex: "1 1 auto", minHeight: 480, position: "relative", width: "100%" }}>
        <style>{`
          .react-flow__controls-button { fill: #e4e4ec !important; background: #13131f !important; border-bottom: 1px solid #2a2a3e !important; }
          .react-flow__controls-button:hover { background: #1a1a2e !important; }
        `}</style>
        <ReactFlow
          nodes={nodes}
          edges={edgesState}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          onPaneClick={handlePaneClick}
          panOnDrag
          panOnScroll
          zoomOnScroll={false}
          zoomOnPinch
          nodesDraggable={false}
          minZoom={0.08}
          maxZoom={2}
          style={{ background: COLORS.bg, position: "absolute", inset: 0 }}
          proOptions={{ hideAttribution: true }}
        >
          <Controls style={{
            background: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 8,
            position: "absolute",
            right: 14,
            bottom: 14,
            left: "auto",
          }} />
          <Background color="#1a1a2e" gap={20} />
        </ReactFlow>

        {/* Tech stack inside canvas */}
        <TechStackStrip tech={graph.tech} />

        {/* Hint text */}
        {!focusModule && (
          <div style={{
            position: "absolute", bottom: 14, left: 14,
            fontSize: 10, color: COLORS.textMuted,
            background: "rgba(20,20,31,0.85)",
            border: `1px solid ${COLORS.border}`,
            borderRadius: 6, padding: "5px 10px",
            pointerEvents: "none",
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            Click a module to focus on it
          </div>
        )}
        {focusModule && !doorOpen && !doorDrilldown && !spotlightFile && (
          <div style={{
            position: "absolute", bottom: 14, left: 14,
            fontSize: 10, color: COLORS.textMuted,
            background: "rgba(20,20,31,0.85)",
            border: `1px solid ${COLORS.border}`,
            borderRadius: 6, padding: "5px 10px",
            pointerEvents: "none",
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            Click a folder to expand · click the door for external links · right-click to go back
          </div>
        )}

        {popoverPos && selectedFile && (
          <NodePopover
            file={selectedFile}
            x={popoverPos.x}
            y={popoverPos.y}
            lookup={lookup}
            onClose={() => setSelectedFile(null)}
          />
        )}
      </div>
    </div>
  )
}

export default function GraphCanvas() {
  const [graph, setGraph] = useState<RepoGraph | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { onboardResult } = useCodeAtlas()

  useEffect(() => {
    let active = true
    setError(null)

    if (onboardResult?.graph) {
      setGraph(onboardResult.graph)
      return
    }

    fetchRepoGraph()
      .then((data) => {
        if (active) setGraph(data)
      })
      .catch((err: Error) => {
        if (active) setError(err.message)
      })

    return () => {
      active = false
    }
  }, [onboardResult])

  if (error) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: COLORS.danger }}>
          <span>⚠</span>
          {error}
        </div>
      </div>
    )
  }

  if (!graph) return <GraphSkeleton />

  const enhanced = enhanceGraph(graph)

  return (
    <div style={{
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      position: "relative",
      background: COLORS.bg,
    }}>
      <ReactFlowProvider>
        <GraphInner graph={enhanced} />
      </ReactFlowProvider>
    </div>
  )
}

export { GraphCanvas }
