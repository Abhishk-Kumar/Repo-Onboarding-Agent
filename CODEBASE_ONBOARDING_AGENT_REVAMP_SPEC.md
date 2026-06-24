# Codebase Onboarding Agent — Revamp Specification (v2)

## 0. How to use this document

This is an **addendum/revamp spec**, not a from-scratch rewrite. The backend already has a working pipeline: repo cloning, chunking, Chroma vector store, LangChain supervisor + sub-agents, FastAPI + SSE streaming, and a basic report-merge chain. **Do not throw any of that away.** This spec adds one new backend module (a real dependency-graph engine), reshapes two existing features (Diagram, Entry Points → Reading Path), fixes one known bug (re-ask), adds three new features, and fully revamps the frontend UI.

Work through phases **in order**. Verify each phase before moving to the next — this project has already lost time once to silent bugs (FAISS crash, indentation bug) that weren't caught early. Don't repeat that pattern.

**Code style rule (carried over from v1): keep all code simple and explicit.** Plain `for` loops over comprehensions where it helps readability. Plain `try/except`. Explicit variable names. The person maintaining this code is still learning — every file should be readable by someone with intermediate Python/React knowledge.

**Environment:** Python 3.12, `uv`, macOS (Apple Silicon). Backend at `~/Desktop/CodeOnboardingAgent/backend`, frontend at `~/Desktop/CodeOnboardingAgent/frontend` (Vite + React, plain JSX, not TypeScript — matches existing `frontend/` tree).

---

## 1. Why this revamp — what was wrong with v1

The first build is functionally real (it's not a fake demo — it actually clones, chunks, embeds, and runs an agent), but three things undercut it as a hiring-manager-facing project:

1. **The diagram is decorative, not informative.** Right now it's an LLM-generated Mermaid chart showing 4–5 generic folder-level boxes in a straight line (`main.py → api/app.py → agents → storage → frontend`). This is the same for almost any repo — it doesn't actually show *this* repo's structure. An LLM asked to "describe the architecture as a diagram" without being given the real import graph will average toward generic folder names, not real file-to-file relationships.

2. **"Entry Points" answers the wrong question.** It currently lists files that are technically entry points (`main.py`, `api/app.py`) with one-line descriptions of what they do. What a new developer actually wants is *an ordered reading sequence with reasoning* — "read this first, then this because it's called from the first one, then this." That's a different, more useful artifact: a **Reading Path**, not a flat list.

3. **Re-ask is broken** (likely a session/state bug, not a design flaw — the `/ask` design in the original spec is correct) and the **UI is functional but visually minimal** — flat dark panels, no hierarchy, no motion, nothing that signals product polish to someone evaluating it in 90 seconds.

This spec fixes all three and adds three new features chosen specifically because they demonstrate skills hiring managers for AI engineering roles look for: **real static analysis** (not just LLM-prompted text), **graph data structures**, and **agentic reasoning made visible**.

---

## 2. New / changed tech stack

| Layer | Choice | Why |
|---|---|---|
| Dependency graph extraction (Python) | Built-in `ast` module | No new dependency; gives a real, exact import graph — zero hallucination risk |
| Dependency graph extraction (JS/TS) | Regex-based import/require parser (no full JS parser needed) | Keeps scope sane; import statements are syntactically simple enough that regex is reliable for the common cases (`import X from 'Y'`, `import {a,b} from 'Y'`, `require('Y')`, `export ... from 'Y'`) |
| Graph rendering (frontend) | **React Flow** (`reactflow` / `@xyflow/react`) + **dagre** for auto-layout | Gives drag, zoom, pan, click-to-highlight — looks like a real product feature, not a static image. This directly matches what you described: circular nodes, curved edges, click a file and see what it touches. |
| Animation (frontend) | `framer-motion` | Industry-standard, small footprint, makes tab transitions / streaming trace / report reveal feel intentional |
| Everything else | Unchanged from v1 spec | LangChain supervisor pattern, Groq, Chroma, HuggingFace embeddings, FastAPI+SSE all stay exactly as they are |

---

## 3. New backend module: Dependency Graph Engine

This is the single most important addition. It replaces "ask the LLM to imagine a diagram" with "compute the real graph, then let the LLM only add human-readable labels/groupings on top of real data."

### File: `app/graph/python_parser.py`

Build one function:

```
parse_python_imports(file_path: str, repo_root: str) -> list[dict]
```

- Read the file, parse it with `ast.parse()`.
- Walk the AST for `ast.Import` and `ast.ImportFrom` nodes.
- For each import, resolve it to a real file path **within the repo** if possible (e.g. `from app.agents.code_explorer import X` → resolve to `app/agents/code_explorer.py` relative to `repo_root`, if that file exists in the repo). Skip/ignore imports that resolve to external packages (stdlib or third-party) — only keep internal repo-to-repo edges.
- Return a list of dicts: `{"from": <this file's relative path>, "to": <resolved relative path>, "type": "import"}`.
- Wrap the whole thing in `try/except` — if a file has a syntax error or can't be parsed, skip it and log a warning, never crash the whole graph build over one bad file.

### File: `app/graph/js_parser.py`

Build one function:

```
parse_js_imports(file_path: str, repo_root: str) -> list[dict]
```

- Read the file as plain text (no AST — JS/TS parsing is a much bigger dependency to pull in for marginal gain at this scope).
- Use `re` to match these patterns line by line:
  - `import ... from ['"](.+?)['"]`
  - `import ['"](.+?)['"]` (side-effect imports)
  - `require\(['"](.+?)['"]\)`
  - `export ... from ['"](.+?)['"]`
- For each match, resolve relative imports (`./X`, `../X`) to a real file path within the repo, trying common extensions in order: `.js`, `.jsx`, `.ts`, `.tsx`, and `/index.js` / `/index.jsx` if the resolved path is a directory. Skip anything that doesn't resolve to a real file in the repo (e.g. `from 'react'`).
- Return the same dict shape as the Python parser: `{"from": ..., "to": ..., "type": "import"}`.

### File: `app/graph/graph_builder.py`

Build one function:

```
build_dependency_graph(repo_root: str, file_list: list[str]) -> dict
```

- For every file in `file_list` (reuse the already-existing `walk_repo` output from `app/ingestion/repo_loader.py` — don't re-walk the filesystem separately):
  - If it ends in `.py`, call `parse_python_imports`.
  - If it ends in `.js`, `.jsx`, `.ts`, `.tsx`, call `parse_js_imports`.
  - Otherwise skip.
- Collect all edges into one list.
- Build the final graph dict with two keys:
  - `"nodes"`: list of `{"id": <relative path>, "label": <filename only>, "folder": <top-level folder, e.g. "agents">}` — one entry per file that appears in any edge (files with zero internal connections are excluded from the graph, since they add visual noise without showing relationships — but list them separately under a `"isolated_files"` key in case the frontend wants to show them as a fallback list).
  - `"edges"`: the raw list of `{"from", "to", "type"}` dicts.
- **This is real data, computed once, no LLM involved.** This is the part of the project worth describing carefully in an interview: "the diagram isn't LLM-generated, it's a real import graph extracted via Python's `ast` module and JS regex parsing, the LLM only labels/groups it."

### Verification for this phase

```bash
uv run python -c "
from app.ingestion.repo_loader import load_repo, cleanup_repo
from app.graph.graph_builder import build_dependency_graph

metadata, files = load_repo('https://github.com/tiangolo/fastapi')
graph = build_dependency_graph(metadata.local_path, files)
print('Nodes:', len(graph['nodes']))
print('Edges:', len(graph['edges']))
print('Sample edges:', graph['edges'][:5])
cleanup_repo(metadata.local_path)
"
```
Expected: a non-trivial node and edge count (FastAPI's repo has real internal imports across `fastapi/` — expect dozens to low hundreds of edges depending on how deep the repo goes), and the sample edges should show real plausible file-to-file paths, not folder names. **Do not proceed until you see real file paths in both `from` and `to` fields, not empty lists.**

---

## 4. Changed feature: Diagram tab → real dependency graph

### Backend change

In `app/chains/diagram_chain.py`, change its job. It previously asked the LLM to invent a Mermaid diagram from scratch. Now:

1. Call `build_dependency_graph()` from the new module (Section 3) — this happens once per onboarding run, alongside (not instead of) the existing agent exploration.
2. Pass the resulting `{"nodes": ..., "edges": ...}` structure to a **much smaller** LLM call whose only job is: assign each node a one-line human-readable purpose label (e.g. `supervisor.py` → `"Routes requests between sub-agents"`) using context already gathered by the CodeExplorer agent. The LLM is NOT inventing structure anymore, only annotating real structure. This is faster, cheaper, and can't hallucinate connections that don't exist.
3. Update `OnboardingReport` schema (`app/models/schemas.py`): replace or supplement the `mermaid_diagram: str` field with:
   ```python
   dependency_graph: dict  # {"nodes": [...], "edges": [...], "isolated_files": [...]}
   ```
   Keep `mermaid_diagram` as optional/deprecated if you want a fallback rendering path, but the frontend will primarily use `dependency_graph`.

### Frontend change

New component: `DependencyGraphView.jsx`, replacing `DiagramTab.jsx` (rename or keep both — developer's choice, but the new one is the default tab).

- Use `reactflow` (`@xyflow/react`) to render `dependency_graph.nodes` as nodes and `dependency_graph.edges` as edges.
- Use `dagre` to auto-layout nodes top-to-bottom or left-to-right (real dagre layout, not manual positioning) — pass the graph into dagre, get back `{x, y}` per node, feed those into React Flow's node positions.
- Color/group nodes by their `folder` field (e.g. all `agents/` files one color, all `tools/` files another) — gives visual structure at a glance even before reading labels.
- **Click-to-highlight**: clicking a node highlights all edges directly connected to it (incoming and outgoing) and dims everything else. This is the "click a file, see what it touches" behavior you described.
- Hover on a node shows the LLM-generated one-line purpose label in a tooltip.
- Include zoom/pan controls (React Flow gives you this almost for free via `<Controls />`).
- For very large repos (hundreds of files), default to showing only the **top-level folder graph** first (folders as nodes, aggregated edge counts between them), with a toggle to "expand to file-level" — this avoids an unreadable hairball on bigger repos while still letting power users drill in. (Compute both granularities server-side from the same edge list — grouping by folder is a simple aggregation, no extra parsing needed.)

---

## 5. Changed feature: Entry Points → Reading Path

### Backend change

New chain: `app/chains/reading_path_chain.py`.

- Input: the dependency graph (Section 3) + the CodeExplorer agent's gathered context.
- Logic (compute this, don't just prompt an LLM to guess it from nothing):
  1. Identify candidate starting files: files with **no incoming internal edges** in the dependency graph but **at least one outgoing edge** (nothing in the repo imports them, but they import other things — the classic signature of an entry point like `main.py`).
  2. From each candidate starting file, do a breadth-first traversal of the dependency graph (using the real edges) to produce a natural reading order — each subsequent file is one that's directly imported by something already in the path.
  3. Cap the path at a reasonable length (e.g. 6–8 files) — prioritize files that have the most outgoing edges (i.e. files that "explain" the most other files by extension) when there are more candidates than the cap allows.
- Then, and only then, call the LLM **once** with this computed ordered list plus gathered context, asking it to write one or two sentences of *reasoning* per step — e.g. "Start here — this is the FastAPI app factory with no internal dependents, meaning nothing in the repo calls into it; everything flows out from here." The LLM explains an already-computed path; it doesn't invent the path.
- Schema addition in `app/models/schemas.py`:
  ```python
  class ReadingPathStep(BaseModel):
      file_path: str
      reason: str
      step_number: int

  # in OnboardingReport:
  reading_path: list[ReadingPathStep]
  ```

### Frontend change

Rename the `Entry Points` tab to **`Reading Path`**. Render as a vertical numbered timeline (not a flat list) — step 1 at top, connecting line down to step 2, etc., each with the file path and the one-sentence reasoning beside it. This is a cheap but high-impact visual change — a timeline communicates "sequence" far better than a numbered list does.

---

## 6. Bug fix: Re-ask feature

This is a design-correct, implementation-broken feature per the original spec — diagnose before rewriting.

### Diagnosis steps (do these in order, don't skip to a rewrite)

1. Check whether `session_id` is actually being generated and returned by `/onboard` and then actually being sent back by the frontend on `/ask` calls. Open browser dev tools network tab, manually inspect the request payload of a failing re-ask call.
2. Check whether the Chroma store is being correctly reloaded for that session — if the backend process holds an in-memory dict of `{session_id: chroma_store}` and the dev server has restarted (common during active development), that dict is now empty and every re-ask will silently fail to find the session. If this is the cause, the fix is to **always fall back to reloading from the persisted `persist_directory` on disk** (keyed by session_id as a subfolder name) rather than relying solely on the in-memory dict — Chroma already persists to disk, so this should always work as a fallback.
3. Check the actual HTTP response code and body of a failing `/ask` call — a silent frontend failure (e.g. an uncaught promise rejection, or the response being parsed incorrectly) is just as likely as a backend bug.

### Required fix outcome

`POST /ask` must reliably: locate the persisted Chroma store for that session (in-memory if available, disk reload as fallback), run `similarity_search` against it, run a short answer chain with citations, and return — without re-cloning or re-running agent exploration. Add a basic error response (not a silent failure) if a session truly can't be found, so the frontend can show a clear message instead of doing nothing.

---

## 7. New features (for resume/interview impact)

Pick all three if time allows — each is scoped to be buildable in under a day on top of the existing pipeline, and each demonstrates a different skill to a hiring manager.

### 7a. "Risk Score" per file (extends the existing Gotchas feature)

You already detect TODOs and potential secrets. Extend this into a simple computed **risk score** per file shown directly on the dependency graph as a colored ring/border around high-risk nodes:
- +1 for each TODO/FIXME found
- +2 for each potential hardcoded secret pattern found
- +1 if the file has more than N incoming edges (a "hub" file — high blast radius if something breaks here) AND has at least one gotcha
- Surface this as a literal number/color directly on the graph node, not just buried in a separate Gotchas tab — this is what makes the diagram itself "explain the problem," not just the structure.

### 7b. Repo health snapshot (uses the already-planned GitHub API tool from the ExternalContext agent)

You already have `github_repo_metadata` planned in the original spec (Phase 3). Surface it more visibly: a small card at the top of the report — stars, last commit date, open issue count, primary language — shown immediately, before the user even looks at tabs. This costs nothing new to build (the tool already exists in the spec), just needs a dedicated UI slot instead of being buried in agent context.

### 7c. "Explain this file" inline action on every graph node

Right-click (or a small "?" icon) on any node in the dependency graph triggers a **targeted** call — not a re-run of the full pipeline, not even the general re-ask flow — that calls `read_file` on that specific file and asks the LLM for a 2–3 sentence summary of what that file does, shown in a small popover. This is fast (single file read + short LLM call) and gives the graph genuine interactivity: a hiring manager can click around the diagram during a demo and watch it explain itself file by file, live.

> Implementation note: this can reuse the existing `read_file` tool function directly (no new backend tool needed) — just add a lightweight `POST /explain_file` endpoint that takes `{session_id, file_path}`, calls `read_file`, and runs one short LLM call. Keep it outside the agent framework entirely — this doesn't need agentic reasoning, just one read + one summarize call, so keep it fast and cheap.

---

## 8. Frontend UI revamp

The current UI ("Codebase Onboarding Agent — AI-powered repository exploration") is functional but flat: dark background, boxed sections, no real visual hierarchy, no motion. Revamp goals: still minimal (don't overdesign), but with intentional hierarchy, spacing, and a few well-placed animations — the kind of polish that signals "this person thinks about product," not just "this person can call an API."

### Design direction

- Keep the dark theme (it suits a developer tool) but introduce a proper **accent color system** — right now everything is the same muted indigo. Use the indigo accent only for primary actions and active states; use distinct folder-group colors (Section 4) for the graph; use a calmer neutral gray-blue for body text panels.
- Increase whitespace between sections — current screenshots show sections touching with thin dividers only. Give each major section (Agent Activity, Tabs, Performance, Files Referenced) clear breathing room.
- Replace the flat tab bar with a more tactile tab switcher — animated underline that slides (not just snaps) between tabs using `framer-motion`'s `layoutId` shared-element technique.

### Specific component changes

1. **`AgentTracePanel.jsx`** — animate each new line in with a slight fade+slide-up as it streams in (`framer-motion`'s `AnimatePresence`), instead of just appending text instantly. This is the most "alive" part of the demo — make it feel alive.
2. **`ReportView.jsx`** — when the final report arrives, animate the tab panel content in with a fade rather than popping in instantly.
3. **`DependencyGraphView.jsx`** (Section 4) — this is the new centerpiece. Give it a dedicated larger viewport (current diagram area is cramped) — this should be the single most visually impressive screen in the whole app.
4. **`InputScreen.jsx`** — add a small set of 2–3 example public repo URLs as clickable chips ("Try: fastapi/fastapi") so a hiring manager evaluating the live demo doesn't need to go find a repo URL themselves — this single addition meaningfully lowers the friction of someone actually trying your demo instead of just reading about it.
5. **New component: `RepoHealthCard.jsx`** (Section 7b) — small horizontal stat card row at the top of the report.
6. **New component: `ReadingPathTimeline.jsx`** (Section 5) — vertical numbered timeline as described.

### What NOT to do

- Don't add a third-party UI kit wholesale (e.g. full Material UI) — keep using plain CSS / Tailwind-style utility classes if that's already the pattern in `index.css`, just apply it with more intention. Adding a heavy component library at this stage adds bundle size and visual genericness, not polish.
- Don't over-animate — motion should be purposeful (signal state changes: new trace line, tab switch, report arriving) not decorative (no bouncing logos, no gratuitous parallax).

---

## 9. Updated full project structure

```
codebase-onboarding-agent/
├── backend/
│   ├── app/
│   │   ├── graph/                         # NEW
│   │   │   ├── __init__.py
│   │   │   ├── python_parser.py           # ast-based import extraction
│   │   │   ├── js_parser.py               # regex-based import extraction
│   │   │   └── graph_builder.py           # combines into nodes/edges graph
│   │   ├── chains/
│   │   │   ├── analysis_chains.py         # unchanged
│   │   │   ├── diagram_chain.py           # CHANGED — labels real graph, doesn't invent one
│   │   │   ├── reading_path_chain.py       # NEW — replaces entry-points logic
│   │   │   └── merge_chain.py             # CHANGED — includes dependency_graph + reading_path
│   │   ├── routes/
│   │   │   └── onboard.py                  # CHANGED — fix /ask session handling, add /explain_file
│   │   ├── models/
│   │   │   └── schemas.py                  # CHANGED — new fields per Section 4/5
│   │   └── ... (agents/, tools/, ingestion/, integrations/ — unchanged from v1)
│   └── ... (unchanged)
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── InputScreen.jsx             # CHANGED — example repo chips
│       │   ├── AgentTracePanel.jsx         # CHANGED — animated trace lines
│       │   ├── ReportView.jsx              # CHANGED — animated tab transitions
│       │   ├── DependencyGraphView.jsx     # NEW — replaces DiagramTab.jsx
│       │   ├── ReadingPathTimeline.jsx     # NEW — replaces flat entry points list
│       │   ├── RepoHealthCard.jsx          # NEW
│       │   ├── ReAskBox.jsx                # CHANGED — fix bug per Section 6
│       │   └── FileExplainPopover.jsx      # NEW — Section 7c
│       └── ... (App.jsx, main.jsx, index.css — restyled, not restructured)
└── README.md
```

---

## 10. Build order

1. **Section 3** (dependency graph engine, Python + JS parsers) — standalone, testable with no other changes. Verify thoroughly before touching anything else; this is the foundation everything else in this revamp sits on.
2. **Section 6** (re-ask bug fix) — independent of everything else, fix it now while it's fresh context, don't let it linger.
3. **Section 4** (diagram chain backend change) — depends on Section 3 being done and verified.
4. **Section 5** (reading path chain) — depends on Section 3.
5. **Section 7a/7b/7c** (new features) — depend on Sections 3–5 being done; 7b is the cheapest (mostly UI), do it first among the three.
6. **Section 8** (frontend revamp) — do last, once all backend fields exist for real, so you're styling against real data instead of guessing at shapes.

At each step, re-run the relevant verification command before moving on. The original v1 spec's lesson holds here even more than before: this revamp adds real parsing logic (AST traversal, import resolution) which is exactly the kind of code that fails silently and confidently if not checked against real, non-trivial repos at each step.

---

## 11. Updated resume bullet

> **Codebase Onboarding Agent** — Multi-agent system (LangChain, supervisor pattern) that autonomously explores unfamiliar GitHub repositories: extracts a real file-level dependency graph via static analysis (Python `ast`, regex-based JS/TS import resolution), renders it as an interactive React Flow graph with dagre auto-layout and click-to-highlight relationships, and computes a graph-derived "reading path" (BFS from zero-indegree entry files) with LLM-generated reasoning per step. Backed by Chroma RAG + Groq, FastAPI + SSE live agent trace, and per-file risk scoring surfaced directly on the graph.
