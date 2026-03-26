'use client'

import { useState, useEffect } from 'react'
import { cn, formatCurrency } from '@/lib/utils'
import { Settings2 } from 'lucide-react'
import {
  getTradingConfig,
  saveTradingConfig,
  calculateMargin,
  calculateLotSizeFromRisk,
  LOT_PRESETS,
  type TradingConfig,
} from '@/lib/trading-config'

interface TradeFormProps {
  symbol: string
  currentPrice: number
  cashBalance: number
  currentShares: number
  onTradeComplete: () => void
  aiSuggestedSl?: number | null
  aiSuggestedTp?: number | null
  aiSuggestedSide?: 'buy' | 'sell' | null
}

export default function TradeForm({
  symbol,
  currentPrice,
  cashBalance,
  currentShares,
  onTradeComplete,
  aiSuggestedSl,
  aiSuggestedTp,
  aiSuggestedSide,
}: TradeFormProps) {
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [lotSize, setLotSize] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [config, setConfig] = useState<TradingConfig>({
    leverage: 1000,
    defaultLotSize: 0.01,
    riskPerTradePercent: 2,
    maxOpenPositions: 10,
    maxLotSize: 10,
  })
  const [stopLoss, setStopLoss] = useState('')
  const [takeProfit, setTakeProfit] = useState('')
  const [stopLossPips, setStopLossPips] = useState('')

  useEffect(() => {
    setConfig(getTradingConfig())
  }, [])

  // Auto-fill from AI analysis
  useEffect(() => {
    if (aiSuggestedSl) setStopLoss(String(aiSuggestedSl))
    if (aiSuggestedTp) setTakeProfit(String(aiSuggestedTp))
    if (aiSuggestedSide) setSide(aiSuggestedSide)
  }, [aiSuggestedSl, aiSuggestedTp, aiSuggestedSide])

  const lots = parseFloat(lotSize) || 0
  const margin = calculateMargin(lots, currentPrice, config.leverage)
  const maxLots = Math.floor((cashBalance * config.leverage) / (100_000 * currentPrice) * 100) / 100
  const riskLots = stopLossPips
    ? calculateLotSizeFromRisk(cashBalance, config.riskPerTradePercent, parseFloat(stopLossPips))
    : 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!symbol || lots <= 0) return

    setLoading(true)
    setMessage(null)

    try {
      const res = await fetch('/api/trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          side,
          lotSize: lots,
          leverage: config.leverage,
          stopLoss: parseFloat(stopLoss) || null,
          takeProfit: parseFloat(takeProfit) || null,
          notes,
        }),
      })

      const data = await res.json()

      if (res.ok) {
        setMessage({ type: 'success', text: data.message })
        setLotSize('')
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

  const handleConfigChange = (key: keyof TradingConfig, value: number) => {
    const updated = saveTradingConfig({ [key]: value })
    setConfig(updated)
  }

  if (!symbol) {
    return (
      <div className="bg-surface-1 rounded-xl border border-surface-3 p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-3">Place Trade</h3>
        <p className="text-text-secondary text-sm">Search and select a pair to trade.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Trading Config */}
      <div className="bg-surface-1 rounded-xl border border-surface-3 p-4">
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="flex items-center justify-between w-full text-sm"
        >
          <div className="flex items-center gap-2 text-text-secondary">
            <Settings2 size={16} />
            <span className="font-medium">Trading Settings</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-text-muted">
            <span>{config.leverage}:1</span>
            <span>{config.riskPerTradePercent}% risk</span>
          </div>
        </button>

        {showSettings && (
          <div className="mt-4 pt-4 border-t border-surface-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-text-muted block mb-1">Leverage</label>
                <select
                  value={config.leverage}
                  onChange={(e) => handleConfigChange('leverage', parseInt(e.target.value))}
                  className="w-full px-3 py-2 bg-surface-2 border border-surface-4 rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                >
                  {[50, 100, 200, 500, 1000].map((l) => (
                    <option key={l} value={l}>{l}:1</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-text-muted block mb-1">Risk per Trade %</label>
                <select
                  value={config.riskPerTradePercent}
                  onChange={(e) => handleConfigChange('riskPerTradePercent', parseFloat(e.target.value))}
                  className="w-full px-3 py-2 bg-surface-2 border border-surface-4 rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                >
                  {[0.5, 1, 2, 3, 5, 10].map((r) => (
                    <option key={r} value={r}>{r}%</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-text-muted block mb-1">Default Lot Size</label>
                <select
                  value={config.defaultLotSize}
                  onChange={(e) => handleConfigChange('defaultLotSize', parseFloat(e.target.value))}
                  className="w-full px-3 py-2 bg-surface-2 border border-surface-4 rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                >
                  {LOT_PRESETS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-text-muted block mb-1">Max Lot Size</label>
                <select
                  value={config.maxLotSize}
                  onChange={(e) => handleConfigChange('maxLotSize', parseFloat(e.target.value))}
                  className="w-full px-3 py-2 bg-surface-2 border border-surface-4 rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                >
                  {[1, 5, 10, 50, 100].map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Trade Form */}
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
              Buy / Long
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
              Sell / Short
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

          {/* Lot Size */}
          <div>
            <div className="flex justify-between mb-1.5">
              <label className="text-sm text-text-secondary">Lot Size</label>
              <span className="text-xs text-text-muted">
                Max: {maxLots.toFixed(2)} lots
              </span>
            </div>
            <input
              type="number"
              min="0.01"
              max={Math.min(maxLots, config.maxLotSize)}
              step="0.01"
              value={lotSize}
              onChange={(e) => setLotSize(e.target.value)}
              className="w-full px-4 py-2.5 bg-surface-2 border border-surface-4 rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
              placeholder={`e.g. ${config.defaultLotSize}`}
              required
            />
          </div>

          {/* Quick lot buttons */}
          <div className="flex gap-2">
            {LOT_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => setLotSize(String(preset.value))}
                className={cn(
                  'flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors',
                  parseFloat(lotSize) === preset.value
                    ? 'bg-brand-600 text-white'
                    : 'bg-surface-2 hover:bg-surface-3 text-text-secondary'
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Risk Calculator */}
          <div className="bg-surface-2 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <label className="text-xs text-text-muted">SL Distance (pips)</label>
              <input
                type="number"
                min="1"
                step="1"
                value={stopLossPips}
                onChange={(e) => setStopLossPips(e.target.value)}
                className="w-20 px-2 py-1 bg-surface-3 border border-surface-4 rounded text-text-primary text-xs focus:outline-none focus:ring-1 focus:ring-brand-600"
                placeholder="e.g. 50"
              />
              {riskLots > 0 && (
                <button
                  type="button"
                  onClick={() => setLotSize(String(riskLots))}
                  className="text-xs text-brand-400 hover:text-brand-300 ml-auto"
                >
                  Use {riskLots} lots
                </button>
              )}
            </div>
            <div className="text-xs text-text-muted">
              {config.riskPerTradePercent}% risk = {formatCurrency(cashBalance * config.riskPerTradePercent / 100)} max loss
            </div>
          </div>

          {/* Stop Loss & Take Profit */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-text-muted block mb-1">Stop Loss</label>
              <input
                type="number"
                step="any"
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                className="w-full px-3 py-2 bg-surface-2 border border-surface-4 rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-loss/50"
                placeholder="Price"
              />
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Take Profit</label>
              <input
                type="number"
                step="any"
                value={takeProfit}
                onChange={(e) => setTakeProfit(e.target.value)}
                className="w-full px-3 py-2 bg-surface-2 border border-surface-4 rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-profit/50"
                placeholder="Price"
              />
            </div>
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

          {/* Trade Summary */}
          <div className="py-3 border-t border-surface-3 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">Position Size</span>
              <span className="text-text-primary">{(lots * 100_000).toLocaleString()} units</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">Notional Value</span>
              <span className="text-text-primary">{formatCurrency(lots * 100_000 * currentPrice)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary font-medium">Margin Required</span>
              <span className="text-text-primary font-bold">{formatCurrency(margin)}</span>
            </div>
            {currentShares > 0 && (
              <div className="flex justify-between text-sm pt-1 border-t border-surface-3">
                <span className="text-text-muted">Current Position</span>
                <span className="text-text-primary">{(currentShares / 100_000).toFixed(2)} lots</span>
              </div>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || lots <= 0 || margin > cashBalance}
            className={cn(
              'w-full py-3 rounded-lg font-medium text-white transition-colors disabled:opacity-50',
              side === 'buy'
                ? 'bg-profit hover:bg-green-600'
                : 'bg-loss hover:bg-red-600'
            )}
          >
            {loading
              ? 'Processing...'
              : `${side === 'buy' ? 'Buy' : 'Sell'} ${lots > 0 ? lots + ' lots' : ''} ${symbol}`}
          </button>

          {margin > cashBalance && lots > 0 && (
            <div className="text-xs text-loss text-center">
              Insufficient margin ({formatCurrency(margin)} needed, {formatCurrency(cashBalance)} available)
            </div>
          )}

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
    </div>
  )
}
