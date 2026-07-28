import {
  existsSync,
  readFileSync,
  realpathSync,
  statSync,
} from 'fs'
import {
  basename,
  extname,
  isAbsolute,
  join,
  resolve,
} from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const safePaths = require('../../scripts/lib/safe-paths') as {
  assertSafeSegment: (value: string, label?: string) => string
  assertWithinBase: (base: string, candidate: string, label?: string) => string
}

export const MAX_DEAL_ARTIFACT_BYTES = 1024 * 1024

const CONTENT_TYPE_BY_EXTENSION = new Map([
  ['.md', 'text/markdown; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
])

const ALLOWED_ARTIFACT_SCOPES = new Set(['reports', 'phase-outputs'])

export interface DealArtifactResult {
  statusCode: number
  headers?: Record<string, string>
  body?: Buffer
  error?: string
}

interface DealArtifactContext {
  projectRoot: string
  dataRoot: string
}

export interface DealArtifactRoute {
  dealId: string
  path: string
}

function failure(statusCode: number, error: string): DealArtifactResult {
  return { statusCode, error }
}

function safeDownloadName(filePath: string): string {
  return basename(filePath).replace(/[^a-zA-Z0-9._-]/g, '-') || 'workpaper.txt'
}

export function parseDealArtifactRoute(url: string): DealArtifactRoute | null {
  try {
    const parsed = new URL(url, 'http://127.0.0.1')
    const match = parsed.pathname.match(/^\/api\/deals\/([^/]+)\/artifacts$/)
    const requestedPaths = parsed.searchParams.getAll('path')
    if (!match || requestedPaths.length !== 1 || requestedPaths[0].length === 0) return null
    return {
      dealId: safePaths.assertSafeSegment(decodeURIComponent(match[1]), 'deal ID'),
      path: requestedPaths[0],
    }
  } catch {
    return null
  }
}

export function readDealArtifact(
  context: DealArtifactContext,
  dealId: string,
  requestedPath: string,
): DealArtifactResult {
  let safeDealId: string
  try {
    safeDealId = safePaths.assertSafeSegment(dealId, 'deal ID')
  } catch {
    return failure(400, 'Invalid deal ID')
  }

  if (
    typeof requestedPath !== 'string' ||
    requestedPath.length === 0 ||
    requestedPath.length > 2048 ||
    requestedPath.includes('\0') ||
    requestedPath.includes('\\') ||
    isAbsolute(requestedPath)
  ) {
    return failure(400, 'Invalid artifact path')
  }

  const pathSegments = requestedPath.split('/')
  if (pathSegments.some((segment) => segment.length === 0 || segment === '.')) {
    return failure(400, 'Invalid artifact path')
  }
  if (pathSegments.some((segment) => segment === '..')) {
    return failure(403, 'Artifact path is outside the requested deal outputs')
  }
  const [dataSegment, scope, pathDealId, ...artifactSegments] = pathSegments
  if (
    dataSegment !== 'data' ||
    !scope ||
    !ALLOWED_ARTIFACT_SCOPES.has(scope) ||
    pathDealId !== safeDealId
  ) {
    return failure(403, 'Artifact path is outside the requested deal outputs')
  }
  if (artifactSegments.length === 0) return failure(400, 'Invalid artifact path')

  const absoluteProjectRoot = resolve(context.projectRoot)
  const absoluteDataRoot = resolve(context.dataRoot)
  const dealArtifactRoot = join(absoluteDataRoot, scope, safeDealId)
  const candidatePath = join(dealArtifactRoot, ...artifactSegments)

  try {
    safePaths.assertWithinBase(dealArtifactRoot, candidatePath, 'deal artifact')
  } catch {
    return failure(403, 'Artifact path is outside the requested deal outputs')
  }

  const extension = extname(candidatePath).toLowerCase()
  const contentType = CONTENT_TYPE_BY_EXTENSION.get(extension)
  if (!contentType) {
    return failure(415, 'Only Markdown, plain-text, and JSON deal artifacts can be opened')
  }

  if (!existsSync(absoluteProjectRoot) || !existsSync(absoluteDataRoot) || !existsSync(dealArtifactRoot) || !existsSync(candidatePath)) {
    return failure(404, 'Artifact not found')
  }

  let realProjectRoot: string
  let realDataRoot: string
  let realDealArtifactRoot: string
  let realArtifactPath: string
  try {
    realProjectRoot = realpathSync(absoluteProjectRoot)
    realDataRoot = realpathSync(absoluteDataRoot)
    safePaths.assertWithinBase(realProjectRoot, realDataRoot, 'canonical data root')
    realDealArtifactRoot = realpathSync(dealArtifactRoot)
    const expectedDealArtifactRoot = join(realDataRoot, scope, safeDealId)
    if (realDealArtifactRoot !== expectedDealArtifactRoot) {
      return failure(403, 'Artifact path is outside the requested deal outputs')
    }
    realArtifactPath = realpathSync(candidatePath)
    safePaths.assertWithinBase(realDealArtifactRoot, realArtifactPath, 'canonical deal artifact')
  } catch {
    return failure(403, 'Artifact path is outside the requested deal outputs')
  }

  try {
    const stats = statSync(realArtifactPath)
    if (!stats.isFile()) return failure(404, 'Artifact not found')
    if (stats.size > MAX_DEAL_ARTIFACT_BYTES) {
      return failure(413, `Artifact exceeds the ${MAX_DEAL_ARTIFACT_BYTES}-byte response limit`)
    }

    const body = readFileSync(realArtifactPath)
    if (body.length > MAX_DEAL_ARTIFACT_BYTES) {
      return failure(413, `Artifact exceeds the ${MAX_DEAL_ARTIFACT_BYTES}-byte response limit`)
    }

    return {
      statusCode: 200,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Disposition': `inline; filename="${safeDownloadName(realArtifactPath)}"`,
        'Content-Length': String(body.length),
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Content-Type': contentType,
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
      },
      body,
    }
  } catch {
    return failure(404, 'Artifact not found')
  }
}
