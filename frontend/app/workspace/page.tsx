"use client"

import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Compass } from "lucide-react"
import { Workspace } from "@/components/codeatlas/workspace"
import { CodeAtlasProvider, useCodeAtlas } from "@/lib/codeatlas/context"
import { setSessionId } from "@/lib/codeatlas/api"

function WorkspacePageInner() {
  const searchParams = useSearchParams()
  const repo = searchParams.get("repo")
  const { onboardResult } = useCodeAtlas()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (onboardResult?.sessionId) {
      setSessionId(onboardResult.sessionId)
      setReady(true)
    } else if (repo) {
      setSessionId(`https://github.com/${repo}`)
      setReady(true)
    } else {
      setReady(false)
    }
  }, [onboardResult, repo])

  if (!ready) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-background p-4 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Compass className="size-7" />
        </span>
        <h2 className="text-xl font-semibold">No repository loaded</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Paste a GitHub repository URL on the home page to see its dependency graph, scan report, and AI chat.
        </p>
        <a
          href="/"
          className="mt-2 inline-block rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Go to Home
        </a>
      </div>
    )
  }

  return <Workspace />
}

export default function WorkspacePage() {
  return (
    <CodeAtlasProvider>
      <Suspense fallback={<div className="flex h-dvh items-center justify-center bg-background text-muted-foreground">Loading...</div>}>
        <WorkspacePageInner />
      </Suspense>
    </CodeAtlasProvider>
  )
}
