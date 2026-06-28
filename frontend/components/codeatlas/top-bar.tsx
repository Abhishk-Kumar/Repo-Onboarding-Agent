"use client"

import { AnimatePresence, motion } from "motion/react"
import { Check, FolderGit2, GitBranch, TriangleAlert } from "lucide-react"
import { useMemo } from "react"
import { CompassLogo } from "./compass-logo"
import { useCodeAtlas } from "@/lib/codeatlas/context"
import type { AgentActivity } from "@/lib/codeatlas/types"

function StatusIndicator({ state }: { state: AgentActivity["state"] }) {
  if (state === "complete") {
    return (
      <motion.span
        key="complete"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 18 }}
        className="flex size-4 items-center justify-center rounded-full bg-primary/15 text-primary"
      >
        <Check className="size-2.5" strokeWidth={3} />
      </motion.span>
    )
  }
  if (state === "warning") {
    return (
      <span className="flex size-4 items-center justify-center rounded-full bg-sev-high/15 text-sev-high">
        <TriangleAlert className="size-2.5" />
      </span>
    )
  }
  return (
    <span className="relative flex size-4 items-center justify-center">
      <span
        className="absolute size-2.5 rounded-full bg-primary"
        style={{ animation: "ca-pulse-dot 1.4s ease-in-out infinite" }}
      />
      <span className="absolute size-4 rounded-full bg-primary/20" />
    </span>
  )
}

function ActivityBar() {
  const { onboardResult } = useCodeAtlas()

  const activity: AgentActivity[] = useMemo(() => {
    if (!onboardResult) return []
    return [
      { id: "a1", text: "Repository cloned and analyzed", state: "complete" },
      { id: "a2", text: `Dependency graph: ${onboardResult.graph.nodes.length} nodes, ${onboardResult.graph.edges.length} edges`, state: "complete" },
      { id: "a3", text: `${onboardResult.graph.tech.length} technologies detected`, state: "complete" },
      { id: "a4", text: "Ready — explore the graph, chat, or run a scan", state: "active" },
    ]
  }, [onboardResult])

  if (activity.length === 0) return null

  return (
    <div className="flex h-9 items-center gap-3 border-b border-border bg-card px-4 sm:px-6">
      <span className="hidden shrink-0 text-xs font-medium uppercase tracking-wider text-muted-foreground/70 sm:inline">
        Agent
      </span>
      <div className="flex flex-1 items-center gap-2 truncate">
        {activity.slice(-1).map((a) => (
          <div key={a.id} className="flex items-center gap-2 text-xs subpixel-antialiased">
            <StatusIndicator state={a.state} />
            <span
              className={
                a.state === "warning"
                  ? "text-sev-high truncate"
                  : a.state === "active"
                    ? "text-foreground truncate"
                    : "text-muted-foreground truncate"
              }
            >
              {a.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function TopBar() {
  const { onboardResult } = useCodeAtlas()

  const repoShort = onboardResult?.sessionId
    ? onboardResult.sessionId.replace(/^https?:\/\/github\.com\//, "")
    : null

  return (
    <header className="z-20 flex flex-col">
      {/* main nav */}
      <div className="flex h-14 items-center justify-between border-b border-border px-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary/12 text-primary">
            <CompassLogo className="size-4" />
          </span>
          <span className="font-heading text-[15px] font-semibold tracking-tight">
            Code<span className="text-primary">Atlas</span>
          </span>
          {repoShort && (
            <span className="ml-2 hidden items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 font-mono text-xs text-muted-foreground sm:flex">
              <FolderGit2 className="size-3" />
              {repoShort}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {repoShort && (
            <>
              <a
                href="/"
                className="hidden items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground md:flex"
              >
                <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                Onboard Another Repo
              </a>
              <span className="hidden items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 font-mono text-xs text-muted-foreground md:flex">
                <GitBranch className="size-3" />
                main
              </span>
            </>
          )}
          <div className="size-7 rounded-full bg-gradient-to-br from-primary/70 to-primary/30 ring-2 ring-background" />
        </div>
      </div>

      {/* slim agent activity bar — only when a repo is loaded */}
      <ActivityBar />
    </header>
  )
}
