import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Copy, Check, Plus, Trash2, Eye, EyeOff, Zap, CheckCircle2,
  Loader2, ExternalLink, Code2, Terminal,
} from 'lucide-react'
import api from '../services/api'

type APIKey = {
  id: string; name: string; key: string; created_at: string; last_used?: string
}

// ── SDK definitions ──────────────────────────────────────────────────────────

type SDK = {
  id: string
  name: string
  logo: string          // emoji
  color: string         // tailwind bg for badge
  install: string
  code: string
  lang: string
}

const BASE_URL = window.location.origin

const SDKS: SDK[] = [
  {
    id: 'python',
    name: 'Python SDK',
    logo: '🐍',
    color: 'bg-yellow-900/40 border-yellow-800/60 text-yellow-300',
    install: 'pip install orion-sdk',
    lang: 'python',
    code: `import orion

orion.init(
    api_key="YOUR_API_KEY",
    base_url="${BASE_URL}",
    agent_id="my-agent",
)

# Any function you decorate is auto-traced
@orion.trace
def run_agent(prompt: str) -> str:
    response = openai_client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
    )
    return response.choices[0].message.content`,
  },
  {
    id: 'langchain',
    name: 'LangChain',
    logo: '🦜',
    color: 'bg-emerald-900/40 border-emerald-800/60 text-emerald-300',
    install: 'pip install orion-langchain',
    lang: 'python',
    code: `from langchain_openai import ChatOpenAI
from orion.integrations.langchain import OrionCallbackHandler

handler = OrionCallbackHandler(
    api_key="YOUR_API_KEY",
    base_url="${BASE_URL}",
    agent_id="langchain-agent",
)

llm = ChatOpenAI(
    model="gpt-4o",
    callbacks=[handler],
)

# All LLM calls are automatically traced
result = llm.invoke("What is the capital of France?")`,
  },
  {
    id: 'llamaindex',
    name: 'LlamaIndex',
    logo: '🦙',
    color: 'bg-zinc-900/40 border-zinc-800/60 text-blue-300',
    install: 'pip install orion-llamaindex',
    lang: 'python',
    code: `from llama_index.core import VectorStoreIndex
from orion.integrations.llamaindex import OrionObserver

OrionObserver.attach(
    api_key="YOUR_API_KEY",
    base_url="${BASE_URL}",
    agent_id="llama-rag-agent",
)

# All queries and retrievals are traced automatically
index = VectorStoreIndex.from_documents(docs)
query_engine = index.as_query_engine()
response = query_engine.query("Summarize the main findings")`,
  },
  {
    id: 'openai-agents',
    name: 'OpenAI Agents',
    logo: '🤖',
    color: 'bg-sky-900/40 border-sky-800/60 text-sky-300',
    install: 'pip install orion-openai',
    lang: 'python',
    code: `from agents import Agent, Runner
from orion.integrations.openai_agents import patch_openai_agents

patch_openai_agents(
    api_key="YOUR_API_KEY",
    base_url="${BASE_URL}",
    agent_id="openai-swarm",
)

agent = Agent(name="ResearchBot", instructions="You are a helpful researcher.")
result = Runner.run_sync(agent, "Find the latest AI research papers")`,
  },
  {
    id: 'anthropic',
    name: 'Anthropic SDK',
    logo: '⚡',
    color: 'bg-violet-900/40 border-violet-800/60 text-violet-300',
    install: 'pip install orion-anthropic',
    lang: 'python',
    code: `import anthropic
from orion.integrations.anthropic import OrionAnthropicClient

client = OrionAnthropicClient(
    api_key=anthropic.api_key,
    orion_api_key="YOUR_API_KEY",
    orion_base_url="${BASE_URL}",
    agent_id="claude-agent",
)

# Drop-in replacement for anthropic.Anthropic()
message = client.messages.create(
    model="claude-opus-4-6",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello!"}],
)`,
  },
  {
    id: 'http',
    name: 'REST API',
    logo: '🔌',
    color: 'bg-gray-800/60 border-gray-700 text-gray-300',
    install: '# No install needed — pure HTTP',
    lang: 'bash',
    code: `# Single event
curl -X POST ${BASE_URL}/api/v1/ingest \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "agent_id": "my-agent",
    "run_id": "run-abc123",
    "name": "llm.call",
    "status": "ok",
    "duration_ms": 842,
    "attributes": {
      "model": "gpt-4o",
      "input_tokens": 512,
      "output_tokens": 128,
      "cost_usd": 0.0045
    }
  }'

# Batch (up to 100 events)
curl -X POST ${BASE_URL}/api/v1/ingest/batch \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '[{"agent_id":"my-agent","name":"step.1","status":"ok","duration_ms":120}, ...]'`,
  },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null)
  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }
  return { copied, copy }
}

function CodeBlock({ code, copyKey, onCopy }: {
  code: string; copyKey: string
  onCopy: (text: string, key: string) => void
}) {
  const { copied, copy } = useCopy()
  return (
    <div className="relative group">
      <pre className="text-xs font-mono text-gray-300 bg-gray-950 border border-gray-800 rounded-lg p-4 overflow-x-auto leading-relaxed whitespace-pre">
        {code}
      </pre>
      <button
        onClick={() => { copy(code, copyKey); onCopy(code, copyKey) }}
        className="absolute top-2 right-2 p-1.5 rounded bg-gray-800 border border-gray-700 text-gray-400 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
      >
        {copied === copyKey ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Integrations() {
  const queryClient = useQueryClient()
  const [activeSdk, setActiveSdk] = useState('python')
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})
  const [newKeyName, setNewKeyName] = useState('')
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<null | 'ok' | 'err'>(null)
  const [testLoading, setTestLoading] = useState(false)
  const { copied, copy } = useCopy()

  const { data: keys = [] } = useQuery<APIKey[]>({
    queryKey: ['api-keys'],
    queryFn: async () => {
      const { data } = await api.get<{ keys: APIKey[] }>('/api-keys')
      return data.keys ?? []
    },
  })

  const createMutation = useMutation({
    mutationFn: (name: string) => api.post<{ key: APIKey & { raw_key: string } }>('/api-keys', { name }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
      setCreatedKey((res.data as any).raw_key ?? (res.data as any).key?.key ?? '')
      setNewKeyName('')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api-keys/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['api-keys'] }),
  })

  async function sendTestEvent() {
    setTestLoading(true); setTestResult(null)
    try {
      await api.post('/ingest', {
        agent_id: 'test-agent',
        run_id: 'run_test_' + Date.now(),
        name: 'orion.connection.test',
        status: 'ok',
        duration_ms: 1,
        attributes: { source: 'integrations_page' },
      })
      setTestResult('ok')
    } catch {
      setTestResult('err')
    } finally {
      setTestLoading(false)
      setTimeout(() => setTestResult(null), 4000)
    }
  }

  const sdk = SDKS.find(s => s.id === activeSdk)!
  const displayCode = sdk.code.replace(/YOUR_API_KEY/g, keys[0]?.key ? `${keys[0].key.slice(0, 8)}...` : 'YOUR_API_KEY')

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Integrations</h1>
          <p className="text-sm text-gray-500 mt-0.5">Connect your AI agents in minutes · 6 frameworks supported</p>
        </div>
        <a
          href="https://docs.orion.dev"
          target="_blank" rel="noreferrer"
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 border border-gray-700 px-3 py-1.5 rounded-lg"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Docs
        </a>
      </div>

      {/* Endpoint strip */}
      <div className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-gray-500 font-mono">
          <Terminal className="h-3.5 w-3.5" />
          <span className="text-gray-400">Base URL</span>
          <span className="text-violet-300 ml-2">{BASE_URL}</span>
        </div>
        <button onClick={() => copy(BASE_URL, 'baseurl')} className="ml-2 text-gray-600 hover:text-gray-300">
          {copied === 'baseurl' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={sendTestEvent}
            disabled={testLoading}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60"
          >
            {testLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
            Send test event
          </button>
          {testResult === 'ok' && (
            <span className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> Connected!</span>
          )}
          {testResult === 'err' && (
            <span className="text-xs text-red-400">Test failed</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left: SDK picker */}
        <div className="col-span-1 space-y-2">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-1 mb-3">Frameworks</div>
          {SDKS.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSdk(s.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                activeSdk === s.id
                  ? 'bg-blue-900/40 border border-blue-700/60 text-white'
                  : 'bg-gray-900 border border-gray-800 text-gray-400 hover:text-gray-200 hover:border-gray-700'
              }`}
            >
              <span className="text-lg">{s.logo}</span>
              <span className="text-sm font-medium">{s.name}</span>
              {activeSdk === s.id && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400" />}
            </button>
          ))}
        </div>

        {/* Right: Code panel */}
        <div className="col-span-2 space-y-4">
          <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-medium ${sdk.color}`}>
            <span>{sdk.logo}</span> {sdk.name}
          </div>

          {/* Install */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Code2 className="h-3.5 w-3.5 text-gray-500" />
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Install</span>
            </div>
            <CodeBlock code={sdk.install} copyKey={`install-${sdk.id}`} onCopy={copy} />
          </div>

          {/* Code */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Terminal className="h-3.5 w-3.5 text-gray-500" />
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Instrument your agent</span>
            </div>
            <CodeBlock code={displayCode} copyKey={`code-${sdk.id}`} onCopy={copy} />
          </div>
        </div>
      </div>

      {/* API Keys */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <span className="text-sm font-semibold text-white">API Keys</span>
          <span className="text-xs text-gray-500">{keys.length} key{keys.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Created key banner */}
        {createdKey && (
          <div className="mx-4 mt-3 flex items-center gap-3 bg-emerald-950 border border-emerald-800 rounded-lg px-4 py-3">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-xs text-emerald-300 font-medium mb-1">Key created — copy it now, it won't be shown again</div>
              <code className="text-xs font-mono text-emerald-200 break-all">{createdKey}</code>
            </div>
            <button onClick={() => copy(createdKey, 'newkey')} className="text-emerald-400 hover:text-white flex-shrink-0">
              {copied === 'newkey' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
            <button onClick={() => setCreatedKey(null)} className="text-emerald-600 hover:text-emerald-400 flex-shrink-0 text-xs">✕</button>
          </div>
        )}

        <div className="p-4 space-y-2">
          {keys.map(k => (
            <div key={k.id} className="flex items-center gap-3 bg-gray-800/60 border border-gray-700/60 rounded-lg px-3 py-2.5">
              <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-200 font-medium">{k.name}</div>
                <div className="text-xs font-mono text-gray-500 mt-0.5">
                  {showKeys[k.id] ? k.key : `${k.key.slice(0, 8)}${'•'.repeat(24)}`}
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="text-xs text-gray-600">{new Date(k.created_at).toLocaleDateString()}</span>
                <button onClick={() => setShowKeys(p => ({ ...p, [k.id]: !p[k.id] }))} className="text-gray-600 hover:text-gray-300 p-1">
                  {showKeys[k.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
                <button onClick={() => copy(k.key, k.id)} className="text-gray-600 hover:text-gray-300 p-1">
                  {copied === k.id ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
                <button onClick={() => deleteMutation.mutate(k.id)} className="text-gray-700 hover:text-red-400 p-1">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}

          {/* Create new key */}
          <div className="flex items-center gap-2 pt-1">
            <input
              value={newKeyName}
              onChange={e => setNewKeyName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && newKeyName.trim() && createMutation.mutate(newKeyName.trim())}
              placeholder="Key name (e.g. production)"
              className="flex-1 text-sm bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-200 placeholder-gray-600 outline-none focus:border-blue-600"
            />
            <button
              onClick={() => newKeyName.trim() && createMutation.mutate(newKeyName.trim())}
              disabled={!newKeyName.trim() || createMutation.isPending}
              className="flex items-center gap-1.5 text-sm px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg"
            >
              {createMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Create
            </button>
          </div>
        </div>
      </div>

      {/* Event schema reference */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="text-sm font-semibold text-white mb-3">Event Schema Reference</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {[
            { field: 'agent_id', type: 'string', req: true, desc: 'Unique agent identifier' },
            { field: 'name', type: 'string', req: true, desc: 'Span/operation name' },
            { field: 'status', type: '"ok"|"error"', req: false, desc: 'Defaults to "ok"' },
            { field: 'duration_ms', type: 'number', req: false, desc: 'Execution time in ms' },
            { field: 'run_id', type: 'string', req: false, desc: 'Groups related spans' },
            { field: 'attributes', type: 'object', req: false, desc: 'Custom key-value metadata' },
          ].map(f => (
            <div key={f.field} className="bg-gray-800/60 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2 mb-1">
                <code className="text-xs font-mono text-violet-300">{f.field}</code>
                {f.req && <span className="text-xs text-red-400">*</span>}
                <span className="text-xs text-gray-600 font-mono ml-auto">{f.type}</span>
              </div>
              <div className="text-xs text-gray-500">{f.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
