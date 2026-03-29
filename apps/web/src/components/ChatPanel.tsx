import { useRef, useEffect, useState, type KeyboardEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatMessage, FeedbackSignal } from '../types'

interface Props {
  messages: ChatMessage[]
  loading: boolean
  error: string | null
  onSend: (q: string) => void
  onFeedback: (traceId: string, signal: FeedbackSignal, msgId: string) => void
}

const AGENT_COLOR: Record<string, string> = {
  CodeReview: 'var(--agent-review)',
  Knowledge: 'var(--agent-know)',
  PrGeneration: 'var(--agent-prgen)',
  Auto: 'var(--text-3)',
}

const AGENT_LABEL: Record<string, string> = {
  CodeReview: 'review',
  Knowledge: 'knowledge',
  PrGeneration: 'pr-gen',
  Auto: 'auto',
}

const SUGGESTIONS = [
  'Where is authentication handled in this repo?',
  'Review PR #42 and flag any security issues',
  'Generate a PR description for PR #7',
  'How does the rate limiter work?',
  'What patterns are used for error handling?',
]

export function ChatPanel({ messages, loading, error, onSend, onFeedback }: Props) {
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const handleSend = () => {
    if (!input.trim()) return
    onSend(input.trim())
    setInput('')
  }

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const isEmpty = messages.length === 0

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 0' }}>
        {isEmpty ? (
          <EmptyState onSuggest={s => { onSend(s) }} />
        ) : (
          <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 24px' }}>
            {messages.map(msg => (
              <MessageRow
                key={msg.id}
                msg={msg}
                onFeedback={(sig) => msg.traceId && onFeedback(msg.traceId, sig, msg.id)}
              />
            ))}
            {loading && <ThinkingIndicator />}
            {error && (
              <div style={{
                padding: '10px 14px', borderRadius: 'var(--radius)',
                background: '#1a0808', border: '1px solid var(--danger)',
                color: 'var(--danger)', fontSize: 12, marginTop: 12,
              }}>
                {error}
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input bar */}
      <div style={{
        borderTop: '1px solid var(--border)', background: 'var(--bg-2)',
        padding: '14px 24px', flexShrink: 0,
      }}>
        <div style={{ maxWidth: 760, margin: '0 auto', position: 'relative' }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            disabled={loading}
            rows={1}
            placeholder="Ask about the codebase, review a PR, or generate a description…"
            style={{
              width: '100%', background: 'var(--bg-3)',
              border: '1px solid var(--border-2)', borderRadius: 'var(--radius-lg)',
              color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 13,
              padding: '12px 52px 12px 16px', resize: 'none', outline: 'none',
              lineHeight: 1.5, minHeight: 46, maxHeight: 160, overflowY: 'auto',
            }}
            onInput={e => {
              const el = e.currentTarget
              el.style.height = 'auto'
              el.style.height = Math.min(el.scrollHeight, 160) + 'px'
            }}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              background: input.trim() && !loading ? 'var(--accent)' : 'var(--border)',
              border: 'none', borderRadius: 'var(--radius)', color: 'var(--bg)',
              width: 32, height: 32, cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
              fontWeight: 700, fontSize: 16, display: 'flex', alignItems: 'center',
              justifyContent: 'center', transition: 'background .15s',
            }}
          >
            ↑
          </button>
        </div>
        <div style={{ maxWidth: 760, margin: '6px auto 0', fontSize: 10, color: 'var(--text-3)', textAlign: 'center' }}>
          Enter to send · Shift+Enter for new line · CodeSage may make mistakes — verify important suggestions
        </div>
      </div>
    </div>
  )
}

function MessageRow({ msg, onFeedback }: {
  msg: ChatMessage
  onFeedback: (sig: FeedbackSignal) => void
}) {
  const isUser = msg.role === 'user'
  return (
    <div style={{
      marginBottom: 24,
      animation: 'fade-in .2s ease-out',
    }}>
      {/* Role label */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
      }}>
        <span style={{
          fontSize: 10, fontWeight: 500, letterSpacing: '.06em',
          textTransform: 'uppercase',
          color: isUser ? 'var(--text-3)' : 'var(--accent)',
        }}>
          {isUser ? 'you' : 'codesage'}
        </span>
        {!isUser && msg.agentUsed && (
          <span style={{
            fontSize: 9, padding: '1px 6px', borderRadius: 2,
            border: `1px solid ${AGENT_COLOR[msg.agentUsed] ?? 'var(--border)'}33`,
            color: AGENT_COLOR[msg.agentUsed] ?? 'var(--text-3)',
          }}>
            {AGENT_LABEL[msg.agentUsed] ?? msg.agentUsed}
          </span>
        )}
        {!isUser && msg.latencyMs && (
          <span style={{ fontSize: 9, color: 'var(--text-3)', marginLeft: 'auto' }}>
            {msg.latencyMs}ms
          </span>
        )}
      </div>

      {/* Content */}
      <div style={{
        background: isUser ? 'var(--bg-3)' : 'transparent',
        border: isUser ? '1px solid var(--border)' : 'none',
        borderRadius: isUser ? 'var(--radius-lg)' : 0,
        padding: isUser ? '10px 14px' : '0',
        fontSize: 13, color: isUser ? 'var(--text)' : 'var(--text)',
      }}>
        {isUser ? (
          <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
        ) : (
          <div className="prose">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
          </div>
        )}
      </div>

      {/* Sources */}
      {!isUser && msg.sources && msg.sources.length > 0 && (
        <SourcesList sources={msg.sources} />
      )}

      {/* Feedback buttons */}
      {!isUser && msg.traceId && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: 'var(--text-3)' }}>Helpful?</span>
          <FeedbackBtn
            onClick={() => onFeedback('ThumbsUp')}
            active={msg.feedback === 'ThumbsUp'}
            label="👍"
            activeColor="var(--accent)"
          />
          <FeedbackBtn
            onClick={() => onFeedback('ThumbsDown')}
            active={msg.feedback === 'ThumbsDown'}
            label="👎"
            activeColor="var(--danger)"
          />
        </div>
      )}
    </div>
  )
}

function FeedbackBtn({ onClick, active, label, activeColor }: {
  onClick: () => void; active: boolean; label: string; activeColor: string
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? `${activeColor}22` : 'none',
        border: `1px solid ${active ? activeColor : 'var(--border)'}`,
        borderRadius: 4, padding: '2px 8px', cursor: 'pointer',
        fontSize: 12, color: active ? activeColor : 'var(--text-3)',
        transition: 'all .12s',
      }}
    >
      {label}
    </button>
  )
}

function SourcesList({ sources }: { sources: ChatMessage['sources'] }) {
  const [open, setOpen] = useState(false)
  if (!sources?.length) return null
  return (
    <div style={{ marginTop: 8 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: 'none', border: 'none', color: 'var(--text-3)',
          fontSize: 10, cursor: 'pointer', padding: 0, fontFamily: 'var(--font-mono)',
        }}
      >
        {open ? '▾' : '▸'} {sources.length} source{sources.length !== 1 ? 's' : ''}
      </button>
      {open && (
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {sources.map((s, i) => (
            <div key={i} style={{
              background: 'var(--bg-3)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', padding: '6px 10px',
            }}>
              <div style={{ fontSize: 10, color: 'var(--accent)', marginBottom: 3 }}>
                {s.filePath}
                <span style={{ color: 'var(--text-3)', marginLeft: 8 }}>
                  score: {s.score.toFixed(3)}
                </span>
              </div>
              <pre style={{
                fontSize: 11, color: 'var(--text-2)', overflow: 'hidden',
                maxHeight: 80, margin: 0, background: 'none', border: 'none', padding: 0,
              }}>
                {s.content.slice(0, 300)}…
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ThinkingIndicator() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0', marginBottom: 24 }}>
      <span style={{ fontSize: 10, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
        codesage
      </span>
      <div style={{ display: 'flex', gap: 4 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)',
            animation: `pulse-dot 1.2s ease-in-out ${i * 0.2}s infinite`,
          }} />
        ))}
      </div>
    </div>
  )
}

function EmptyState({ onSuggest }: { onSuggest: (s: string) => void }) {
  return (
    <div style={{
      maxWidth: 580, margin: '60px auto 0', padding: '0 24px', textAlign: 'center'
    }}>
      <div style={{
        fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700,
        color: 'var(--accent)', letterSpacing: '.04em', marginBottom: 8,
      }}>
        CodeSage
      </div>
      <div style={{ color: 'var(--text-3)', fontSize: 13, marginBottom: 36 }}>
        Ask anything about your codebase, review a PR, or generate a description.
        Set the repo context in the sidebar first.
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {SUGGESTIONS.map(s => (
          <button
            key={s}
            onClick={() => onSuggest(s)}
            style={{
              textAlign: 'left', background: 'var(--bg-2)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
              padding: '10px 14px', cursor: 'pointer', color: 'var(--text-2)',
              fontSize: 12, fontFamily: 'var(--font-mono)',
              transition: 'border-color .12s, color .12s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'var(--accent)'
              e.currentTarget.style.color = 'var(--text)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--border)'
              e.currentTarget.style.color = 'var(--text-2)'
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}
