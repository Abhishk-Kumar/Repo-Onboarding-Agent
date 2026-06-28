"use client"

import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Check, Compass, Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { startOnboardingSSE } from "@/lib/codeatlas/client"
import { useCodeAtlas } from "@/lib/codeatlas/context"
import type { AgentActivityEvent } from "@/lib/codeatlas/types"

export function ProcessingScreen({
  repo,
  onClose,
  onComplete,
}: {
  repo: string
  onClose: () => void
  onComplete: (repoUrl: string) => void
}) {
  const [steps, setSteps] = useState<
    { message: string; state: "active" | "done" | "pending" }[]
  >([
    { message: `Cloning ${repo}...`, state: "active" },
    { message: "Parsing files...", state: "pending" },
    { message: "Building dependency graph...", state: "pending" },
    { message: "Running security scan...", state: "pending" },
    { message: "Generating AI summary...", state: "pending" },
  ])
  const [progress, setProgress] = useState(0)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { setOnboardResult } = useCodeAtlas()
  const repoUrl = repo.startsWith("http") ? repo : `https://github.com/${repo}`

  useEffect(() => {
    const cleanup = startOnboardingSSE(
      repoUrl,
      (event: AgentActivityEvent) => {
        setSteps((prev) => {
          const next = prev.map((s) =>
            s.state === "active" ? { ...s, state: "done" as const } : s,
          )
          next.push({ message: event.message, state: "active" })
          return next
        })
        setProgress((p) => Math.min(p + 18, 90))
      },
      (data) => {
        setOnboardResult({
          sessionId: data.sessionId,
          graph: data.graph,
          fileList: data.fileList,
        })
        setSteps((prev) => {
          const next = prev.map((s) =>
            s.state === "active" ? { ...s, state: "done" as const } : s,
          )
          return next
        })
        setDone(true)
        setProgress(100)
      },
      (err: string) => {
        setError(err)
      },
    )

    // Nudge progress periodically while waiting so it doesn't stay at 0%
    const nudge = setInterval(() => {
      setProgress((p) => (p < 90 ? Math.min(p + 4, 85) : p))
    }, 8000)

    return () => {
      cleanup?.()
      clearInterval(nudge)
    }
  }, [repoUrl, setOnboardResult])

  useEffect(() => {
    if (done) {
      const timer = setTimeout(() => {
        onComplete(repo)
      }, 1200)
      return () => clearTimeout(timer)
    }
  }, [done, repo, onComplete])

  const shown = steps

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 p-4 backdrop-blur-xl"
      role="dialog"
      aria-modal="true"
      aria-label="Onboarding repository"
    >
      <motion.div
        initial={{ scale: 0.95, y: 16, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 26 }}
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card p-7 shadow-2xl shadow-black/50"
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label="Cancel"
        >
          <X className="size-4" />
        </button>

        <div className="flex items-center gap-3">
          <motion.span
            animate={done ? {} : { rotate: 360 }}
            transition={
              done
                ? {}
                : { repeat: Infinity, duration: 8, ease: "linear" }
            }
            className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground"
          >
            <Compass className="size-5" />
          </motion.span>
          <div>
            <h2 className="text-base font-semibold">
              {error
                ? "Error"
                : done
                  ? "Ready to explore"
                  : "Onboarding repository"}
            </h2>
            <p className="font-mono text-xs text-muted-foreground">{repo}</p>
          </div>
        </div>

        {/* progress bar */}
        <div className="mt-6">
          <div className="mb-2 flex justify-between text-xs text-muted-foreground">
            <span>
              {error ? "Failed" : done ? "Complete" : "Analyzing..."}
            </span>
            <span className="font-mono">{progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-secondary">
            <motion.div
              className="h-full rounded-full bg-primary"
              animate={{
                width: error ? "100%" : `${progress}%`,
                background: error
                  ? "var(--sev-high)"
                  : "var(--primary)",
              }}
              transition={{ ease: "easeOut", duration: 0.5 }}
            />
          </div>
        </div>

        {/* checklist */}
        {error ? (
          <div className="mt-6 rounded-xl border border-sev-high/30 bg-sev-high/10 p-4">
            <p className="text-sm text-sev-high">{error}</p>
            <Button
              onClick={onClose}
              variant="outline"
              className="mt-3 w-full rounded-lg"
            >
              Go back
            </Button>
          </div>
        ) : (
          <ul className="mt-6 max-h-64 space-y-3 overflow-y-auto">
            {shown.map((step, i) => (
              <li key={i} className="flex items-center gap-3">
                <span
                  className={`flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                    step.state === "done"
                      ? "border-primary bg-primary text-primary-foreground"
                      : step.state === "active"
                        ? "border-primary text-primary"
                        : "border-border text-muted-foreground"
                  }`}
                >
                  <AnimatePresence mode="wait">
                    {step.state === "done" ? (
                      <motion.span
                        key="check"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{
                          type: "spring",
                          stiffness: 500,
                          damping: 20,
                        }}
                      >
                        <Check className="size-3" />
                      </motion.span>
                    ) : step.state === "active" ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <span className="size-1.5 rounded-full bg-current opacity-40" />
                    )}
                  </AnimatePresence>
                </span>
                <span
                  className={`font-mono text-sm transition-colors ${
                    step.state === "pending"
                      ? "text-muted-foreground/60"
                      : "text-foreground"
                  }`}
                >
                  {step.message}
                </span>
              </li>
            ))}
          </ul>
        )}
      </motion.div>
    </motion.div>
  )
}
