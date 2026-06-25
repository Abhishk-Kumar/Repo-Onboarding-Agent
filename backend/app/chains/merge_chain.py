import logging
import time

from app.models.schemas import OnboardingReport, DependencyGraph
from app.graph.graph_builder import build_dependency_graph
from app.graph.blast_radius import compute_blast_radius
from app.chains.node_label_chain import generate_node_labels
from app.chains.start_here_chain import generate_start_here
from app.chains.flow_trace_chain import generate_flow_trace, find_flow_starting_points

logger = logging.getLogger(__name__)


def assemble_full_report(
    repo_root: str,
    file_list: list[str],
    goal: str | None = None,
    flow_start: str | None = None,
    blast_file: str | None = None,
) -> OnboardingReport:
    timing = {}

    t0 = time.time()
    graph = build_dependency_graph(repo_root, file_list)
    timing["graph_build"] = round(time.time() - t0, 3)
    logger.info("Graph built in %.3fs", timing["graph_build"])

    t0 = time.time()
    graph["nodes"] = generate_node_labels(graph["nodes"])
    timing["node_labels"] = round(time.time() - t0, 3)

    dep_graph = DependencyGraph(**graph)

    start_here = None
    if goal:
        t0 = time.time()
        sh_result = generate_start_here(graph, goal)
        from app.models.schemas import StartHereResult
        start_here = StartHereResult(**sh_result)
        timing["start_here"] = round(time.time() - t0, 3)

    flow_trace = None
    if flow_start:
        t0 = time.time()
        flow_result = generate_flow_trace(flow_start, graph, repo_root)
        from app.models.schemas import FlowTrace
        flow_trace = FlowTrace(**flow_result)
        timing["flow_trace"] = round(time.time() - t0, 3)

    blast_radius = None
    if blast_file:
        t0 = time.time()
        br_result = compute_blast_radius(blast_file, graph)
        from app.models.schemas import BlastRadiusResult
        blast_radius = BlastRadiusResult(**br_result)
        timing["blast_radius"] = round(time.time() - t0, 3)

    return OnboardingReport(
        dependency_graph=dep_graph,
        start_here=start_here,
        flow_trace=flow_trace,
        blast_radius=blast_radius,
        sources=[n["id"] for n in graph.get("nodes", [])],
        status="complete",
        timing=timing,
    )
