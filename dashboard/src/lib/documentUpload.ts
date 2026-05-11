import type { SourceDocument } from '../types/workspace'

const API_URL = 'http://localhost:8081'
const MAX_DOCUMENT_UPLOAD_BYTES = 50 * 1024 * 1024

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

async function parseJson<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isTransientFileLock(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /EPERM|EBUSY|operation not permitted|rename/i.test(message)
}

export async function uploadDealDocument(dealId: string, file: File): Promise<SourceDocument> {
  if (!dealId) throw new Error('Choose a deal before uploading documents.')
  if (file.size > MAX_DOCUMENT_UPLOAD_BYTES) {
    throw new Error(`${file.name} is larger than the 50 MB local upload limit.`)
  }

  const contentBase64 = await readFileAsBase64(file)
  let lastError: unknown = null

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`${API_URL}/api/deals/${encodeURIComponent(dealId)}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          mime: file.type,
          size: file.size,
          contentBase64,
        }),
      })
      const payload = await parseJson<{ document?: SourceDocument; error?: string }>(response)
      if (!response.ok || !payload.document) {
        throw new Error(payload.error || 'Failed to upload document')
      }
      return payload.document
    } catch (err) {
      lastError = err
      if (!isTransientFileLock(err) || attempt === 2) break
      await sleep(250 * (attempt + 1))
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError || 'Failed to upload document'))
}
