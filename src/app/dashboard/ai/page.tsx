'use client'

import { useState, useEffect, useCallback } from 'react'
import { Brain, BarChart2, Image as ImageIcon, Trash2 } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { format } from 'date-fns'
import StockSearch from '@/components/StockSearch'
import AiChart from '@/components/AiChart'
import IndicatorPanel from '@/components/IndicatorPanel'
import AiChat from '@/components/AiChat'
import Watchlist from '@/components/Watchlist'
import IndicatorLibrary from '@/components/IndicatorLibrary'
import ImageDropZone from '@/components/ImageDropZone'
import ChartAnalysisCard from '@/components/ChartAnalysisCard'
import SentimentDashboard from '@/components/SentimentDashboard'
import AiStatsPanel from '@/components/AiStatsPanel'
import AnalysisDisplay from '@/components/AnalysisDisplay'
import type {
  ChartAnalysisResponse,
  AiSuggestion,
  Portfolio,
  ChatMessage,
  IndicatorConfig,
  CustomIndicator,
  OHLC,
  IndicatorValues,
} from '@/types'

type Tab = 'live' | 'screenshot' | 'sentiment'

export default function AiPage() {
  const [tab, setTab] = useState<Tab>('live')
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [history, setHistory] = useState<AiSuggestion[]>([])

  // Live Chart state
  const [selectedSymbol, setSelectedSymbol] = useState('')
  const [selectedName, setSelectedName] = useState('')
  const [interval, setInterval] = useState('5')
  const [indicators, setIndicators] = useState<IndicatorConfig[]>([])
  const [pineScript, setPineScript] = useState('')
  const [tvStudies, setTvStudies] = useState<string[]>([])
  const [activeCustomIndicators, setActiveCustomIndicators] = useState<CustomIndicator[]>([])
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatSending, setChatSending] = useState(false)
  const [currentOhlc, setCurrentOhlc] = useState<OHLC[]>([])
  const [currentIndicatorValues, setCurrentIndicatorValues] = useState<IndicatorValues[]>([])
  const [pendingSuggestionId, setPendingSuggestionId] = useState<string | null>(null)

  // Screenshot tab state
  const [analyzing, setAnalyzing] = useState(false)
  const [screenshotText, setScreenshotText] = useState('')
  const [screenshotAnalysis, setScreenshotAnalysis] = useState<ChartAnalysisResponse | null>(null)
  const [screenshotSuggestionId, setScreenshotSuggestionId] = useState<string | null>(null)
  const [screenshotError, setScreenshotError] = useState('')
  const [screenshotMessage, setScreenshotMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const fetchPortfolio = useCallback(async () => {
    try {
      const res = await fetch('/api/portfolio')
      const data = await res.json()
      if (data.portfolio) setPortfolio(data.portfolio)
    } catch { /* ignore */ }
  }, [])

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/ai/suggestions')
      const data = await res.json()
      if (Array.isArray(data)) setHistory(data)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    fetchPortfolio()
    fetchHistory()
  }, [fetchPortfolio, fetchHistory])

  // Combine manual Pine Script + active custom indicators into one context string
  const buildPineScriptContext = () => {
    const parts: string[] = []
    if (pineScript.trim()) parts.push(`// Manual Pine Script:\n${pineScript}`)
    for (const ind of activeCustomIndicators) {
      parts.push(`// Custom Indicator: ${ind.name}${ind.description ? ` - ${ind.description}` : ''}\n${ind.pine_script}`)
    }
    return parts.length > 0 ? parts.join('\n\n') : undefined
  }

  // ── Multi-TF Screenshot handler ──

  const handleScreenshotAnalyze = async (images: string[], mimeTypes: string[]) => {
    if (images.length === 0) return
    setChatSending(true)

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: `Analyze these ${images.length} timeframe screenshot${images.length > 1 ? 's' : ''} of ${selectedSymbol}. Give me a multi-timeframe confluence analysis.`,
      timestamp: new Date().toISOString(),
    }
    setChatMessages((prev) => [...prev, userMsg])

    try {
      const res = await fetch('/api/ai/analyze-chart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images, mimeTypes }),
      })
      const data = await res.json()

      if (res.ok && (data.text || data.analysis)) {
        if (data.suggestionId) setPendingSuggestionId(data.suggestionId)
        setChatMessages((prev) => [...prev, {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: data.text || data.analysis?.reasoning || 'Analysis complete.',
          analysis: data.analysis || null,
          timestamp: new Date().toISOString(),
        }])
        fetchHistory()
      } else {
        setChatMessages((prev) => [...prev, {
          id: `err-${Date.now()}`, role: 'assistant',
          content: `Error: ${data.error || 'Analysis failed'}`,
          timestamp: new Date().toISOString(),
        }])
      }
    } catch (err) {
      const errText = err instanceof Error ? err.message : 'Unknown error'
      setChatMessages((prev) => [...prev, {
        id: `err-${Date.now()}`, role: 'assistant',
        content: `Failed to analyze: ${errText}`,
        timestamp: new Date().toISOString(),
      }])
    } finally {
      setChatSending(false)
    }
  }

  // ── Live Chart handlers ──

  const handleAnalyzeChart = async (ohlcData: OHLC[], indicatorValues: IndicatorValues[]) => {
    if (!selectedSymbol) return
    setCurrentOhlc(ohlcData)
    setCurrentIndicatorValues(indicatorValues)
    setChatSending(true)

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: `Analyze this ${selectedSymbol} chart on the ${interval} timeframe.`,
      timestamp: new Date().toISOString(),
    }
    setChatMessages((prev) => [...prev, userMsg])

    try {
      const res = await fetch('/api/ai/analyze-chart-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: selectedSymbol,
          interval,
          ohlcData,
          indicators: indicatorValues,
          pineScriptCode: buildPineScriptContext(),
          conversationHistory: chatMessages.map((m) => ({ ...m })),
          userMessage: undefined,
        }),
      })
      const data = await res.json()

      if (res.ok) {
        if (data.suggestionId) setPendingSuggestionId(data.suggestionId)
        const assistantMsg: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: data.message || data.analysis?.reasoning || 'Analysis complete.',
          analysis: data.analysis || null,
          timestamp: new Date().toISOString(),
        }
        setChatMessages((prev) => [...prev, assistantMsg])
      } else {
        const errMsg: ChatMessage = {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: `Error: ${data.error || 'Analysis failed'}`,
          timestamp: new Date().toISOString(),
        }
        setChatMessages((prev) => [...prev, errMsg])
      }
    } catch (err) {
      const errText = err instanceof Error ? err.message : 'Unknown error'
      setChatMessages((prev) => [...prev, {
        id: `err-${Date.now()}`, role: 'assistant',
        content: `Failed to connect to AI: ${errText}. Please try again.`,
        timestamp: new Date().toISOString(),
      }])
    } finally {
      setChatSending(false)
      fetchHistory()
    }
  }

  const handleChatSend = async (text: string) => {
    setChatSending(true)
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    }
    const updatedMessages = [...chatMessages, userMsg]
    setChatMessages(updatedMessages)

    try {
      const res = await fetch('/api/ai/analyze-chart-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: selectedSymbol,
          interval,
          ohlcData: currentOhlc,
          indicators: currentIndicatorValues,
          pineScriptCode: buildPineScriptContext(),
          conversationHistory: updatedMessages.map((m) => ({
            id: m.id, role: m.role, content: m.content, timestamp: m.timestamp,
          })),
          userMessage: text,
        }),
      })
      const data = await res.json()

      if (res.ok) {
        if (data.suggestionId) setPendingSuggestionId(data.suggestionId)
        setChatMessages((prev) => [...prev, {
          id: `assistant-${Date.now()}`, role: 'assistant',
          content: data.message || 'Analysis complete.',
          analysis: data.analysis || null,
          timestamp: new Date().toISOString(),
        }])
      } else {
        setChatMessages((prev) => [...prev, {
          id: `err-${Date.now()}`, role: 'assistant',
          content: `Error: ${data.error}`,
          timestamp: new Date().toISOString(),
        }])
      }
    } catch (err) {
      const errText = err instanceof Error ? err.message : 'Unknown error'
      setChatMessages((prev) => [...prev, {
        id: `err-${Date.now()}`, role: 'assistant',
        content: `Failed to connect: ${errText}. Please try again.`,
        timestamp: new Date().toISOString(),
      }])
    } finally {
      setChatSending(false)
      fetchHistory()
    }
  }

  const handleChatTakeTrade = async (analysis: ChartAnalysisResponse, suggestionId: string) => {
    try {
      const res = await fetch('/api/ai/take-trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          suggestionId,
          symbol: analysis.symbol || selectedSymbol,
          side: analysis.direction,
          lotSize: 0.01,
          stopLoss: analysis.stop_loss || null,
          takeProfit: analysis.take_profit || null,
          entryPrice: analysis.entry_price || null,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setScreenshotMessage({ type: 'success', text: data.message })
        fetchPortfolio()
        fetchHistory()
      } else {
        setScreenshotMessage({ type: 'error', text: data.error })
      }
    } catch { /* ignore */ }
  }

  const handleChatSkip = async (suggestionId: string) => {
    try {
      await fetch('/api/ai/skip-suggestion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestionId }),
      })
      fetchHistory()
    } catch { /* ignore */ }
  }

  // ── Screenshot tab handlers ──

  const handleImageReady = async (base64: string, mimeType: string) => {
    setAnalyzing(true)
    setScreenshotError('')
    setScreenshotAnalysis(null)
    setScreenshotSuggestionId(null)
    setScreenshotMessage(null)
    setScreenshotText('')

    try {
      const res = await fetch('/api/ai/analyze-chart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, mimeType }),
      })
      const data = await res.json()

      if (res.ok && (data.text || data.analysis)) {
        setScreenshotText(data.text || '')
        setScreenshotAnalysis(data.analysis || null)
        setScreenshotSuggestionId(data.suggestionId)
        fetchHistory()
      } else {
        setScreenshotError(data.error || 'Analysis failed')
      }
    } catch {
      setScreenshotError('Failed to analyze chart.')
    } finally {
      setAnalyzing(false)
    }
  }

  const handleScreenshotTakeTrade = async (symbol: string, side: 'buy' | 'sell', quantity: number) => {
    if (!screenshotSuggestionId) return
    try {
      const res = await fetch('/api/ai/take-trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestionId: screenshotSuggestionId, symbol, side, quantity }),
      })
      const data = await res.json()
      if (res.ok) {
        setScreenshotMessage({ type: 'success', text: data.message })
        fetchPortfolio()
        fetchHistory()
      } else {
        setScreenshotMessage({ type: 'error', text: data.error })
      }
    } catch {
      setScreenshotMessage({ type: 'error', text: 'Failed to execute trade' })
    }
  }

  const handleScreenshotSkip = async () => {
    if (!screenshotSuggestionId) return
    try {
      await fetch('/api/ai/skip-suggestion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestionId: screenshotSuggestionId }),
      })
      fetchHistory()
    } catch { /* ignore */ }
  }

  const handleDeleteSuggestion = async (id: string) => {
    try {
      await fetch('/api/ai/suggestions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      setHistory((prev) => prev.filter((s) => s.id !== id))
    } catch { /* ignore */ }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-text-primary">AI Analysis</h1>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-1 rounded-lg p-1 w-fit border border-surface-3">
        {([
          { key: 'live', label: 'Live Chart', icon: Brain },
          { key: 'screenshot', label: 'Screenshot', icon: ImageIcon },
          { key: 'sentiment', label: 'News Sentiment', icon: BarChart2 },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
              tab === key ? 'bg-brand-600 text-white' : 'text-text-secondary hover:text-text-primary'
            )}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {/* ── Live Chart Tab ── */}
      {tab === 'live' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Watchlist Sidebar */}
          <div className="lg:col-span-1">
            <Watchlist
              onSymbolClick={(sym) => {
                setSelectedSymbol(sym)
                setSelectedName('')
                setChatMessages([])
                setPendingSuggestionId(null)
              }}
            />
          </div>

          {/* Main Chart Area */}
          <div className="lg:col-span-4 space-y-4">
            <StockSearch
              onSelect={(symbol, name) => {
                setSelectedSymbol(symbol)
                setSelectedName(name)
                setChatMessages([])
                setPendingSuggestionId(null)
              }}
              placeholder="Search stocks, forex, crypto..."
            />

            {selectedSymbol && (
              <>
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-bold text-text-primary text-lg">{selectedSymbol}</span>
                  {selectedName && <span className="text-text-secondary">{selectedName}</span>}
                </div>

                <AiChart
                  symbol={selectedSymbol}
                  interval={interval}
                  onIntervalChange={setInterval}
                  indicators={indicators}
                  onAnalyze={handleAnalyzeChart}
                  analyzing={chatSending}
                  tvStudies={tvStudies}
                  onScreenshotAnalyze={handleScreenshotAnalyze}
                />

                <AiChat
                  messages={chatMessages}
                  onSendMessage={handleChatSend}
                  onTakeTrade={handleChatTakeTrade}
                  onSkip={handleChatSkip}
                  sending={chatSending}
                  cashBalance={portfolio?.cash_balance || 0}
                  pendingSuggestionId={pendingSuggestionId}
                />
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Screenshot Tab ── */}
      {tab === 'screenshot' && (
        <div className="space-y-6">
          <ImageDropZone onImageReady={handleImageReady} analyzing={analyzing} />

          {screenshotError && (
            <div className="bg-loss/10 text-loss px-4 py-3 rounded-lg text-sm">{screenshotError}</div>
          )}
          {screenshotMessage && (
            <div className={cn(
              'px-4 py-3 rounded-lg text-sm',
              screenshotMessage.type === 'success' ? 'bg-profit/10 text-profit' : 'bg-loss/10 text-loss'
            )}>
              {screenshotMessage.text}
            </div>
          )}

          {/* Analysis Display */}
          {(screenshotText || screenshotAnalysis) && (
            <AnalysisDisplay
              text={screenshotText}
              analysis={screenshotAnalysis}
              suggestionId={screenshotSuggestionId}
              cashBalance={portfolio?.cash_balance || 0}
              onTakeTrade={(symbol, side, qty) => handleScreenshotTakeTrade(symbol, side, qty)}
              onSkip={handleScreenshotSkip}
            />
          )}

          {/* Screenshot History */}
          {history.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-text-secondary mb-3">Analysis History</h3>
              <div className="space-y-2">
                {history.map((s) => (
                  <div
                    key={s.id}
                    className="bg-surface-1 rounded-xl border border-surface-3 p-4 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={cn(
                        'w-2 h-2 rounded-full shrink-0',
                        s.status === 'taken' ? 'bg-profit' : s.status === 'skipped' ? 'bg-text-muted' : 'bg-brand-400'
                      )} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-text-primary text-sm">{s.symbol || 'UNKNOWN'}</span>
                          {s.direction && (
                            <span className={cn(
                              'text-xs font-medium px-1.5 py-0.5 rounded',
                              s.direction === 'buy' ? 'bg-profit/10 text-profit' : 'bg-loss/10 text-loss'
                            )}>
                              {s.direction.toUpperCase()}
                            </span>
                          )}
                          <span className={cn(
                            'text-xs px-1.5 py-0.5 rounded',
                            s.status === 'taken' ? 'bg-profit/10 text-profit' : s.status === 'skipped' ? 'bg-surface-3 text-text-muted' : 'bg-brand-600/10 text-brand-400'
                          )}>
                            {s.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-text-muted mt-0.5">
                          {s.confidence && <span>Confidence: {s.confidence}/10</span>}
                          {s.entry_price && <span>Entry: {formatCurrency(s.entry_price)}</span>}
                          <span>{format(new Date(s.created_at), 'MMM d, HH:mm')}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {s.outcome_pnl !== null && (
                        <span className={cn('text-sm font-medium', s.outcome_pnl >= 0 ? 'text-profit' : 'text-loss')}>
                          {formatCurrency(s.outcome_pnl)}
                        </span>
                      )}
                      <button
                        onClick={() => handleDeleteSuggestion(s.id)}
                        className="p-1.5 rounded-lg hover:bg-loss/10 text-text-muted hover:text-loss transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Sentiment Tab ── */}
      {tab === 'sentiment' && <SentimentDashboard />}

      {/* AI Stats */}
      <AiStatsPanel />
    </div>
  )
}
