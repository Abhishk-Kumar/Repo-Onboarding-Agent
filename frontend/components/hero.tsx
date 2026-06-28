"use client"

import { useRef, useState } from "react"
import { motion } from "framer-motion"
import { ArrowRight, GitBranch, Link2, UploadCloud, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { GraphBackground } from "@/components/graph-background"

type Tab = "url" | "upload"

export function Hero({ onOnboard }: { onOnboard: (repo: string) => void }) {
  const [tab, setTab] = useState<Tab>("url")
  const [url, setUrl] = useState("")
  const [dragging, setDragging] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = () => {
    if (tab === "url") {
      const repo = url.trim()
      if (!repo) {
        setError("Please enter a GitHub repository URL")
        return
      }
      if (!repo.includes("github.com") && !repo.includes("/")) {
        setError("Enter a full GitHub URL (e.g. github.com/user/repo)")
        return
      }
      setError(null)
      const short = repo.replace(/^https?:\/\/github\.com\//, "")
      onOnboard(short)
    } else {
      if (!fileName) {
        setError("Please select a .zip file to upload")
        return
      }
      setError(null)
      onOnboard(fileName)
    }
  }

  const handleFiles = (files: FileList | null) => {
    if (files && files.length > 0) { setFileName(files[0].name); setError(null) }
  }

  return (
    <section
      id="top"
      className="relative overflow-hidden border-b border-border pt-32 pb-20 sm:pt-40 sm:pb-28"
    >
      <GraphBackground className="pointer-events-none absolute inset-0 h-full w-full opacity-70" />
      {/* radial fade so content stays readable over the graph */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 35%, transparent 30%, var(--background) 78%)",
        }}
      />

      <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur"
        >
          <Sparkles className="size-3.5 text-primary" />
          AI-powered codebase onboarding
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.05, ease: "easeOut" }}
          className="text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl"
        >
          Understand any codebase in{" "}
          <span className="text-primary">minutes</span>, not weeks
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15, ease: "easeOut" }}
          className="mx-auto mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg"
        >
          Point CodeAtlas at any repository and get an interactive dependency
          graph, an AI that answers questions, and an automated security scan —
          all in one onboarding session.
        </motion.p>

        {/* Input card */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.25, ease: "easeOut" }}
          className="mx-auto mt-10 max-w-xl rounded-2xl border border-border bg-card/70 p-2 shadow-2xl shadow-black/40 backdrop-blur-xl"
        >
          {/* Tabs */}
          <div className="flex gap-1 rounded-xl bg-secondary/60 p-1">
            <TabButton active={tab === "url"} onClick={() => setTab("url")}>
              <Link2 className="size-4" />
              Repo URL
            </TabButton>
            <TabButton
              active={tab === "upload"}
              onClick={() => setTab("upload")}
            >
              <UploadCloud className="size-4" />
              Upload zip
            </TabButton>
          </div>

          {error && (
            <div className="px-3 pt-2">
              <p className="text-xs text-sev-high">{error}</p>
            </div>
          )}
          <div className="p-3">
            {tab === "url" ? (
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-background/60 px-3">
                  <GitBranch className="size-4 shrink-0 text-muted-foreground" />
                  <input
                    value={url}
                    onChange={(e) => { setUrl(e.target.value); setError(null) }}
                    onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                    placeholder="github.com/vercel/next.js"
                    className="w-full bg-transparent py-3 font-mono text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
                    aria-label="GitHub repository URL"
                  />
                </div>
                <Button
                  onClick={handleSubmit}
                  size="lg"
                  className="group h-12 shrink-0 rounded-lg font-medium"
                >
                  Onboard Repository
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDragging(true)
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDragging(false)
                    handleFiles(e.dataTransfer.files)
                  }}
                  className={`flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center transition-colors ${
                    dragging
                      ? "border-primary bg-primary/10"
                      : "border-border bg-background/60 hover:border-primary/50"
                  }`}
                >
                  <UploadCloud className="size-7 text-primary" />
                  <span className="text-sm font-medium">
                    {fileName ?? "Drop a .zip of your repo here"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    or click to browse — max 200MB
                  </span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".zip"
                    className="hidden"
                    onChange={(e) => handleFiles(e.target.files)}
                  />
                </button>
                <Button
                  onClick={handleSubmit}
                  size="lg"
                  className="group h-12 w-full rounded-lg font-medium"
                >
                  Onboard Repository
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </Button>
              </div>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.4 }}
          className="mx-auto mt-5 flex flex-wrap items-center justify-center gap-2"
        >
          <span className="text-xs text-muted-foreground/70">Try:</span>
          {[
            { label: "vercel/next.js", repo: "vercel/next.js" },
            { label: "fastapi/fastapi", repo: "fastapi/fastapi" },
            { label: "psf/requests", repo: "psf/requests" },
            { label: "pallets/flask", repo: "pallets/flask" },
          ].map((r) => (
            <button
              key={r.repo}
              onClick={() => { setUrl(`github.com/${r.repo}`); setError(null) }}
              className="rounded-full border border-border bg-card/50 px-3 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              {r.label}
            </button>
          ))}
        </motion.div>
      </div>
    </section>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {active && (
        <motion.span
          layoutId="hero-tab"
          className="absolute inset-0 rounded-lg bg-card shadow-sm"
          transition={{ type: "spring", stiffness: 400, damping: 32 }}
        />
      )}
      <span className="relative z-10 flex items-center gap-2">{children}</span>
    </button>
  )
}
