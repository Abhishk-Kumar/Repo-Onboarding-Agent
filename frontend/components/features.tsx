"use client"

import type { LucideIcon } from "lucide-react"
import {
  Network,
  MousePointerClick,
  MessageSquareCode,
  ShieldAlert,
  FileText,
  Boxes,
  Gauge,
  Share2,
} from "lucide-react"
import { Reveal } from "@/components/reveal"

type Feature = {
  icon: LucideIcon
  title: string
  desc: string
  className?: string
  accent?: boolean
}

const FEATURES: Feature[] = [
  {
    icon: Network,
    title: "Interactive dependency graph",
    desc: "Pan, zoom, and filter a live map of every module and how they connect. Click any node to trace its dependents and dependencies.",
    className: "md:col-span-2",
    accent: true,
  },
  {
    icon: MousePointerClick,
    title: "Hover-to-explain",
    desc: "Hover any file to see what it does, why it exists, and what it touches — no archaeology required.",
  },
  {
    icon: MessageSquareCode,
    title: "Chat with the repo",
    desc: "Ask anything: “Where is auth handled?” or “How do I add an endpoint?” and get answers grounded in the code.",
  },
  {
    icon: ShieldAlert,
    title: "Security & bug scan",
    desc: "Automated scan surfaces vulnerabilities and risky patterns in a severity-ranked report.",
  },
  {
    icon: FileText,
    title: "One-click repo summary",
    desc: "Get 4–5 plain-English bullet points on what the project does and how it’s structured.",
    className: "md:col-span-2",
  },
  {
    icon: Boxes,
    title: "Tech stack detection",
    desc: "Auto-detects languages, frameworks, and tooling with clean badges.",
  },
  {
    icon: Gauge,
    title: "Code health score",
    desc: "An A–F grade based on complexity, test coverage, and documentation.",
  },
  {
    icon: Share2,
    title: "Export & share",
    desc: "Export any scan as a PDF or generate a shareable read-only link for your team.",
  },
]

export function Features() {
  return (
    <section id="features" className="border-b border-border py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
            Capabilities
          </p>
          <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            Everything you need to ramp up fast
          </h2>
          <p className="mt-4 text-pretty text-muted-foreground">
            CodeAtlas turns an unfamiliar repository into a guided tour — with
            visualization, conversation, and analysis working together.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal
              key={f.title}
              delay={(i % 3) * 0.08}
              className={f.className}
            >
              <FeatureCard feature={f} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

function FeatureCard({ feature }: { feature: Feature }) {
  const Icon = feature.icon
  return (
    <div className="group relative h-full overflow-hidden rounded-2xl border border-border bg-card p-6 transition-colors hover:border-primary/40">
      <div
        className="pointer-events-none absolute -right-12 -top-12 size-32 rounded-full bg-primary/10 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
        aria-hidden="true"
      />
      <div className="flex size-11 items-center justify-center rounded-xl border border-border bg-secondary/60 text-primary">
        <Icon className="size-5" />
      </div>
      <h3 className="mt-4 text-base font-semibold">{feature.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {feature.desc}
      </p>

      {feature.accent && (
        <div className="mt-5 flex flex-wrap gap-2">
          {["import", "export", "lazy", "circular"].map((t) => (
            <span
              key={t}
              className="rounded-md border border-border bg-background/60 px-2 py-1 font-mono text-xs text-muted-foreground"
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
