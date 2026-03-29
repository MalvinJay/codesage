import { useState } from 'react'
import { useChat } from './hooks/useChat'
import { ChatPanel } from './components/ChatPanel'
import { Sidebar } from './components/Sidebar'
import type { AgentType } from './types'

export default function App() {
  const chat = useChat()
  const [sidebarOpen, setSidebarOpen] = useState(true)

  return (
    <div style={{
      display: 'flex', height: '100vh', overflow: 'hidden',
      background: 'var(--bg)'
    }}>
      {/* Sidebar */}
      {sidebarOpen && (
        <Sidebar
          repoContext={chat.repoContext}
          onRepoChange={chat.setRepoContext}
          selectedAgent={chat.selectedAgent}
          onAgentChange={(a: AgentType) => chat.setSelectedAgent(a)}
          onClear={chat.clearMessages}
          messageCount={chat.messages.length}
        />
      )}

      {/* Main chat area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Topbar */}
        <header style={{
          height: 48, display: 'flex', alignItems: 'center', gap: 12,
          padding: '0 20px', borderBottom: '1px solid var(--border)',
          background: 'var(--bg-2)', flexShrink: 0,
        }}>
          <button
            onClick={() => setSidebarOpen(o => !o)}
            style={{
              background: 'none', border: 'none', color: 'var(--text-3)',
              cursor: 'pointer', fontSize: 18, padding: '4px 6px',
              borderRadius: 'var(--radius)',
            }}
            title="Toggle sidebar"
          >
            ☰
          </button>
          <span style={{
            fontFamily: 'var(--font-display)', fontWeight: 700,
            fontSize: 16, color: 'var(--accent)', letterSpacing: '.04em'
          }}>
            CodeSage
          </span>
          <span style={{ color: 'var(--text-3)', fontSize: 12 }}>
            AI-powered SDLC assistant
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <AgentBadge agent={chat.selectedAgent} />
          </div>
        </header>

        <ChatPanel
          messages={chat.messages}
          loading={chat.loading}
          error={chat.error}
          onSend={chat.sendMessage}
          onFeedback={chat.submitFeedback}
        />
      </div>
    </div>
  )
}

function AgentBadge({ agent }: { agent: AgentType }) {
  const colors: Record<AgentType, string> = {
    Auto: 'var(--text-3)',
    CodeReview: 'var(--agent-review)',
    Knowledge: 'var(--agent-know)',
    PrGeneration: 'var(--agent-prgen)',
  }
  const labels: Record<AgentType, string> = {
    Auto: 'auto-route',
    CodeReview: 'review agent',
    Knowledge: 'knowledge agent',
    PrGeneration: 'pr-gen agent',
  }
  return (
    <span style={{
      fontSize: 11, color: colors[agent], border: `1px solid ${colors[agent]}`,
      padding: '2px 8px', borderRadius: 3, fontFamily: 'var(--font-mono)',
      opacity: .85,
    }}>
      {labels[agent]}
    </span>
  )
}
