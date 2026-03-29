export type AgentType = 'Auto' | 'CodeReview' | 'Knowledge' | 'PrGeneration'
export type FeedbackSignal = 'ThumbsUp' | 'ThumbsDown'

export interface AgentContext {
  repoOwner?: string
  repoName?: string
  prNumber?: number
  branch?: string
}

export interface AgentRequest {
  query: string
  agent?: AgentType
  context?: AgentContext
}

export interface SourceChunk {
  filePath: string
  content: string
  score: number
}

export interface AgentResponse {
  response: string
  agentUsed: AgentType
  sources: SourceChunk[]
  traceId: string
  latencyMs: number
}

export interface FeedbackRequest {
  traceId: string
  signal: FeedbackSignal
  comment?: string
}

export interface FeedbackStats {
  total: number
  positive: number
  negative: number
  positiveRate: number
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  agentUsed?: AgentType
  sources?: SourceChunk[]
  traceId?: string
  latencyMs?: number
  feedback?: FeedbackSignal
  timestamp: Date
}

export interface RepoContext {
  owner: string
  name: string
  prNumber?: number
  branch: string
}
