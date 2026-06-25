import json
import time
import logging

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.models.schemas import OnboardRequest, AskRequest, TraceFlowRequest, StartHereRequest, ExplainFileRequest
from app.ingestion.repo_loader import load_repo, cleanup_repo
from app.ingestion.chunker import chunk_files
from app.ingestion.vector_store import build_vector_store
from app.tools.code_tools import set_repo_context
from app.chains.merge_chain import assemble_full_report
from app.chains.flow_trace_chain import generate_flow_trace, find_flow_starting_points
from app.graph.graph_builder import build_dependency_graph
from app.graph.blast_radius import compute_blast_radius
from app.chains.node_label_chain import generate_node_labels

logger = logging.getLogger(__name__)

router = APIRouter()

_session_store: dict[str, dict] = {}


def _sse_event(event_type: str, data: dict) -> str:
    data["event"] = event_type
    return f"event: {event_type}\ndata: {json.dumps(data)}\n\n"


@router.post("/onboard")
async def onboard(request: OnboardRequest):
    logger.info("REQUEST START: repo=%s", request.repo_url)

    async def _run():
        timing = {}
        repo_data = None

        yield _sse_event("progress", {"message": "Cloning repository..."})
        t0 = time.time()
        try:
            metadata, files = load_repo(request.repo_url)
            timing["clone"] = round(time.time() - t0, 3)
            repo_data = metadata
        except Exception as e:
            logger.exception("Clone failed")
            yield _sse_event("error", {"message": f"Failed to clone repo: {e}"})
            return

        yield _sse_event("progress", {
            "message": f"Found {metadata.file_count} files, languages: {metadata.languages_detected}",
        })

        yield _sse_event("progress", {"message": "Chunking files for vector search..."})
        t0 = time.time()
        try:
            docs = chunk_files(files, metadata.local_path)
            timing["chunk"] = round(time.time() - t0, 3)
        except Exception as e:
            logger.exception("Chunking failed")
            yield _sse_event("error", {"message": f"Chunking failed: {e}"})
            cleanup_repo(metadata.local_path)
            return

        yield _sse_event("progress", {"message": "Building vector store..."})
        try:
            vectorstore = build_vector_store(docs, request.repo_url)
            set_repo_context(metadata.local_path, vectorstore)
        except Exception as e:
            logger.warning("Vector store build failed: %s", e)

        yield _sse_event("progress", {"message": "Building dependency graph..."})
        t0 = time.time()
        try:
            graph = build_dependency_graph(metadata.local_path, files)
            timing["graph"] = round(time.time() - t0, 3)
            timing["total"] = round(sum(v for v in timing.values() if isinstance(v, float)), 3)
        except Exception as e:
            logger.exception("Graph build failed")
            yield _sse_event("error", {"message": f"Graph build failed: {e}"})
            cleanup_repo(metadata.local_path)
            return

        yield _sse_event("progress", {"message": f"Graph built: {len(graph['nodes'])} nodes, {len(graph['edges'])} edges"})

        t0 = time.time()
        try:
            graph["nodes"] = generate_node_labels(graph["nodes"])
            timing["labels"] = round(time.time() - t0, 3)
        except Exception as e:
            logger.warning("Node labeling failed: %s", e)

        flow_candidates = find_flow_starting_points(graph)
        flow_starts = [{"label": fc["label"], "file": fc["file"]} for fc in flow_candidates[:10]]

        report_data = {
            "dependency_graph": graph,
            "flow_candidates": flow_starts,
            "sources": [n["id"] for n in graph.get("nodes", [])],
            "status": "complete",
            "timing": timing,
        }

        _session_store[request.repo_url] = {
            "repo_path": metadata.local_path,
            "graph": graph,
            "file_list": files,
        }

        yield _sse_event("complete", report_data)

    return StreamingResponse(
        _run(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/trace_flow")
async def trace_flow(request: TraceFlowRequest):
    session = _session_store.get(request.session_id)
    if not session:
        return {"error": "Session not found. Please re-onboard the repo."}

    try:
        graph = session["graph"]
        repo_root = session["repo_path"]
        flow_result = generate_flow_trace(request.starting_file, graph, repo_root)
        return flow_result
    except Exception as e:
        logger.exception("Flow trace failed")
        return {"error": str(e)}


@router.post("/start_here")
async def start_here(request: StartHereRequest):
    session = _session_store.get(request.session_id)
    if not session:
        return {"error": "Session not found. Please re-onboard the repo."}

    try:
        from app.chains.start_here_chain import generate_start_here
        result = generate_start_here(session["graph"], request.goal)
        return result
    except Exception as e:
        logger.exception("Start here failed")
        return {"error": str(e)}


@router.post("/blast_radius")
async def blast_radius(request: ExplainFileRequest):
    session = _session_store.get(request.session_id)
    if not session:
        return {"error": "Session not found. Please re-onboard the repo."}

    try:
        result = compute_blast_radius(request.file_path, session["graph"])
        return result
    except Exception as e:
        logger.exception("Blast radius failed")
        return {"error": str(e)}


@router.post("/explain_file")
async def explain_file(request: ExplainFileRequest):
    session = _session_store.get(request.session_id)
    if not session:
        return {"error": "Session not found. Please re-onboard the repo."}

    try:
        from app.tools.code_tools import read_file
        from app.llm import get_llm, call_llm_with_retry
        from langchain_core.prompts import ChatPromptTemplate
        from langchain_core.output_parsers import StrOutputParser

        import os
        original_repo_path = None
        try:
            from app.tools.code_tools import _REPO_PATH
            original_repo_path = _REPO_PATH
        except Exception:
            pass

        from app.tools.code_tools import set_repo_context
        set_repo_context(session["repo_path"], None)

        content = read_file.invoke({"file_path": request.file_path})
        if content.startswith("Error"):
            return {"error": content}

        prompt = ChatPromptTemplate.from_messages([
            ("system", "You are a code analyst. Given a file's content, write a brief 2-3 sentence explanation of what this file does, its key exports/functions, and how it fits in a codebase. Be specific and cite function names."),
            ("human", "File: {file_path}\n\nContent:\n{content}"),
        ])
        chain = prompt | get_llm() | StrOutputParser()
        explanation = call_llm_with_retry(chain, {"file_path": request.file_path, "content": content})

        return {"file_path": request.file_path, "explanation": explanation}
    except Exception as e:
        logger.exception("Explain file failed")
        return {"error": str(e)}


@router.post("/ask")
async def ask(request: AskRequest):
    session = _session_store.get(request.session_id)
    if not session:
        return {"answer": "Session not found. Please re-onboard the repo first."}

    try:
        from app.ingestion.vector_store import get_vector_store
        from app.llm import get_llm, call_llm_with_retry
        from langchain_core.prompts import ChatPromptTemplate
        from langchain_core.output_parsers import StrOutputParser

        vectorstore = get_vector_store(request.session_id)
        if vectorstore:
            results = vectorstore.similarity_search(request.question, k=5)
            context = "\n\n".join(
                f"Source: {r.metadata.get('source', 'unknown')}\n{r.page_content}"
                for r in results
            )
        else:
            context = "No vector index available."

        prompt = ChatPromptTemplate.from_messages([
            ("system", "You are a codebase assistant. Answer the user's question about the codebase based on the provided context. Cite specific file paths where relevant. If the context doesn't contain enough information, say so."),
            ("human", "Context from the codebase:\n{context}\n\nQuestion: {question}\n\nAnswer:"),
        ])
        chain = prompt | get_llm() | StrOutputParser()
        answer = call_llm_with_retry(chain, {"context": context, "question": request.question})

        return {"answer": answer}
    except Exception as e:
        logger.exception("Ask failed")
        return {"answer": f"Failed to process question: {e}"}
