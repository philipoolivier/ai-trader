'use client'

import { useEffect, useState, useCallback } from 'react'
import { formatCurrency, formatPercent, getPnlColor, cn } from '@/lib/utils'
import { format } from 'date-fns'
import type { Trade } from '@/types'
import { BookOpen, TrendingUp, TrendingDown, Filter } from 'lucide-react'

export default function JournalPage() {
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'wins' | 'losses'>('all')

  const fetchTrades = useCallback(async () => {
    try {
      const res = await fetch('/api/portfolio')
      const data = await res.json()
      setTrades(data.trades || [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTrades()
  }, [fetchTrades])

  const closedTrades = trades.filter((t) => t.side === 'sell' && t.pnl !== null)
  const filteredTrades =
    filter === 'wins'
      ? closedTrades.filter((t) => (t.pnl || 0) > 0)
      : filter === 'losses'
      ? closedTrades.filter((t) => (t.pnl || 0) < 0)
      : trades

  // Group trades by date
  const grouped = filteredTrades.reduce((acc, trade) => {
    const date = format(new Date(trade.created_at), 'yyyy-MM-dd')
    if (!acc[date]) acc[date] = []
    acc[date].push(trade)
    return acc
  }, {} as Record<string, Trade[]>)

  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  // Stats
  const totalRealizedPnl = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0)
  const bestTrade = closedTrades.length > 0
    ? closedTrades.reduce((best, t) => ((t.pnl || 0) > (best.pnl || 0) ? t : best))
    : null
  const worstTrade = closedTrades.length > 0
    ? closedTrades.reduce((worst, t) => ((t.pnl || 0) < (worst.pnl || 0) ? t : worst))
    : null

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-text-primary">Trade Journal</h1>
        <div className="animate-pulse space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 bg-surface-1 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-text-primary">Trade Journal</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-surface-1 rounded-xl border border-surface-3 p-5">
          <span className="text-sm text-text-secondary block mb-1">Realized P&L</span>
          <span className={cn('text-2xl font-bold', getPnlColor(totalRealizedPnl))}>
            {formatCurrency(totalRealizedPnl)}
          </span>
        </div>
        <div className="bg-surface-1 rounded-xl border border-surface-3 p-5">
          <span className="text-sm text-text-secondary block mb-1">Best Trade</span>
          {bestTrade ? (
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-profit">
                {formatCurrency(bestTrade.pnl || 0)}
              </span>
              <span className="text-sm text-text-muted">{bestTrade.symbol}</span>
            </div>
          ) : (
            <span className="text-text-muted">No closed trades</span>
          )}
        </div>
        <div className="bg-surface-1 rounded-xl border border-surface-3 p-5">
          <span className="text-sm text-text-secondary block mb-1">Worst Trade</span>
          {worstTrade ? (
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-loss">
                {formatCurrency(worstTrade.pnl || 0)}
              </span>
              <span className="text-sm text-text-muted">{worstTrade.symbol}</span>
            </div>
          ) : (
            <span className="text-text-muted">No closed trades</span>
          )}
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Filter size={16} className="text-text-muted" />
        {(['all', 'wins', 'losses'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
              filter === f
                ? 'bg-brand-600 text-white'
                : 'bg-surface-2 text-text-secondary hover:text-text-primary'
            )}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Trade Entries */}
      {filteredTrades.length === 0 ? (
        <div className="bg-surface-1 rounded-xl border border-surface-3 p-12 text-center">
          <BookOpen className="mx-auto mb-3 text-text-muted" size={32} />
          <p className="text-text-secondary">No trades to show</p>
          <p className="text-text-muted text-sm mt-1">Start trading to build your journal</p>
        </div>
      ) : (
        <div className="space-y-6">
          {sortedDates.map((date) => (
            <div key={date}>
              <h3 className="text-sm font-medium text-text-muted mb-3">
                {format(new Date(date), 'EEEE, MMMM d, yyyy')}
              </h3>
              <div className="space-y-2">
                {grouped[date].map((trade) => (
                  <div
                    key={trade.id}
                    className="bg-surface-1 rounded-xl border border-surface-3 p-4 hover:border-surface-4 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            'w-8 h-8 rounded-lg flex items-center justify-center',
                            trade.side === 'buy' ? 'bg-profit/10' : 'bg-loss/10'
                          )}
                        >
                          {trade.side === 'buy' ? (
                            <TrendingUp size={16} className="text-profit" />
                          ) : (
                            <TrendingDown size={16} className="text-loss" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-text-primary">{trade.symbol}</span>
                            <span
                              className={cn(
                                'text-xs font-medium px-1.5 py-0.5 rounded',
                                trade.side === 'buy' ? 'bg-profit/10 text-profit' : 'bg-loss/10 text-loss'
                              )}
                            >
                              {trade.side.toUpperCase()}
                            </span>
                          </div>
                          <span className="text-xs text-text-muted">
                            {trade.quantity} shares @ {formatCurrency(trade.price)}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium text-text-primary">
                          {formatCurrency(trade.total)}
                        </div>
                        {trade.pnl !== null && (
                          <div className={cn('text-sm font-medium', getPnlColor(trade.pnl))}>
                            {trade.pnl >= 0 ? '+' : ''}
                            {formatCurrency(trade.pnl)}
                          </div>
                        )}
                      </div>
                    </div>
                    {trade.notes && (
                      <div className="mt-3 pt-3 border-t border-surface-3">
                        <p className="text-sm text-text-secondary">{trade.notes}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
