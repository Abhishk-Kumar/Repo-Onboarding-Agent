"use client"

import { motion } from "motion/react"
import { Boxes, Code2, Database } from "lucide-react"
import type { TechBadge } from "@/lib/codeatlas/types"

const ICON = {
  language: Code2,
  framework: Boxes,
  database: Database,
} as const

export function TechStackStrip({ tech }: { tech: TechBadge[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25, duration: 0.4 }}
      className="pointer-events-auto absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-xl border border-border bg-card/70 px-2 py-1.5 backdrop-blur-md"
    >
      <span className="px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
        Stack
      </span>
      {tech.map((t) => {
        const Icon = ICON[t.kind]
        return (
          <span
            key={t.id}
            className="flex items-center gap-1.5 rounded-lg bg-secondary/60 px-2 py-1 text-[11px] text-secondary-foreground"
          >
            <Icon className="size-3 text-primary" />
            {t.label}
          </span>
        )
      })}
    </motion.div>
  )
}
