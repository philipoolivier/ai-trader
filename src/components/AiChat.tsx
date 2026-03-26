'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, TrendingUp, TrendingDown, Target, Shield, Zap, Award, Play, Check } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import type { ChatMessage, ChartAnalysisResponse } from '@/types'

interface AiChatProps {
  messages: ChatMessage[]
  onSendMessage: (text: string) => void
  onTakeTrade: (analysis: ChartAnalysisResponse, suggestionId: string) => void
  onSkip: (suggestionId: string) => void
  sending: boolean
  cashBalance: number
  pendingSuggestionId: string | null
}

export default function AiChat({
  messages,
  onSendMessage,
  onTakeTrade,
  onSkip,
  sending,
  cashBalance,
  pendingSuggestionId,
}: AiChatProps) {
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || sending) return
    onSendMessage(input.trim())
    setInput('')
  }

  if (messages.length === 0) {
    return (
      <div className="bg-surface-1 rounded-xl border border-surface-3 p-6 text-center">
        <p className="text-text-secondary text-sm">Click &ldquo;Analyze This Chart&rdquo; to start the conversation</p>
      </div>
    )
  }

  return (
    <div className="bg-surface-1 rounded-xl border border-surface-3 overflow-hidden flex flex-col" style={{ maxHeight: '800px' }}>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={cn(
              'max-w-[90%] rounded-xl px-4 py-3',
              msg.role === 'user'
                ? 'bg-brand-600/20 text-text-primary'
                : 'bg-surface-2 text-text-primary'
            )}>
              {/* Render markdown-style content */}
              <div className="text-sm leading-relaxed prose prose-invert prose-sm max-w-none">
                <div dangerouslySetInnerHTML={{ __html: formatContent(msg.content) }} />
              </div>

              {/* Trade suggestions */}
              {msg.analysis && msg.analysis.direction && msg.analysis.confidence > 0 && (
                <TradeCardsPanel
                  analysis={msg.analysis}
                  trades={msg.trades}
                  onTake={(trade) => onTakeTrade(trade, pendingSuggestionId || '')}
                  onSkip={() => pendingSuggestionId && onSkip(pendingSuggestionId)}
                  cashBalance={cashBalance}
                />
              )}

              {msg.analysis?.follow_up_suggestion && (
                <button
                  onClick={() => onSendMessage(msg.analysis!.follow_up_suggestion!)}
                  className="mt-2 px-3 py-1.5 text-xs bg-brand-600/10 text-brand-400 rounded-lg hover:bg-brand-600/20 transition-colors"
                >
                  {msg.analysis.follow_up_suggestion}
                </button>
              )}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-surface-2 rounded-xl px-4 py-3">
              <div className="flex items-center gap-2 text-text-muted text-sm">
                <div className="w-4 h-4 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
                Analyzing...
              </div>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-3 border-t border-surface-3 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about this chart..."
          className="flex-1 px-4 py-2.5 bg-surface-2 border border-surface-4 rounded-lg text-text-primary text-sm placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-brand-600"
          disabled={sending}
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="px-4 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-lg transition-colors"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  )
}

function formatContent(text: string): string {
  return text
    .replace(/### (.*)/g, '<h3 class="text-base font-semibold text-text-primary mt-4 mb-2">$1</h3>')
    .replace(/## (.*)/g, '<h2 class="text-lg font-bold text-text-primary mt-4 mb-2">$1</h2>')
    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-text-primary font-semibold">$1</strong>')
    .replace(/\n\n/g, '</p><p class="mt-2">')
    .replace(/\n/g, '<br/>')
    .replace(/\|(.+)\|/g, (match) => {
      // Simple table row formatting
      const cells = match.split('|').filter(c => c.trim())
      return `<div class="grid grid-cols-${cells.length} gap-2 text-xs py-0.5">${cells.map(c => `<span>${c.trim()}</span>`).join('')}</div>`
    })
}

function getConfidenceColor(confidence: number): string {
  if (confidence >= 8) return 'text-profit bg-profit/10'
  if (confidence >= 6) return 'text-brand-400 bg-brand-600/10'
  if (confidence >= 4) return 'text-yellow-400 bg-yellow-500/10'
  return 'text-loss bg-loss/10'
}

function TradeCardsPanel({
  analysis,
  trades,
  onTake,
  onSkip,
  cashBalance,
}: {
  analysis: ChartAnalysisResponse
  trades?: ChartAnalysisResponse[]
  onTake: (trade: ChartAnalysisResponse) => void
  onSkip: () => void
  cashBalance: number
}) {
  const [acted, setActed] = useState<Set<number>>(new Set())
  const [allActed, setAllActed] = useState(false)

  // Use trades array if available, otherwise fall back to single analysis
  const allTrades = trades && trades.length > 0 ? trades : [analysis]

  const handleTake = (trade: ChartAnalysisResponse, index: number) => {
    onTake(trade)
    setActed(prev => new Set(prev).add(index))
  }

  const handleTakeAll = () => {
    allTrades.forEach((trade, i) => {
      if (!acted.has(i) && trade.direction) {
        onTake(trade)
      }
    })
    setAllActed(true)
  }

  return (
    <div className="mt-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Trade Suggestions</span>
        <span className="text-[10px] text-text-muted">Balance: {formatCurrency(cashBalance)}</span>
      </div>

      {allTrades.map((trade, i) => {
        const isBuy = trade.direction === 'buy'
        const isActed = acted.has(i) || allActed
        const label = (trade as TradeWithLabel).label || (isBuy ? 'BUY' : 'SELL')
        const orderType = (trade as TradeWithLabel).order_type || 'market'

        return (
          <div key={i} className={cn(
            'rounded-lg border p-3 space-y-2 transition-all',
            isActed ? 'border-surface-3 bg-surface-2/50 opacity-60' :
            'border-surface-3 bg-surface-1'
          )}>
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isBuy ? <TrendingUp size={14} className="text-profit" /> : <TrendingDown size={14} className="text-loss" />}
                <span className={cn('text-xs font-bold', isBuy ? 'text-profit' : 'text-loss')}>
                  {label}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-3 text-text-muted font-medium">
                  {orderType.replace('_', ' ').toUpperCase()}
                </span>
              </div>
              <span className={cn('text-xs font-bold px-2 py-0.5 rounded', getConfidenceColor(trade.confidence))}>
                {trade.confidence}/10
              </span>
            </div>

            {/* Levels */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-surface-1/50 rounded px-2 py-1.5">
                <span className="text-[10px] text-text-muted flex items-center gap-0.5"><Zap size={9} /> Entry</span>
                <span className="text-xs text-text-primary font-semibold">{formatCurrency(trade.entry_price || 0)}</span>
              </div>
              <div className="bg-surface-1/50 rounded px-2 py-1.5">
                <span className="text-[10px] text-text-muted flex items-center gap-0.5"><Shield size={9} /> SL</span>
                <span className="text-xs text-loss font-semibold">{formatCurrency(trade.stop_loss || 0)}</span>
              </div>
              <div className="bg-surface-1/50 rounded px-2 py-1.5">
                <span className="text-[10px] text-text-muted flex items-center gap-0.5"><Target size={9} /> TP</span>
                <span className="text-xs text-profit font-semibold">{formatCurrency(trade.take_profit || 0)}</span>
              </div>
            </div>

            {/* R:R */}
            {trade.risk_reward_ratio && (
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-surface-3 rounded-full overflow-hidden">
                  <div
                    className={cn('h-full rounded-full', trade.risk_reward_ratio >= 2 ? 'bg-profit' : trade.risk_reward_ratio >= 1 ? 'bg-yellow-500' : 'bg-loss')}
                    style={{ width: `${Math.min(trade.risk_reward_ratio * 25, 100)}%` }}
                  />
                </div>
                <span className="text-[10px] text-text-muted font-medium">R:R 1:{trade.risk_reward_ratio.toFixed(1)}</span>
              </div>
            )}

            {/* Action */}
            <button
              onClick={() => handleTake(trade, i)}
              className={cn(
                'w-full py-1.5 text-xs font-semibold rounded transition-colors',
                isActed
                  ? 'bg-surface-3 text-text-muted border border-surface-4'
                  : isBuy ? 'bg-profit/15 text-profit hover:bg-profit/25 border border-profit/20' : 'bg-loss/15 text-loss hover:bg-loss/25 border border-loss/20'
              )}
            >
              {isActed ? 'Re-take Trade' : `Take ${label}`}
            </button>
          </div>
        )
      })}

      {/* Execute All + Skip */}
      {!allActed && allTrades.length > 1 && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleTakeAll}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg bg-brand-600 hover:bg-brand-700 text-white transition-colors"
          >
            <Play size={12} /> Execute All ({allTrades.filter((_, i) => !acted.has(i)).length})
          </button>
          <button
            onClick={() => { onSkip(); setAllActed(true) }}
            className="px-4 py-2 text-xs font-medium rounded-lg bg-surface-3 text-text-secondary hover:text-text-primary transition-colors"
          >
            Skip All
          </button>
        </div>
      )}
    </div>
  )
}

interface TradeWithLabel extends ChartAnalysisResponse {
  label?: string
  order_type?: string
}
