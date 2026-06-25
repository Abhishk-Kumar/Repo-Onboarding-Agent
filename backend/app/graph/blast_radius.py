import logging

logger = logging.getLogger(__name__)


def _build_adjacency(graph: dict) -> tuple[dict[str, set[str]], dict[str, set[str]]]:
    outgoing = {}
    incoming = {}

    for node in graph.get("nodes", []):
        nid = node["id"]
        outgoing.setdefault(nid, set())
        incoming.setdefault(nid, set())

    for edge in graph.get("edges", []):
        src = edge["source"]
        tgt = edge["target"]
        outgoing.setdefault(src, set()).add(tgt)
        incoming.setdefault(tgt, set()).add(src)

    return outgoing, incoming


def compute_blast_radius(file_path: str, graph: dict, max_depth: int = 10) -> dict:
    outgoing, incoming = _build_adjacency(graph)

    if file_path not in incoming:
        return {
            "file_path": file_path,
            "direct_dependents": [],
            "transitive_dependents": [],
            "dependent_count": 0,
            "found": False,
        }

    direct_dependents = sorted(incoming[file_path])

    transitive = set()
    frontier = set(incoming[file_path])
    depth = 0

    while frontier and depth < max_depth:
        new_frontier = set()
        for f in frontier:
            if f in incoming and f != file_path:
                for dep in incoming[f]:
                    if dep != file_path and dep not in transitive and dep not in frontier:
                        new_frontier.add(dep)
        transitive.update(frontier)
        frontier = new_frontier
        depth += 1

    transitive_dependents = sorted(transitive)
    all_dependents = list(dict.fromkeys(direct_dependents + [d for d in transitive_dependents if d not in direct_dependents]))

    return {
        "file_path": file_path,
        "direct_dependents": direct_dependents,
        "transitive_dependents": transitive_dependents,
        "all_dependents": all_dependents,
        "dependent_count": len(all_dependents),
        "found": True,
    }


def find_entry_candidates(graph: dict) -> list[str]:
    outgoing, incoming = _build_adjacency(graph)
    candidates = []

    for nid in outgoing:
        if len(incoming.get(nid, set())) == 0 and len(outgoing[nid]) > 0:
            candidates.append(nid)

    return sorted(candidates)
