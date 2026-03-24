'use client'

import { useState } from 'react'
import { TrendingUp, TrendingDown, Target, Shield, Award, Zap } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import type { ChartAnalysisResponse } from '@/types'

interface ChartAnalysisCardProps {
  analysis: ChartAnalysisResponse
  suggestionId: string
  onTakeTrade: (symbol: string, side: 'buy' | 'sell', quantity: number) => void
  onSkip: () => void
  cashBalance: number
}

export default function ChartAnalysisCard({
  analysis,
  suggestionId,
  onTakeTrade,
  onSkip,
  cashBalance,
}: ChartAnalysisCardProps) {
  const [symbol, setSymbol] = useState(analysis.symbol === 'UNKNOWN' ? '' : analysis.symbol)
  const [quantity, setQuantity] = useState('1')
  const [loading, setLoading] = useState(false)
  const [acted, setActed] = useState(false)

  const isBuy = analysis.direction === 'buy'
  const riskAmount = Math.abs(analysis.entry_price - analysis.stop_loss)
  const rewardAmount = Math.abs(analysis.take_profit - analysis.entry_price)

  const handleTake = async () => {
    if (!symbol || !quantity) return
    setLoading(true)
    onTakeTrade(symbol, analysis.direction, parseInt(quantity))
    setActed(true)
    setLoading(false)
  }

  const handleSkip = () => {
    onSkip()
    setActed(true)
  }

  return (
    <div className="bg-surface-1 rounded-xl border border-surface-3 overflow-hidden">
      {/* Header */}
      <div className={cn(
        'px-5 py-4 flex items-center justify-between',
        isBuy ? 'bg-profit/5 border-b border-profit/20' : 'bg-loss/5 border-b border-loss/20'
      )}>
        <div className="flex items-center gap-3">
          <div className={cn(
            'w-10 h-10 rounded-lg flex items-center justify-center',
            isBuy ? 'bg-profit/10' : 'bg-loss/10'
          )}>
            {isBuy ? (
              <TrendingUp className="text-profit" size={20} />
            ) : (
              <TrendingDown className="text-loss" size={20} />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-text-primary text-lg">
                {analysis.symbol !== 'UNKNOWN' ? analysis.symbol : 'Unknown Symbol'}
              </span>
              <span className={cn(
                'text-xs font-bold px-2 py-0.5 rounded',
                isBuy ? 'bg-profit/10 text-profit' : 'bg-loss/10 text-loss'
              )}>
                {analysis.direction.toUpperCase()}
              </span>
            </div>
            <span className="text-sm text-text-secondary capitalize">{analysis.trend}</span>
          </div>
        </div>

        {/* Confidence */}
        <div className="text-right">
          <div className="flex items-center gap-1 mb-0.5">
            <Award size={14} className="text-brand-400" />
            <span className="text-sm font-medium text-text-primary">
              {analysis.confidence}/10
            </span>
          </div>
          <span className="text-xs text-text-muted">Confidence</span>
        </div>
      </div>

      {/* Price Levels */}
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-surface-2 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Zap size={12} className="text-brand-400" />
              <span className="text-xs text-text-muted">Entry</span>
            </div>
            <span className="text-sm font-bold text-text-primary">
              {formatCurrency(analysis.entry_price)}
            </span>
          </div>
          <div className="bg-surface-2 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Shield size={12} className="text-loss" />
              <span className="text-xs text-text-muted">Stop Loss</span>
            </div>
            <span className="text-sm font-bold text-loss">
              {formatCurrency(analysis.stop_loss)}
            </span>
          </div>
          <div className="bg-surface-2 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Target size={12} className="text-profit" />
              <span className="text-xs text-text-muted">Take Profit</span>
            </div>
            <span className="text-sm font-bold text-profit">
              {formatCurrency(analysis.take_profit)}
            </span>
          </div>
        </div>

        {/* Risk/Reward Bar */}
        <div>
          <div className="flex justify-between text-xs text-text-muted mb-1.5">
            <span>Risk: {formatCurrency(riskAmount)}</span>
            <span>R:R {analysis.risk_reward_ratio.toFixed(1)}:1</span>
            <span>Reward: {formatCurrency(rewardAmount)}</span>
          </div>
          <div className="flex h-2 rounded-full overflow-hidden">
            <div
              className="bg-loss"
              style={{ width: `${(riskAmount / (riskAmount + rewardAmount)) * 100}%` }}
            />
            <div
              className="bg-profit"
              style={{ width: `${(rewardAmount / (riskAmount + rewardAmount)) * 100}%` }}
            />
          </div>
        </div>

        {/* Patterns */}
        {analysis.patterns.length > 0 && (
          <div>
            <span className="text-xs text-text-muted block mb-1.5">Patterns Identified</span>
            <div className="flex flex-wrap gap-1.5">
              {analysis.patterns.map((p) => (
                <span
                  key={p}
                  className="px-2 py-0.5 bg-brand-600/10 text-brand-400 text-xs rounded-lg"
                >
                  {p}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Indicators */}
        {analysis.indicators_detected.length > 0 && (
          <div>
            <span className="text-xs text-text-muted block mb-1.5">Indicators</span>
            <div className="flex flex-wrap gap-1.5">
              {analysis.indicators_detected.map((ind) => (
                <span
                  key={ind}
                  className="px-2 py-0.5 bg-surface-3 text-text-secondary text-xs rounded-lg"
                >
                  {ind}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Support/Resistance */}
        <div className="grid grid-cols-2 gap-3">
          {analysis.support_levels.length > 0 && (
            <div>
              <span className="text-xs text-text-muted block mb-1">Support</span>
              {analysis.support_levels.map((s) => (
                <span key={s} className="block text-xs text-profit">{formatCurrency(s)}</span>
              ))}
            </div>
          )}
          {analysis.resistance_levels.length > 0 && (
            <div>
              <span className="text-xs text-text-muted block mb-1">Resistance</span>
              {analysis.resistance_levels.map((r) => (
                <span key={r} className="block text-xs text-loss">{formatCurrency(r)}</span>
              ))}
            </div>
          )}
        </div>

        {/* Reasoning */}
        <div className="bg-surface-2 rounded-lg p-3">
          <span className="text-xs text-text-muted block mb-1">Analysis</span>
          <p className="text-sm text-text-primary leading-relaxed">{analysis.reasoning}</p>
        </div>

        {/* Action Area */}
        {!acted ? (
          <div className="space-y-3 pt-2 border-t border-surface-3">
            {analysis.symbol === 'UNKNOWN' && (
              <div>
                <label className="text-sm text-text-secondary mb-1.5 block">
                  Enter symbol (not detected from chart)
                </label>
                <input
                  type="text"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  className="w-full px-4 py-2.5 bg-surface-2 border border-surface-4 rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  placeholder="e.g., EUR/USD, AAPL"
                />
              </div>
            )}

            <div>
              <label className="text-sm text-text-secondary mb-1.5 block">
                Quantity (shares/units)
              </label>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full px-4 py-2.5 bg-surface-2 border border-surface-4 rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
              <span className="text-xs text-text-muted mt-1 block">
                Est. cost: {formatCurrency(analysis.entry_price * (parseInt(quantity) || 0))} | Cash: {formatCurrency(cashBalance)}
              </span>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleTake}
                disabled={loading || !symbol || !quantity}
                className={cn(
                  'flex-1 py-3 rounded-lg font-medium text-white transition-colors disabled:opacity-50',
                  isBuy ? 'bg-profit hover:bg-green-600' : 'bg-loss hover:bg-red-600'
                )}
              >
                {loading ? 'Executing...' : `Take Trade - ${analysis.direction.toUpperCase()} ${symbol}`}
              </button>
              <button
                onClick={handleSkip}
                className="px-6 py-3 rounded-lg font-medium text-text-secondary bg-surface-2 hover:bg-surface-3 transition-colors"
              >
                Skip
              </button>
            </div>
          </div>
        ) : (
          <div className="pt-2 border-t border-surface-3 text-center text-sm text-text-muted">
            Trade action recorded
          </div>
        )}
      </div>
    </div>
  )
}
