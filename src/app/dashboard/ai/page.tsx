'use client'

import { useState, useEffect, useCallback } from 'react'
import { Brain, BarChart2 } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import ImageDropZone from '@/components/ImageDropZone'
import ChartAnalysisCard from '@/components/ChartAnalysisCard'
import SentimentDashboard from '@/components/SentimentDashboard'
import AiStatsPanel from '@/components/AiStatsPanel'
import type { ChartAnalysisResponse, AiSuggestion, Portfolio } from '@/types'

type Tab = 'chart' | 'sentiment'

export default function AiPage() {
  const [tab, setTab] = useState<Tab>('chart')
  const [analyzing, setAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState<ChartAnalysisResponse | null>(null)
  const [suggestionId, setSuggestionId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [history, setHistory] = useState<AiSuggestion[]>([])
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const fetchPortfolio = useCallback(async () => {
    try {
      const res = await fetch('/api/portfolio')
      const data = await res.json()
      if (data.portfolio) setPortfolio(data.portfolio)
    } catch {
      // ignore
    }
  }, [])

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/ai/suggestions')
      const data = await res.json()
      if (Array.isArray(data)) setHistory(data)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    fetchPortfolio()
    fetchHistory()
  }, [fetchPortfolio, fetchHistory])

  const handleImageReady = async (base64: string, mimeType: string) => {
    setAnalyzing(true)
    setError('')
    setAnalysis(null)
    setSuggestionId(null)
    setMessage(null)

    try {
      const res = await fetch('/api/ai/analyze-chart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, mimeType }),
      })

      const data = await res.json()

      if (res.ok && data.analysis) {
        setAnalysis(data.analysis)
        setSuggestionId(data.suggestionId)
        fetchHistory()
      } else {
        setError(data.error || 'Analysis failed')
      }
    } catch {
      setError('Failed to analyze chart. Please try again.')
    } finally {
      setAnalyzing(false)
    }
  }

  const handleTakeTrade = async (symbol: string, side: 'buy' | 'sell', quantity: number) => {
    if (!suggestionId) return

    try {
      const res = await fetch('/api/ai/take-trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestionId, symbol, side, quantity }),
      })

      const data = await res.json()

      if (res.ok) {
        setMessage({ type: 'success', text: data.message })
        fetchPortfolio()
        fetchHistory()
      } else {
        setMessage({ type: 'error', text: data.error })
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to execute trade' })
    }
  }

  const handleSkip = async () => {
    if (!suggestionId) return

    try {
      await fetch('/api/ai/skip-suggestion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestionId }),
      })
      fetchHistory()
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-text-primary">AI Analysis</h1>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-1 rounded-lg p-1 w-fit border border-surface-3">
        <button
          onClick={() => setTab('chart')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
            tab === 'chart'
              ? 'bg-brand-600 text-white'
              : 'text-text-secondary hover:text-text-primary'
          )}
        >
          <Brain size={16} />
          Chart Analysis
        </button>
        <button
          onClick={() => setTab('sentiment')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
            tab === 'sentiment'
              ? 'bg-brand-600 text-white'
              : 'text-text-secondary hover:text-text-primary'
          )}
        >
          <BarChart2 size={16} />
          News Sentiment
        </button>
      </div>

      {/* Chart Analysis Tab */}
      {tab === 'chart' && (
        <div className="space-y-6">
          <ImageDropZone onImageReady={handleImageReady} analyzing={analyzing} />

          {error && (
            <div className="bg-loss/10 text-loss px-4 py-3 rounded-lg text-sm">{error}</div>
          )}

          {message && (
            <div className={cn(
              'px-4 py-3 rounded-lg text-sm',
              message.type === 'success' ? 'bg-profit/10 text-profit' : 'bg-loss/10 text-loss'
            )}>
              {message.text}
            </div>
          )}

          {analysis && suggestionId && (
            <ChartAnalysisCard
              analysis={analysis}
              suggestionId={suggestionId}
              onTakeTrade={handleTakeTrade}
              onSkip={handleSkip}
              cashBalance={portfolio?.cash_balance || 0}
            />
          )}

          {/* Suggestion History */}
          {history.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-text-secondary mb-3">Recent Suggestions</h3>
              <div className="space-y-2">
                {history.slice(0, 10).map((s) => (
                  <div
                    key={s.id}
                    className="bg-surface-1 rounded-xl border border-surface-3 p-4 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'w-2 h-2 rounded-full',
                        s.status === 'taken' ? 'bg-profit' : s.status === 'skipped' ? 'bg-text-muted' : 'bg-brand-400'
                      )} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-text-primary text-sm">
                            {s.symbol || 'UNKNOWN'}
                          </span>
                          <span className={cn(
                            'text-xs font-medium px-1.5 py-0.5 rounded',
                            s.direction === 'buy' ? 'bg-profit/10 text-profit' : 'bg-loss/10 text-loss'
                          )}>
                            {s.direction?.toUpperCase()}
                          </span>
                          <span className={cn(
                            'text-xs px-1.5 py-0.5 rounded',
                            s.status === 'taken'
                              ? 'bg-profit/10 text-profit'
                              : s.status === 'skipped'
                              ? 'bg-surface-3 text-text-muted'
                              : 'bg-brand-600/10 text-brand-400'
                          )}>
                            {s.status}
                          </span>
                        </div>
                        <span className="text-xs text-text-muted">
                          Confidence: {s.confidence}/10 | Entry: {formatCurrency(s.entry_price || 0)}
                        </span>
                      </div>
                    </div>
                    {s.outcome_pnl !== null && (
                      <span className={cn(
                        'text-sm font-medium',
                        s.outcome_pnl >= 0 ? 'text-profit' : 'text-loss'
                      )}>
                        {formatCurrency(s.outcome_pnl)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sentiment Tab */}
      {tab === 'sentiment' && <SentimentDashboard />}

      {/* AI Stats */}
      <AiStatsPanel />
    </div>
  )
}
