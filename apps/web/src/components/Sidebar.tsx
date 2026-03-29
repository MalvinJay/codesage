import type { AgentType, RepoContext } from '../types'

interface Props {
  repoContext: RepoContext
  onRepoChange: (ctx: RepoContext) => void
  selectedAgent: AgentType
  onAgentChange: (a: AgentType) => void
  onClear: () => void
  messageCount: number
}

const AGENTS: { value: AgentType; label: string; desc: string; color: string }[] = [
  { value: 'Auto',         label: 'Auto',        desc: 'Let CodeSage decide',    color: 'var(--text-3)' },
  { value: 'CodeReview',   label: 'Review',      desc: 'Review PRs & code',      color: 'var(--agent-review)' },
  { value: 'Knowledge',    label: 'Knowledge',   desc: 'Ask about the codebase', color: 'var(--agent-know)' },
  { value: 'PrGeneration', label: 'PR-Gen',      desc: 'Draft PR descriptions',  color: 'var(--agent-prgen)' },
]

export function Sidebar({ repoContext, onRepoChange, selectedAgent, onAgentChange, onClear, messageCount }: Props) {
  const inputStyle = {
    width: '100%', background: 'var(--bg-3)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius)', color: 'var(--text)', fontFamily: 'var(--font-mono)',
    fontSize: 12, padding: '6px 10px', outline: 'none', marginTop: 4,
  }
  const labelStyle = { fontSize: 11, color: 'var(--text-3)', display: 'block' as const }
  const sectionStyle = { marginBottom: 20 }

  return (
    <aside style={{
      width: 240, background: 'var(--bg-2)', borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', padding: '16px 14px', flexShrink: 0,
      overflowY: 'auto',
    }}>
      {/* Logo */}
      <div style={{ marginBottom: 24 }}>
        <div style={{
          fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20,
          color: 'var(--accent)', letterSpacing: '.05em',
        }}>
          CodeSage
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>
          SDLC AI Assistant
        </div>
      </div>

      {/* Agent selector */}
      <div style={sectionStyle}>
        <div style={{ ...labelStyle, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.08em' }}>
          Agent
        </div>
        {AGENTS.map(a => (
          <button
            key={a.value}
            onClick={() => onAgentChange(a.value)}
            style={{
              width: '100%', textAlign: 'left', background: selectedAgent === a.value
                ? 'var(--bg-4)' : 'none',
              border: selectedAgent === a.value
                ? `1px solid ${a.color}33` : '1px solid transparent',
              borderRadius: 'var(--radius)', padding: '7px 10px', cursor: 'pointer',
              marginBottom: 3, transition: 'all .12s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: selectedAgent === a.value ? a.color : 'var(--border-2)',
                flexShrink: 0, transition: 'background .12s',
              }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: selectedAgent === a.value ? 'var(--text)' : 'var(--text-2)' }}>
                {a.label}
              </span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 14, marginTop: 1 }}>
              {a.desc}
            </div>
          </button>
        ))}
      </div>

      {/* Repo context */}
      <div style={sectionStyle}>
        <div style={{ ...labelStyle, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.08em' }}>
          Repo context
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={labelStyle}>Owner</label>
          <input
            style={inputStyle}
            placeholder="e.g. octocat"
            value={repoContext.owner}
            onChange={e => onRepoChange({ ...repoContext, owner: e.target.value })}
          />
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={labelStyle}>Repo</label>
          <input
            style={inputStyle}
            placeholder="e.g. my-api"
            value={repoContext.name}
            onChange={e => onRepoChange({ ...repoContext, name: e.target.value })}
          />
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={labelStyle}>Branch</label>
          <input
            style={inputStyle}
            value={repoContext.branch}
            onChange={e => onRepoChange({ ...repoContext, branch: e.target.value })}
          />
        </div>
        <div>
          <label style={labelStyle}>PR # (optional)</label>
          <input
            style={inputStyle}
            type="number"
            placeholder="e.g. 42"
            value={repoContext.prNumber ?? ''}
            onChange={e => onRepoChange({
              ...repoContext,
              prNumber: e.target.value ? Number(e.target.value) : undefined
            })}
          />
        </div>
      </div>

      {/* Session controls */}
      <div style={{ marginTop: 'auto' }}>
        <div style={{
          fontSize: 10, color: 'var(--text-3)', marginBottom: 8,
          display: 'flex', justifyContent: 'space-between',
        }}>
          <span>Session</span>
          <span>{messageCount} messages</span>
        </div>
        <button
          onClick={onClear}
          disabled={messageCount === 0}
          style={{
            width: '100%', padding: '7px', background: 'none',
            border: '1px solid var(--border)', borderRadius: 'var(--radius)',
            color: 'var(--text-3)', fontFamily: 'var(--font-mono)', fontSize: 11,
            cursor: messageCount > 0 ? 'pointer' : 'not-allowed',
            opacity: messageCount > 0 ? 1 : .4,
          }}
        >
          Clear session
        </button>
      </div>
    </aside>
  )
}
