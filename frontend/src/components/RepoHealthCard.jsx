import { useState, useEffect } from 'react'

export default function RepoHealthCard({ repoUrl }) {
  const [health, setHealth] = useState(null)

  useEffect(() => {
    if (!repoUrl) return

    const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/)
    if (!match) return

    const [, owner, repo] = match
    fetch(`https://api.github.com/repos/${owner}/${repo}`)
      .then((r) => r.json())
      .then((data) => {
        setHealth({
          stars: data.stargazers_count ?? 'N/A',
          openIssues: data.open_issues_count ?? 'N/A',
          language: data.language ?? 'N/A',
          description: data.description ?? '',
        })
      })
      .catch(() => {})
  }, [repoUrl])

  if (!health) return null

  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        padding: '8px 12px',
        background: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border)',
        fontSize: 12,
        color: 'var(--color-text-muted)',
      }}
    >
      <span>★ {health.stars?.toLocaleString?.() ?? health.stars}</span>
      <span>⚠ {health.openIssues} issues</span>
      <span>{health.language}</span>
      {health.description && (
        <span style={{ color: 'var(--color-text)', maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {health.description}
        </span>
      )}
    </div>
  )
}
