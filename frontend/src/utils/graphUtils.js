export function getModuleName(filePath) {
  if (!filePath || typeof filePath !== 'string') return 'root'
  const parts = filePath.split('/')
  return parts.length > 1 ? parts[0] : 'root'
}

export function getFileName(filePath) {
  if (!filePath || typeof filePath !== 'string') return 'unknown'
  return filePath.split('/').pop()
}

export function getParentPath(filePath) {
  if (!filePath || typeof filePath !== 'string') return null
  const idx = filePath.lastIndexOf('/')
  if (idx === -1) return ''
  return filePath.slice(0, idx)
}

export function buildFolderTree(nodes) {
  const root = {
    name: 'root',
    path: '',
    type: 'folder',
    children: [],
    files: [],
    fileCount: 0,
    subfolderCount: 0,
    filePaths: new Set(),
    depth: 0,
  }

  if (!nodes || !Array.isArray(nodes)) return root

  const folderMap = new Map()
  folderMap.set('', root)

  nodes.forEach((node) => {
    if (!node || !node.id) return

    const path = node.id
    const parts = path.split('/')

    let currentPath = ''
    for (let i = 0; i < parts.length - 1; i++) {
      const parentPath = currentPath
      currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i]

      if (!folderMap.has(currentPath)) {
        const folderNode = {
          name: parts[i],
          path: currentPath,
          type: 'folder',
          children: [],
          files: [],
          fileCount: 0,
          subfolderCount: 0,
          filePaths: new Set(),
          depth: i + 1,
          parentPath,
        }
        folderMap.set(currentPath, folderNode)
        const parent = folderMap.get(parentPath)
        if (parent) {
          parent.children.push(folderNode)
          parent.subfolderCount++
        }
      }
    }

    const parentPath = parts.length > 1 ? parts.slice(0, -1).join('/') : ''
    const parent = folderMap.get(parentPath)
    if (parent) {
      parent.files.push(node)
      parent.fileCount++
      parent.filePaths.add(path)
    }
  })

  return root
}

export function getFolderByPath(folderTree, pathParts) {
  if (!pathParts || pathParts.length === 0) return folderTree
  let current = folderTree
  for (const part of pathParts) {
    if (!current || !current.children) return null
    current = current.children.find((c) => c.name === part)
    if (!current) return null
  }
  return current
}

export function getModuleEdges(edges) {
  if (!edges || !Array.isArray(edges)) return []

  const moduleEdgeMap = new Map()

  edges.forEach((edge) => {
    if (!edge || !edge.source || !edge.target) return
    const srcModule = getModuleName(edge.source)
    const tgtModule = getModuleName(edge.target)
    if (srcModule === tgtModule) return

    const key = `${srcModule}→${tgtModule}`
    const existing = moduleEdgeMap.get(key) || {
      source: srcModule,
      target: tgtModule,
      weight: 0,
    }
    existing.weight += 1
    moduleEdgeMap.set(key, existing)
  })

  return Array.from(moduleEdgeMap.values())
}

export function computeModuleStats(nodes, edges) {
  const stats = new Map()

  if (!nodes || !Array.isArray(nodes)) return stats

  nodes.forEach((node) => {
    if (!node || !node.id) return
    const mod = node.folder || getModuleName(node.id)
    if (!stats.has(mod)) {
      stats.set(mod, {
        fileCount: 0,
        subfolderCount: 0,
        internalDeps: 0,
        externalDeps: 0,
        incomingDeps: 0,
        subfolders: new Set(),
      })
    }
    const s = stats.get(mod)
    s.fileCount += 1

    const parent = getParentPath(node.id)
    if (parent) {
      const parts = parent.split('/')
      if (parts.length > 0 && parts[0] === mod && parts.length > 1) {
        s.subfolders.add(parts[1])
      }
    }
  })

  if (edges && Array.isArray(edges)) {
    edges.forEach((edge) => {
      if (!edge || !edge.source || !edge.target) return
      const srcMod = getModuleName(edge.source)
      const tgtMod = getModuleName(edge.target)
      if (srcMod === tgtMod) {
        const s = stats.get(srcMod)
        if (s) s.internalDeps += 1
      } else {
        const s1 = stats.get(srcMod)
        const s2 = stats.get(tgtMod)
        if (s1) s1.externalDeps += 1
        if (s2) s2.incomingDeps += 1
      }
    })
  }

  stats.forEach((s) => {
    s.subfolderCount = s.subfolders.size
    delete s.subfolders
  })

  return stats
}

export function getInternalEdges(edges, filePaths) {
  if (!edges || !filePaths) return []
  const idSet = new Set(filePaths)
  return edges.filter((e) => idSet.has(e.source) && idSet.has(e.target))
}

export function getExternalEdgesByFolder(edges, folderPath) {
  if (!edges || !folderPath) return {}

  const result = {}

  edges.forEach((edge) => {
    if (!edge || !edge.source || !edge.target) return

    const srcFolder = getParentPath(edge.source) || ''
    const tgtFolder = getParentPath(edge.target) || ''

    const isSrcInFolder =
      srcFolder === folderPath || srcFolder.startsWith(folderPath + '/')
    const isTgtInFolder =
      tgtFolder === folderPath || tgtFolder.startsWith(folderPath + '/')

    if (isSrcInFolder && !isTgtInFolder) {
      const targetMod = getModuleName(edge.target)
      if (!result[targetMod]) {
        result[targetMod] = { count: 0, edges: [], moduleFiles: new Set() }
      }
      result[targetMod].count++
      result[targetMod].edges.push(edge)
      result[targetMod].moduleFiles.add(edge.target)
    }

    if (!isSrcInFolder && isTgtInFolder) {
      const sourceMod = getModuleName(edge.source)
      if (!result[sourceMod]) {
        result[sourceMod] = { count: 0, edges: [], moduleFiles: new Set() }
      }
      result[sourceMod].count++
      result[sourceMod].edges.push(edge)
      result[sourceMod].moduleFiles.add(edge.source)
    }
  })

  return result
}

export function getFileToFileEdgesBetweenModules(edges, moduleA, moduleB) {
  return edges.filter((e) => {
    const srcMod = getModuleName(e.source)
    const tgtMod = getModuleName(e.target)
    return (
      (srcMod === moduleA && tgtMod === moduleB) ||
      (srcMod === moduleB && tgtMod === moduleA)
    )
  })
}

export function getNodeColor(folder) {
  const FOLDER_COLORS = {
    app: '#6366f1',
    src: '#a78bfa',
    lib: '#34d399',
    components: '#f472b6',
    utils: '#fbbf24',
    routes: '#fb923c',
    pages: '#60a5fa',
    api: '#f87171',
    config: '#a1a1aa',
    tests: '#4ade80',
    default: '#8888a0',
  }
  return FOLDER_COLORS[folder] || FOLDER_COLORS.default
}

export function getModuleColor(folder) {
  const MODULE_COLORS = {
    backend: '#E74C3C',
    frontend: '#3498DB',
    database: '#2ECC71',
    utils: '#9B59B6',
    config: '#95A5A6',
    tests: '#F39C12',
    src: '#6366f1',
    components: '#f472b6',
    routes: '#fb923c',
    pages: '#60a5fa',
    api: '#f87171',
    lib: '#34d399',
    app: '#6366f1',
    default: '#8888a0',
  }
  return MODULE_COLORS[folder] || MODULE_COLORS.default
}
