import type {
  AgentRequest, AgentResponse, FeedbackRequest, FeedbackStats
} from '../types'

const BASE = '/api'

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    console.log("Error: ", err)
    throw new Error(err.error ?? `Request failed: ${res.status}`)
  }
  return res.json()
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`Request failed: ${res.status}`)
  return res.json()
}

export const api = {
  query: (request: AgentRequest) =>
    post<AgentResponse>('/agent/query', request),

  feedback: (request: FeedbackRequest) =>
    post<{ recorded: boolean }>('/feedback', request),

  feedbackStats: () =>
    get<FeedbackStats>('/feedback/stats'),

  ingest: (request: { repoOwner: string; repoName: string; branch?: string }) =>
    post<{ filesProcessed: number; chunksCreated: number }>('/ingest', request),

  health: () =>
    get<{ status: string; ts: string }>('/health').catch(() => null),
}

// Re-export for convenience
export type { AgentRequest, AgentResponse }
