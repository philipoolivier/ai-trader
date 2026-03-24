'use client'

import { formatCurrency, formatPercent, getPnlColor } from '@/lib/utils'
import type { PositionWithQuote } from '@/types'
import { TrendingUp, TrendingDown } from 'lucide-react'

interface PositionsTableProps {
  positions: PositionWithQuote[]
  loading: boolean
  onSymbolClick?: (symbol: string) => void
}

export default function PositionsTable({ positions, loading, onSymbolClick }: PositionsTableProps) {
  if (loading) {
    return (
      <div className="bg-surface-1 rounded-xl border border-surface-3 p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-5 bg-surface-3 rounded w-32" />
          <div className="h-8 bg-surface-3 rounded" />
          <div className="h-8 bg-surface-3 rounded" />
          <div className="h-8 bg-surface-3 rounded" />
        </div>
      </div>
    )
  }

  if (positions.length === 0) {
    return (
      <div className="bg-surface-1 rounded-xl border border-surface-3 p-8 text-center">
        <Briefcase className="mx-auto mb-3 text-text-muted" size={32} />
        <p className="text-text-secondary text-sm">No open positions</p>
        <p className="text-text-muted text-xs mt-1">Place a trade to get started</p>
      </div>
    )
  }

  return (
    <div className="bg-surface-1 rounded-xl border border-surface-3 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-surface-3">
              <th className="text-left text-xs font-medium text-text-muted uppercase tracking-wider px-4 py-3">Symbol</th>
              <th className="text-right text-xs font-medium text-text-muted uppercase tracking-wider px-4 py-3">Shares</th>
              <th className="text-right text-xs font-medium text-text-muted uppercase tracking-wider px-4 py-3">Avg Price</th>
              <th className="text-right text-xs font-medium text-text-muted uppercase tracking-wider px-4 py-3">Current</th>
              <th className="text-right text-xs font-medium text-text-muted uppercase tracking-wider px-4 py-3">Mkt Value</th>
              <th className="text-right text-xs font-medium text-text-muted uppercase tracking-wider px-4 py-3">P&L</th>
              <th className="text-right text-xs font-medium text-text-muted uppercase tracking-wider px-4 py-3">P&L %</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((pos) => (
              <tr
                key={pos.id}
                className="border-b border-surface-3/50 hover:bg-surface-2/50 transition-colors cursor-pointer"
                onClick={() => onSymbolClick?.(pos.symbol)}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${pos.unrealized_pnl >= 0 ? 'bg-profit' : 'bg-loss'}`} />
                    <span className="font-medium text-text-primary text-sm">{pos.symbol}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right text-sm text-text-primary">{pos.quantity}</td>
                <td className="px-4 py-3 text-right text-sm text-text-secondary">{formatCurrency(pos.avg_price)}</td>
                <td className="px-4 py-3 text-right text-sm text-text-primary">{formatCurrency(pos.current_price)}</td>
                <td className="px-4 py-3 text-right text-sm text-text-primary">{formatCurrency(pos.market_value)}</td>
                <td className={`px-4 py-3 text-right text-sm font-medium ${getPnlColor(pos.unrealized_pnl)}`}>
                  <div className="flex items-center justify-end gap-1">
                    {pos.unrealized_pnl >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                    {formatCurrency(pos.unrealized_pnl)}
                  </div>
                </td>
                <td className={`px-4 py-3 text-right text-sm font-medium ${getPnlColor(pos.unrealized_pnl_percent)}`}>
                  {formatPercent(pos.unrealized_pnl_percent)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Briefcase({ className, size }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect width="20" height="14" x="2" y="7" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  )
}
