# Codebase Onboarding Agent — Specification v3 (Full Rethink)

## 0. How to use this document

This replaces the previous feature set, not just patches it. **Keep the backend foundation** — repo cloning, chunking, Chroma vector store, LangChain supervisor + sub-agent pattern, FastAPI + SSE streaming, Groq, HuggingFace embeddings. **Throw away the old "Architecture / Entry Points / Gotchas" report shape and the old flat diagram.** Build the four features in Section 3 instead. Delete dead code as you go — don't leave the old `diagram_chain.py` / entry-points logic sitting unused next to the new modules; remove it once its replacement is verified working. A project with leftover dead code from a previous design is worse than one that never had it, especially if a hiring manager opens the repo on GitHub.

Work through phases **in order**, verify each before moving on. Same code-style rule as before: simple, explicit, plain loops, plain try/except, readable by an intermediate Python/React developer.

**Environment:** Python 3.12, `uv`, macOS (Apple Silicon). Backend at `~/Desktop/CodeOnboardingAgent/backend`, frontend at `~/Desktop/CodeOnboardingAgent/frontend` (Vite + React JSX).

---

## 1. The actual problem, reframed

Every existing tool in this space (DeepWiki, Sourcegraph Cody, Greptile, Aider's repo-map) converges on the same lesson: **a static "here's the architecture" summary is the least valuable thing you can generate.** It reads fine, demos badly, and doesn't match what a developer actually does on day one.

What a developer actually does on day one, when asked to ship a small fix in an unfamiliar repo:
1. Figures out **where to even start looking** — not "what's the architecture" abstractly, but "which file do I open first for *this kind of task*."
2. Picks **one real flow** (a login, an API call, a button click) and **traces it end to end** through the actual code — this is how understanding actually forms; reading isolated file summaries doesn't build a mental model, following one path through real code does.
3. Before touching anything, asks **"what else does this touch, what might I break."**
4. Asks **specific, grounded questions** ("where does X happen") and wants an answer with exact file/line citations, not a vague paragraph.

This reframes the whole product. The deliverable isn't "a report about the repo." It's **an interactive map you explore**, anchored on one core artifact — the real dependency graph — with three things layered on top of it that mirror the four steps above. Static prose tabs are gone. Everything is graph-anchored.

---

## 2. What's kept from the existing backend (do not rebuild)

- `app/ingestion/repo_loader.py` — clone, walk, detect languages. Unchanged.
- `app/ingestion/chunker.py` — code-aware chunking. Unchanged.
- `app/ingestion/vector_store.py` — Chroma-backed store. Unchanged.
- `app/tools/code_tools.py` — `list_files`, `read_file`, `search_codebase`, `grep_pattern`. Unchanged, still used by the CodeExplorer agent.
- `app/agents/code_explorer.py`, `app/agents/supervisor.py` — kept, but the supervisor's job changes (see Section 3.4) — it now also triggers the new graph + flow-tracing pipeline, not just text-report chains.
- `app/agents/external_context.py` and `app/tools/external_tools.py` — kept as-is, used for the repo-health card (cheap, already-planned feature, low priority but free to keep).
- FastAPI + SSE pattern in `app/main.py` — kept, same mechanism, new event types.

## What's removed

- `app/chains/diagram_chain.py` (old version — invented a generic Mermaid diagram from prompted text, replaced by Section 3.1)
- The old "Entry Points" framing/chain (replaced by Section 3.2 — Start Here, which is graph-anchored, not a separate flat-list chain)
- The old `mermaid_diagram: str` field in `OnboardingReport` (replaced by `dependency_graph: dict`)
- `DiagramTab.jsx`, the old `ReportView.jsx` tab structure built around Architecture/Entry Points/Gotchas as separate prose blocks

---

## 3. The four features (the whole product)

### 3.1 The Map — real dependency graph (the foundation everything else sits on)

This is unchanged in spirit from the previous revamp spec, and it's still correct: it's the one feature you confirmed is right. Restated precisely:

**Backend — new module `app/graph/`:**
- `python_parser.py` — `parse_python_imports(file_path, repo_root) -> list[dict]`, using `ast.parse()` to find `Import`/`ImportFrom` nodes, resolving them to real in-repo file paths, discarding anything that resolves to stdlib/third-party.
- `js_parser.py` — `parse_js_imports(file_path, repo_root) -> list[dict]`, regex-based (`import...from`, `require(...)`, `export...from`), resolving relative imports against common extensions (`.js`, `.jsx`, `.ts`, `.tsx`, `/index.*`).
- `graph_builder.py` — `build_dependency_graph(repo_root, file_list) -> dict` combining both parsers' output into `{"nodes": [...], "edges": [...], "isolated_files": [...]}`, with each node tagged by top-level folder for grouping/coloring.
- This is computed once, deterministically, with **no LLM involved in structure** — only an LLM pass afterward to attach a one-line human-readable purpose label to each node (using context the CodeExplorer agent already gathered).

**Frontend — `DependencyGraphView.jsx`:** React Flow + dagre auto-layout, folder-colored nodes, click-to-highlight connected edges, zoom/pan, folder-level view by default with drill-to-file-level toggle for big repos. This is the home screen of the report — not a tab buried third in a list, **the first thing shown**, with the other three features as overlays/modes on top of it (see 3.4).

**Verification:** same as the previous spec — run against `tiangolo/fastapi`, confirm real non-empty edges with real file paths, not folder-level guesses.

---

### 3.2 Start Here — graph-derived, task-aware onboarding path

This replaces "Entry Points" entirely, and goes one step further than the previous revamp's "Reading Path": instead of one generic reading order, it asks the user **what kind of task they're onboarding for**, then computes a path biased toward that.

**Why this matters for the hiring-manager lens:** a generic "files in dependency order" list is mildly useful once and forgettable. A path that adapts to "I need to fix a bug" vs. "I need to add a new API endpoint" vs. "I just want the big picture" demonstrates the agent reasoning about *intent*, not just running one fixed graph algorithm — this is the difference between "uses a graph library" and "built an agentic system," which is the actual point of this whole project on a resume.

**Backend — `app/chains/start_here_chain.py`:**
1. Compute zero-incoming-edge, has-outgoing-edge candidate files from the dependency graph (same BFS-from-entry-points idea as before) — this is the structural backbone, computed deterministically, not guessed by an LLM.
2. Take a `goal` parameter from the user: one of `"fix_a_bug"`, `"add_a_feature"`, `"big_picture"` (presented as 3 buttons in the UI, not a free-text field — keeps it fast and demo-friendly).
   - `big_picture` → standard BFS reading order from the top entry point(s), capped at 6–8 files (same as before).
   - `add_a_feature` → bias the path toward files with the **most outgoing edges** (the "hub" files most new features end up touching — routers, schema definitions, the main agent/service registration point).
   - `fix_a_bug` → bias the path toward files that appear most often in the Gotchas/risk signals (Section 3.3) crossed with files that have high incoming-edge counts (i.e. "fragile and depended-upon" — where bugs are both likely and impactful).
3. One LLM call over the already-computed ordered list, asking only for a one-to-two sentence reason per step, grounded in real graph facts ("nothing in the repo imports this file, so start here" / "this file is imported by 14 other files, so changes here have wide impact").

**Frontend — `StartHerePanel.jsx`:** Not a separate tab — a **highlight mode on the graph itself**. When the user picks a goal, the relevant nodes on the already-visible dependency graph light up in sequence (numbered badges 1, 2, 3... appear directly on the existing graph nodes), with the reasoning shown in a side panel that scrolls in sync. The graph never goes away — this mode annotates it. This is a meaningfully different feeling from "here's tab #2 with a list in it."

---

### 3.3 Trace a Flow — follow one real user journey end-to-end (the standout feature)

This is the feature that's actually new versus the last spec, and it's the one most directly justified by what real tools and real onboarding research converge on: tracing one concrete flow end-to-end is how understanding actually forms, far more than reading isolated summaries.

**What it does:** the user picks (or the agent suggests) one entry point — e.g. an API route, a CLI command, a button's `onClick` handler — and the system traces the **actual call path** through the dependency graph and file contents, producing a step-by-step walkthrough: "Request hits `routes/onboard.py:POST /onboard` → calls `supervisor.run()` in `agents/supervisor.py` → which invokes `code_explorer` agent → which calls `search_codebase()` in `tools/code_tools.py` → which queries the Chroma store built in `vector_store.py`." Each step cites the real file (and, where feasible, function name found via the AST parse already done in 3.1 — Python's `ast` module already gives you function definitions for free while you're walking the tree for imports, so capture function names per file at the same time at near-zero extra cost).

**Backend — `app/chains/flow_trace_chain.py`:**
1. Reuse the dependency graph from 3.1, but at function-call granularity where possible: extend `python_parser.py` to also record, per file, the function/class names it defines (`ast.FunctionDef`, `ast.ClassDef` — already walking the tree, this is one more node type to capture, not new parsing work) — this gives a richer node label set for the trace narrative even if full call-graph resolution (which function calls which) is out of scope for a portfolio project.
2. Identify candidate "flow starting points" automatically: for backend code, look for common route-decorator patterns (`@app.get`, `@app.post`, `@router.get`, found via simple AST/regex matching on decorators — cheap, no LLM needed); for frontend code, look for exported component functions with `onClick`/`onSubmit` handlers (regex match is sufficient at this scope). Present these as a clickable list ("Trace: POST /onboard", "Trace: handleSubmit in InputScreen.jsx") rather than asking the user to type a flow description blind.
3. Once a starting point is picked, walk the dependency graph **forward** from that file (which files does it import, and in turn what do those import) up to a reasonable depth (e.g. 5–6 hops), and run **one** LLM call over the gathered file contents (using `read_file` from the existing tool, capped per file as already designed) to narrate the sequence as a numbered walkthrough, citing the real file at each step. This is a Chain-of-thought-over-real-structure call, not free invention — the LLM is told the exact file sequence already computed and asked only to explain *what happens* at each hop, grounded in the actual file content it's given.
4. Schema addition:
   ```python
   class FlowTraceStep(BaseModel):
       file_path: str
       function_or_symbol: str | None
       explanation: str
       step_number: int

   class FlowTrace(BaseModel):
       flow_name: str          # e.g. "POST /onboard"
       steps: list[FlowTraceStep]
   ```
   Exposed via a new endpoint `POST /trace_flow` (`{session_id, starting_file}`) — this does **not** require re-running the full agent exploration, only the already-cloned repo + already-built graph, so it should feel fast (a few seconds, one LLM call), making it safe to let the user trigger several traces in one session.

**Frontend — `FlowTraceView.jsx`:** Triggered from a small "Trace a flow ▸" control near the graph. Shows the candidate starting points as a short clickable list. On selection, **animates the path directly on the existing dependency graph** — the relevant edges light up and animate in sequence (a small moving dot/pulse along each edge, one at a time, React Flow supports animated edges natively) while a side panel narrates each step in sync. This is the single most demo-able moment in the whole app: a hiring manager clicks "Trace: POST /onboard" and watches the actual request path light up across the real graph, narrated, in under 10 seconds.

---

### 3.4 Blast Radius — what breaks if I touch this file

The fourth and last piece, directly answering the instinctive question every developer has before editing anything unfamiliar: "if I change this, what else moves." This is **cheap to build** (pure graph math, no LLM needed for the core computation) and **disproportionately useful** — exactly the kind of detail that signals product thinking rather than just feature-stuffing.

**Backend — `app/graph/blast_radius.py`:**
- `compute_blast_radius(file_path, graph) -> dict`:
  - **Direct dependents**: files with a direct edge pointing *to* this file (things that import it).
  - **Transitive dependents**: full upstream traversal (everything that depends on it, even indirectly) — capped at a sensible depth so huge repos don't return an unreadable list.
  - **Risk multiplier**: combine with the existing Gotchas detection (TODOs / secret-pattern scan, already planned in the original spec) — if a high-blast-radius file *also* has gotchas flagged in it, surface that combination explicitly: "12 files depend on this, and it contains a flagged TODO — handle with care."
- No LLM call needed for the computation itself — purely graph traversal + the existing gotchas scan. Optionally, one short LLM call to phrase the risk summary as a sentence, but the underlying numbers are exact, not generated.
- Exposed by extending the existing per-node click behavior — when a user clicks a node on the graph (already wired for highlighting in 3.1), also show its blast-radius count as a small badge, with the full dependents list available on deeper click/expand.

**Frontend:** no new top-level view — this is a **detail panel** that appears when a node is clicked on the existing graph (the same click that does edge-highlighting in 3.1 also populates this panel). Badge directly on the node itself if the blast radius is large (e.g. a small number chip showing dependent count, colored by severity) — visible even before clicking, the same way the old "risk score" idea worked, but now framed around the actually useful question ("how many things depend on this") rather than a vague composite score.

---

## 4. How the four features fit together (this matters — they are not four separate tabs)

The biggest UX mistake the old version made was tabs: Architecture / Diagram / Entry Points / Gotchas as four separate, disconnected views. **v3 has one screen** — the dependency graph — and the other three features are *modes/overlays* on that one screen, not separate destinations:

```
                     ┌─────────────────────────────┐
                     │   THE GRAPH (always visible)  │
                     │   React Flow + dagre, folder-  │
                     │   colored, zoom/pan             │
                     └───────────────┬─────────────┘
                                      │
       ┌───────────────────┬─────────┴─────────┬───────────────────┐
       ▼                   ▼                     ▼                   ▼
 [default state]    [Start Here mode]    [Trace a Flow mode]   [click any node]
 plain graph,        numbered badges       animated path          Blast Radius
 click = highlight   overlay on graph      + pulse along edges    panel + badge
 connections          + side reasoning       + side narration       on the node
```

A single persistent control bar above the graph lets the user switch between these modes (`Explore` / `Start Here` / `Trace a Flow`), but the graph itself never disappears or gets replaced — this is the structural decision that makes the product feel coherent instead of like four bolted-together demos.

---

## 5. Kept from the original plan, lower priority, build only if time allows

- **Repo health card** (stars, last commit, issue count via the already-planned `github_repo_metadata` tool) — small stat row above the graph. Cheap, already speced, doesn't need rethinking.
- **"Explain this file"** popover on right-click/long-press of any graph node — single `read_file` + short LLM summary, no agent re-run. Still a good, cheap interactivity win, kept from the previous spec.
- **Re-ask box** — kept as a fallback general-question box below the graph (not removed, just no longer the headline feature) — diagnose and fix the same way as previously speced: check `session_id` round-trip, make the Chroma store reload-from-disk a guaranteed fallback rather than relying only on an in-memory dict.

---

## 6. Updated backend file structure

```
backend/app/
├── graph/
│   ├── __init__.py
│   ├── python_parser.py        # ast-based: imports + function/class defs
│   ├── js_parser.py             # regex-based: imports
│   ├── graph_builder.py         # nodes/edges graph, folder-grouped
│   └── blast_radius.py          # dependents traversal (Section 3.4)
├── chains/
│   ├── start_here_chain.py      # Section 3.2 — replaces entry_points logic
│   ├── flow_trace_chain.py      # Section 3.3 — new
│   ├── node_label_chain.py      # small chain: one-line purpose labels for graph nodes
│   └── merge_chain.py           # CHANGED — assembles dependency_graph + optional start_here/flow data
├── routes/
│   └── onboard.py               # CHANGED — /onboard (SSE), /ask (fixed), /trace_flow (new), /start_here (new), /explain_file (new, optional)
├── models/
│   └── schemas.py               # CHANGED — see Section 3 schemas
└── (agents/, tools/, ingestion/, integrations/ — unchanged)
```

```
frontend/src/
├── components/
│   ├── InputScreen.jsx           # CHANGED — example repo chips (kept from before)
│   ├── AgentTracePanel.jsx       # CHANGED — animated trace lines (kept from before)
│   ├── DependencyGraphView.jsx   # NEW — the one main screen, React Flow + dagre
│   ├── StartHerePanel.jsx        # NEW — goal buttons + numbered overlay + reasoning side panel
│   ├── FlowTraceView.jsx         # NEW — flow picker + animated edge trace + narration panel
│   ├── BlastRadiusPanel.jsx      # NEW — click-node detail panel
│   ├── RepoHealthCard.jsx        # NEW (low priority)
│   ├── FileExplainPopover.jsx    # NEW (low priority)
│   └── ReAskBox.jsx              # CHANGED — fixed, demoted to secondary position
└── ... (App.jsx, main.jsx, index.css — restyled)
```

---

## 7. Build order

1. **`app/graph/` module** (python_parser, js_parser, graph_builder) — foundation, verify against a real repo before anything else.
2. **`app/graph/blast_radius.py`** — pure graph math on top of the already-built graph, cheap, do it right after since it needs nothing new.
3. **Re-ask bug fix** — independent, do while context is fresh.
4. **`DependencyGraphView.jsx`** — get the core graph rendering and click-to-highlight working end-to-end against real backend data before building any overlay mode on top of it.
5. **`start_here_chain.py` + `StartHerePanel.jsx`** — first overlay mode.
6. **`flow_trace_chain.py` + `FlowTraceView.jsx`** — second overlay mode, the standout feature, give this the most polish time.
7. **`BlastRadiusPanel.jsx`** wired to the click handler already built in step 4.
8. Lower-priority items (Section 5) only after 1–7 are solid.
9. Final pass: delete the old dead chains/components per Section 2's removal list, confirm nothing still imports them, confirm the app runs clean with no leftover references.

At every step, verify against a real, non-trivial public repo (`tiangolo/fastapi` as before, plus ideally one repo with a JS/TS frontend to confirm the JS parser path, e.g. a small full-stack example repo) before moving to the next step.

---

## 8. Updated resume bullet

> **Codebase Onboarding Agent** — Multi-agent system (LangChain, supervisor pattern) that turns an unfamiliar GitHub repo into an interactive dependency graph (real static analysis via Python `ast` + regex-based JS/TS import resolution, rendered with React Flow + dagre), then layers three agentic features on top of it: a goal-aware "Start Here" path (biases a graph traversal differently for bug-fix vs. feature-add vs. big-picture intents), an animated end-to-end "Trace a Flow" walkthrough that follows one real request/event path through actual file contents with LLM narration, and a zero-LLM "Blast Radius" calculator showing exactly what depends on any file before you touch it. Backed by Chroma RAG + Groq, FastAPI + SSE live agent trace.

---

## 9. One framing note for interviews

The strongest thing to say about this project, if asked "why is this interesting": *most AI codebase tools generate a summary you read once. This one is built around the idea that understanding a codebase isn't about reading a description of it — it's about tracing one real path through it, knowing where to start for the task you actually have, and knowing what you'd break before you touch anything. Those are the three things I actually do when I join a new codebase, so I built the tool to do them, instead of building a chatbot that answers questions about architecture in the abstract.*
