// Simple in-memory log store for debugging
const logs: { time: string; level: 'info' | 'error' | 'success'; message: string }[] = []
const listeners: (() => void)[] = []

export function addLog(level: 'info' | 'error' | 'success', message: string) {
  const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  logs.unshift({ time, level, message })
  if (logs.length > 50) logs.length = 50
  listeners.forEach(fn => fn())
}

export function getLogs() {
  return logs
}

export function subscribe(fn: () => void) {
  listeners.push(fn)
  return () => {
    const idx = listeners.indexOf(fn)
    if (idx >= 0) listeners.splice(idx, 1)
  }
}

export function clearLogs() {
  logs.length = 0
  listeners.forEach(fn => fn())
}
