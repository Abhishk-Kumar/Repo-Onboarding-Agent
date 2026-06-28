export type NodeGroup = "backend" | "frontend" | "config" | "data" | "util"

export interface RepoFileNode {
  id: string
  label: string
  path: string
  group: NodeGroup
  description: string
  dependsOn: string[]
  usedBy: string[]
  position: { x: number; y: number }
}

export interface RepoEdge {
  id: string
  source: string
  target: string
}

export interface TechBadge {
  id: string
  label: string
  kind: "language" | "framework" | "database"
}

export interface RepoGraph {
  nodes: RepoFileNode[]
  edges: RepoEdge[]
  tech: TechBadge[]
}

export type AgentActivityState = "active" | "complete" | "warning"

export interface AgentActivity {
  id: string
  text: string
  state: AgentActivityState
}

export type Severity = "critical" | "high" | "medium" | "low"

export interface ScanIssue {
  id: string
  title: string
  severity: Severity
  file: string
  line: number
  detail: string
  fix: string
}

export interface HealthMetric {
  label: string
  value: number
  hint: string
}

export interface FutureImprovement {
  id: string
  title: string
  detail: string
}

export interface ScanReport {
  grade: "A" | "B" | "C" | "D" | "F"
  score: number
  summary: string
  metrics: HealthMetric[]
  issues: ScanIssue[]
  improvements: FutureImprovement[]
}

export interface ExplainPoint {
  id: string
  title: string
  body: string
  icon: "compass" | "layers" | "target" | "boxes" | "sparkles"
}

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
}

export interface AgentActivityEvent {
  type: "progress" | "complete" | "error"
  message: string
}
