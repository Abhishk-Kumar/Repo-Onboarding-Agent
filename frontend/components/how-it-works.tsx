"use client"

import { UploadCloud, BrainCircuit, Workflow, MessageSquareCode } from "lucide-react"
import { Reveal } from "@/components/reveal"

const STEPS = [
  {
    icon: UploadCloud,
    title: "Paste or Upload",
    desc: "Drop a GitHub URL or upload a zip. Public or private — your code never leaves your control.",
  },
  {
    icon: BrainCircuit,
    title: "AI Analyzes",
    desc: "CodeAtlas parses every file, resolves imports, and builds a semantic model of the project.",
  },
  {
    icon: Workflow,
    title: "Explore the Graph",
    desc: "Navigate an interactive dependency map and hover any node for a plain-English explanation.",
  },
  {
    icon: MessageSquareCode,
    title: "Chat & Scan",
    desc: "Ask the AI anything about the repo and review a severity-ranked security report.",
  },
]

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="border-b border-border py-20 sm:py-28"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
            How it works
          </p>
          <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            From clone to clarity in four steps
          </h2>
        </Reveal>

        <div className="relative mt-14 grid gap-6 md:grid-cols-4">
          {/* connecting line on desktop */}
          <div className="absolute left-0 right-0 top-7 hidden h-px bg-gradient-to-r from-transparent via-border to-transparent md:block" />
          {STEPS.map((step, i) => (
            <Reveal key={step.title} delay={i * 0.1}>
              <div className="relative flex flex-col items-center text-center md:items-start md:text-left">
                <div className="relative z-10 flex size-14 items-center justify-center rounded-xl border border-border bg-card">
                  <step.icon className="size-6 text-primary" />
                  <span className="absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full bg-primary font-mono text-xs font-bold text-primary-foreground">
                    {i + 1}
                  </span>
                </div>
                <h3 className="mt-5 text-base font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {step.desc}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
