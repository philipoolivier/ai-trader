'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, TrendingUp, TrendingDown, Target, Shield, Zap, Award } from 'lucide-react'
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

  const handleSuggestionClick = (text: string) => {
    onSendMessage(text)
  }

  if (messages.length === 0) {
    return (
      <div className="bg-surface-1 rounded-xl border border-surface-3 p-6 text-center">
        <p className="text-text-secondary text-sm">Click &ldquo;Analyze This Chart&rdquo; to start the conversation</p>
      </div>
    )
  }

  return (
    <div className="bg-surface-1 rounded-xl border border-surface-3 overflow-hidden flex flex-col" style={{ maxHeight: '600px' }}>
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={cn(
              'max-w-[85%] rounded-xl px-4 py-3',
              msg.role === 'user'
                ? 'bg-brand-600/20 text-text-primary'
                : 'bg-surface-2 text-text-primary'
            )}>
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>

              {/* Inline trade suggestion */}
              {msg.analysis && msg.analysis.direction && msg.analysis.confidence > 0 && (
                <InlineTradeCard
                  analysis={msg.analysis}
                  onTake={() => pendingSuggestionId && onTakeTrade(msg.analysis!, pendingSuggestionId)}
                  onSkip={() => pendingSuggestionId && onSkip(pendingSuggestionId)}
                  cashBalance={cashBalance}
                />
              )}

              {/* Follow-up suggestion chip */}
              {msg.analysis?.follow_up_suggestion && (
                <button
                  onClick={() => handleSuggestionClick(msg.analysis!.follow_up_suggestion!)}
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

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-surface-3 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about this chart... (e.g., 'What about the 4H timeframe?')"
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

function InlineTradeCard({
  analysis,
  onTake,
  onSkip,
  cashBalance,
}: {
  analysis: ChartAnalysisResponse
  onTake: () => void
  onSkip: () => void
  cashBalance: number
}) {
  const [acted, setActed] = useState(false)
  const [quantity, setQuantity] = useState('1')
  const isBuy = analysis.direction === 'buy'

  return (
    <div className={cn(
      'mt-3 rounded-lg border p-3 space-y-2',
      isBuy ? 'border-profit/20 bg-profit/5' : 'border-loss/20 bg-loss/5'
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isBuy ? <TrendingUp size={14} className="text-profit" /> : <TrendingDown size={14} className="text-loss" />}
          <span className={cn('text-xs font-bold', isBuy ? 'text-profit' : 'text-loss')}>
            {analysis.direction?.toUpperCase()} {analysis.symbol}
          </span>
          <span className="text-[10px] text-text-muted flex items-center gap-0.5">
            <Award size={10} /> {analysis.confidence}/10
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <div>
          <span className="text-text-muted flex items-center gap-0.5"><Zap size={9} /> Entry</span>
          <span className="text-text-primary font-medium">{formatCurrency(analysis.entry_price || 0)}</span>
        </div>
        <div>
          <span className="text-text-muted flex items-center gap-0.5"><Shield size={9} /> SL</span>
          <span className="text-loss font-medium">{formatCurrency(analysis.stop_loss || 0)}</span>
        </div>
        <div>
          <span className="text-text-muted flex items-center gap-0.5"><Target size={9} /> TP</span>
          <span className="text-profit font-medium">{formatCurrency(analysis.take_profit || 0)}</span>
        </div>
      </div>

      {!acted ? (
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="w-16 px-2 py-1 text-xs bg-surface-2 border border-surface-4 rounded text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-600"
            placeholder="Qty"
          />
          <span className="text-[10px] text-text-muted">Cash: {formatCurrency(cashBalance)}</span>
          <div className="flex-1" />
          <button
            onClick={() => { onTake(); setActed(true) }}
            className={cn('px-3 py-1 text-xs font-medium rounded text-white', isBuy ? 'bg-profit' : 'bg-loss')}
          >
            Take Trade
          </button>
          <button
            onClick={() => { onSkip(); setActed(true) }}
            className="px-3 py-1 text-xs font-medium rounded bg-surface-3 text-text-secondary"
          >
            Skip
          </button>
        </div>
      ) : (
        <p className="text-[10px] text-text-muted text-center">Action recorded</p>
      )}
    </div>
  )
}
