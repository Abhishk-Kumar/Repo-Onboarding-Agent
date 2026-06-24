import json
import time
import logging

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.ingestion.repo_loader import load_repo, cleanup_repo
from app.ingestion.chunker import chunk_files
from app.code_explorer import explore_codebase
from app.chains.analysis_chains import generate_analysis
from app.models.schemas import OnboardingReport
from app.integrations.sheets_logger import log_to_sheets

logger = logging.getLogger(__name__)

router = APIRouter()


class OnboardRequest(BaseModel):
    repo_url: str
    question: str | None = None


def _log_stage(stage: str, t0: float) -> float:
    elapsed = round(time.time() - t0, 3)
    logger.info("STAGE END: %s (%.3fs)", stage, elapsed)
    return elapsed


def _sse_event(event_type: str, data: dict) -> str:
    data["event"] = event_type
    return f"event: {event_type}\ndata: {json.dumps(data)}\n\n"


def _run_pipeline(repo_url: str, question: str | None):
    timing = {}
    llm_t0 = None

    # --- CLONE ---
    logger.info("STAGE START: Clone Repository")
    yield _sse_event("progress", {"message": "Cloning repository..."})
    t0 = time.time()
    try:
        metadata, files = load_repo(repo_url)
        timing["clone_time"] = _log_stage("Clone Repository", t0)
    except Exception as e:
        logger.exception("Clone failed for %s", repo_url)
        yield _sse_event("error", {"message": f"Failed to clone repo: {e}"})
        return

    yield _sse_event("progress", {
        "message": f"Found {metadata.file_count} files, languages: {metadata.languages_detected}",
    })

    # --- CHUNK ---
    logger.info("STAGE START: Chunk Files")
    yield _sse_event("progress", {"message": "Chunking files..."})
    t0 = time.time()
    try:
        docs = chunk_files(files, metadata.local_path)
        timing["chunk_time"] = _log_stage("Chunk Files", t0)
        yield _sse_event("progress", {"message": f"Created {len(docs)} chunks"})
    except Exception as e:
        logger.exception("Chunking failed")
        yield _sse_event("error", {"message": f"Failed to chunk files: {e}"})
        cleanup_repo(metadata.local_path)
        return

    # --- EXPLORE CODEBASE ---
    logger.info("STAGE START: Explore Codebase")
    yield _sse_event("progress", {"message": "Exploring codebase structure..."})
    t0 = time.time()
    try:
        findings = explore_codebase(metadata.local_path)
        timing["explore_time"] = _log_stage("Explore Codebase", t0)
        yield _sse_event("progress", {
            "message": f"Found {len(findings.get('entry_points', []))} entry points, "
                       f"{len(findings.get('todos', []))} TODOs, "
                       f"{len(findings.get('secrets', []))} potential secrets",
        })
    except Exception as e:
        logger.exception("Code exploration failed")
        yield _sse_event("error", {"message": f"Failed to explore codebase: {e}"})
        cleanup_repo(metadata.local_path)
        return

    # --- LLM ANALYSIS ---
    sources = [f.replace(metadata.local_path, "").lstrip("/") for f in files[:20]]

    logger.info("STAGE START: LLM Analysis")
    yield _sse_event("progress", {
        "message": "Generating comprehensive analysis... (this may take 20-30 seconds for the LLM call)",
    })
    llm_t0 = time.time()
    try:
        analysis = generate_analysis(findings, question)
        timing["llm_time"] = _log_stage("LLM Analysis", llm_t0)
    except Exception as e:
        logger.exception("Analysis generation failed")
        timing["llm_time"] = round(time.time() - llm_t0, 2) if llm_t0 else -1
        timing["total_time"] = round(sum(v for v in timing.values() if isinstance(v, (int, float))), 2)

        partial = OnboardingReport(
            architecture_summary="Analysis generation failed due to an LLM error.",
            entry_points=[],
            gotchas=[],
            mermaid_diagram="",
            direct_answer=None,
            sources=sources,
            status="partial",
            error=f"LLM analysis failed: {e}.",
            timing=timing,
        )
        cleanup_repo(metadata.local_path)
        yield _sse_event("complete", partial.model_dump())
        return

    timing["total_time"] = round(sum(v for v in timing.values() if isinstance(v, (int, float))), 2)
    logger.info("PIPELINE COMPLETE: total=%.3fs, details=%s", timing["total_time"], timing)

    report = OnboardingReport(
        architecture_summary=analysis.architecture_summary,
        entry_points=analysis.entry_points,
        gotchas=analysis.gotchas,
        mermaid_diagram=analysis.mermaid_diagram,
        direct_answer=analysis.direct_answer,
        sources=sources,
        status="complete",
        timing=timing,
    )

    try:
        log_to_sheets(repo_url, analysis.architecture_summary[:200])
    except Exception:
        logger.exception("Sheets log failed")

    cleanup_repo(metadata.local_path)

    yield _sse_event("complete", report.model_dump())


@router.post("/onboard")
async def onboard(request: OnboardRequest):
    logger.info("REQUEST START: repo=%s, question=%s", request.repo_url, bool(request.question))
    return StreamingResponse(
        _run_pipeline(request.repo_url, request.question),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


class AskRequest(BaseModel):
    session_id: str
    question: str


@router.post("/ask")
async def ask(request: AskRequest):
    return {"answer": "Re-ask endpoint not yet implemented"}
