'use client'

import { useState } from 'react'
import {
  TrendingUp, TrendingDown, Minus, Target, Shield, Zap, Award,
  BarChart3, Layers, Activity, Eye, ChevronDown, ChevronUp, ArrowRight,
} from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import type { ChartAnalysisResponse } from '@/types'

interface AnalysisDisplayProps {
  text: string
  analysis: ChartAnalysisResponse | null
  suggestionId: string | null
  cashBalance: number
  onTakeTrade: (symbol: string, side: 'buy' | 'sell', quantity: number) => void
  onSkip: () => void
}

export default function AnalysisDisplay({
  text,
  analysis,
  suggestionId,
  cashBalance,
  onTakeTrade,
  onSkip,
}: AnalysisDisplayProps) {
  const [showFullText, setShowFullText] = useState(false)
  const [quantity, setQuantity] = useState('1')
  const [acted, setActed] = useState(false)
  const [tradeMessage, setTradeMessage] = useState('')

  const hasTrade = analysis?.direction && analysis.confidence > 0
  const isBuy = analysis?.direction === 'buy'
  const entryPrice = analysis?.entry_price || 0
  const stopLoss = analysis?.stop_loss || 0
  const takeProfit = analysis?.take_profit || 0
  const riskAmount = Math.abs(entryPrice - stopLoss)
  const rewardAmount = Math.abs(takeProfit - entryPrice)

  const handleTake = () => {
    if (!analysis?.direction || !analysis?.symbol || !suggestionId) return
    onTakeTrade(analysis.symbol, analysis.direction, parseInt(quantity) || 1)
    setActed(true)
    setTradeMessage(`${analysis.direction === 'buy' ? 'Bought' : 'Sold'} ${quantity} ${analysis.symbol}`)
  }

  const handleSkip = () => {
    onSkip()
    setActed(true)
    setTradeMessage('Trade skipped')
  }

  // Parse the text into sections for display
  const sections = parseAnalysisText(text)

  return (
    <div className="space-y-4">
      {/* Header with trend direction */}
      {analysis && (
        <div className={cn(
          'rounded-xl border p-4 flex items-center justify-between',
          analysis.trend === 'uptrend' ? 'bg-profit/5 border-profit/20' :
          analysis.trend === 'downtrend' ? 'bg-loss/5 border-loss/20' :
          'bg-surface-1 border-surface-3'
        )}>
          <div className="flex items-center gap-3">
            {analysis.trend === 'uptrend' ? (
              <div className="w-10 h-10 rounded-lg bg-profit/10 flex items-center justify-center">
                <TrendingUp className="text-profit" size={20} />
              </div>
            ) : analysis.trend === 'downtrend' ? (
              <div className="w-10 h-10 rounded-lg bg-loss/10 flex items-center justify-center">
                <TrendingDown className="text-loss" size={20} />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-lg bg-surface-3 flex items-center justify-center">
                <Minus className="text-text-muted" size={20} />
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-text-primary text-lg">{analysis.symbol || 'Chart'}</span>
                <span className={cn(
                  'text-xs font-bold px-2 py-0.5 rounded capitalize',
                  analysis.trend === 'uptrend' ? 'bg-profit/10 text-profit' :
                  analysis.trend === 'downtrend' ? 'bg-loss/10 text-loss' :
                  'bg-surface-3 text-text-muted'
                )}>
                  {analysis.trend}
                </span>
                {hasTrade && (
                  <span className={cn(
                    'text-xs font-bold px-2 py-0.5 rounded',
                    isBuy ? 'bg-profit/10 text-profit' : 'bg-loss/10 text-loss'
                  )}>
                    {analysis.direction?.toUpperCase()} SIGNAL
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <Award size={12} className="text-brand-400" />
                <span className="text-xs text-text-secondary">
                  Confidence: <span className="font-bold">{analysis.confidence}/10</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Key Levels Grid */}
      {analysis && (analysis.support_levels.length > 0 || analysis.resistance_levels.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Support Levels */}
          {analysis.support_levels.length > 0 && (
            <div className="bg-surface-1 rounded-xl border border-surface-3 p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded bg-profit/10 flex items-center justify-center">
                  <Shield size={14} className="text-profit" />
                </div>
                <span className="text-sm font-medium text-text-primary">Support Levels</span>
              </div>
              <div className="space-y-2">
                {analysis.support_levels.map((level, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 px-3 bg-profit/5 rounded-lg">
                    <span className="text-xs text-text-muted">S{i + 1}</span>
                    <span className="text-sm font-bold text-profit">{formatCurrency(level)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Resistance Levels */}
          {analysis.resistance_levels.length > 0 && (
            <div className="bg-surface-1 rounded-xl border border-surface-3 p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded bg-loss/10 flex items-center justify-center">
                  <Layers size={14} className="text-loss" />
                </div>
                <span className="text-sm font-medium text-text-primary">Resistance Levels</span>
              </div>
              <div className="space-y-2">
                {analysis.resistance_levels.map((level, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 px-3 bg-loss/5 rounded-lg">
                    <span className="text-xs text-text-muted">R{i + 1}</span>
                    <span className="text-sm font-bold text-loss">{formatCurrency(level)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Trade Suggestion Card */}
      {hasTrade && analysis && (
        <div className={cn(
          'rounded-xl border overflow-hidden',
          isBuy ? 'border-profit/30' : 'border-loss/30'
        )}>
          <div className={cn(
            'px-5 py-3 flex items-center gap-2',
            isBuy ? 'bg-profit/10' : 'bg-loss/10'
          )}>
            {isBuy ? <TrendingUp size={18} className="text-profit" /> : <TrendingDown size={18} className="text-loss" />}
            <span className={cn('font-bold text-sm', isBuy ? 'text-profit' : 'text-loss')}>
              Trade Suggestion: {analysis.direction?.toUpperCase()} {analysis.symbol}
            </span>
          </div>
          <div className="bg-surface-1 p-5 space-y-4">
            {/* Entry / SL / TP */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-surface-2 rounded-lg p-3 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <Zap size={12} className="text-brand-400" />
                  <span className="text-xs text-text-muted">Entry</span>
                </div>
                <span className="text-base font-bold text-text-primary">{formatCurrency(entryPrice)}</span>
              </div>
              <div className="bg-surface-2 rounded-lg p-3 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <Shield size={12} className="text-loss" />
                  <span className="text-xs text-text-muted">Stop Loss</span>
                </div>
                <span className="text-base font-bold text-loss">{formatCurrency(stopLoss)}</span>
              </div>
              <div className="bg-surface-2 rounded-lg p-3 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <Target size={12} className="text-profit" />
                  <span className="text-xs text-text-muted">Take Profit</span>
                </div>
                <span className="text-base font-bold text-profit">{formatCurrency(takeProfit)}</span>
              </div>
            </div>

            {/* Risk/Reward Visual */}
            <div>
              <div className="flex justify-between text-xs text-text-muted mb-1.5">
                <span>Risk: {formatCurrency(riskAmount)}</span>
                <span className="font-medium text-text-primary">
                  R:R {(analysis.risk_reward_ratio || 0).toFixed(1)}:1
                </span>
                <span>Reward: {formatCurrency(rewardAmount)}</span>
              </div>
              <div className="flex h-3 rounded-full overflow-hidden">
                <div
                  className="bg-loss rounded-l-full"
                  style={{ width: `${(riskAmount / (riskAmount + rewardAmount)) * 100}%` }}
                />
                <div
                  className="bg-profit rounded-r-full"
                  style={{ width: `${(rewardAmount / (riskAmount + rewardAmount)) * 100}%` }}
                />
              </div>
            </div>

            {/* Action Buttons */}
            {!acted ? (
              <div className="flex items-center gap-3 pt-2 border-t border-surface-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-text-muted">Qty:</label>
                  <input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-20 px-3 py-2 text-sm bg-surface-2 border border-surface-4 rounded-lg text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-600"
                  />
                  <span className="text-xs text-text-muted">Cash: {formatCurrency(cashBalance)}</span>
                </div>
                <div className="flex-1" />
                <button
                  onClick={handleTake}
                  disabled={!suggestionId}
                  className={cn(
                    'px-6 py-2.5 rounded-lg font-bold text-sm text-white transition-colors flex items-center gap-2 disabled:opacity-50',
                    isBuy ? 'bg-profit hover:bg-green-600' : 'bg-loss hover:bg-red-600'
                  )}
                >
                  <ArrowRight size={14} />
                  Take {analysis.direction?.toUpperCase()}
                </button>
                <button
                  onClick={handleSkip}
                  className="px-5 py-2.5 rounded-lg font-medium text-sm bg-surface-2 hover:bg-surface-3 text-text-secondary transition-colors"
                >
                  Skip
                </button>
              </div>
            ) : (
              <div className="pt-2 border-t border-surface-3 text-center">
                <span className={cn(
                  'text-sm font-medium',
                  tradeMessage.includes('skipped') ? 'text-text-muted' : isBuy ? 'text-profit' : 'text-loss'
                )}>
                  {tradeMessage}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Patterns & Indicators */}
      {analysis && (analysis.patterns.length > 0 || analysis.indicators_detected.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {analysis.patterns.length > 0 && (
            <div className="bg-surface-1 rounded-xl border border-surface-3 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Activity size={14} className="text-brand-400" />
                <span className="text-sm font-medium text-text-primary">Patterns Detected</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {analysis.patterns.map((p, i) => (
                  <span key={i} className="px-2.5 py-1 bg-brand-600/10 text-brand-400 text-xs font-medium rounded-lg">
                    {p}
                  </span>
                ))}
              </div>
            </div>
          )}
          {analysis.indicators_detected.length > 0 && (
            <div className="bg-surface-1 rounded-xl border border-surface-3 p-4">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 size={14} className="text-text-muted" />
                <span className="text-sm font-medium text-text-primary">Indicators Read</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {analysis.indicators_detected.map((ind, i) => (
                  <span key={i} className="px-2.5 py-1 bg-surface-3 text-text-secondary text-xs font-medium rounded-lg">
                    {ind}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Full Analysis Text */}
      {text && (
        <div className="bg-surface-1 rounded-xl border border-surface-3 overflow-hidden">
          <button
            onClick={() => setShowFullText(!showFullText)}
            className="w-full px-5 py-3 flex items-center justify-between hover:bg-surface-2/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Eye size={14} className="text-brand-400" />
              <span className="text-sm font-medium text-text-primary">Full Analysis</span>
            </div>
            {showFullText ? <ChevronUp size={16} className="text-text-muted" /> : <ChevronDown size={16} className="text-text-muted" />}
          </button>
          {showFullText && (
            <div className="px-5 pb-5">
              <div className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">
                {text}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Follow-up Suggestion */}
      {analysis?.follow_up_suggestion && (
        <div className="bg-brand-600/5 border border-brand-600/20 rounded-xl px-5 py-3 flex items-center gap-2">
          <ArrowRight size={14} className="text-brand-400 shrink-0" />
          <span className="text-sm text-brand-400">{analysis.follow_up_suggestion}</span>
        </div>
      )}
    </div>
  )
}

// Helper: rough parsing of Claude's text into displayable sections
function parseAnalysisText(text: string): { title: string; content: string }[] {
  const sections: { title: string; content: string }[] = []
  const lines = text.split('\n')
  let currentTitle = ''
  let currentContent: string[] = []

  for (const line of lines) {
    const headerMatch = line.match(/^\*\*(.+?)\*\*/)
    if (headerMatch) {
      if (currentTitle || currentContent.length > 0) {
        sections.push({ title: currentTitle, content: currentContent.join('\n').trim() })
      }
      currentTitle = headerMatch[1].replace(/[*:]/g, '').trim()
      currentContent = [line.replace(/^\*\*.+?\*\*\s*[-—]?\s*/, '')]
    } else {
      currentContent.push(line)
    }
  }
  if (currentTitle || currentContent.length > 0) {
    sections.push({ title: currentTitle, content: currentContent.join('\n').trim() })
  }
  return sections
}
