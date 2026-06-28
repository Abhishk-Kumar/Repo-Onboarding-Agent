"use client"

import { useState } from "react"
import { AnimatePresence } from "framer-motion"
import { useRouter } from "next/navigation"
import { SiteHeader } from "@/components/site-header"
import { Hero } from "@/components/hero"
import { HowItWorks } from "@/components/how-it-works"
import { Features } from "@/components/features"
import { LivePreview } from "@/components/live-preview"
import { SiteFooter } from "@/components/site-footer"
import { ProcessingScreen } from "@/components/processing-screen"
import { CodeAtlasProvider } from "@/lib/codeatlas/context"

export default function Page() {
  const [repo, setRepo] = useState<string | null>(null)
  const router = useRouter()

  const handleComplete = (repoUrl: string) => {
    const short = repoUrl.replace(/^https?:\/\/github\.com\//, "")
    setRepo(null)
    router.push(`/workspace?repo=${encodeURIComponent(short)}`)
  }

  return (
    <CodeAtlasProvider>
      <main className="relative min-h-screen">
        <SiteHeader />
        <Hero onOnboard={setRepo} />
        <HowItWorks />
        <Features />
        <LivePreview />
        <SiteFooter onOnboard={setRepo} />

        <AnimatePresence>
          {repo && (
            <ProcessingScreen
              repo={repo}
              onClose={() => setRepo(null)}
              onComplete={handleComplete}
            />
          )}
        </AnimatePresence>
      </main>
    </CodeAtlasProvider>
  )
}
