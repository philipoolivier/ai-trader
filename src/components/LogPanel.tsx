'use client'

import { useState, useEffect } from 'react'
import { getLogs, subscribe, clearLogs } from '@/lib/log-store'
import { cn } from '@/lib/utils'
import { Trash2 } from 'lucide-react'

export default function LogPanel() {
  const [logs, setLogs] = useState(getLogs())
  const [show, setShow] = useState(true)

  useEffect(() => {
    return subscribe(() => setLogs([...getLogs()]))
  }, [])

  return (
    <div className="bg-surface-1 rounded-xl border border-surface-3 overflow-hidden">
      <button
        onClick={() => setShow(!show)}
        className="w-full px-4 py-3 flex items-center justify-between text-sm font-medium text-text-primary hover:bg-surface-2 transition-colors"
      >
        <span>System Log ({logs.length})</span>
        <div className="flex items-center gap-2">
          {logs.length > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); clearLogs() }}
              className="p-1 text-text-muted hover:text-loss"
            >
              <Trash2 size={12} />
            </button>
          )}
          <span className="text-text-muted text-xs">{show ? 'Hide' : 'Show'}</span>
        </div>
      </button>
      {show && (
        <div className="border-t border-surface-3 max-h-64 overflow-y-auto font-mono text-[11px]">
          {logs.length === 0 ? (
            <p className="px-4 py-3 text-text-muted">No logs yet. Actions will appear here.</p>
          ) : (
            logs.map((log, i) => (
              <div
                key={i}
                className={cn(
                  'px-4 py-1.5 border-b border-surface-3/30',
                  log.level === 'error' ? 'text-loss bg-loss/5' :
                  log.level === 'success' ? 'text-profit bg-profit/5' :
                  'text-text-secondary'
                )}
              >
                <span className="text-text-muted mr-2">{log.time}</span>
                {log.message}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
