import { useState, useCallback } from 'react'
import { api } from '../api/client'
import type { ChatMessage, AgentType, FeedbackSignal, RepoContext } from '../types'

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [repoContext, setRepoContext] = useState<RepoContext>({
    owner: '', name: '', branch: 'main'
  })
  const [selectedAgent, setSelectedAgent] = useState<AgentType>('Auto')

  const sendMessage = useCallback(async (query: string) => {
    if (!query.trim() || loading) return
    setError(null)

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: query,
      timestamp: new Date(),
    }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      const response = await api.query({
        query,
        agent: selectedAgent,
        context: repoContext.owner ? {
          repoOwner: repoContext.owner,
          repoName: repoContext.name,
          prNumber: repoContext.prNumber,
          branch: repoContext.branch,
        } : undefined,
      })

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response.response,
        agentUsed: response.agentUsed,
        sources: response.sources,
        traceId: response.traceId,
        latencyMs: response.latencyMs,
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [loading, selectedAgent, repoContext])

  const submitFeedback = useCallback(async (
    traceId: string, signal: FeedbackSignal, msgId: string
  ) => {
    await api.feedback({ traceId, signal })
    setMessages(prev => prev.map(m =>
      m.id === msgId ? { ...m, feedback: signal } : m
    ))
  }, [])

  const clearMessages = useCallback(() => setMessages([]), [])

  return {
    messages, loading, error,
    repoContext, setRepoContext,
    selectedAgent, setSelectedAgent,
    sendMessage, submitFeedback, clearMessages,
  }
}
