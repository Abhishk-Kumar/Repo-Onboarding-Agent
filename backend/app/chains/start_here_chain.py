import json
import re
import logging

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from app.llm import get_llm, call_llm_with_retry
from app.graph.blast_radius import find_entry_candidates, _build_adjacency

logger = logging.getLogger(__name__)

GOAL_DESCRIPTIONS = {
    "big_picture": "Standard BFS reading order from entry points — get the big-picture understanding.",
    "add_a_feature": "Bias toward 'hub' files with the most outgoing edges — routers, schema definitions, main service registration points.",
    "fix_a_bug": "Bias toward files with high incoming-edge counts that also appear in gotchas/risk signals — fragile and depended-upon files.",
}

_RESPONSE_FORMAT = json.dumps(
    {"path": [{"file_path": "app/main.py", "reasoning": "Entry point — nothing imports this file."}]},
    indent=2,
)


def compute_reading_path(graph: dict, goal: str, max_files: int = 8) -> list[str]:
    outgoing, incoming = _build_adjacency(graph)

    if goal == "big_picture":
        entry_candidates = find_entry_candidates(graph)
        if not entry_candidates:
            entry_candidates = [n["id"] for n in graph.get("nodes", [])[:3]]

        visited = set()
        path = []
        frontier = list(entry_candidates)

        while frontier and len(path) < max_files:
            current = frontier.pop(0)
            if current in visited:
                continue
            visited.add(current)
            path.append(current)
            for neighbor in outgoing.get(current, set()):
                if neighbor not in visited:
                    frontier.append(neighbor)

        return path[:max_files]

    elif goal == "add_a_feature":
        scored = []
        for node in graph.get("nodes", []):
            nid = node["id"]
            out_count = len(outgoing.get(nid, set()))
            scored.append((nid, out_count))

        scored.sort(key=lambda x: -x[1])
        return [s[0] for s in scored[:max_files]]

    elif goal == "fix_a_bug":
        scored = []
        for node in graph.get("nodes", []):
            nid = node["id"]
            in_count = len(incoming.get(nid, set()))
            scored.append((nid, in_count))

        scored.sort(key=lambda x: -x[1])
        return [s[0] for s in scored[:max_files]]

    return []


def build_start_here_prompt() -> ChatPromptTemplate:
    return ChatPromptTemplate.from_messages([
        (
            "system",
            "You are a senior developer creating an onboarding path through a codebase. "
            "Given an ordered list of files (the structural path) and a user's goal, "
            "add a one-to-two sentence reasoning for each step explaining why this file "
            "matters at this point in the path. Ground each explanation in real graph facts "
            "like 'nothing imports this file, so start here' or 'this file is imported by 14 others'.\n\n"
            "Respond with a JSON object in this exact format (substitute real values):\n"
            "{response_format}\n\n"
            "Valid JSON only, no markdown, no code fences."
        ),
        (
            "human",
            "User goal: {goal}\n\n"
            "Reading path (in order):\n{path_list}\n\n"
            "Graph context (incoming/outgoing edge counts per file):\n{edge_context}\n\n"
            "Output ONLY valid JSON matching the schema above."
        ),
    ])


def _build_start_here_chain():
    prompt = build_start_here_prompt()
    llm = get_llm()
    return prompt | llm | StrOutputParser()


def generate_start_here(graph: dict, goal: str) -> dict:
    path_files = compute_reading_path(graph, goal)

    if not path_files:
        return {"goal": goal, "path": []}

    outgoing, incoming = _build_adjacency(graph)
    edge_context_lines = []
    for f in path_files:
        out_c = len(outgoing.get(f, set()))
        in_c = len(incoming.get(f, set()))
        edge_context_lines.append(f"{f}: {in_c} incoming, {out_c} outgoing")

    chain = _build_start_here_chain()
    inputs = {
        "goal": GOAL_DESCRIPTIONS.get(goal, goal),
        "path_list": "\n".join(f"{i+1}. {f}" for i, f in enumerate(path_files)),
        "edge_context": "\n".join(edge_context_lines),
        "response_format": _RESPONSE_FORMAT,
    }

    try:
        raw = call_llm_with_retry(chain, inputs)
        json_match = re.search(r'\{.*\}', raw, re.DOTALL)
        if json_match:
            data = json.loads(json_match.group())
            steps = data.get("path", [])
            result_path = []
            for i, step in enumerate(steps):
                result_path.append({
                    "file_path": step.get("file_path", path_files[i] if i < len(path_files) else "unknown"),
                    "step_number": i + 1,
                    "reasoning": step.get("reasoning", ""),
                })
            return {"goal": goal, "path": result_path}
    except Exception as e:
        logger.warning("Start here LLM reasoning failed: %s — using structural path only", e)

    result_path = [
        {"file_path": f, "step_number": i + 1, "reasoning": ""}
        for i, f in enumerate(path_files)
    ]
    return {"goal": goal, "path": result_path}
