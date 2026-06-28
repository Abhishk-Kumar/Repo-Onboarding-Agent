"use client"

import { motion } from "motion/react"
import { AlertCircle, Boxes, Layers, Sparkles, Target } from "lucide-react"
import { useEffect, useState } from "react"
import { CompassLogo } from "../compass-logo"
import { ExplainSkeleton } from "../skeletons"
import { fetchExplain } from "@/lib/codeatlas/api"
import type { ExplainPoint } from "@/lib/codeatlas/types"

const ICONS = {
  compass: CompassLogo,
  layers: Layers,
  target: Target,
  boxes: Boxes,
  sparkles: Sparkles,
} as const

export function ExplainTab() {
  const [points, setPoints] = useState<ExplainPoint[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setError(null)
    fetchExplain()
      .then((data) => {
        if (active) setPoints(data)
      })
      .catch((err) => {
        if (active) setError(err.message)
      })
    return () => {
      active = false
    }
  }, [])

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="flex items-center gap-2 text-sm text-sev-high">
          <AlertCircle className="size-4" />
          {error}
        </div>
      </div>
    )
  }

  if (!points) return <ExplainSkeleton />

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-2.5">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Explain Repo
        </p>
      </div>
      <div className="thin-scroll flex-1 space-y-3 overflow-y-auto p-4">
        {points.map((p, i) => {
          const Icon = ICONS[p.icon]
          return (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08, duration: 0.32 }}
              className="rounded-xl border border-border bg-card p-3.5"
            >
              <div className="flex items-center gap-2.5">
                <span className="flex size-7 items-center justify-center rounded-lg bg-primary/12 text-primary">
                  <Icon className="size-4" />
                </span>
                <span className="font-mono text-[11px] text-muted-foreground/60">
                  0{i + 1}
                </span>
                <p className="font-heading text-[14px] font-medium text-card-foreground">
                  {p.title}
                </p>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                {p.body}
              </p>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
