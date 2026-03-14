import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Siren, Send, CheckSquare, Square, UserPlus, Crown,
  AlertTriangle, Info, Radio, Plus, CheckCircle2, X,
  Wifi, WifiOff,
} from 'lucide-react'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Presence { user_id: string; user_email: string; user_name: string; user_role: string }
interface ChatMessage {
  id: string; user_id: string; user_email: string; user_role: string
  kind: 'chat' | 'annotation' | 'system'
  body: string; trace_id?: string; created_at: string
}
interface Task {
  id: string; room_id: string; title: string
  assigned_to: string; assignee_name: string
  done: boolean; created_at: string; done_at?: string
}
interface WarRoomData {
  room: { id: string; incident_id: string; title: string; status: string; commander: string }
  messages: ChatMessage[]
  tasks: Task[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROLE_COLOR: Record<string, string> = {
  owner: 'bg-yellow-600', admin: 'bg-indigo-600',
  'agent-runner': 'bg-emerald-600', viewer: 'bg-gray-600', system: 'bg-gray-700',
}

function Avatar({ email, name, role, size = 'sm' }: { email: string; name?: string; role?: string; size?: 'sm' | 'md' }) {
  const letter = (name || email || '?')[0].toUpperCase()
  const bg = ROLE_COLOR[role ?? 'viewer'] ?? 'bg-gray-600'
  const sz = size === 'md' ? 'w-8 h-8 text-sm' : 'w-6 h-6 text-xs'
  return (
    <div className={`${sz} ${bg} rounded-full flex items-center justify-center text-white font-bold flex-shrink-0`}
      title={name || email}>
      {letter}
    </div>
  )
}

function MessageBubble({ msg, isMe }: { msg: ChatMessage; isMe: boolean }) {
  if (msg.kind === 'system') {
    return (
      <div className="flex justify-center my-1">
        <span className="text-xs text-gray-600 bg-gray-800/50 px-3 py-0.5 rounded-full">{msg.body}</span>
      </div>
    )
  }
  return (
    <div className={`flex gap-2 ${isMe ? 'flex-row-reverse' : ''}`}>
      <Avatar email={msg.user_email} role={msg.user_role} />
      <div className={`max-w-xs ${isMe ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
        {!isMe && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400">{msg.user_email}</span>
            {msg.kind === 'annotation' && (
              <span className="text-xs text-indigo-400 bg-indigo-950 border border-indigo-900 px-1.5 rounded">annotation</span>
            )}
          </div>
        )}
        <div className={`rounded-2xl px-3 py-2 text-sm leading-relaxed
          ${isMe
            ? 'bg-indigo-600 text-white rounded-tr-sm'
            : msg.kind === 'annotation'
              ? 'bg-indigo-950 border border-indigo-800 text-indigo-200 rounded-tl-sm'
              : 'bg-gray-800 text-gray-200 rounded-tl-sm'}`}>
          {msg.body}
          {msg.trace_id && (
            <div className="text-xs opacity-60 mt-1 font-mono">trace: {msg.trace_id.slice(0, 12)}</div>
          )}
        </div>
        <span className="text-xs text-gray-600 px-1">
          {new Date(msg.created_at).toLocaleTimeString()}
        </span>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function WarRoom() {
  const { incidentId } = useParams<{ incidentId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  useQueryClient()

  // WebSocket
  const wsRef = useRef<WebSocket | null>(null)
  const [wsState, setWsState] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const [presence, setPresence] = useState<Presence[]>([])

  // Chat
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [msgKind, setMsgKind] = useState<'chat' | 'annotation'>('chat')

  // Tasks
  const [tasks, setTasks] = useState<Task[]>([])
  const [newTask, setNewTask] = useState('')
  const [showTaskForm, setShowTaskForm] = useState(false)

  // Room data
  const [room, setRoom] = useState<WarRoomData['room'] | null>(null)

  // ── Open / load war room ──────────────────────────────────────────────────

  const { isLoading } = useQuery({
    queryKey: ['warroom', incidentId],
    queryFn: async () => {
      const { data } = await api.post(`/warroom/${incidentId}`)
      const wr = data as WarRoomData
      setRoom(wr.room)
      setMessages(Array.isArray(wr.messages) ? wr.messages : [])
      setTasks(Array.isArray(wr.tasks) ? wr.tasks : [])
      return wr
    },
    enabled: !!incidentId,
    staleTime: Infinity,
  })

  // ── WebSocket connection ──────────────────────────────────────────────────

  const connectWS = useCallback(() => {
    if (!incidentId) return
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const host = window.location.hostname
    const port = import.meta.env.DEV ? '8080' : window.location.port
    const token = localStorage.getItem('access_token') ?? ''
    const url = `${proto}://${host}:${port}/api/v1/warroom/${incidentId}/ws?token=${token}`
    const ws = new WebSocket(url)

    ws.onopen = () => { setWsState('connected'); wsRef.current = ws }
    ws.onclose = () => {
      setWsState('disconnected')
      // Reconnect after 3s
      setTimeout(connectWS, 3000)
    }
    ws.onerror = () => setWsState('disconnected')
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as { type: string; payload: any }
        handleWSEvent(msg.type, msg.payload)
      } catch { /* ignore */ }
    }
  }, [incidentId])

  useEffect(() => {
    if (!isLoading && incidentId) connectWS()
    return () => { wsRef.current?.close() }
  }, [isLoading, incidentId])

  const handleWSEvent = useCallback((type: string, payload: any) => {
    switch (type) {
      case 'presence.snapshot':
        setPresence(Array.isArray(payload.presence) ? payload.presence : [])
        break
      case 'user.joined':
      case 'user.left':
        setPresence(Array.isArray(payload.presence) ? payload.presence : [])
        break
      case 'message.new':
        setMessages(prev => [...prev, payload as ChatMessage])
        break
      case 'task.created':
        setTasks(prev => [...prev, payload as Task])
        break
      case 'task.updated':
        setTasks(prev => prev.map(t => t.id === payload.id ? { ...t, done: payload.done } : t))
        break
    }
  }, [])

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Actions ───────────────────────────────────────────────────────────────

  const sendMessage = () => {
    if (!input.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    wsRef.current.send(JSON.stringify({
      type: 'message.send',
      payload: { body: input.trim(), kind: msgKind },
    }))
    setInput('')
  }

  const createTaskMutation = useMutation({
    mutationFn: async (title: string) => {
      const { data } = await api.post(`/warroom/${incidentId}/tasks`, { title })
      return data as Task
    },
    onSuccess: () => { setNewTask(''); setShowTaskForm(false) },
  })

  const toggleTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const { data } = await api.patch(`/warroom/${incidentId}/tasks/${taskId}/toggle`)
      return data as Task
    },
    onSuccess: (updated) => {
      setTasks(prev => prev.map(t => t.id === updated.id ? updated : t))
    },
  })

  const { data: incidentData } = useQuery({
    queryKey: ['incident', incidentId],
    queryFn: async () => { const { data } = await api.get(`/incidents/${incidentId}`); return data },
    enabled: !!incidentId,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Radio className="h-6 w-6 text-indigo-400 animate-pulse" />
        <span className="ml-2 text-gray-400">Opening war room…</span>
      </div>
    )
  }

  const doneTasks = tasks.filter(t => t.done).length
  const isCommander = room?.commander === user?.id

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] gap-0">
      {/* Header */}
      <div className="bg-gray-900 border border-gray-800 rounded-t-xl px-5 py-3 flex items-center gap-3 flex-shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Siren className="h-4 w-4 text-red-400 animate-pulse flex-shrink-0" />
          <span className="font-semibold text-white truncate">{room?.title || 'War Room'}</span>
          {isCommander && (
            <span className="flex items-center gap-1 text-xs text-yellow-400 bg-yellow-900/30 border border-yellow-800/50 px-2 py-0.5 rounded-full flex-shrink-0">
              <Crown className="h-3 w-3" /> Commander
            </span>
          )}
        </div>

        {/* Presence avatars */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <div className="flex -space-x-1.5">
            {presence.slice(0, 6).map(p => (
              <Avatar key={p.user_id} email={p.user_email} name={p.user_name} role={p.user_role} />
            ))}
          </div>
          {presence.length > 6 && (
            <span className="text-xs text-gray-500 ml-1">+{presence.length - 6}</span>
          )}
          <span className="ml-2 text-xs text-gray-500">{presence.length} online</span>
        </div>

        {/* WS status */}
        <div className={`flex items-center gap-1.5 text-xs flex-shrink-0 ${wsState === 'connected' ? 'text-emerald-400' : wsState === 'connecting' ? 'text-yellow-400' : 'text-red-400'}`}>
          {wsState === 'connected' ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
          {wsState}
        </div>

        <button onClick={() => navigate('/incidents')}
          className="p-1 text-gray-600 hover:text-gray-400 flex-shrink-0">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-1 gap-0 overflow-hidden border-x border-b border-gray-800 rounded-b-xl">
        {/* Left: incident context */}
        <div className="w-56 flex-shrink-0 border-r border-gray-800 overflow-y-auto p-3 space-y-3">
          {incidentData && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Incident</div>
              <div className={`text-xs px-2 py-0.5 rounded-full w-fit font-medium
                ${incidentData.severity === 'critical' ? 'bg-red-900/60 text-red-300' :
                  incidentData.severity === 'high' ? 'bg-orange-900/60 text-orange-300' :
                  'bg-yellow-900/60 text-yellow-300'}`}>
                {incidentData.severity}
              </div>
              <div className="text-xs text-gray-400">{incidentData.status}</div>
              {incidentData.root_cause && (
                <div className="text-xs text-gray-500 bg-gray-800 rounded p-2 leading-relaxed">
                  {incidentData.root_cause}
                </div>
              )}
              {incidentData.suggested_fix && (
                <div className="text-xs text-emerald-500/80 bg-emerald-950/30 border border-emerald-900/30 rounded p-2 leading-relaxed">
                  {incidentData.suggested_fix}
                </div>
              )}
            </div>
          )}

          <div className="border-t border-gray-800 pt-3">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Participants</div>
            <div className="space-y-1.5">
              {presence.map(p => (
                <div key={p.user_id} className="flex items-center gap-2">
                  <Avatar email={p.user_email} name={p.user_name} role={p.user_role} />
                  <div className="min-w-0">
                    <div className="text-xs text-gray-300 truncate">{p.user_name || p.user_email}</div>
                    <div className="text-xs text-gray-600">{p.user_role}</div>
                  </div>
                  {room?.commander === p.user_id && <Crown className="h-3 w-3 text-yellow-400 flex-shrink-0" />}
                </div>
              ))}
              {presence.length === 0 && (
                <div className="text-xs text-gray-600">No one else here yet</div>
              )}
            </div>
          </div>
        </div>

        {/* Center: chat */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map(msg => (
              <MessageBubble key={msg.id} msg={msg} isMe={msg.user_id === user?.id} />
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-800 p-3 flex-shrink-0">
            <div className="flex gap-1.5 mb-2">
              {(['chat', 'annotation'] as const).map(k => (
                <button key={k} onClick={() => setMsgKind(k)}
                  className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${msgKind === k ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                  {k === 'chat' ? '💬 Chat' : '📌 Annotate'}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendMessage())}
                placeholder={msgKind === 'annotation' ? 'Add an annotation (links to a trace)…' : 'Message the team…'}
                className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
              />
              <button onClick={sendMessage} disabled={!input.trim()}
                className="p-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl transition-colors">
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Right: task checklist */}
        <div className="w-60 flex-shrink-0 border-l border-gray-800 flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <CheckSquare className="h-4 w-4 text-indigo-400" />
              <span className="text-sm font-semibold text-white">Tasks</span>
              {tasks.length > 0 && (
                <span className="text-xs text-gray-500">{doneTasks}/{tasks.length}</span>
              )}
            </div>
            <button onClick={() => setShowTaskForm(v => !v)}
              className="p-1 text-gray-500 hover:text-white transition-colors">
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {showTaskForm && (
            <div className="px-3 py-2 border-b border-gray-800 flex-shrink-0">
              <input value={newTask} onChange={e => setNewTask(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && newTask.trim() && createTaskMutation.mutate(newTask.trim())}
                placeholder="New task… (Enter to add)"
                autoFocus
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500" />
            </div>
          )}

          {/* Progress bar */}
          {tasks.length > 0 && (
            <div className="px-3 py-2 border-b border-gray-800 flex-shrink-0">
              <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${(doneTasks / tasks.length) * 100}%` }} />
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto divide-y divide-gray-800/50">
            {tasks.length === 0 && (
              <div className="p-4 text-center text-xs text-gray-600">
                No tasks yet<br />Click + to add one
              </div>
            )}
            {tasks.map(task => (
              <div key={task.id}
                className={`flex items-start gap-2.5 px-3 py-2.5 hover:bg-gray-800/30 transition-colors group ${task.done ? 'opacity-50' : ''}`}>
                <button onClick={() => toggleTaskMutation.mutate(task.id)}
                  className="mt-0.5 flex-shrink-0 text-gray-500 hover:text-emerald-400 transition-colors">
                  {task.done
                    ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    : <Square className="h-4 w-4" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className={`text-xs text-gray-300 leading-relaxed ${task.done ? 'line-through text-gray-600' : ''}`}>
                    {task.title}
                  </div>
                  {task.assignee_name && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <UserPlus className="h-2.5 w-2.5 text-gray-600" />
                      <span className="text-xs text-gray-600 truncate">{task.assignee_name}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Severity legend */}
          <div className="px-3 py-3 border-t border-gray-800 space-y-1 flex-shrink-0">
            <div className="text-xs font-medium text-gray-500 mb-1.5">Message Types</div>
            {[
              { icon: Info, label: 'Chat', color: 'text-gray-400' },
              { icon: AlertTriangle, label: 'Annotation', color: 'text-indigo-400' },
            ].map(({ icon: Icon, label, color }) => (
              <div key={label} className={`flex items-center gap-1.5 text-xs ${color}`}>
                <Icon className="h-3 w-3" /> {label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
