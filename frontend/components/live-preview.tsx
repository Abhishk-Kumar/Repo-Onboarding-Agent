"use client"

import { motion } from "framer-motion"
import { Reveal } from "@/components/reveal"
import { Circle, MessageSquare, ShieldCheck } from "lucide-react"

type GNode = {
  id: string
  x: number
  y: number
  r: number
  kind: "core" | "mod" | "leaf"
}

const NODES: GNode[] = [
  { id: "app", x: 300, y: 90, r: 26, kind: "core" },
  { id: "router", x: 150, y: 170, r: 18, kind: "mod" },
  { id: "auth", x: 450, y: 165, r: 18, kind: "mod" },
  { id: "db", x: 300, y: 230, r: 20, kind: "mod" },
  { id: "ui", x: 90, y: 270, r: 13, kind: "leaf" },
  { id: "hooks", x: 210, y: 285, r: 13, kind: "leaf" },
  { id: "api", x: 470, y: 270, r: 14, kind: "leaf" },
  { id: "utils", x: 360, y: 315, r: 12, kind: "leaf" },
  { id: "session", x: 540, y: 95, r: 12, kind: "leaf" },
]

const EDGES: [string, string][] = [
  ["app", "router"],
  ["app", "auth"],
  ["app", "db"],
  ["router", "ui"],
  ["router", "hooks"],
  ["auth", "api"],
  ["auth", "session"],
  ["db", "utils"],
  ["db", "api"],
]

const byId = (id: string) => NODES.find((n) => n.id === id)!

const FILL: Record<GNode["kind"], string> = {
  core: "var(--color-primary)",
  mod: "var(--color-accent)",
  leaf: "var(--color-muted-foreground)",
}

export function LivePreview() {
  return (
    <section id="preview" className="border-b border-border py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
            Live canvas
          </p>
          <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            See your whole repo at a glance
          </h2>
        </Reveal>

        <Reveal delay={0.1} className="mt-12">
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-black/40">
            {/* window chrome */}
            <div className="flex items-center gap-2 border-b border-border bg-secondary/40 px-4 py-3">
              <span className="size-3 rounded-full bg-destructive/70" />
              <span className="size-3 rounded-full bg-chart-3/70" />
              <span className="size-3 rounded-full bg-primary/70" />
              <span className="ml-3 font-mono text-xs text-muted-foreground">
                codeatlas · vercel/next.js
              </span>
            </div>

            <div className="grid gap-px bg-border lg:grid-cols-[1.6fr_1fr]">
              {/* graph canvas */}
              <div className="relative bg-background/40 p-4">
                <div className="absolute left-6 top-6 z-10 flex gap-3 text-xs">
                  {(
                    [
                      ["Entry", "core"],
                      ["Module", "mod"],
                      ["Leaf", "leaf"],
                    ] as const
                  ).map(([label, kind]) => (
                    <span
                      key={kind}
                      className="flex items-center gap-1.5 text-muted-foreground"
                    >
                      <span
                        className="size-2.5 rounded-full"
                        style={{ background: FILL[kind] }}
                      />
                      {label}
                    </span>
                  ))}
                </div>

                <svg
                  viewBox="0 0 600 360"
                  className="h-full max-h-[380px] w-full"
                  role="img"
                  aria-label="Stylized dependency graph of a repository"
                >
                  {EDGES.map(([a, b], i) => {
                    const na = byId(a)
                    const nb = byId(b)
                    return (
                      <motion.line
                        key={`${a}-${b}`}
                        x1={na.x}
                        y1={na.y}
                        x2={nb.x}
                        y2={nb.y}
                        stroke="var(--color-border)"
                        strokeWidth={1.5}
                        initial={{ pathLength: 0, opacity: 0 }}
                        whileInView={{ pathLength: 1, opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: 0.2 + i * 0.06 }}
                      />
                    )
                  })}
                  {NODES.map((n, i) => (
                    <motion.g
                      key={n.id}
                      initial={{ scale: 0, opacity: 0 }}
                      whileInView={{ scale: 1, opacity: 1 }}
                      viewport={{ once: true }}
                      transition={{
                        type: "spring",
                        stiffness: 260,
                        damping: 18,
                        delay: 0.5 + i * 0.05,
                      }}
                      style={{ transformOrigin: `${n.x}px ${n.y}px` }}
                    >
                      <circle
                        cx={n.x}
                        cy={n.y}
                        r={n.r}
                        fill={FILL[n.kind]}
                        fillOpacity={n.kind === "leaf" ? 0.35 : 0.18}
                        stroke={FILL[n.kind]}
                        strokeWidth={1.5}
                      />
                      <text
                        x={n.x}
                        y={n.y + n.r + 13}
                        textAnchor="middle"
                        className="fill-muted-foreground font-mono"
                        style={{ fontSize: 10 }}
                      >
                        {n.id}
                      </text>
                    </motion.g>
                  ))}
                </svg>
              </div>

              {/* side panel */}
              <div className="flex flex-col gap-4 bg-card p-5">
                {/* health score */}
                <div className="rounded-xl border border-border bg-background/40 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Code health</span>
                    <span className="flex size-9 items-center justify-center rounded-lg bg-primary font-mono text-lg font-bold text-primary-foreground">
                      A
                    </span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {[
                      ["Complexity", 82],
                      ["Test coverage", 74],
                      ["Docs", 68],
                    ].map(([label, val]) => (
                      <div key={label as string}>
                        <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                          <span>{label}</span>
                          <span className="font-mono">{val}%</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                          <motion.div
                            className="h-full rounded-full bg-primary"
                            initial={{ width: 0 }}
                            whileInView={{ width: `${val}%` }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.8, delay: 0.3 }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* stack badges */}
                <div className="rounded-xl border border-border bg-background/40 p-4">
                  <span className="text-sm font-medium">Detected stack</span>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {["TypeScript", "React", "Next.js", "Tailwind", "pnpm"].map(
                      (t) => (
                        <span
                          key={t}
                          className="rounded-md border border-border bg-secondary/50 px-2 py-1 font-mono text-xs"
                        >
                          {t}
                        </span>
                      ),
                    )}
                  </div>
                </div>

                {/* scan summary */}
                <div className="rounded-xl border border-border bg-background/40 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <ShieldCheck className="size-4 text-primary" />
                    Security scan
                  </div>
                  <ul className="mt-3 space-y-2 text-xs">
                    <li className="flex items-center justify-between">
                      <span className="text-muted-foreground">High</span>
                      <span className="rounded bg-destructive/15 px-2 py-0.5 font-mono text-destructive">
                        1
                      </span>
                    </li>
                    <li className="flex items-center justify-between">
                      <span className="text-muted-foreground">Medium</span>
                      <span className="rounded bg-chart-3/15 px-2 py-0.5 font-mono text-chart-3">
                        3
                      </span>
                    </li>
                    <li className="flex items-center justify-between">
                      <span className="text-muted-foreground">Low</span>
                      <span className="rounded bg-secondary px-2 py-0.5 font-mono text-muted-foreground">
                        7
                      </span>
                    </li>
                  </ul>
                </div>

                {/* chat hint */}
                <div className="mt-auto flex items-center gap-2 rounded-lg border border-border bg-background/40 px-3 py-2.5 text-xs text-muted-foreground">
                  <MessageSquare className="size-4 text-accent" />
                  <span className="font-mono">Ask anything about this repo…</span>
                  <Circle className="ml-auto size-1.5 animate-pulse fill-primary text-primary" />
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
