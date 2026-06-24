import os 
import shutil
import tempfile

import git

from app.models.schemas import RepoMetaData

IGNORE_DIRS={".git", "node_modules", "__pycache__", "venv", ".venv", "dist", "build"}
IGNORE_FILES={"package-lock.json", "uv.lock", "yarn.lock", "poetry.lock"}
MAX_FILE_SIZE_BYTES=500_000 # => 500 kb

Language_Extentions={
    ".py": "Python",
    ".js": "JavaScript",
    ".java": "Java",
    ".tsx": "TypeScript",
    ".jsx": "JavaScript",
    ".ts": "TypeScript",
    ".go": "Go"
}

def clone_repo(github_url: str)->str:
    """Shallow clones a github repo in its local directory and returns local path"""
    localpath=tempfile.mkdtemp(prefix="onboarding_agent_")
    git.Repo.clone_from(github_url, localpath, depth=1)
    return localpath

def traverse_repo(localpath:str)->list[str]:
    """Walk complete repo and find valid directory and files and filter noise."""
    valid_files=[]
    for root, dirs, files in os.walk(localpath):
        dirs[:]= [d for d in dirs if d not in IGNORE_DIRS]

        for filename in files:
            if filename in IGNORE_FILES:
                continue
            filepath=os.path.join(root, filename)
            try:
                if os.path.getsize(filepath) > MAX_FILE_SIZE_BYTES:
                    continue
            except OSError:
                    continue
            valid_files.append(filepath)
    return valid_files

def detect_languages(file_paths: list[str])-> list[str]:
    """ Detect languages present based on file extentions"""
    found_languages=set()
    for path in file_paths:
        ext=os.path.splitext(path)[1]
        if ext in Language_Extentions:
            found_languages.add(Language_Extentions[ext])
    return sorted(found_languages)

def load_repo(github_url: str) -> tuple[RepoMetaData, list[str]]:
    """ Full pipeline of repo loading: clone -> traverse -> language detect -> return metadata+ valid files list"""
    localpath=clone_repo(github_url)
    file_paths=traverse_repo(localpath)
    languages=detect_languages(file_paths)

    metadata=RepoMetaData(
        repo_url=github_url,
        local_path=localpath,
        file_count=len(file_paths),
        languages_detected=languages
    )
    return metadata, file_paths

def cleanup_repo(local_path:str)-> None:
    """Deletes cloned repo from disk after processing"""
    shutil.rmtree(local_path, ignore_errors=True)
