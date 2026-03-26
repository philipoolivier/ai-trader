'use client'

import { useState, useEffect, useCallback } from 'react'
import { Brain, BarChart2, Image as ImageIcon, Trash2 } from 'lucide-react'
import PendingOrdersPanel from '@/components/PendingOrdersPanel'
import { getTradingConfig, saveTradingConfig, LOT_PRESETS } from '@/lib/trading-config'
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
  const [savedSessions, setSavedSessions] = useState<{ id: string; symbol: string; date: string; messages: ChatMessage[] }[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [chatSending, setChatSending] = useState(false)
  const [tradeLotSize, setTradeLotSize] = useState(0.01)
  const [riskMode, setRiskMode] = useState<'fixed' | 'percent'>('fixed')
  const [riskPercent, setRiskPercent] = useState(2)
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
    // Load trading config
    const cfg = getTradingConfig()
    setTradeLotSize(cfg.defaultLotSize)
    setRiskPercent(cfg.riskPerTradePercent)
    // Load saved sessions from localStorage
    try {
      const saved = localStorage.getItem('ai-analysis-sessions')
      if (saved) setSavedSessions(JSON.parse(saved))
    } catch { /* ignore */ }
  }, [fetchPortfolio, fetchHistory])

  // Auto-save session when chat has messages
  useEffect(() => {
    if (chatMessages.length > 1 && selectedSymbol) {
      const sessionId = `session-${selectedSymbol}-${chatMessages[0]?.id || Date.now()}`
      setSavedSessions(prev => {
        const existing = prev.findIndex(s => s.id === sessionId)
        const session = {
          id: sessionId,
          symbol: selectedSymbol,
          date: new Date().toISOString(),
          messages: chatMessages,
        }
        const updated = existing >= 0
          ? prev.map((s, i) => i === existing ? session : s)
          : [session, ...prev].slice(0, 20) // Keep last 20 sessions
        try { localStorage.setItem('ai-analysis-sessions', JSON.stringify(updated)) } catch { /* ignore */ }
        return updated
      })
    }
  }, [chatMessages, selectedSymbol])

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
        body: JSON.stringify({ images, mimeTypes, symbol: selectedSymbol, interval }),
      })
      const data = await res.json()

      if (res.ok && (data.text || data.analysis)) {
        if (data.suggestionId) setPendingSuggestionId(data.suggestionId)
        setChatMessages((prev) => [...prev, {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: data.text || data.analysis?.reasoning || 'Analysis complete.',
          analysis: data.analysis || null,
          trades: data.trades || [],
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
          trades: data.trades || [],
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
          trades: data.trades || [],
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
    const tradeLabel = (analysis as unknown as Record<string, unknown>).label as string || undefined

    // Calculate lot size based on mode
    let lots = tradeLotSize
    if (riskMode === 'percent' && analysis.stop_loss && analysis.entry_price) {
      const accountBalance = portfolio?.cash_balance || 500
      const riskAmount = accountBalance * (riskPercent / 100)
      const slDistance = Math.abs(analysis.entry_price - analysis.stop_loss)
      if (slDistance > 0) {
        // Determine contract size based on symbol
        const sym = (analysis.symbol || selectedSymbol).toUpperCase().replace('/', '')
        const contractSize = sym.startsWith('XAU') ? 100 : sym.startsWith('XAG') ? 5000 : 100000
        lots = Math.round((riskAmount / (slDistance * contractSize)) * 100) / 100
        lots = Math.max(lots, 0.01) // Minimum 0.01
      }
    }

    try {
      const res = await fetch('/api/ai/take-trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          suggestionId,
          symbol: analysis.symbol || selectedSymbol,
          side: analysis.direction,
          lotSize: lots,
          entryPrice: analysis.entry_price || null,
          stopLoss: analysis.stop_loss || null,
          takeProfit: analysis.take_profit || null,
          label: tradeLabel,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        // Show success in chat
        setChatMessages((prev) => [...prev, {
          id: `trade-${Date.now()}`, role: 'assistant',
          content: `✅ ${data.message}`,
          timestamp: new Date().toISOString(),
        }])
        fetchPortfolio()
        fetchHistory()
      } else {
        setChatMessages((prev) => [...prev, {
          id: `err-${Date.now()}`, role: 'assistant',
          content: `Trade failed: ${data.error}`,
          timestamp: new Date().toISOString(),
        }])
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setChatMessages((prev) => [...prev, {
        id: `err-${Date.now()}`, role: 'assistant',
        content: `Trade failed: ${msg}`,
        timestamp: new Date().toISOString(),
      }])
    }
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
        body: JSON.stringify({ image: base64, mimeType, symbol: selectedSymbol, interval }),
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

      {/* Tabs + Trade Settings */}
      <div className="flex items-center justify-between flex-wrap gap-3">
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

      {/* Risk / Lot Size Selector */}
      <div className="flex items-center gap-3 bg-surface-1 rounded-lg px-3 py-1.5 border border-surface-3">
        {/* Toggle */}
        <div className="flex gap-0.5 bg-surface-2 rounded p-0.5">
          <button
            onClick={() => setRiskMode('fixed')}
            className={cn('px-2 py-1 text-[10px] font-medium rounded transition-colors',
              riskMode === 'fixed' ? 'bg-brand-600 text-white' : 'text-text-muted'
            )}
          >Fixed Lot</button>
          <button
            onClick={() => setRiskMode('percent')}
            className={cn('px-2 py-1 text-[10px] font-medium rounded transition-colors',
              riskMode === 'percent' ? 'bg-brand-600 text-white' : 'text-text-muted'
            )}
          >% Risk</button>
        </div>

        {riskMode === 'fixed' ? (
          <>
            <span className="text-xs text-text-muted">Lots:</span>
            <div className="flex gap-1">
              {LOT_PRESETS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => {
                    setTradeLotSize(p.value)
                    saveTradingConfig({ defaultLotSize: p.value })
                  }}
                  className={cn(
                    'px-2 py-1 text-xs font-medium rounded transition-colors',
                    tradeLotSize === p.value
                      ? 'bg-brand-600 text-white'
                      : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <span className="text-xs text-text-muted">Risk:</span>
            <div className="flex gap-1">
              {[0.5, 1, 2, 3, 5].map((pct) => (
                <button
                  key={pct}
                  onClick={() => {
                    setRiskPercent(pct)
                    saveTradingConfig({ riskPerTradePercent: pct })
                  }}
                  className={cn(
                    'px-2 py-1 text-xs font-medium rounded transition-colors',
                    riskPercent === pct
                      ? 'bg-brand-600 text-white'
                      : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
                  )}
                >
                  {pct}%
                </button>
              ))}
            </div>
            <span className="text-[10px] text-text-muted">of ${(portfolio?.cash_balance || 500).toFixed(0)}</span>
          </>
        )}
      </div>
      </div>

      {/* ── Live Chart Tab ── */}
      {tab === 'live' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Watchlist + History Sidebar */}
          <div className="lg:col-span-1 space-y-4">
            <Watchlist
              onSymbolClick={(sym) => {
                setSelectedSymbol(sym)
                setSelectedName('')
                setChatMessages([])
                setPendingSuggestionId(null)
              }}
            />

            {/* Analysis History */}
            {savedSessions.length > 0 && (
              <div className="bg-surface-1 rounded-xl border border-surface-3 overflow-hidden">
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className="w-full px-4 py-3 flex items-center justify-between text-sm font-medium text-text-primary hover:bg-surface-2 transition-colors"
                >
                  <span>Analysis History ({savedSessions.length})</span>
                  <span className="text-text-muted text-xs">{showHistory ? 'Hide' : 'Show'}</span>
                </button>
                {showHistory && (
                  <div className="border-t border-surface-3 max-h-64 overflow-y-auto">
                    {savedSessions.map((session) => (
                      <button
                        key={session.id}
                        onClick={() => {
                          setSelectedSymbol(session.symbol)
                          setChatMessages(session.messages)
                          setPendingSuggestionId(null)
                        }}
                        className={cn(
                          'w-full px-4 py-2.5 text-left hover:bg-surface-2 transition-colors border-b border-surface-3/50 last:border-0',
                          selectedSymbol === session.symbol && chatMessages.length > 0 && chatMessages[0]?.id === session.messages[0]?.id
                            ? 'bg-brand-600/10'
                            : ''
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-text-primary">{session.symbol}</span>
                          <span className="text-[10px] text-text-muted">
                            {new Date(session.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-[10px] text-text-muted truncate mt-0.5">
                          {session.messages.filter(m => m.role === 'assistant').length} responses
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
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

                {/* Pending Orders */}
                <PendingOrdersPanel onOrderTriggered={fetchPortfolio} />
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
    </div>
  )
}
