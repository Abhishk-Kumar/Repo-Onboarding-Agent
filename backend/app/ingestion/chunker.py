from langchain_core.documents import Document 
import os
from langchain_text_splitters import RecursiveCharacterTextSplitter, Language

EXTENTION_TO_LANGUAGE={
    ".py": Language.PYTHON,
    ".js": Language.JS,
    ".jsx": Language.JS,
    ".java": Language.JAVA,
    ".tsx": Language.TS,
    ".ts": Language.TS,
    ".go": Language.GO
}
Chunk_Size=1000
Chunk_Overlap=100



def get_splitter(filepath:str)->RecursiveCharacterTextSplitter:
    ext=os.path.splitext(filepath)[1]
    language=EXTENTION_TO_LANGUAGE.get(ext)
    if language:
        return RecursiveCharacterTextSplitter.from_language(
            language=language,
            chunk_size=Chunk_Size,
            chunk_overlap=Chunk_Overlap
            )
    else:
        return RecursiveCharacterTextSplitter(
            chunk_size=Chunk_Size,
            chunk_overlap=Chunk_Overlap
        )

def chunk_file(filepath: str, repo_root:str)->list[Document]:
    try:
        with open(filepath, "r", encoding="utf-8", errors="ignore")as f:
            content=f.read()
            f.close()
    except(OSError, UnicodeDecodeError):
        return []
    
    if not content.strip():
        return []
    
    splitter=get_splitter(filepath)
    chunks=splitter.split_text(content)

    relative_path=filepath.replace(repo_root, "").lstrip("/")
    documents=[]
    for chunk in chunks:
        doc=Document(page_content=chunk, metadata={'source': relative_path})
        documents.append(doc)
    return documents 

def chunk_files(file_paths:list[str], repo_root:str)-> list[Document]:
    all_documents=[]
    for filepath in file_paths:
        all_documents.extend(chunk_file(filepath, repo_root))
    return all_documents
    
