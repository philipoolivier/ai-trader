'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, X, TrendingUp, TrendingDown, Star } from 'lucide-react'
import { cn, formatCurrency, formatPercent, getPnlColor } from '@/lib/utils'
import type { Quote } from '@/types'

interface WatchlistProps {
  onSymbolClick?: (symbol: string) => void
}

const DEFAULT_WATCHLIST = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'AAPL', 'SPY', 'BTCUSD']

export default function Watchlist({ onSymbolClick }: WatchlistProps) {
  const [symbols, setSymbols] = useState<string[]>([])
  const [quotes, setQuotes] = useState<Record<string, Quote>>({})
  const [loading, setLoading] = useState(true)
  const [addInput, setAddInput] = useState('')
  const [adding, setAdding] = useState(false)

  // Load from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('ai-trader-watchlist')
    if (saved) {
      try { setSymbols(JSON.parse(saved)) } catch { setSymbols(DEFAULT_WATCHLIST) }
    } else {
      setSymbols(DEFAULT_WATCHLIST)
    }
  }, [])

  // Save to localStorage
  useEffect(() => {
    if (symbols.length > 0) {
      localStorage.setItem('ai-trader-watchlist', JSON.stringify(symbols))
    }
  }, [symbols])

  // Fetch quotes
  const fetchQuotes = useCallback(async () => {
    if (symbols.length === 0) return
    setLoading(true)
    const newQuotes: Record<string, Quote> = {}

    await Promise.all(
      symbols.map(async (sym) => {
        try {
          const res = await fetch(`/api/market/quote?symbol=${sym}`)
          const data = await res.json()
          if (data.price) newQuotes[sym] = data
        } catch { /* ignore */ }
      })
    )

    setQuotes(newQuotes)
    setLoading(false)
  }, [symbols])

  useEffect(() => {
    fetchQuotes()
    const interval = window.setInterval(fetchQuotes, 60000) // refresh every minute
    return () => clearInterval(interval)
  }, [fetchQuotes])

  const addSymbol = () => {
    const sym = addInput.trim().toUpperCase()
    if (sym && !symbols.includes(sym)) {
      setSymbols([...symbols, sym])
      setAddInput('')
      setAdding(false)
    }
  }

  const removeSymbol = (sym: string) => {
    setSymbols(symbols.filter((s) => s !== sym))
    const newQuotes = { ...quotes }
    delete newQuotes[sym]
    setQuotes(newQuotes)
  }

  return (
    <div className="bg-surface-1 rounded-xl border border-surface-3 overflow-hidden">
      <div className="px-4 py-3 border-b border-surface-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Star size={16} className="text-brand-400" />
          <h3 className="text-sm font-medium text-text-primary">Watchlist</h3>
        </div>
        <button
          onClick={() => setAdding(!adding)}
          className="p-1 rounded-lg hover:bg-surface-2 text-text-muted hover:text-text-primary transition-colors"
        >
          <Plus size={16} />
        </button>
      </div>

      {adding && (
        <div className="px-4 py-2 border-b border-surface-3 flex gap-2">
          <input
            type="text"
            value={addInput}
            onChange={(e) => setAddInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addSymbol()}
            placeholder="Symbol (e.g., XAUUSD)"
            className="flex-1 px-3 py-1.5 text-sm bg-surface-2 border border-surface-4 rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-brand-600"
            autoFocus
          />
          <button
            onClick={addSymbol}
            className="px-3 py-1.5 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors"
          >
            Add
          </button>
        </div>
      )}

      <div className="divide-y divide-surface-3/50">
        {symbols.map((sym) => {
          const q = quotes[sym]
          const isUp = q ? q.change >= 0 : true
          return (
            <div
              key={sym}
              className="px-4 py-2.5 flex items-center justify-between hover:bg-surface-2/50 transition-colors cursor-pointer group"
              onClick={() => onSymbolClick?.(sym)}
            >
              <div className="flex items-center gap-2">
                {isUp ? (
                  <TrendingUp size={12} className="text-profit" />
                ) : (
                  <TrendingDown size={12} className="text-loss" />
                )}
                <span className="text-sm font-medium text-text-primary">{sym}</span>
              </div>
              <div className="flex items-center gap-3">
                {q ? (
                  <>
                    <span className="text-sm text-text-primary font-medium">{formatCurrency(q.price)}</span>
                    <span className={cn('text-xs font-medium', getPnlColor(q.change))}>
                      {formatPercent(q.percent_change)}
                    </span>
                  </>
                ) : loading ? (
                  <div className="w-16 h-4 bg-surface-3 rounded animate-pulse" />
                ) : (
                  <span className="text-xs text-text-muted">--</span>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); removeSymbol(sym) }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-loss/10 text-text-muted hover:text-loss transition-all"
                >
                  <X size={12} />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {symbols.length === 0 && (
        <div className="px-4 py-6 text-center text-text-muted text-sm">
          Add symbols to your watchlist
        </div>
      )}
    </div>
  )
}
