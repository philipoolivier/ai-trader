'use client'

import { useState, useEffect, useCallback } from 'react'
import { Save, Trash2, Edit3, Plus, X, Code, Check, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CustomIndicator } from '@/types'

interface IndicatorLibraryProps {
  /** Called when user activates an indicator — its Pine Script gets sent to AI */
  activeIndicators: CustomIndicator[]
  onActiveChange: (indicators: CustomIndicator[]) => void
}

export default function IndicatorLibrary({ activeIndicators, onActiveChange }: IndicatorLibraryProps) {
  const [indicators, setIndicators] = useState<CustomIndicator[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(true)

  // Editor state
  const [editing, setEditing] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [pineScript, setPineScript] = useState('')
  const [category, setCategory] = useState('custom')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const fetchIndicators = useCallback(async () => {
    try {
      const res = await fetch('/api/indicators')
      const data = await res.json()
      if (Array.isArray(data)) setIndicators(data)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchIndicators() }, [fetchIndicators])

  const handleSave = async () => {
    if (!name.trim() || !pineScript.trim()) {
      setError('Name and Pine Script code are required')
      return
    }

    setSaving(true)
    setError('')

    try {
      const method = editId ? 'PUT' : 'POST'
      const body = editId
        ? { id: editId, name, description, pine_script: pineScript, category }
        : { name, description, pine_script: pineScript, category }

      const res = await fetch('/api/indicators', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        resetEditor()
        fetchIndicators()
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to save')
      }
    } catch {
      setError('Failed to save indicator')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this indicator?')) return

    try {
      await fetch('/api/indicators', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      setIndicators((prev) => prev.filter((i) => i.id !== id))
      onActiveChange(activeIndicators.filter((i) => i.id !== id))
    } catch { /* ignore */ }
  }

  const handleEdit = (ind: CustomIndicator) => {
    setEditId(ind.id)
    setName(ind.name)
    setDescription(ind.description || '')
    setPineScript(ind.pine_script)
    setCategory(ind.category)
    setEditing(true)
  }

  const resetEditor = () => {
    setEditing(false)
    setEditId(null)
    setName('')
    setDescription('')
    setPineScript('')
    setCategory('custom')
    setError('')
  }

  const toggleActive = (ind: CustomIndicator) => {
    const isActive = activeIndicators.some((a) => a.id === ind.id)
    if (isActive) {
      onActiveChange(activeIndicators.filter((a) => a.id !== ind.id))
    } else {
      onActiveChange([...activeIndicators, ind])
    }
  }

  const CATEGORIES = ['custom', 'trend', 'momentum', 'volatility', 'volume']

  return (
    <div className="bg-surface-1 rounded-xl border border-surface-3 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-surface-2/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Code size={16} className="text-brand-400" />
          <span className="text-sm font-medium text-text-primary">
            My Indicators {indicators.length > 0 && `(${indicators.length})`}
          </span>
        </div>
        {expanded ? <ChevronUp size={16} className="text-text-muted" /> : <ChevronDown size={16} className="text-text-muted" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Saved indicators list */}
          {loading ? (
            <div className="space-y-2">
              {[...Array(2)].map((_, i) => <div key={i} className="h-12 bg-surface-2 rounded-lg animate-pulse" />)}
            </div>
          ) : indicators.length > 0 ? (
            <div className="space-y-1.5">
              {indicators.map((ind) => {
                const isActive = activeIndicators.some((a) => a.id === ind.id)
                return (
                  <div
                    key={ind.id}
                    className={cn(
                      'flex items-center gap-2 rounded-lg p-2.5 transition-colors',
                      isActive ? 'bg-brand-600/10 border border-brand-600/30' : 'bg-surface-2'
                    )}
                  >
                    <button
                      onClick={() => toggleActive(ind)}
                      className={cn(
                        'w-5 h-5 rounded flex items-center justify-center shrink-0 transition-colors',
                        isActive ? 'bg-brand-600 text-white' : 'bg-surface-3 text-transparent hover:text-text-muted'
                      )}
                    >
                      <Check size={12} />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-text-primary truncate">{ind.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 bg-surface-3 text-text-muted rounded">{ind.category}</span>
                      </div>
                      {ind.description && (
                        <p className="text-[11px] text-text-muted truncate">{ind.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleEdit(ind)}
                        className="p-1 rounded hover:bg-surface-3 text-text-muted hover:text-text-primary transition-colors"
                      >
                        <Edit3 size={12} />
                      </button>
                      <button
                        onClick={() => handleDelete(ind.id)}
                        className="p-1 rounded hover:bg-loss/10 text-text-muted hover:text-loss transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : !editing ? (
            <p className="text-xs text-text-muted text-center py-2">No saved indicators yet</p>
          ) : null}

          {/* Active indicator info */}
          {activeIndicators.length > 0 && !editing && (
            <p className="text-[10px] text-brand-400">
              {activeIndicators.length} indicator{activeIndicators.length > 1 ? 's' : ''} active — AI will analyze {activeIndicators.length > 1 ? 'their' : 'its'} logic
            </p>
          )}

          {/* Editor */}
          {editing ? (
            <div className="space-y-3 border-t border-surface-3 pt-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-text-primary">
                  {editId ? 'Edit Indicator' : 'New Indicator'}
                </span>
                <button onClick={resetEditor} className="p-1 rounded hover:bg-surface-2 text-text-muted">
                  <X size={14} />
                </button>
              </div>

              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Indicator name"
                className="w-full px-3 py-2 text-sm bg-surface-2 border border-surface-4 rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-brand-600"
              />

              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description (optional)"
                className="w-full px-3 py-2 text-sm bg-surface-2 border border-surface-4 rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-brand-600"
              />

              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-surface-2 border border-surface-4 rounded-lg text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-600"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</option>
                ))}
              </select>

              <textarea
                value={pineScript}
                onChange={(e) => setPineScript(e.target.value)}
                placeholder={`//@version=5\nindicator("My Indicator", overlay=true)\n\n// Your Pine Script code here\nema20 = ta.ema(close, 20)\nema50 = ta.ema(close, 50)\n\nplot(ema20, color=color.blue)\nplot(ema50, color=color.red)`}
                className="w-full h-48 px-3 py-2 text-xs font-mono bg-surface-2 border border-surface-4 rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-brand-600 resize-none leading-relaxed"
                spellCheck={false}
              />

              {error && (
                <div className="text-xs text-loss bg-loss/10 px-3 py-2 rounded-lg">{error}</div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <Save size={14} />
                  {saving ? 'Saving...' : editId ? 'Update' : 'Save Indicator'}
                </button>
                <button
                  onClick={resetEditor}
                  className="px-4 py-2 bg-surface-2 hover:bg-surface-3 text-text-secondary text-sm rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-surface-2 hover:bg-surface-3 text-text-secondary text-sm rounded-lg transition-colors"
            >
              <Plus size={14} />
              Create New Indicator
            </button>
          )}
        </div>
      )}
    </div>
  )
}
