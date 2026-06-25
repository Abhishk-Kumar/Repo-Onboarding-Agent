from pydantic import BaseModel


class RepoMetaData(BaseModel):
    repo_url: str
    local_path: str
    file_count: int
    languages_detected: list[str] = []


class GraphNode(BaseModel):
    id: str
    label: str
    folder: str
    language: str
    functions: list[str] = []
    classes: list[str] = []
    purpose: str = ""


class GraphEdge(BaseModel):
    source: str
    target: str


class DependencyGraph(BaseModel):
    nodes: list[GraphNode] = []
    edges: list[GraphEdge] = []
    isolated_files: list[str] = []
    routes: list[dict] = []


class BlastRadiusResult(BaseModel):
    file_path: str
    direct_dependents: list[str] = []
    transitive_dependents: list[str] = []
    all_dependents: list[str] = []
    dependent_count: int = 0
    found: bool = True


class StartHereStep(BaseModel):
    file_path: str
    step_number: int
    reasoning: str


class StartHereResult(BaseModel):
    goal: str
    path: list[StartHereStep] = []


class FlowTraceStep(BaseModel):
    file_path: str
    function_or_symbol: str | None = None
    explanation: str
    step_number: int


class FlowTrace(BaseModel):
    flow_name: str
    steps: list[FlowTraceStep] = []


class OnboardingReport(BaseModel):
    dependency_graph: DependencyGraph | None = None
    start_here: StartHereResult | None = None
    flow_trace: FlowTrace | None = None
    blast_radius: BlastRadiusResult | None = None
    sources: list[str] = []
    status: str = "complete"
    error: str | None = None
    timing: dict[str, float] | None = None


class OnboardRequest(BaseModel):
    repo_url: str
    question: str | None = None


class AskRequest(BaseModel):
    session_id: str
    question: str


class TraceFlowRequest(BaseModel):
    session_id: str
    starting_file: str


class StartHereRequest(BaseModel):
    session_id: str
    goal: str = "big_picture"


class ExplainFileRequest(BaseModel):
    session_id: str
    file_path: str
