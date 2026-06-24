import os
from langchain_core.tools import tool
from langchain_community.tools.tavily_search import TavilySearchResults
from langchain_community.document_loaders import FireCrawlLoader
import httpx

@tool
def tavily_search(query: str) -> str:
    """Search the web via Tavily for current information (e.g. dependency status, known issues)."""
    api_key = os.getenv("TAVILY_API_KEY") 
    if not api_key:
        return "Error: TAVILY_API_KEY not set in environment."
    try:
        search = TavilySearchResults(tavily_api_key=api_key, max_results=3)
        results = search.invoke({"query": query})
        if not results:
            return "No search results found."
        lines = []
        for r in results:
            title = r.get("title", "No title")
            url = r.get("url", "")
            content = r.get("content", "")
            lines.append(f"- {title} ({url})\n  {content[:300]}")
        return "\n\n".join(lines)
    except Exception as e:
        return f"Error during Tavily search: {e}"


@tool
def firecrawl_scrape(url: str) -> str:
    """Scrape a URL and return its clean text content (e.g. docs pages linked from the README)."""
    api_key = os.getenv("FIRECRAWL_API_KEY")
    if not api_key:
        return "Error: FIRECRAWL_API_KEY not set in environment."
    try:
        loader = FireCrawlLoader(
            url=url,
            api_key=api_key,
            mode="scrape",
        )
        docs = loader.load()
        if not docs:
            return f"No content scraped from {url}"
        text = docs[0].page_content
        if len(text) > 3000:
            text = text[:3000] + "\n\n... (truncated)"
        return text
    except Exception as e:
        return f"Error scraping {url}: {e}"


@tool
def github_repo_metadata(owner: str, repo: str) -> str:
    """Fetch public GitHub repo metadata: stars, last commit, open issues, primary language."""
    url = f"https://api.github.com/repos/{owner}/{repo}"
    headers = {"Accept": "application/vnd.github.v3+json"}
    token = os.getenv("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"token {token}"
    try:
        response = httpx.get(url, headers=headers, timeout=15, follow_redirects=True)
        response.raise_for_status()
        data = response.json()
        lines = [
            f"Repository: {owner}/{repo}",
            f"Description: {data.get('description', 'N/A')}",
            f"Stars: {data.get('stargazers_count', 'N/A')}",
            f"Forks: {data.get('forks_count', 'N/A')}",
            f"Open Issues: {data.get('open_issues_count', 'N/A')}",
            f"Primary Language: {data.get('language', 'N/A')}",
            f"Last Updated: {data.get('updated_at', 'N/A')}",
            f"License: {data.get('license', {}).get('spdx_id', 'N/A') if data.get('license') else 'N/A'}",
        ]
        return "\n".join(lines)
    except httpx.HTTPStatusError as e:
        return f"GitHub API error: {e.response.status_code} - {e.response.text[:200]}"
    except Exception as e:
        return f"Error fetching GitHub metadata: {e}"
