from pydantic import BaseModel


class RepoMetaData(BaseModel):
    repo_url: str
    local_path: str
    file_count: int
    languages_detected: list[str] = []


class OnboardingReport(BaseModel):
    architecture_summary: str
    entry_points: list[str]
    gotchas: list[str]
    mermaid_diagram: str
    direct_answer: str | None = None
    sources: list[str] = []
    status: str = "complete"
    error: str | None = None
    timing: dict[str, float] | None = None


class CodebaseAnalysis(BaseModel):
    architecture_summary: str
    entry_points: list[str]
    gotchas: list[str]
    mermaid_diagram: str
    direct_answer: str | None = None
