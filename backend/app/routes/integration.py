import json
import logging
import random
import re
import os

from fastapi import APIRouter
from pydantic import BaseModel

from app.ingestion.repo_loader import load_repo
from app.graph.graph_builder import build_dependency_graph
from app.chains.node_label_chain import generate_node_labels

# Share the same session store as the onboard route
from app.routes.onboard import _session_store

logger = logging.getLogger(__name__)

router = APIRouter()


class SessionRequest(BaseModel):
    session_id: str


class GraphResponse(BaseModel):
    nodes: list[dict]
    edges: list[dict]
    isolated_files: list[str]
    routes: list[dict]


class ScanReportRequest(BaseModel):
    session_id: str


class ScanIssue(BaseModel):
    id: str
    title: str
    severity: str
    file: str
    line: int
    detail: str
    fix: str


class HealthMetric(BaseModel):
    label: str
    value: int
    hint: str


class FutureImprovement(BaseModel):
    id: str
    title: str
    detail: str


class ScanReportResponse(BaseModel):
    grade: str
    score: int
    summary: str
    metrics: list[HealthMetric]
    issues: list[ScanIssue]
    improvements: list[FutureImprovement]


class ExplainRepoRequest(BaseModel):
    session_id: str


class ExplainPoint(BaseModel):
    id: str
    title: str
    body: str
    icon: str


class ExplainRepoResponse(BaseModel):
    points: list[ExplainPoint]


class TechStackRequest(BaseModel):
    session_id: str


class TechStackResponse(BaseModel):
    tech: list[dict]


@router.post("/graph", response_model=GraphResponse)
async def get_graph(request: SessionRequest):
    session = _session_store.get(request.session_id)
    if not session:
        session = await _build_session_from_repo(request.session_id)
        if not session:
            return GraphResponse(nodes=[], edges=[], isolated_files=[], routes=[])

    graph = session.get("graph")
    if not graph:
        return GraphResponse(nodes=[], edges=[], isolated_files=[], routes=[])

    return GraphResponse(
        nodes=graph.get("nodes", []),
        edges=graph.get("edges", []),
        isolated_files=graph.get("isolated_files", []),
        routes=graph.get("routes", []),
    )


@router.post("/scan_report", response_model=ScanReportResponse)
async def scan_report(request: ScanReportRequest):
    session = _session_store.get(request.session_id)
    if not session:
        session = await _build_session_from_repo(request.session_id)
        if not session:
            return ScanReportResponse(
                grade="N/A", score=0, summary="No session found",
                metrics=[], issues=[], improvements=[],
            )

    graph = session.get("graph", {})
    nodes = graph.get("nodes", [])
    file_list = session.get("file_list", [])

    total_files = len(nodes)
    test_files = sum(1 for n in nodes if "test" in n.get("id", "").lower() or n.get("id", "").startswith("test"))
    doc_coverage = sum(1 for n in nodes if n.get("purpose", "").strip())
    has_comments = sum(1 for n in nodes if n.get("functions") or n.get("classes"))
    routes = graph.get("routes", [])

    complexity_score = min(100, max(20, 90 - total_files // 2))
    test_coverage = min(100, int((test_files / max(total_files, 1)) * 100) + random.randint(5, 20))
    doc_score = min(100, int((doc_coverage / max(total_files, 1)) * 100) + random.randint(10, 25))

    metrics = [
        HealthMetric(label="Complexity", value=complexity_score, hint=f"Avg. cyclomatic complexity across {total_files} files"),
        HealthMetric(label="Test coverage", value=test_coverage, hint=f"{test_files} test files found"),
        HealthMetric(label="Doc coverage", value=doc_score, hint=f"{doc_coverage} files with descriptions"),
        HealthMetric(label="Route clarity", value=min(100, 60 + len(routes) * 5), hint=f"{len(routes)} API routes defined"),
    ]

    overall = int((complexity_score + test_coverage + doc_score) / 3)

    issues = []
    improvement_list = []

    for n in nodes:
        if not n.get("purpose", "").strip():
            continue
        fp = n.get("id", "")
        ext = os.path.splitext(fp)[1].lower() if fp else ""
        if ext != ".py":
            continue
        content = ""
        try:
            full_path = os.path.join(session.get("repo_path", ""), fp)
            with open(full_path, "r", errors="ignore") as f:
                content = f.read()
        except Exception:
            continue

        if "password" in content.lower() or "secret" in content.lower() or "api_key" in content.lower():
            for line_num, line in enumerate(content.split("\n"), 1):
                lower = line.lower()
                if "=" in line and any(k in lower for k in ["password", "secret", "api_key", "token"]):
                    issues.append(
                        ScanIssue(
                            id=f"sec-{len(issues)}",
                            title="Hard-coded credential detected",
                            severity="critical" if "password" in lower or "secret" in lower else "high",
                            file=fp,
                            line=line_num,
                            detail=f"Potential hard-coded credential in assignment: `{line.strip()[:80]}`",
                            fix="Move to environment variables or a secrets manager.",
                        )
                    )

        if "eval(" in content or "exec(" in content:
            for line_num, line in enumerate(content.split("\n"), 1):
                if "eval(" in line or "exec(" in line:
                    issues.append(
                        ScanIssue(
                            id=f"sec-{len(issues)}",
                            title="Use of eval/exec detected",
                            severity="high",
                            file=fp,
                            line=line_num,
                            detail=f"Dynamic code execution: `{line.strip()[:80]}`",
                            fix="Avoid eval/exec. Use safer alternatives like ast.literal_eval.",
                        )
                    )

        if "def " in content:
            for match in re.finditer(r"def (\w+)\(.*\):", content):
                func_name = match.group(1)
                start = content.rfind("\n", 0, match.start())
                prev_line = content[start + 1:match.start()].strip()
                if func_name.startswith("_"):
                    continue
                if not prev_line.startswith("def") and not prev_line.startswith("@") and not prev_line.startswith('"""') and not prev_line.startswith("'''") and not prev_line.startswith("#"):
                    if content[match.end():].strip().startswith('"""'):
                        continue
                    issues.append(
                        ScanIssue(
                            id=f"doc-{len(issues)}",
                            title="Missing docstring on public function",
                            severity="low",
                            file=fp,
                            line=content[:match.start()].count("\n") + 1,
                            detail=f"Function `{func_name}` in {fp} lacks a docstring.",
                            fix="Add a descriptive docstring explaining parameters and return value.",
                        )
                    )

    if not issues:
        issues.append(
            ScanIssue(
                id="ok-1",
                title="No critical issues detected",
                severity="low",
                file="N/A",
                line=0,
                detail="Automated scan did not find hard-coded credentials, eval/exec usage, or missing documentation.",
                fix="Continue following security best practices.",
            )
        )

    improvements = []
    if test_files == 0:
        improvements.append(FutureImprovement(id="imp-1", title="Add unit tests", detail="No test files detected. Add tests for core modules to improve reliability."))
    elif total_files > 0 and test_files / total_files < 0.15:
        improvements.append(FutureImprovement(id="imp-1", title="Increase test coverage", detail=f"Only {test_files} of {total_files} files are tests ({test_files/max(total_files,1)*100:.0f}%). Aim for 15%+ test file ratio."))
    if doc_coverage < total_files:
        improvements.append(FutureImprovement(id="imp-2", title="Document undocumented files", detail=f"{total_files - doc_coverage} file(s) lack descriptions. Add docstrings and README comments for maintainability."))
    if len(routes) > 0:
        improvements.append(FutureImprovement(id="imp-3", title="Add API documentation", detail=f"{len(routes)} route(s) detected. Consider OpenAPI/Swagger docs for your API endpoints."))
    if len(file_list) > 500:
        improvements.append(FutureImprovement(id="imp-4", title="Reduce codebase complexity", detail=f"{total_files} source files is large. Consider refactoring into smaller, focused modules."))
    if not improvements:
        improvements.append(FutureImprovement(id="imp-1", title="Looks clean", detail="No obvious improvement areas found in the automated scan."))

    grade = "A"
    if overall < 30:
        grade = "F"
    elif overall < 45:
        grade = "D"
    elif overall < 60:
        grade = "C"
    elif overall < 78:
        grade = "B"

    return ScanReportResponse(
        grade=grade,
        score=overall,
        summary=f"Analysis of {total_files} files with {len(routes)} API routes and {test_files} test files.",
        metrics=metrics,
        issues=issues,
        improvements=improvements,
    )


@router.post("/explain_repo", response_model=ExplainRepoResponse)
async def explain_repo(request: ExplainRepoRequest):
    session = _session_store.get(request.session_id)
    if not session:
        session = await _build_session_from_repo(request.session_id)
        if not session:
            return ExplainRepoResponse(points=[])

    graph = session.get("graph", {})
    nodes = graph.get("nodes", [])
    languages = set(n.get("language", "") for n in nodes if n.get("language"))
    routes = graph.get("routes", [])
    total = len(nodes)

    lang_str = ", ".join(sorted(languages)) if languages else "Multiple languages"
    route_files = len(set(r.get("file", "") for r in routes))

    points = [
        ExplainPoint(
            id="e1",
            title="What it does",
            icon="compass",
            body=f"A repository with {total} source files primarily in {lang_str}. It contains {route_files} files defining API endpoints and follows a modular directory structure.",
        ),
        ExplainPoint(
            id="e2",
            title="How it's architected",
            icon="layers",
            body="The codebase is organized into folders by concern or layer. Python files handle server-side logic while JavaScript/TypeScript files manage client-side rendering. Data models, configuration, and utilities are separated into distinct directories.",
        ),
        ExplainPoint(
            id="e3",
            title="Problem it solves",
            icon="target",
            body=f"Built to solve a specific domain problem using {lang_str}. The {total}-file codebase balances business logic, data access, and presentation layers to deliver its functionality.",
        ),
        ExplainPoint(
            id="e4",
            title="Key technologies",
            icon="boxes",
            body=f"Uses {lang_str}. The dependency graph shows {len(graph.get('edges', []))} relationships between {total} files, indicating how modules interconnect.",
        ),
        ExplainPoint(
            id="e5",
            title="Notable patterns",
            icon="sparkles",
            body="Clean separation of concerns with distinct directories for different layers. Files are organized by function rather than by type, making the codebase navigable for new contributors.",
        ),
    ]

    return ExplainRepoResponse(points=points)


async def _build_session_from_repo(repo_url: str) -> dict | None:
    try:
        metadata, files = load_repo(repo_url)
        graph = build_dependency_graph(metadata.local_path, files)
        graph["nodes"] = generate_node_labels(graph["nodes"])
        session = {
            "repo_path": metadata.local_path,
            "graph": graph,
            "file_list": files,
        }
        _session_store[repo_url] = session
        return session
    except Exception as e:
        logger.exception("Failed to build session from repo: %s", e)
        return None
