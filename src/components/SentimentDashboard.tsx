'use client'

import { useState, useEffect } from 'react'
import { RefreshCw, TrendingUp, TrendingDown, Minus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { NewsSentiment } from '@/types'
import { formatDistanceToNow } from 'date-fns'

export default function SentimentDashboard() {
  const [data, setData] = useState<NewsSentiment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedPair, setExpandedPair] = useState<string | null>(null)
  const [customPairs, setCustomPairs] = useState<string[]>(['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD'])
  const [pairInput, setPairInput] = useState('')

  const addPair = () => {
    const pair = pairInput.trim().toUpperCase()
    if (pair && !customPairs.includes(pair)) {
      setCustomPairs([...customPairs, pair])
      setPairInput('')
    }
  }

  const removePair = (pair: string) => {
    setCustomPairs(customPairs.filter((p) => p !== pair))
  }

  const fetchSentiment = async (refresh = false) => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (customPairs.length > 0) params.set('pairs', customPairs.join(','))
      if (refresh) params.set('refresh', 'true')
      const res = await fetch(`/api/ai/news-sentiment?${params}`)
      const json = await res.json()
      if (Array.isArray(json)) {
        setData(json)
      } else if (json.error) {
        setError(json.error)
      }
    } catch {
      setError('Failed to fetch sentiment data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSentiment()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const getSentimentIcon = (label: string) => {
    if (label === 'bullish') return <TrendingUp size={16} className="text-profit" />
    if (label === 'bearish') return <TrendingDown size={16} className="text-loss" />
    return <Minus size={16} className="text-text-muted" />
  }

  const getScoreColor = (score: number) => {
    if (score > 30) return 'text-profit'
    if (score < -30) return 'text-loss'
    return 'text-text-secondary'
  }

  const getBarColor = (score: number) => {
    if (score > 30) return 'bg-profit'
    if (score < -30) return 'bg-loss'
    return 'bg-text-muted'
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-20 bg-surface-2 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-surface-1 rounded-xl border border-surface-3 p-8 text-center">
        <p className="text-loss text-sm mb-3">{error}</p>
        <button
          onClick={() => fetchSentiment()}
          className="px-4 py-2 bg-surface-2 hover:bg-surface-3 text-text-secondary text-sm rounded-lg transition-colors"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Custom Pairs */}
      <div className="bg-surface-1 rounded-xl border border-surface-3 p-4">
        <span className="text-sm font-medium text-text-secondary block mb-2">Watchlist Pairs</span>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {customPairs.map((pair) => (
            <span
              key={pair}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-surface-2 text-text-primary text-xs rounded-lg"
            >
              {pair}
              <button onClick={() => removePair(pair)} className="text-text-muted hover:text-loss transition-colors">
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={pairInput}
            onChange={(e) => setPairInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addPair()}
            placeholder="Add pair (e.g. EUR/GBP)"
            className="flex-1 px-3 py-2 text-sm bg-surface-2 border border-surface-4 rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-brand-600"
          />
          <button
            onClick={addPair}
            className="px-3 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors"
          >
            Add
          </button>
          <button
            onClick={() => fetchSentiment(true)}
            disabled={loading}
            className="px-3 py-2 bg-surface-2 hover:bg-surface-3 text-text-secondary rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-text-secondary">Currency Pair Sentiment</h3>
          {data.length > 0 && data[0].fetched_at && (
            <span className="text-xs text-text-muted">
              Updated {formatDistanceToNow(new Date(data[0].fetched_at))} ago
            </span>
          )}
        </div>
        <span className="text-xs text-text-muted">Use controls above to refresh</span>
      </div>

      {data.length === 0 ? (
        <div className="bg-surface-1 rounded-xl border border-surface-3 p-8 text-center">
          <p className="text-text-secondary text-sm">No sentiment data available yet</p>
          <p className="text-text-muted text-xs mt-1">Click refresh to analyze current news</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {data.map((item) => (
            <div
              key={item.pair}
              className="bg-surface-1 rounded-xl border border-surface-3 overflow-hidden"
            >
              <button
                onClick={() => setExpandedPair(expandedPair === item.pair ? null : item.pair)}
                className="w-full p-4 flex items-center justify-between hover:bg-surface-2/50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  {getSentimentIcon(item.sentiment_label)}
                  <div>
                    <span className="font-medium text-text-primary">{item.pair}</span>
                    <span className={cn(
                      'ml-2 text-xs font-medium px-1.5 py-0.5 rounded capitalize',
                      item.sentiment_label === 'bullish'
                        ? 'bg-profit/10 text-profit'
                        : item.sentiment_label === 'bearish'
                        ? 'bg-loss/10 text-loss'
                        : 'bg-surface-3 text-text-secondary'
                    )}>
                      {item.sentiment_label}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={cn('text-lg font-bold', getScoreColor(item.sentiment_score))}>
                    {item.sentiment_score > 0 ? '+' : ''}{item.sentiment_score}
                  </span>
                  {/* Score bar */}
                  <div className="w-24 h-2 bg-surface-3 rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all', getBarColor(item.sentiment_score))}
                      style={{
                        width: `${Math.min(Math.abs(item.sentiment_score), 100)}%`,
                        marginLeft: item.sentiment_score < 0 ? `${100 - Math.abs(item.sentiment_score)}%` : '0',
                      }}
                    />
                  </div>
                </div>
              </button>

              {/* Expanded: show summary and headlines */}
              {expandedPair === item.pair && (
                <div className="px-4 pb-4 border-t border-surface-3">
                  {item.analysis_summary && (
                    <p className="text-sm text-text-secondary mt-3 mb-3">{item.analysis_summary}</p>
                  )}
                  {item.headlines && item.headlines.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-xs text-text-muted">Recent Headlines</span>
                      {item.headlines.slice(0, 5).map((h, i) => (
                        <div key={i} className="text-xs text-text-secondary flex gap-2">
                          <span className="text-text-muted shrink-0">[{h.source}]</span>
                          {h.url ? (
                            <a href={h.url} target="_blank" rel="noopener noreferrer" className="hover:text-brand-400 transition-colors">
                              {h.title}
                            </a>
                          ) : (
                            <span>{h.title}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
