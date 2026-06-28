"use client"

import { useMemo } from "react"
import { motion } from "motion/react"
import { ArrowDownLeft, ArrowUpRight, X } from "lucide-react"
import { GROUP_META } from "../style-maps"
import type { RepoFileNode } from "@/lib/codeatlas/types"

function Chips({
  ids,
  lookup,
}: {
  ids: string[]
  lookup: Map<string, RepoFileNode>
}) {
  const unique = useMemo(() => [...new Set(ids)], [ids])
  if (unique.length === 0) {
    return <span className="text-[11px] text-muted-foreground/70">None</span>
  }
  return (
    <div className="flex flex-wrap gap-1">
      {unique.map((id) => {
        const f = lookup.get(id)
        if (!f) return null
        const meta = GROUP_META[f.group]
        return (
          <span
            key={id}
            className="rounded-md border border-border bg-secondary/50 px-1.5 py-0.5 font-mono text-[10px]"
            style={{ color: meta.color }}
          >
            {f.label}
          </span>
        )
      })}
    </div>
  )
}

export function NodePopover({
  file,
  x,
  y,
  lookup,
  onClose,
}: {
  file: RepoFileNode
  x: number
  y: number
  lookup: Map<string, RepoFileNode>
  onClose: () => void
}) {
  const meta = GROUP_META[file.group]
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 6 }}
      transition={{ type: "spring", stiffness: 420, damping: 26 }}
      style={{ left: x, top: y }}
      className="absolute z-20 w-64 origin-top-left rounded-xl border border-border bg-popover/95 p-3.5 shadow-2xl backdrop-blur-md"
    >
      <span
        className="absolute -left-px top-4 h-8 w-1 rounded-full"
        style={{ background: meta.color }}
      />
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-[13px] text-popover-foreground">
            {file.label}
          </p>
          <p className="font-mono text-[10px] text-muted-foreground/70">
            {file.path}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close details"
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <p className="mt-2.5 text-[12px] leading-relaxed text-muted-foreground">
        {file.description}
      </p>

      <div className="mt-3 space-y-2.5">
        <div>
          <p className="mb-1 flex items-center gap-1 text-[11px] font-medium text-foreground">
            <ArrowUpRight className="size-3 text-primary" />
            Depends on {file.dependsOn.length} file
            {file.dependsOn.length === 1 ? "" : "s"}
          </p>
          <Chips ids={file.dependsOn} lookup={lookup} />
        </div>
        <div>
          <p className="mb-1 flex items-center gap-1 text-[11px] font-medium text-foreground">
            <ArrowDownLeft className="size-3 text-primary" />
            Used by {file.usedBy.length} file
            {file.usedBy.length === 1 ? "" : "s"}
          </p>
          <Chips ids={file.usedBy} lookup={lookup} />
        </div>
      </div>
    </motion.div>
  )
}
