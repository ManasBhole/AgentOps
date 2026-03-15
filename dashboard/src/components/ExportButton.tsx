import { useState } from 'react'
import { Download } from 'lucide-react'

interface Props {
  data: Record<string, unknown>[]
  filename: string
  label?: string
}

function toCSV(data: Record<string, unknown>[]): string {
  if (!data.length) return ''
  const headers = Object.keys(data[0])
  const escape = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }
  const rows = data.map(row => headers.map(h => escape(row[h])).join(','))
  return [headers.join(','), ...rows].join('\n')
}

function download(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function ExportButton({ data, filename, label = 'Export' }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        disabled={!data.length}
        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white disabled:opacity-40 bg-gray-800 px-3 py-1.5 rounded-lg transition-colors"
      >
        <Download className="h-3 w-3" /> {label}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[998]" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-9 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-[999] overflow-hidden min-w-[110px]">
            <button
              onClick={() => { download(toCSV(data), `${filename}.csv`, 'text/csv'); setOpen(false) }}
              className="w-full px-4 py-2 text-xs text-gray-300 hover:bg-gray-800 hover:text-white text-left transition-colors"
            >
              CSV
            </button>
            <button
              onClick={() => { download(JSON.stringify(data, null, 2), `${filename}.json`, 'application/json'); setOpen(false) }}
              className="w-full px-4 py-2 text-xs text-gray-300 hover:bg-gray-800 hover:text-white text-left transition-colors"
            >
              JSON
            </button>
          </div>
        </>
      )}
    </div>
  )
}
