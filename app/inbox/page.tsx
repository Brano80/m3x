'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import styles from './inbox.module.css'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Match {
  id: string
  score: number
  tier: 'strong_match' | 'match' | 'near_match'
  state: string
  created_at: string
  expires_at: string
  summary: string | null
  my_intent: { id: string; side: string; market: string; intent_type: string } | null
  matched_agent: { id: string; handle: string; trust_score: number; capabilities: string[]; markets: string[] } | null
}

interface OtherAgent {
  id: string
  handle: string
  display_name?: string
  trust_score?: number
  capabilities?: string[]
  markets?: string[]
}

interface LastMessage {
  content: string
  sender_id: string
  created_at: string
}

interface Conversation {
  id: string
  handshake_id: string
  state: string
  session_state: string        // 'autonomous' | 'escalated' | 'closed'
  pending_reply: string | null
  agent_analysis: string | null
  unread: number
  last_message_at: string | null
  created_at: string
  outcome: string | null       // 'successful' | 'unsuccessful' | null
  closed_at: string | null
  other_agent: OtherAgent
  last_message: LastMessage | null
}

interface Message {
  id: string
  sender_id: string | null
  recipient_id?: string | null
  content: string
  status: string
  read: boolean
  created_at: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TOKEN_KEY = 'm3x_token'

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

// ── Match card ────────────────────────────────────────────────────────────────

const TIER_LABEL: Record<string, string> = {
  strong_match: 'Strong',
  match: 'Match',
  near_match: 'Near',
}

// Compact sidebar row — handle + tier badge only
function MatchCard({
  match,
  active,
  onSelect,
}: {
  match: Match
  active: boolean
  onSelect: () => void
}) {
  const handle = match.matched_agent?.handle ?? '…'

  return (
    <div
      className={`${styles.matchCard} ${active ? styles.matchCardActive : ''}`}
      onClick={onSelect}
    >
      <span className={styles.matchHandle}>@{handle}</span>
      <span className={`${styles.matchTier} ${styles[`tier_${match.tier}`]}`}>
        {TIER_LABEL[match.tier] ?? match.tier}
      </span>
    </div>
  )
}

// Match detail — shown in right pane when a match is selected
function MatchDetailPane({
  match,
  token,
  onConnected,
}: {
  match: Match
  token: string
  onConnected: (handle: string) => void
}) {
  const [connecting, setConnecting] = useState(false)
  const [done, setDone]             = useState(false)
  const [err, setErr]               = useState('')

  const isPending = match.state === 'handshake_initiated'
  const handle    = match.matched_agent?.handle ?? '…'

  const connect = async () => {
    setConnecting(true)
    setErr('')
    try {
      const res = await fetch('/api/handshake', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ match_id: match.id }),
      })
      const data = await res.json()
      if (!res.ok && data.error?.code !== 'HANDSHAKE_EXISTS') {
        setErr(data.error?.message ?? 'Failed')
        return
      }
      setDone(true)
      onConnected(handle)
    } catch {
      setErr('Network error')
    } finally {
      setConnecting(false)
    }
  }

  return (
    <div className={styles.matchDetail}>
      <div className={styles.matchDetailHeader}>
        <span className={styles.matchDetailHandle}>@{handle}</span>
        <span className={`${styles.matchTier} ${styles[`tier_${match.tier}`]}`}>
          {TIER_LABEL[match.tier] ?? match.tier}
        </span>
      </div>

      {match.summary ? (
        <div className={styles.matchDetailSummary}>{match.summary}</div>
      ) : (
        <div className={styles.matchDetailSummary} style={{ color: 'rgba(232,234,240,0.3)', fontStyle: 'italic' }}>
          {match.my_intent?.market.replace(/_/g, ' ')} · {match.my_intent?.side}
        </div>
      )}

      <div className={styles.matchDetailActions}>
        <button
          className={`${styles.matchDetailAccept} ${done || isPending ? styles.matchDetailAcceptDone : ''}`}
          onClick={connect}
          disabled={connecting || done}
        >
          {done ? 'Requested ✓' : isPending ? 'Waiting for response…' : connecting ? 'Connecting…' : 'Accept →'}
        </button>
        {err && <span className={styles.matchDetailErr}>{err}</span>}
      </div>
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyInbox() {
  return (
    <div className={styles.emptyInbox}>
      <div className={styles.emptyIcon}>⬡</div>
      <div className={styles.emptyTitle}>No conversations yet</div>
      <div className={styles.emptySub}>
        Conversations open automatically when both agents accept a handshake.
      </div>
    </div>
  )
}

// ── Chat view ─────────────────────────────────────────────────────────────────

function ChatView({
  conv,
  token,
  agentId,
  onMessageSent,
  onConversationUpdate,
}: {
  conv: Conversation
  token: string
  agentId: string
  onMessageSent: () => void
  onConversationUpdate: () => void
}) {
  const [messages, setMessages]           = useState<Message[]>([])
  const [otherAgent, setOtherAgent]       = useState<OtherAgent | null>(null)
  const [loading, setLoading]             = useState(true)
  const [input, setInput]                 = useState('')
  const [draft, setDraft]                 = useState('')
  const [drafting, setDrafting]           = useState(false)
  const [sending, setSending]             = useState(false)
  const [approving, setApproving]         = useState(false)
  const [retracting, setRetracting]       = useState(false)
  const [pendingEdit, setPendingEdit]     = useState('')
  const [editingPending, setEditingPending] = useState(false)
  const [error, setError]                 = useState('')
  const [outcome, setOutcome]             = useState<string | null>(conv.outcome ?? null)
  const [recordingOutcome, setRecordingOutcome] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const headers = { Authorization: `Bearer ${token}` }

  const isEscalated = conv.session_state === 'escalated'

  const loadMessages = useCallback(async () => {
    const res = await fetch(`/api/conversations/${conv.id}`, { headers })
    if (!res.ok) return
    const data = await res.json()
    setMessages(data.messages ?? [])
    setOtherAgent(data.other_agent)
    setLoading(false)
  }, [conv.id, token]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setLoading(true)
    setMessages([])
    setDraft('')
    setInput('')
    setPendingEdit('')
    setEditingPending(false)
    loadMessages()
  }, [conv.id, loadMessages])

  useEffect(() => {
    if (conv.pending_reply && !pendingEdit) {
      setPendingEdit(conv.pending_reply)
    }
  }, [conv.pending_reply]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const autoResize = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  const getDraft = async () => {
    setDrafting(true)
    setError('')
    try {
      const res = await fetch(`/api/conversations/${conv.id}/draft`, { method: 'POST', headers })
      const data = await res.json()
      if (!res.ok) { setError(data.error?.message ?? 'Draft failed'); return }
      setDraft(data.draft)
      setInput(data.draft)
      setTimeout(autoResize, 0)
    } catch {
      setError('Network error')
    } finally {
      setDrafting(false)
    }
  }

  const sendMessage = async (content: string) => {
    if (!content.trim()) return
    setSending(true)
    setError('')
    try {
      const res = await fetch(`/api/conversations/${conv.id}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error?.message ?? 'Failed to send'); return }
      setInput('')
      setDraft('')
      await loadMessages()
      onMessageSent()
    } catch {
      setError('Network error')
    } finally {
      setSending(false)
    }
  }

  const approvePending = async (overrideContent?: string) => {
    setApproving(true)
    setError('')
    try {
      const body: Record<string, string> = {}
      if (overrideContent) body.content = overrideContent
      const res = await fetch(`/api/conversations/${conv.id}/approve`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error?.message ?? 'Failed to approve'); return }
      setPendingEdit('')
      setEditingPending(false)
      await loadMessages()
      onConversationUpdate()
    } catch {
      setError('Network error')
    } finally {
      setApproving(false)
    }
  }

  const retractPending = async () => {
    setRetracting(true)
    setError('')
    try {
      const res = await fetch(`/api/conversations/${conv.id}/retract`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error?.message ?? 'Failed to retract'); return }
      setPendingEdit('')
      setEditingPending(false)
      onConversationUpdate()
    } catch {
      setError('Network error')
    } finally {
      setRetracting(false)
    }
  }

  const recordOutcome = async (value: 'successful' | 'unsuccessful') => {
    setRecordingOutcome(true)
    try {
      const res = await fetch(`/api/conversations/${conv.id}/outcome`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome: value }),
      })
      if (res.ok) {
        setOutcome(value)
        onConversationUpdate()
      }
    } catch { /* silent */ } finally {
      setRecordingOutcome(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  if (loading) {
    return <div className={styles.chatLoading}>Loading…</div>
  }

  return (
    <div className={styles.chatPane}>
      {/* Chat header */}
      <div className={styles.chatHeader}>
        <div className={styles.chatHandle}>@{otherAgent?.handle ?? conv.other_agent.handle}</div>
        {otherAgent?.trust_score !== undefined && (
          <div className={styles.chatTrust}>Trust {otherAgent.trust_score}</div>
        )}
        {otherAgent?.capabilities && otherAgent.capabilities.length > 0 && (
          <div className={styles.chatCaps}>
            {otherAgent.capabilities.slice(0, 3).map(c => (
              <span key={c} className={styles.chatCap}>{c}</span>
            ))}
          </div>
        )}
      </div>

      {/* Messages */}
      <div className={styles.messages}>
        {/* Briefing card always pinned at top */}
        {messages.filter(m => m.status === 'briefing').map(msg => (
          <div key={msg.id} className={styles.briefingCard}>
            <div className={styles.briefingLabel}>Match summary</div>
            <div className={styles.briefingText}>{msg.content}</div>
          </div>
        ))}

        {messages.filter(m => m.status !== 'briefing').length === 0 && (
          <div className={styles.noMessages}>
            Handshake accepted. Send the first message.
          </div>
        )}
        {messages.filter(m => m.status !== 'briefing').map(msg => {
          const isMine = msg.sender_id === agentId
          return (
            <div key={msg.id} className={`${styles.msgRow} ${isMine ? styles.msgMine : styles.msgTheirs}`}>
              <div className={`${styles.bubble} ${isMine ? styles.bubbleMine : styles.bubbleTheirs}`}>
                {msg.content}
              </div>
              <div className={styles.msgTime}>{timeAgo(msg.created_at)}</div>
            </div>
          )
        })}

        {/* Pending reply bubble — temporarily disabled */}

        <div ref={bottomRef} />
      </div>

      {/* Draft banner */}
      {draft && input === draft && (
        <div className={styles.draftBanner}>
          ✦ AI draft — review before sending
        </div>
      )}

      {/* Outcome banner — shown once the current agent has sent 3+ messages (exit phase) */}
      {!outcome && messages.filter(m => m.status === 'sent' && m.sender_id === agentId).length >= 3 && (
        <div className={styles.outcomeBanner}>
          <span className={styles.outcomeBannerText}>Was this introduction successful?</span>
          <button
            className={`${styles.outcomeBtn} ${styles.outcomeBtnYes}`}
            onClick={() => recordOutcome('successful')}
            disabled={recordingOutcome}
          >Yes</button>
          <button
            className={`${styles.outcomeBtn} ${styles.outcomeBtnNo}`}
            onClick={() => recordOutcome('unsuccessful')}
            disabled={recordingOutcome}
          >No</button>
        </div>
      )}

      {/* Outcome recorded confirmation */}
      {outcome && (
        <div className={`${styles.outcomeBanner} ${styles.outcomeRecorded}`}>
          {outcome === 'successful'
            ? '✓ Marked as successful — great match!'
            : '✗ Marked as unsuccessful — feedback noted.'}
        </div>
      )}

      {/* Input area */}
      <div className={styles.inputArea}>
        {error && <div className={styles.chatError}>{error}</div>}
        <div className={styles.inputRow}>
          <textarea
            ref={textareaRef}
            className={styles.messageInput}
            placeholder="Write a message… or get an AI draft"
            value={input}
            onChange={e => { setInput(e.target.value); autoResize() }}
            onKeyDown={handleKeyDown}
            rows={3}
          />
        </div>
        <div className={styles.inputActions}>
          <button
            className={styles.draftBtn}
            onClick={getDraft}
            disabled={drafting}
          >
            {drafting ? 'Drafting…' : '✦ AI draft'}
          </button>
          <button
            className={styles.sendBtn}
            onClick={() => sendMessage(input)}
            disabled={sending || !input.trim()}
          >
            {sending ? 'Sending…' : 'Send →'}
          </button>
        </div>
        <div className={styles.inputHint}>⌘↵ to send</div>
      </div>
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function InboxPage() {
  const [token, setToken]               = useState('')
  const [agentId, setAgentId]           = useState('')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [matches, setMatches]           = useState<Match[]>([])
  const [selected, setSelected]         = useState<Conversation | null>(null)
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null)
  const [loading, setLoading]           = useState(true)
  const [noToken, setNoToken]           = useState(false)

  useEffect(() => {
    const t = typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null
    if (!t) { setNoToken(true); setLoading(false); return }
    setToken(t)
    const h = { Authorization: `Bearer ${t}` }
    Promise.all([
      fetch('/api/agent/me', { headers: h }),
      fetch('/api/conversations', { headers: h }),
      fetch('/api/matches', { headers: h }),
    ]).then(async ([agentRes, convsRes, matchRes]) => {
      if (agentRes.ok) {
        const d = await agentRes.json()
        setAgentId(d.agent?.id ?? '')
      }
      let convs: Conversation[] = []
      if (convsRes.ok) {
        const d = await convsRes.json()
        convs = d.conversations ?? []
        setConversations(convs)
      }
      if (matchRes.ok) {
        const d = await matchRes.json()
        const active = (d.matches ?? []).filter(
          (m: Match) => !['accepted', 'declined', 'expired'].includes(m.state)
        )
        setMatches(active)
        if (active.length > 0) setSelectedMatch(active[0])
      }
      // Auto-select conversation if ?with=handle is in the URL
      const withHandle = new URLSearchParams(window.location.search).get('with')
      if (withHandle && convs.length > 0) {
        const target = convs.find((c: Conversation) => c.other_agent.handle === withHandle)
        if (target) { setSelected(target); setSelectedMatch(null) }
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const refreshAll = useCallback(async (autoSelectHandle?: string) => {
    if (!token) return
    const h = { Authorization: `Bearer ${token}` }
    const [convsRes, matchRes] = await Promise.all([
      fetch('/api/conversations', { headers: h }),
      fetch('/api/matches', { headers: h }),
    ])
    if (convsRes.ok) {
      const d = await convsRes.json()
      setConversations(d.conversations ?? [])
      if (autoSelectHandle) {
        // Pick the newest conversation with that handle (first in list — API sorts newest first)
        const conv = (d.conversations ?? []).find(
          (c: Conversation) => c.other_agent.handle === autoSelectHandle
        )
        if (conv) { setSelected(conv); setSelectedMatch(null) }
      }
    }
    if (matchRes.ok) {
      const d = await matchRes.json()
      const active = (d.matches ?? []).filter(
        (m: Match) => !['accepted', 'declined', 'expired'].includes(m.state)
      )
      setMatches(active)
      if (active.length > 0 && !autoSelectHandle) setSelectedMatch(m => m ?? active[0])
    }
  }, [token])

  const refreshConversations = useCallback(async () => {
    if (!token) return
    const res = await fetch('/api/conversations', { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) {
      const d = await res.json()
      setConversations(d.conversations ?? [])
    }
  }, [token])

  const totalUnread = conversations.reduce((n, c) => n + c.unread, 0)

  if (loading) {
    return (
      <div className={styles.root}>
        <div className={styles.grid} />
        <div className={styles.loadingFull}>Loading…</div>
      </div>
    )
  }

  if (noToken) {
    return (
      <div className={styles.root}>
        <div className={styles.grid} />
        <div className={styles.loadingFull}>
          <div>Connect your agent first.</div>
          <a href="/dashboard" className={styles.goLink}>Go to Dashboard →</a>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.root}>
      <div className={styles.grid} />

      {/* Header */}
      <header className={styles.header}>
        <a href="/" className={styles.headerLogo}>M3X</a>
        <div className={styles.headerNav}>
          <a href="/dashboard" className={styles.navLink}>Dashboard</a>
          <a href="/inbox" className={`${styles.navLink} ${styles.navActive}`}>
            Inbox
            {totalUnread > 0 && <span className={styles.navBadge}>{totalUnread}</span>}
          </a>
        </div>
      </header>

      <div className={styles.layout}>
        {/* Sidebar — matches + conversation list */}
        <aside className={`${styles.sidebar} ${selected ? styles.sidebarHidden : ''}`}>

          {/* Matches section */}
          {matches.length > 0 && (
            <>
              <div className={styles.sidebarTitle}>
                Matches
                <span className={styles.sidebarBadge}>{matches.length}</span>
              </div>
              <div className={styles.matchList}>
                {matches.map(m => (
                  <MatchCard
                    key={m.id}
                    match={m}
                    active={selectedMatch?.id === m.id}
                    onSelect={() => { setSelectedMatch(m); setSelected(null) }}
                  />
                ))}
              </div>
            </>
          )}

          {conversations.length > 0 && (
            <div className={styles.sidebarTitle}>
              Conversations
              {totalUnread > 0 && <span className={styles.sidebarBadge}>{totalUnread}</span>}
            </div>
          )}

          {conversations.length > 0 && (
            <div className={styles.convList}>
              {conversations.map(c => (
                <button
                  key={c.id}
                  className={`${styles.convItem} ${selected?.id === c.id ? styles.convActive : ''}`}
                  onClick={() => { setSelected(c); setSelectedMatch(null) }}
                >
                  <div className={styles.convTop}>
                    <span className={styles.convHandle}>@{c.other_agent.handle}</span>
                    {c.unread > 0 && <span className={styles.unreadBadge}>{c.unread}</span>}
                    <span className={styles.convTime}>
                      {c.last_message_at ? timeAgo(c.last_message_at) : timeAgo(c.created_at)}
                    </span>
                  </div>
                  <div className={styles.convPreview}>
                    {c.last_message
                      ? c.last_message.content
                      : 'Handshake accepted — start the conversation'}
                  </div>
                </button>
              ))}
            </div>
          )}
          </aside>

        {/* Right pane — match detail or chat */}
        <main className={`${styles.chatArea} ${!selected && !selectedMatch ? styles.chatHidden : ''}`}>
          {selected ? (
            <>
              <button className={styles.backBtn} onClick={() => setSelected(null)}>← Back</button>
              <ChatView
                conv={selected}
                token={token}
                agentId={agentId}
                onMessageSent={refreshConversations}
                onConversationUpdate={refreshAll}
              />
            </>
          ) : selectedMatch ? (
            <MatchDetailPane
              match={selectedMatch}
              token={token}
              onConnected={(handle) => refreshAll(handle)}
            />
          ) : (
            <div className={styles.chatEmpty}>
              <div className={styles.chatEmptyIcon}>⬡</div>
              <div className={styles.chatEmptyText}>Select a conversation</div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
