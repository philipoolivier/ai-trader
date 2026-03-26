'use client'

import { formatCurrency, getPnlColor, cn } from '@/lib/utils'
import { format } from 'date-fns'
import type { Trade } from '@/types'

interface TradeHistoryProps {
  trades: Trade[]
  loading: boolean
}

export default function TradeHistory({ trades, loading }: TradeHistoryProps) {
  if (loading) {
    return (
      <div className="animate-pulse space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-12 bg-surface-3 rounded" />
        ))}
      </div>
    )
  }

  if (trades.length === 0) {
    return (
      <p className="text-text-secondary text-sm text-center py-8">No trades yet</p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-surface-3">
            <th className="text-left text-xs font-medium text-text-muted uppercase tracking-wider px-4 py-3">Date</th>
            <th className="text-left text-xs font-medium text-text-muted uppercase tracking-wider px-4 py-3">Symbol</th>
            <th className="text-left text-xs font-medium text-text-muted uppercase tracking-wider px-4 py-3">Side</th>
            <th className="text-right text-xs font-medium text-text-muted uppercase tracking-wider px-4 py-3">Lots</th>
            <th className="text-right text-xs font-medium text-text-muted uppercase tracking-wider px-4 py-3">Price</th>
            <th className="text-right text-xs font-medium text-text-muted uppercase tracking-wider px-4 py-3">Total</th>
            <th className="text-right text-xs font-medium text-text-muted uppercase tracking-wider px-4 py-3">P&L</th>
            <th className="text-left text-xs font-medium text-text-muted uppercase tracking-wider px-4 py-3">Notes</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((trade) => (
            <tr key={trade.id} className="border-b border-surface-3/50 hover:bg-surface-2/50 transition-colors">
              <td className="px-4 py-3 text-xs text-text-secondary">
                {format(new Date(trade.created_at), 'MMM d, HH:mm')}
              </td>
              <td className="px-4 py-3 text-sm font-medium text-text-primary">{trade.symbol}</td>
              <td className="px-4 py-3">
                <span
                  className={cn(
                    'text-xs font-medium px-2 py-0.5 rounded',
                    trade.side === 'buy' ? 'bg-profit/10 text-profit' : 'bg-loss/10 text-loss'
                  )}
                >
                  {trade.side.toUpperCase()}
                </span>
              </td>
              <td className="px-4 py-3 text-right text-sm text-text-primary">{(trade.quantity / 100_000).toFixed(2)}</td>
              <td className="px-4 py-3 text-right text-sm text-text-secondary">{formatCurrency(trade.price)}</td>
              <td className="px-4 py-3 text-right text-sm text-text-primary">{formatCurrency(trade.total)}</td>
              <td className={`px-4 py-3 text-right text-sm font-medium ${trade.pnl !== null ? getPnlColor(trade.pnl) : 'text-text-muted'}`}>
                {trade.pnl !== null ? formatCurrency(trade.pnl) : '—'}
              </td>
              <td className="px-4 py-3 text-xs text-text-muted max-w-[150px] truncate">
                {trade.notes || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
