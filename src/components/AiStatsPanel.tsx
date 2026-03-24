'use client'

import { useState, useEffect } from 'react'
import { Brain, Target, TrendingUp, BarChart3 } from 'lucide-react'
import { formatCurrency, formatPercent, cn, getPnlColor } from '@/lib/utils'
import type { AiPerformanceStats } from '@/types'

export default function AiStatsPanel() {
  const [stats, setStats] = useState<AiPerformanceStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/ai/stats')
        const data = await res.json()
        if (data.totalSuggestions !== undefined) {
          setStats(data)
        }
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }
    fetchStats()
  }, [])

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-20 bg-surface-2 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (!stats || stats.totalSuggestions === 0) {
    return (
      <div className="bg-surface-1 rounded-xl border border-surface-3 p-6 text-center">
        <Brain className="mx-auto mb-2 text-text-muted" size={24} />
        <p className="text-sm text-text-secondary">No AI suggestions yet</p>
        <p className="text-xs text-text-muted mt-1">Upload a chart to get started</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-text-secondary flex items-center gap-2">
        <Brain size={14} />
        AI Performance
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-surface-1 rounded-xl border border-surface-3 p-4">
          <div className="flex items-center gap-1.5 mb-1">
            <BarChart3 size={12} className="text-brand-400" />
            <span className="text-xs text-text-muted">Total Suggestions</span>
          </div>
          <span className="text-lg font-bold text-text-primary">{stats.totalSuggestions}</span>
          <div className="text-xs text-text-muted mt-0.5">
            {stats.takenCount} taken / {stats.skippedCount} skipped
          </div>
        </div>

        <div className="bg-surface-1 rounded-xl border border-surface-3 p-4">
          <div className="flex items-center gap-1.5 mb-1">
            <Target size={12} className="text-profit" />
            <span className="text-xs text-text-muted">AI Win Rate</span>
          </div>
          <span className={cn('text-lg font-bold', stats.takenWinRate >= 50 ? 'text-profit' : 'text-loss')}>
            {formatPercent(stats.takenWinRate)}
          </span>
        </div>

        <div className="bg-surface-1 rounded-xl border border-surface-3 p-4">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp size={12} className="text-text-muted" />
            <span className="text-xs text-text-muted">Avg P&L</span>
          </div>
          <span className={cn('text-lg font-bold', getPnlColor(stats.takenAvgPnl))}>
            {formatCurrency(stats.takenAvgPnl)}
          </span>
        </div>

        <div className="bg-surface-1 rounded-xl border border-surface-3 p-4">
          <div className="flex items-center gap-1.5 mb-1">
            <Brain size={12} className="text-brand-400" />
            <span className="text-xs text-text-muted">Avg Confidence</span>
          </div>
          <span className="text-lg font-bold text-text-primary">
            {stats.avgConfidence.toFixed(1)}/10
          </span>
        </div>
      </div>
    </div>
  )
}
