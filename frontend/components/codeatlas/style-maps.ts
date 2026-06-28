import type { NodeGroup, Severity } from "@/lib/codeatlas/types"

export const GROUP_META: Record<
  NodeGroup,
  { label: string; color: string; dot: string; text: string }
> = {
  backend: {
    label: "Backend",
    color: "var(--node-backend)",
    dot: "bg-node-backend",
    text: "text-node-backend",
  },
  frontend: {
    label: "Frontend",
    color: "var(--node-frontend)",
    dot: "bg-node-frontend",
    text: "text-node-frontend",
  },
  data: {
    label: "Data / Models",
    color: "var(--node-data)",
    dot: "bg-node-data",
    text: "text-node-data",
  },
  config: {
    label: "Config",
    color: "var(--node-config)",
    dot: "bg-node-config",
    text: "text-node-config",
  },
  util: {
    label: "Utilities",
    color: "var(--node-util)",
    dot: "bg-node-util",
    text: "text-node-util",
  },
}

export const SEVERITY_META: Record<
  Severity,
  { label: string; color: string; border: string; text: string; bg: string }
> = {
  critical: {
    label: "Critical",
    color: "var(--sev-critical)",
    border: "border-l-sev-critical",
    text: "text-sev-critical",
    bg: "bg-sev-critical/10",
  },
  high: {
    label: "High",
    color: "var(--sev-high)",
    border: "border-l-sev-high",
    text: "text-sev-high",
    bg: "bg-sev-high/10",
  },
  medium: {
    label: "Medium",
    color: "var(--sev-medium)",
    border: "border-l-sev-medium",
    text: "text-sev-medium",
    bg: "bg-sev-medium/10",
  },
  low: {
    label: "Low",
    color: "var(--sev-low)",
    border: "border-l-sev-low",
    text: "text-sev-low",
    bg: "bg-sev-low/10",
  },
}
