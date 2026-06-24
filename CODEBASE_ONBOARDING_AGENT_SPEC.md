# Codebase Onboarding Agent — Full Build Specification

## 0. How to use this document

This is a complete build spec for an AI coding assistant (OpenCode or similar) to build this project end-to-end. Work through it **in the exact phase order given**. After finishing each phase, run the verification command listed for that phase before moving to the next one. Do not skip verification — several early bugs in this project were caused by moving ahead before confirming a previous step actually worked.

**Code style rule: keep all code simple and explicit.** Avoid clever one-liners, nested list comprehensions, or unnecessary abstraction layers. Use plain `for` loops over comprehensions where it improves readability. Use plain `try/except` blocks. Prefer explicit variable names over short ones. The person maintaining this code is still learning Python/LangChain, so every file should be readable by someone with intermediate Python knowledge — favor clarity over cleverness everywhere, even if it means a few extra lines.

**Environment:** Python 3.12, package manager `uv`, macOS (Apple Silicon), backend at `~/Desktop/CodeOnboardingAgent/backend`.

---

## 1. What this project actually is

### The problem
When a developer joins a freelance gig, a new job, or picks up an unfamiliar client codebase, there's usually no documentation. They spend hours manually clicking through files to understand: What does this app do? Where's the entry point? Where does auth/database/routing happen? Are there obvious red flags (TODOs, hardcoded secrets, fragile code)?

### The solution
A tool where a user pastes a GitHub repo URL (and optionally a specific question like "where does auth happen?"), and an AI agent autonomously explores that repo — deciding for itself which files to list, read, and search — then produces:
1. A structured onboarding report (architecture summary, entry points, gotchas)
2. A visual architecture diagram (auto-generated, Mermaid format)
3. A direct answer to the user's specific question, if asked, with file citations
4. Optionally, external context (is a dependency outdated? what do the linked docs say? repo health stats from GitHub)

### Why this is a strong resume project (not just another RAG chatbot)
- The agent **decides its own exploration path** using real tools — this isn't a scripted pipeline, the tool-call sequence depends on what each tool call reveals. This is genuinely agentic, unlike most portfolio RAG projects which are just "retrieve chunks → stuff into prompt."
- It uses a **supervisor + sub-agents** pattern (current production-standard multi-agent design in LangChain) for a real reason: code-exploration tools and external-API tools are different domains, and splitting them produces better decisions than one agent juggling 9 tools.
- It produces a **visual deliverable** (architecture diagram), not just text — this demos well live in an interview.
- It's narratively grounded in the developer's real freelance/job experience, not a tutorial reskin.

---

## 2. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Language | Python 3.12 | |
| Package manager | `uv` | already set up |
| LLM orchestration | LangChain (`create_agent`, supervisor pattern) | current standard, see Section 4 |
| LLM provider | Groq (`langchain-groq`, `llama-3.3-70b-versatile`) | free tier, already used in prior projects |
| Vector store | **Chroma** (`langchain-chroma`) | see note below — FAISS was tried first and had an unresolved crash |
| Embeddings | HuggingFace `sentence-transformers/all-MiniLM-L6-v2` (`langchain-huggingface`) | free, local, already working |
| Backend API | FastAPI + Server-Sent Events (SSE) for streaming agent trace | matches prior project (Research Agent) |
| External tools | Tavily (web search), Firecrawl (scraping), GitHub REST API (repo metadata, no auth needed for public repos), Google Sheets API (run logging) | all free-tier |
| Frontend | React (Vite) | matches prior projects |
| Diagram rendering | `mermaid.js` (CDN import in React, no backend rendering needed) | LLM outputs Mermaid syntax as text, browser renders it |
| Deployment | Render/Railway (backend) + Vercel (frontend) | matches prior project pattern |

### Important note on the vector store choice
The original plan was FAISS (`faiss-cpu`), matching prior projects (DocuMind, QueryVault). During build, `FAISS.from_documents()` and index building worked fine, but `store.similarity_search()` on a large index (~26,000 chunks from a real repo) silently crashed with no Python traceback — confirmed via isolated testing that the crash happens specifically inside `store.index.search()` (the raw FAISS C++ call), not in embedding or chunking. This is a known class of issue with `faiss-cpu` wheels on macOS/Apple Silicon with certain Python versions. **Decision: use Chroma instead of FAISS for this project.** Chroma has a simpler persistence model (`persist_directory` passed at creation, auto-persists) and avoided this crash in initial testing. If Chroma has issues, the fallback is `faiss-cpu` pinned to an older version, but try Chroma first.

---

## 3. UI / UX — what the user actually sees

### Screen 1 — Input
- Text field: GitHub repo URL
- Text field (optional): a specific question, e.g. "where does auth happen?"
- Button: "Start Onboarding"

### Screen 2 — Live agent trace (shown immediately after clicking the button, streamed via SSE)
A scrolling panel showing each tool call as it happens, e.g.:
```
Listing root directory...
Found: app/, routes/, models/
Reading app/main.py...
Searching codebase: "auth setup"
Generating architecture diagram...
```
This is the most demo-worthy part of the project — it visibly shows the agent making decisions in real time, not running a fixed script.

### Screen 3 — Final report (tabbed)
- **Architecture Summary** tab — prose overview: frameworks used, folder responsibilities, request flow
- **Diagram** tab — rendered Mermaid flowchart (boxes + arrows showing module relationships)
- **Entry Points** tab — clickable list of "if you only read 3 files, read these," with file paths
- **Gotchas** tab — list of TODO/FIXME comments, hardcoded secrets/config smells, fragile patterns found
- **Direct Answer** section (only shown if the user asked a question) — answer with file citations

### Re-ask box
Below the report: a text input for follow-up questions. This does **not** re-run the full agent exploration — it queries the already-built vector store directly (fast, cheap), since the codebase has already been indexed.

---

## 4. System architecture

```
                    ┌───────────────────────┐
                    │   Supervisor Agent      │  (routes + merges)
                    └──────────┬─────────────┘
              ┌────────────────┼─────────────────┐
              ▼                                   ▼
    ┌──────────────────────┐           ┌──────────────────────────┐
    │  CodeExplorer Agent    │           │  ExternalContext Agent     │
    │  (sub-agent)            │           │  (sub-agent)                │
    ├──────────────────────────┤           ├──────────────────────────────┤
    │ list_files                │           │ tavily_search                 │
    │ read_file                  │           │ firecrawl_scrape                │
    │ search_codebase (Chroma)   │           │ github_repo_metadata             │
    │ grep_pattern                │           │                                    │
    └──────────────────────────┘           └──────────────────────────────┘
              │                                   │
              └────────────────┬─────────────────┘
                                ▼
                    RunnableParallel merge
       (Architecture Summary / Entry Points / Gotchas / Mermaid Diagram)
                                ▼
                    Pydantic-structured Report
                                ▼
                    Google Sheets logging (fire-and-forget)
```

**Why two sub-agents instead of one agent with 7 tools:** a single agent juggling code-exploration tools and external-API tools makes worse routing decisions — it doesn't reliably know when to stop reading files versus when to check GitHub repo health or search Tavily for "is this dependency deprecated." Splitting by domain, with a supervisor routing between them, is the standard justification for the supervisor/sub-agent pattern, not just for variety on a resume.

**Supervisor routing logic:** the supervisor should decide, per request, whether the ExternalContext agent is even needed. If the user just wants entry points and architecture, skip external calls entirely (saves cost and latency). This "cost-aware routing" decision is itself worth describing in an interview.

---

## 5. Full project structure

```
codebase-onboarding-agent/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                       # FastAPI entrypoint
│   │   ├── config.py                     # env vars, settings        [DONE]
│   │   ├── ingestion/
│   │   │   ├── __init__.py
│   │   │   ├── repo_loader.py             # clone repo, walk files   [DONE]
│   │   │   ├── chunker.py                 # code-aware splitting    [DONE]
│   │   │   └── vector_store.py            # Chroma embed + store    [NEEDS FIX — see Phase 1b]
│   │   ├── tools/
│   │   │   ├── __init__.py
│   │   │   ├── code_tools.py              # list_files, read_file, search_codebase, grep_pattern
│   │   │   └── external_tools.py          # tavily, firecrawl, github_api
│   │   ├── agents/
│   │   │   ├── __init__.py
│   │   │   ├── code_explorer.py
│   │   │   ├── external_context.py
│   │   │   └── supervisor.py
│   │   ├── chains/
│   │   │   ├── __init__.py
│   │   │   ├── analysis_chains.py         # RunnableParallel chains
│   │   │   ├── diagram_chain.py           # Mermaid generation
│   │   │   └── merge_chain.py             # Pydantic merge
│   │   ├── integrations/
│   │   │   ├── __init__.py
│   │   │   └── sheets_logger.py           # Google Sheets logging
│   │   ├── models/
│   │   │   ├── __init__.py
│   │   │   └── schemas.py                 # Pydantic models          [PARTIAL — has RepoMetadata only]
│   │   └── routes/
│   │       ├── __init__.py
│   │       └── onboard.py                 # SSE endpoints
│   ├── data/                              # local Chroma index storage (gitignored)
│   ├── pyproject.toml
│   ├── uv.lock
│   └── .env
├── frontend/                              # React (Vite) — built after backend is fully working
│   └── src/
│       ├── App.jsx
│       ├── components/
│       │   ├── InputScreen.jsx
│       │   ├── AgentTracePanel.jsx
│       │   ├── ReportView.jsx
│       │   ├── DiagramTab.jsx
│       │   └── ReAskBox.jsx
│       └── main.jsx
└── README.md
```

**Build order: finish the entire backend first (Phases 1–7 below). Do not start the frontend until Phase 7 is verified working end-to-end via curl/Postman, returning correct JSON/SSE output.**

---

## 6. Phase-by-phase build instructions

### Phase 1 — Ingestion pipeline

**Status: mostly done, one fix required before continuing.**

#### Phase 1a — already complete, do not rewrite unless broken
- `app/config.py` — Pydantic `Settings` class loading from `.env`: `groq_api_key`, `embedding_model` (default `"sentence-transformers/all-MiniLM-L6-v2"`), and a path setting for the vector store directory (currently named `faiss_index_path`, can rename to `vector_store_path` for clarity now that it's Chroma).
- `app/models/schemas.py` — has `RepoMetadata` (fields: `url`, `local_path`, `file_count`, `languages_detected`). Keep this. More schemas will be added in Phase 5.
- `app/ingestion/repo_loader.py` — has `clone_repo`, `walk_repo`, `detect_languages`, `load_repo`, `cleanup_repo`. Verified working: tested against `https://github.com/tiangolo/fastapi`, correctly returns ~2986 files, 2 detected languages, and metadata.
- `app/ingestion/chunker.py` — has `get_splitter`, `chunk_file`, `chunk_files`. Verified working after fixing an indentation bug (the `return` statement was inside the `for` loop in `chunk_files`, causing it to only process the first file). Confirmed working: 2986 files → 26,585 chunks.

#### Phase 1b — REQUIRED FIX before moving to Phase 2

Current `app/ingestion/vector_store.py` uses FAISS and has a confirmed crash: `store.index.search()` crashes silently (no Python exception, no traceback) when called on a large index (~26,585 vectors) built from a real repo. Isolated testing confirmed: embedding the query works fine (`embed_query` returns a valid 384-length vector), but the raw FAISS `.search()` call never completes or returns — the process just exits.

**Action: rewrite `vector_store.py` to use Chroma instead of FAISS.**

Steps:
1. Add dependencies: `langchain-chroma` and `chromadb`.
2. Rewrite the four functions to use `Chroma` instead of `FAISS`:
   - `get_embeddings()` — unchanged, still returns `HuggingFaceEmbeddings`.
   - `build_vector_store(documents)` — use `Chroma.from_documents(documents, embeddings, persist_directory=<path from config>)`. Unlike FAISS, Chroma persists automatically when given a `persist_directory` at creation time — there is no separate save step needed.
   - `save_index(store, path)` — Chroma auto-persists, so this function is no longer strictly necessary. Either remove it, or keep it as a no-op for interface consistency with the rest of the codebase — developer's choice, but document the decision in a code comment either way.
   - `load_index(path)` — construct `Chroma(persist_directory=path, embedding_function=get_embeddings())` and return it.
3. Update type hints from `FAISS` to `Chroma` throughout the file.
4. Remove the `faiss-cpu` dependency once Chroma is confirmed working (don't remove it preemptively in case a rollback is needed).

**Verification command for Phase 1 (run this exact test after the fix):**
```bash
uv run python -c "
from app.ingestion.repo_loader import load_repo, cleanup_repo
from app.ingestion.chunker import chunk_files
from app.ingestion.vector_store import build_vector_store

metadata, files = load_repo('https://github.com/tiangolo/fastapi')
docs = chunk_files(files, metadata.local_path)
print('Total chunks:', len(docs))

store = build_vector_store(docs)
print('Index built')

results = store.similarity_search('dependency injection', k=2)
print('Results found:', len(results))
for r in results:
    print(r.metadata['source'])

cleanup_repo(metadata.local_path)
"
```
Expected output: `Total chunks: 26585` (approximately), `Results found: 2`, and two file paths printed. **Do not proceed to Phase 2 until this prints actual file paths.** If it still fails, the fallback is to try `faiss-cpu` pinned to an earlier version (e.g. `1.7.4`) before abandoning FAISS entirely, but attempt Chroma first since it's the simpler fix.

---

### Phase 2 — CodeExplorer sub-agent tools

File: `app/tools/code_tools.py`

Build four tool functions, each decorated with LangChain's `@tool` decorator (`from langchain_core.tools import tool`) so they can be passed directly to an agent:

1. **`list_files(path: str) -> str`**
   Lists immediate contents (files and folders) of a given directory path within the cloned repo. Should not recurse into subdirectories — that's what makes the agent's own exploration decisions meaningful (it chooses what to explore next). Return a simple newline-separated string of names, with folders marked (e.g. trailing `/`).

2. **`read_file(path: str) -> str`**
   Reads and returns the raw text content of a single file, given its path. Should cap the returned content at a reasonable length (e.g. first 3000 characters) to avoid blowing up the agent's context window on huge files, and note in the returned string if it was truncated.

3. **`search_codebase(query: str) -> str`**
   Runs `similarity_search` against the Chroma vector store built in Phase 1, returns the top 3–5 matching chunks concatenated with their `source` file path labeled above each chunk, so the agent can see both the content and where it came from.

4. **`grep_pattern(pattern: str) -> str`**
   Does an exact-match (not semantic) search across all files in the cloned repo for a literal string or simple pattern (e.g. `@app.route`, `class.*Controller`). Use Python's `re` module for pattern matching, walk the file list (reuse `walk_repo` from Phase 1), and return matching file paths with the matching line shown.

Each tool needs access to the current repo's local path and vector store — pass these in via a simple module-level pattern (e.g. a small class or set of module-level variables that get initialized once per onboarding request, then the tool functions reference them). Keep this simple — no need for complex dependency injection here.

**Verification:** write a small standalone test that calls each of the four tools directly (not through an agent yet) against the cloned FastAPI repo and prints the output, confirming each one returns sensible results before wiring them into an agent.

---

### Phase 3 — ExternalContext sub-agent tools

File: `app/tools/external_tools.py`

Build three tool functions, also using `@tool`:

1. **`tavily_search(query: str) -> str`**
   Uses `langchain_community.tools.tavily_search.TavilySearchResults` or the Tavily SDK directly, requires `TAVILY_API_KEY` in `.env` (free tier). Use for queries like "is [library name] still maintained" or "known issues with [framework]."

2. **`firecrawl_scrape(url: str) -> str`**
   Uses the Firecrawl API (free tier) to scrape a given URL (e.g. a docs page linked from the repo's README) and return clean markdown/text content. Requires `FIRECRAWL_API_KEY` in `.env`.

3. **`github_repo_metadata(owner: str, repo: str) -> str`**
   Calls the public GitHub REST API (`https://api.github.com/repos/{owner}/{repo}`) — no authentication needed for public repo metadata, though an optional `GITHUB_TOKEN` in `.env` raises rate limits. Return stars, last commit date, open issue count, and primary language as a formatted string.

**Verification:** test each function standalone with real inputs, confirm sensible output, confirm graceful handling (return an informative string, not a crash) if an API key is missing or a request fails.

---

### Phase 4 — Agents

Files: `app/agents/code_explorer.py`, `app/agents/external_context.py`, `app/agents/supervisor.py`

1. **`code_explorer.py`** — build the CodeExplorer agent using LangChain's current `create_agent` API (not the deprecated `create_react_agent` import path), passing it the four Phase 2 tools and a system prompt describing its job: explore the given repo using the tools to gather enough context to describe its architecture, entry points, and any code smells. Cap the agent at a reasonable max tool-call count (e.g. 12) so it terminates predictably.

2. **`external_context.py`** — same pattern, using the three Phase 3 tools, with a system prompt describing its job: check external context (dependency health, linked docs, repo stats) only for the specific things the supervisor asks it to check.

3. **`supervisor.py`** — use LangChain's supervisor pattern (`create_supervisor` if available in the installed LangChain version, or a manually written router agent that calls the two sub-agents as tools) to coordinate both agents. The supervisor's prompt should explicitly instruct it to skip invoking the ExternalContext agent unless the user's question concerns dependency health, external documentation, or repository statistics — this is the "cost-aware routing" decision described in Section 4.

**Verification:** run the CodeExplorer agent standalone first against a real repo, inspect its tool-call trace (print each tool call and result as it happens) to confirm it's making sensible decisions, before wiring in the supervisor.

---

### Phase 5 — Pydantic schemas, RunnableParallel chains, diagram generation, merge

Files: `app/models/schemas.py` (extend), `app/chains/analysis_chains.py`, `app/chains/diagram_chain.py`, `app/chains/merge_chain.py`

1. Extend `schemas.py` with a final report schema, e.g. `OnboardingReport` with fields: `architecture_summary: str`, `entry_points: list[str]`, `gotchas: list[str]`, `mermaid_diagram: str`, `direct_answer: str | None`, `sources: list[str]`.

2. `analysis_chains.py` — build three independent chains using `RunnableParallel`, each taking the gathered agent context as input and producing one piece of the report (architecture summary, entry points, gotchas). Each is a simple prompt + LLM + output parser chain.

3. `diagram_chain.py` — a fourth chain that takes the same gathered context and prompts the LLM to output **only** a valid Mermaid flowchart string (e.g. `graph TD; A-->B;` syntax) describing the repo's module structure and data flow. Be explicit in the prompt that the output must be valid Mermaid syntax only, no markdown code fences, no explanation text — the frontend will render this raw string directly.

4. `merge_chain.py` — combines the outputs of all four chains plus, if the user asked a question, a direct-answer chain, into the final `OnboardingReport` Pydantic object. Add a retry-with-fix-prompt fallback if Mermaid syntax parsing/validation fails (reuse the `tenacity` retry pattern from the prior Research Agent project's Groq error handling).

**Verification:** run the full chain against gathered context from a test agent run, print the resulting `OnboardingReport`, confirm all fields are populated and the Mermaid string is syntactically plausible (can be pasted into the Mermaid Live Editor at mermaid.live to visually confirm it renders).

---

### Phase 6 — Google Sheets logging (optional but cheap, do after Phase 5 works)

File: `app/integrations/sheets_logger.py`

After each completed onboarding run, append a row to a Google Sheet: `{repo_url, timestamp, summary_snippet}`. Use `gspread` with a service account JSON key (stored as an env var path, not committed to git). This call should be fire-and-forget — wrap it so a failure here never blocks or breaks the main response to the user.

**Verification:** confirm a row actually appears in a real test Google Sheet after running a full onboarding request.

---

### Phase 7 — FastAPI backend wiring

Files: `app/main.py`, `app/routes/onboard.py`

1. `POST /onboard` — accepts `{repo_url: str, question: str | None}`, kicks off the full pipeline (clone → chunk → embed → supervisor/agents → merge chain), and streams progress via Server-Sent Events: each tool call and major step should be pushed to the client as it happens (this is what powers the live agent trace panel in the UI), ending with the final `OnboardingReport` JSON.

2. `POST /ask` — accepts `{session_id: str, question: str}` for the re-ask flow: does **not** re-run repo cloning or agent exploration, only queries the already-built vector store (`search_codebase` directly) and runs a quick answer chain. Requires keeping the built vector store in memory or reloading it from the persisted Chroma directory, keyed by a session identifier.

**Backend is considered complete only when this verification passes:**
```bash
curl -X POST http://localhost:8000/onboard \
  -H "Content-Type: application/json" \
  -d '{"repo_url": "https://github.com/tiangolo/fastapi", "question": "where does dependency injection happen?"}'
```
This should stream visible progress events and end with a complete, valid JSON report including a populated `mermaid_diagram` field and a `direct_answer` referencing real files.

**Do not begin frontend work (Phase 8 below) until this curl test passes cleanly on a real public repo.**

---

### Phase 8 — Frontend (React + Vite) — only after backend is fully verified

Build in this order:
1. `InputScreen.jsx` — repo URL + optional question form, posts to `/onboard`, opens an `EventSource` (or fetch with streaming) connection to consume the SSE stream.
2. `AgentTracePanel.jsx` — renders each incoming SSE event as a line in a scrolling list, live, as the agent works.
3. `ReportView.jsx` — tabbed layout (Architecture / Diagram / Entry Points / Gotchas / Direct Answer) once the final report event arrives.
4. `DiagramTab.jsx` — renders the `mermaid_diagram` string using `mermaid.js` (import from CDN, call `mermaid.render()` on mount with the string).
5. `ReAskBox.jsx` — posts follow-up questions to `/ask`, appends the answer below the main report without re-triggering the trace panel.

---

## 7. Resume bullet (use once the project is complete and deployed)

> **Codebase Onboarding Agent** — Multi-agent system (LangChain, supervisor pattern) that autonomously explores unfamiliar GitHub repositories using 7 tools across 2 specialized sub-agents (code exploration via Chroma-backed RAG + external context via Tavily/Firecrawl/GitHub API), generates live Mermaid architecture diagrams, and produces structured onboarding reports (Pydantic) with cited file paths. Built with `RunnableParallel` for concurrent analysis, FastAPI + SSE for real-time agent trace visualization, and Google Sheets logging for run history.

---

## 8. Things to watch for (lessons already learned during this build)

- **Indentation bugs are silent and severe in Python.** A `return` statement placed one level too deep inside a loop will make the loop only run once, with no error raised. Always test list-processing functions against more than one input item to catch this class of bug.
- **`faiss-cpu` had an unresolved silent crash on this machine** during large-index similarity search — no traceback, just an exit. If anything FAISS-related needs revisiting, isolate the exact failing call (embedding vs. raw index search) before assuming the fix; don't guess.
- **Function name mismatches between definition and call site** (e.g. `build_vectorstore` vs `build_vector_store`) cause `ImportError` — keep naming consistent (snake_case with clear word separation) across all files in this project.
- Always test ingestion-pipeline changes against a real, reasonably large public repo (FastAPI's repo, ~2986 files, was used throughout this build) — small toy inputs can hide bugs that only appear at scale.
