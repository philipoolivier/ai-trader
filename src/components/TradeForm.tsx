'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/utils'

interface TradeFormProps {
  symbol: string
  currentPrice: number
  cashBalance: number
  currentShares: number
  onTradeComplete: () => void
}

export default function TradeForm({
  symbol,
  currentPrice,
  cashBalance,
  currentShares,
  onTradeComplete,
}: TradeFormProps) {
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [quantity, setQuantity] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const qty = parseInt(quantity) || 0
  const total = qty * currentPrice
  const maxBuyShares = Math.floor(cashBalance / currentPrice)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!symbol || qty <= 0) return

    setLoading(true)
    setMessage(null)

    try {
      const res = await fetch('/api/trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, side, quantity: qty, notes }),
      })

      const data = await res.json()

      if (res.ok) {
        setMessage({ type: 'success', text: data.message })
        setQuantity('')
        setNotes('')
        onTradeComplete()
      } else {
        setMessage({ type: 'error', text: data.error })
      }
    } catch {
      setMessage({ type: 'error', text: 'Trade failed. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  if (!symbol) {
    return (
      <div className="bg-surface-1 rounded-xl border border-surface-3 p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-3">Place Trade</h3>
        <p className="text-text-secondary text-sm">Search and select a stock to trade.</p>
      </div>
    )
  }

  return (
    <div className="bg-surface-1 rounded-xl border border-surface-3 p-6">
      <h3 className="text-lg font-semibold text-text-primary mb-4">Place Trade</h3>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Buy/Sell Toggle */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setSide('buy')}
            className={cn(
              'flex-1 py-2.5 rounded-lg font-medium text-sm transition-colors',
              side === 'buy'
                ? 'bg-profit text-white'
                : 'bg-surface-2 text-text-secondary hover:text-text-primary'
            )}
          >
            Buy
          </button>
          <button
            type="button"
            onClick={() => setSide('sell')}
            className={cn(
              'flex-1 py-2.5 rounded-lg font-medium text-sm transition-colors',
              side === 'sell'
                ? 'bg-loss text-white'
                : 'bg-surface-2 text-text-secondary hover:text-text-primary'
            )}
          >
            Sell
          </button>
        </div>

        {/* Symbol & Price */}
        <div className="flex justify-between text-sm">
          <span className="text-text-secondary">Symbol</span>
          <span className="text-text-primary font-medium">{symbol}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-text-secondary">Market Price</span>
          <span className="text-text-primary font-medium">{formatCurrency(currentPrice)}</span>
        </div>

        {/* Quantity */}
        <div>
          <div className="flex justify-between mb-1.5">
            <label className="text-sm text-text-secondary">Shares</label>
            <span className="text-xs text-text-muted">
              {side === 'buy'
                ? `Max: ${maxBuyShares.toLocaleString()}`
                : `Available: ${currentShares}`}
            </span>
          </div>
          <input
            type="number"
            min="1"
            max={side === 'buy' ? maxBuyShares : currentShares}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="w-full px-4 py-2.5 bg-surface-2 border border-surface-4 rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
            placeholder="Enter quantity"
            required
          />
        </div>

        {/* Quick fill buttons */}
        <div className="flex gap-2">
          {[25, 50, 75, 100].map((pct) => {
            const maxQty = side === 'buy' ? maxBuyShares : currentShares
            return (
              <button
                key={pct}
                type="button"
                onClick={() => setQuantity(String(Math.floor(maxQty * pct / 100)))}
                className="flex-1 py-1.5 text-xs font-medium bg-surface-2 hover:bg-surface-3 text-text-secondary rounded-lg transition-colors"
              >
                {pct}%
              </button>
            )
          })}
        </div>

        {/* Notes */}
        <div>
          <label className="text-sm text-text-secondary mb-1.5 block">Notes (optional)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-4 py-2.5 bg-surface-2 border border-surface-4 rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
            placeholder="Trade rationale..."
          />
        </div>

        {/* Total */}
        <div className="flex justify-between text-sm py-3 border-t border-surface-3">
          <span className="text-text-secondary font-medium">Estimated Total</span>
          <span className="text-text-primary font-bold">{formatCurrency(total)}</span>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading || qty <= 0}
          className={cn(
            'w-full py-3 rounded-lg font-medium text-white transition-colors disabled:opacity-50',
            side === 'buy'
              ? 'bg-profit hover:bg-green-600'
              : 'bg-loss hover:bg-red-600'
          )}
        >
          {loading
            ? 'Processing...'
            : `${side === 'buy' ? 'Buy' : 'Sell'} ${qty > 0 ? qty : ''} ${symbol}`}
        </button>

        {/* Message */}
        {message && (
          <div
            className={cn(
              'text-sm px-4 py-2.5 rounded-lg',
              message.type === 'success' ? 'bg-profit/10 text-profit' : 'bg-loss/10 text-loss'
            )}
          >
            {message.text}
          </div>
        )}
      </form>
    </div>
  )
}
