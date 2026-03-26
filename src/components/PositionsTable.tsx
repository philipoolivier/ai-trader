'use client'

import React, { useState } from 'react'
import { formatCurrency, formatPercent, getPnlColor, cn } from '@/lib/utils'
import { getLotUnit } from '@/lib/trading-config'
import MiniPriceLadder from '@/components/MiniPriceLadder'
import type { PositionWithQuote } from '@/types'
import { TrendingUp, TrendingDown, X } from 'lucide-react'

interface PositionsTableProps {
  positions: PositionWithQuote[]
  loading: boolean
  onSymbolClick?: (symbol: string) => void
  onPositionClosed?: () => void
}

export default function PositionsTable({ positions, loading, onSymbolClick, onPositionClosed }: PositionsTableProps) {
  const [closingId, setClosingId] = useState<string | null>(null)
  const [closeMessage, setCloseMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const handleClose = async (e: React.MouseEvent, positionId: string, symbol: string) => {
    e.stopPropagation()
    if (!confirm(`Close entire ${symbol} position at market price?`)) return

    setClosingId(positionId)
    setCloseMessage(null)

    try {
      const res = await fetch('/api/trade/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positionId }),
      })
      const data = await res.json()

      if (res.ok) {
        setCloseMessage({ type: 'success', text: data.message })
        onPositionClosed?.()
      } else {
        setCloseMessage({ type: 'error', text: data.error })
      }
    } catch {
      setCloseMessage({ type: 'error', text: 'Failed to close position' })
    } finally {
      setClosingId(null)
    }
  }

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
    <div className="space-y-2">
      <div className="bg-surface-1 rounded-xl border border-surface-3 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-3">
                <th className="text-left text-xs font-medium text-text-muted uppercase tracking-wider px-4 py-3">Symbol</th>
                <th className="text-right text-xs font-medium text-text-muted uppercase tracking-wider px-4 py-3">Side</th>
                <th className="text-right text-xs font-medium text-text-muted uppercase tracking-wider px-4 py-3">Lots</th>
                <th className="text-right text-xs font-medium text-text-muted uppercase tracking-wider px-4 py-3">Avg Price</th>
                <th className="text-right text-xs font-medium text-text-muted uppercase tracking-wider px-4 py-3">Current</th>
                <th className="text-right text-xs font-medium text-text-muted uppercase tracking-wider px-4 py-3">SL</th>
                <th className="text-right text-xs font-medium text-text-muted uppercase tracking-wider px-4 py-3">TP</th>
                <th className="text-right text-xs font-medium text-text-muted uppercase tracking-wider px-4 py-3">P&L</th>
                <th className="text-right text-xs font-medium text-text-muted uppercase tracking-wider px-4 py-3">P&L %</th>
                <th className="text-center text-xs font-medium text-text-muted uppercase tracking-wider px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {positions.map((pos) => (
                <React.Fragment key={pos.id}>
                <tr
                  className="border-b border-surface-3/50 hover:bg-surface-2/50 transition-colors cursor-pointer"
                  onClick={() => setExpandedId(expandedId === pos.id ? null : pos.id)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full ${pos.unrealized_pnl >= 0 ? 'bg-profit' : 'bg-loss'}`} />
                      <span className="font-medium text-text-primary text-sm">{pos.symbol}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-sm">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${pos.side === 'long' ? 'bg-profit/10 text-profit' : 'bg-loss/10 text-loss'}`}>
                      {pos.side?.toUpperCase() || 'LONG'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-text-primary">{(pos.quantity / getLotUnit(pos.symbol)).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-sm text-text-secondary">{formatCurrency(pos.avg_price)}</td>
                  <td className="px-4 py-3 text-right text-sm text-text-primary">{formatCurrency(pos.current_price)}</td>
                  <td className="px-4 py-3 text-right text-sm">
                    {pos.stop_loss ? (
                      <div>
                        <span className="text-loss font-medium">{formatCurrency(pos.stop_loss)}</span>
                        <span className="text-[10px] text-text-muted block">
                          {((Math.abs(pos.current_price - pos.stop_loss) / pos.current_price) * 100).toFixed(1)}% away
                        </span>
                      </div>
                    ) : <span className="text-text-muted">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-sm">
                    {pos.take_profit ? (
                      <div>
                        <span className="text-profit font-medium">{formatCurrency(pos.take_profit)}</span>
                        <span className="text-[10px] text-text-muted block">
                          {((Math.abs(pos.take_profit - pos.current_price) / pos.current_price) * 100).toFixed(1)}% away
                        </span>
                      </div>
                    ) : <span className="text-text-muted">—</span>}
                  </td>
                  <td className={`px-4 py-3 text-right text-sm font-medium ${getPnlColor(pos.unrealized_pnl)}`}>
                    <div className="flex items-center justify-end gap-1">
                      {pos.unrealized_pnl >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                      {formatCurrency(pos.unrealized_pnl)}
                    </div>
                  </td>
                  <td className={`px-4 py-3 text-right text-sm font-medium ${getPnlColor(pos.unrealized_pnl_percent)}`}>
                    {formatPercent(pos.unrealized_pnl_percent)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={(e) => handleClose(e, pos.id, pos.symbol)}
                      disabled={closingId === pos.id}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                        closingId === pos.id
                          ? 'bg-surface-3 text-text-muted'
                          : 'bg-loss/10 text-loss hover:bg-loss/20'
                      )}
                    >
                      {closingId === pos.id ? (
                        <div className="w-3 h-3 border-2 border-text-muted border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <div className="flex items-center gap-1">
                          <X size={12} />
                          Close
                        </div>
                      )}
                    </button>
                  </td>
                </tr>
                {expandedId === pos.id && (pos.stop_loss || pos.take_profit) && (
                  <tr className="bg-surface-2/30">
                    <td colSpan={9} className="px-4 py-3">
                      <div className="flex items-start gap-4">
                        <MiniPriceLadder
                          currentPrice={pos.current_price}
                          entryPrice={pos.avg_price}
                          stopLoss={pos.stop_loss}
                          takeProfit={pos.take_profit}
                          side={pos.side || 'long'}
                          width={220}
                          height={90}
                        />
                        <div className="text-xs space-y-1 text-text-muted">
                          <div>Entry: <span className="text-brand-400 font-medium">{formatCurrency(pos.avg_price)}</span></div>
                          {pos.stop_loss && <div>SL: <span className="text-loss font-medium">{formatCurrency(pos.stop_loss)}</span> ({((Math.abs(pos.current_price - pos.stop_loss) / pos.current_price) * 100).toFixed(2)}% away)</div>}
                          {pos.take_profit && <div>TP: <span className="text-profit font-medium">{formatCurrency(pos.take_profit)}</span> ({((Math.abs(pos.take_profit - pos.current_price) / pos.current_price) * 100).toFixed(2)}% away)</div>}
                          {pos.stop_loss && pos.take_profit && (
                            <div>R:R: <span className="text-text-primary font-medium">1:{Math.abs((pos.take_profit - pos.avg_price) / (pos.avg_price - pos.stop_loss)).toFixed(1)}</span></div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {closeMessage && (
        <div
          className={cn(
            'text-sm px-4 py-2.5 rounded-lg',
            closeMessage.type === 'success' ? 'bg-profit/10 text-profit' : 'bg-loss/10 text-loss'
          )}
        >
          {closeMessage.text}
        </div>
      )}
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
