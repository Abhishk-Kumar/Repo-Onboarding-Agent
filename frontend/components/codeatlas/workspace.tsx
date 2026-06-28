import { GraphCanvas } from "./graph/graph-canvas"
import { RightPanel } from "./panel/right-panel"
import { TopBar } from "./top-bar"

export function Workspace() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <TopBar />
      <main className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        {/* main canvas ~65% */}
        <section className="relative h-[45vh] min-h-0 border-b border-border lg:h-auto lg:flex-[65] lg:border-b-0 lg:border-r">
          <GraphCanvas />
        </section>
        {/* right panel ~35% */}
        <aside className="min-h-0 flex-1 lg:flex-[35]">
          <RightPanel />
        </aside>
      </main>
    </div>
  )
}
