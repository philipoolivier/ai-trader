'use client'

import { useState } from 'react'
import {
  TrendingUp, TrendingDown, Target, Shield, Zap, Award,
  Activity, BarChart3, ArrowRight,
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

  return (
    <div className="space-y-4">
      {/* Header */}
      {analysis && (
        <div className={cn(
          'rounded-xl border p-4 flex items-center justify-between flex-wrap gap-3',
          analysis.trend === 'uptrend' ? 'bg-profit/5 border-profit/20' :
          analysis.trend === 'downtrend' ? 'bg-loss/5 border-loss/20' :
          'bg-surface-1 border-surface-3'
        )}>
          <div className="flex items-center gap-3">
            <div className={cn(
              'w-10 h-10 rounded-lg flex items-center justify-center',
              analysis.trend === 'uptrend' ? 'bg-profit/10' :
              analysis.trend === 'downtrend' ? 'bg-loss/10' : 'bg-surface-3'
            )}>
              {analysis.trend === 'uptrend' ? <TrendingUp className="text-profit" size={20} /> :
               analysis.trend === 'downtrend' ? <TrendingDown className="text-loss" size={20} /> :
               <Activity className="text-text-muted" size={20} />}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-text-primary text-lg">{analysis.symbol || 'Chart'}</span>
                <span className={cn(
                  'text-xs font-bold px-2 py-0.5 rounded capitalize',
                  analysis.trend === 'uptrend' ? 'bg-profit/10 text-profit' :
                  analysis.trend === 'downtrend' ? 'bg-loss/10 text-loss' :
                  'bg-surface-3 text-text-muted'
                )}>{analysis.trend}</span>
                {hasTrade && (
                  <span className={cn(
                    'text-xs font-bold px-2 py-0.5 rounded',
                    isBuy ? 'bg-profit/10 text-profit' : 'bg-loss/10 text-loss'
                  )}>{analysis.direction?.toUpperCase()} SIGNAL</span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-xs text-text-secondary flex items-center gap-1">
                  <Award size={11} className="text-brand-400" /> Confidence: <b>{analysis.confidence}/10</b>
                </span>
                {analysis.risk_reward_ratio && (
                  <span className="text-xs text-text-secondary">R:R <b>{analysis.risk_reward_ratio.toFixed(1)}:1</b></span>
                )}
              </div>
            </div>
          </div>
          {/* Patterns */}
          {analysis.patterns.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {analysis.patterns.map((p, i) => (
                <span key={i} className="px-2 py-0.5 bg-brand-600/10 text-brand-400 text-[11px] font-medium rounded-lg">{p}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Trade Suggestion Card */}
      {hasTrade && analysis && (
        <div className={cn('rounded-xl border overflow-hidden', isBuy ? 'border-profit/30' : 'border-loss/30')}>
          <div className={cn('px-5 py-3 flex items-center gap-2', isBuy ? 'bg-profit/10' : 'bg-loss/10')}>
            {isBuy ? <TrendingUp size={18} className="text-profit" /> : <TrendingDown size={18} className="text-loss" />}
            <span className={cn('font-bold text-sm', isBuy ? 'text-profit' : 'text-loss')}>
              Trade: {analysis.direction?.toUpperCase()} {analysis.symbol}
            </span>
          </div>
          <div className="bg-surface-1 p-5 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-surface-2 rounded-lg p-3 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <Zap size={12} className="text-brand-400" /><span className="text-xs text-text-muted">Entry</span>
                </div>
                <span className="text-base font-bold text-text-primary">{formatCurrency(entryPrice)}</span>
              </div>
              <div className="bg-surface-2 rounded-lg p-3 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <Shield size={12} className="text-loss" /><span className="text-xs text-text-muted">Stop Loss</span>
                </div>
                <span className="text-base font-bold text-loss">{formatCurrency(stopLoss)}</span>
              </div>
              <div className="bg-surface-2 rounded-lg p-3 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <Target size={12} className="text-profit" /><span className="text-xs text-text-muted">Take Profit</span>
                </div>
                <span className="text-base font-bold text-profit">{formatCurrency(takeProfit)}</span>
              </div>
            </div>

            {/* R:R Bar */}
            {riskAmount + rewardAmount > 0 && (
              <div>
                <div className="flex justify-between text-xs text-text-muted mb-1">
                  <span>Risk: {formatCurrency(riskAmount)}</span>
                  <span className="font-medium text-text-primary">R:R {(analysis.risk_reward_ratio || 0).toFixed(1)}:1</span>
                  <span>Reward: {formatCurrency(rewardAmount)}</span>
                </div>
                <div className="flex h-3 rounded-full overflow-hidden">
                  <div className="bg-loss rounded-l-full" style={{ width: `${(riskAmount / (riskAmount + rewardAmount)) * 100}%` }} />
                  <div className="bg-profit rounded-r-full" style={{ width: `${(rewardAmount / (riskAmount + rewardAmount)) * 100}%` }} />
                </div>
              </div>
            )}

            {/* Action Buttons */}
            {!acted ? (
              <div className="flex items-center gap-3 pt-2 border-t border-surface-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-text-muted">Qty:</label>
                  <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)}
                    className="w-20 px-3 py-2 text-sm bg-surface-2 border border-surface-4 rounded-lg text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-600" />
                  <span className="text-xs text-text-muted">Cash: {formatCurrency(cashBalance)}</span>
                </div>
                <div className="flex-1" />
                <button onClick={handleTake} disabled={!suggestionId}
                  className={cn('px-6 py-2.5 rounded-lg font-bold text-sm text-white transition-colors flex items-center gap-2 disabled:opacity-50', isBuy ? 'bg-profit hover:bg-green-600' : 'bg-loss hover:bg-red-600')}>
                  <ArrowRight size={14} /> Take {analysis.direction?.toUpperCase()}
                </button>
                <button onClick={handleSkip}
                  className="px-5 py-2.5 rounded-lg font-medium text-sm bg-surface-2 hover:bg-surface-3 text-text-secondary transition-colors">
                  Skip
                </button>
              </div>
            ) : (
              <div className="pt-2 border-t border-surface-3 text-center">
                <span className={cn('text-sm font-medium', tradeMessage.includes('skipped') ? 'text-text-muted' : isBuy ? 'text-profit' : 'text-loss')}>{tradeMessage}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Key Levels */}
      {analysis && (analysis.support_levels.length > 0 || analysis.resistance_levels.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {analysis.support_levels.length > 0 && (
            <div className="bg-surface-1 rounded-xl border border-surface-3 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Shield size={14} className="text-profit" />
                <span className="text-sm font-medium text-text-primary">Support</span>
              </div>
              <div className="space-y-1.5">
                {analysis.support_levels.map((l, i) => (
                  <div key={i} className="flex items-center justify-between py-1 px-3 bg-profit/5 rounded-lg">
                    <span className="text-xs text-text-muted">S{i+1}</span>
                    <span className="text-sm font-bold text-profit">{formatCurrency(l)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {analysis.resistance_levels.length > 0 && (
            <div className="bg-surface-1 rounded-xl border border-surface-3 p-4">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 size={14} className="text-loss" />
                <span className="text-sm font-medium text-text-primary">Resistance</span>
              </div>
              <div className="space-y-1.5">
                {analysis.resistance_levels.map((l, i) => (
                  <div key={i} className="flex items-center justify-between py-1 px-3 bg-loss/5 rounded-lg">
                    <span className="text-xs text-text-muted">R{i+1}</span>
                    <span className="text-sm font-bold text-loss">{formatCurrency(l)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Full Analysis — rendered with markdown-like formatting */}
      {text && (
        <div className="bg-surface-1 rounded-xl border border-surface-3 p-5">
          <div className="prose-analysis text-sm text-text-primary leading-relaxed"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}
          />
        </div>
      )}

      {/* Follow-up */}
      {analysis?.follow_up_suggestion && (
        <div className="bg-brand-600/5 border border-brand-600/20 rounded-xl px-5 py-3 flex items-center gap-2">
          <ArrowRight size={14} className="text-brand-400 shrink-0" />
          <span className="text-sm text-brand-400">{analysis.follow_up_suggestion}</span>
        </div>
      )}
    </div>
  )
}

/** Simple markdown to HTML for Claude's analysis output */
function renderMarkdown(text: string): string {
  return text
    // Headers
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-bold text-text-primary mt-5 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold text-text-primary mt-6 mb-2">$1</h2>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-text-primary font-semibold">$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Tables - basic support
    .replace(/\|(.+)\|/g, (match) => {
      const cells = match.split('|').filter(c => c.trim())
      if (cells.every(c => c.trim().match(/^[-:]+$/))) {
        return '' // separator row
      }
      const isHeader = cells.some(c => c.trim().match(/^[-:]+$/))
      if (isHeader) return ''
      const tag = 'td'
      const cellHtml = cells.map(c =>
        `<${tag} class="px-3 py-1.5 border-b border-surface-3 text-xs">${c.trim()}</${tag}>`
      ).join('')
      return `<tr class="hover:bg-surface-2/50">${cellHtml}</tr>`
    })
    // Wrap consecutive table rows
    .replace(/((<tr[^>]*>.*?<\/tr>\s*)+)/g, '<table class="w-full border-collapse mb-3 bg-surface-2/30 rounded-lg overflow-hidden">$1</table>')
    // Bullet points
    .replace(/^- (.+)$/gm, '<li class="ml-4 mb-1 text-text-secondary list-disc">$1</li>')
    // Wrap consecutive list items
    .replace(/((<li[^>]*>.*?<\/li>\s*)+)/g, '<ul class="mb-3">$1</ul>')
    // Line breaks
    .replace(/\n\n/g, '<div class="h-3"></div>')
    .replace(/\n/g, '<br/>')
    // Inline code
    .replace(/`(.+?)`/g, '<code class="px-1.5 py-0.5 bg-surface-3 text-brand-400 text-xs rounded">$1</code>')
}
