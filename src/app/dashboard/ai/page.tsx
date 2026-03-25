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
} from '@/types'

type Tab = 'live' | 'screenshot' | 'sentiment'

export default function AiPage() {
  const [tab, setTab] = useState<Tab>('live')
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [history, setHistory] = useState<AiSuggestion[]>([])

  // Live Chart state
  const [selectedSymbol, setSelectedSymbol] = useState('')
  const [selectedName, setSelectedName] = useState('')
  const [interval, setInterval] = useState('D')
  const [indicators, setIndicators] = useState<IndicatorConfig[]>([])
  const [pineScript, setPineScript] = useState('')
  const [tvStudies, setTvStudies] = useState<string[]>([])
  const [activeCustomIndicators, setActiveCustomIndicators] = useState<CustomIndicator[]>([])
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatSending, setChatSending] = useState(false)
  const [pendingSuggestionId, setPendingSuggestionId] = useState<string | null>(null)

  // Live chart screenshot state
  const [liveScreenshotAnalyzing, setLiveScreenshotAnalyzing] = useState(false)
  const [liveScreenshotError, setLiveScreenshotError] = useState('')

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

  // ── Screenshot analysis (used by both Live Chart and Screenshot tabs) ──

  const analyzeScreenshot = async (base64: string, mimeType: string, addToChat: boolean) => {
    if (addToChat) {
      setLiveScreenshotAnalyzing(true)
      setLiveScreenshotError('')
      setChatSending(true)
      setChatMessages((prev) => [...prev, {
        id: `user-${Date.now()}`, role: 'user',
        content: `Analyze this ${selectedSymbol || ''} chart screenshot.`,
        timestamp: new Date().toISOString(),
      }])
    } else {
      setAnalyzing(true)
      setScreenshotError('')
      setScreenshotAnalysis(null)
      setScreenshotSuggestionId(null)
      setScreenshotText('')
      setScreenshotMessage(null)
    }

    try {
      const res = await fetch('/api/ai/analyze-chart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, mimeType }),
      })
      const data = await res.json()

      if (res.ok && (data.text || data.analysis)) {
        if (addToChat) {
          if (data.suggestionId) setPendingSuggestionId(data.suggestionId)
          setChatMessages((prev) => [...prev, {
            id: `assistant-${Date.now()}`, role: 'assistant',
            content: data.text || data.analysis?.reasoning || 'Analysis complete.',
            analysis: data.analysis || null,
            timestamp: new Date().toISOString(),
          }])
        } else {
          setScreenshotText(data.text || '')
          setScreenshotAnalysis(data.analysis || null)
          setScreenshotSuggestionId(data.suggestionId)
        }
        fetchHistory()
      } else {
        const errMsg = data.error || 'Analysis failed'
        if (addToChat) {
          setLiveScreenshotError(errMsg)
          setChatMessages((prev) => [...prev, {
            id: `err-${Date.now()}`, role: 'assistant',
            content: `Error: ${errMsg}`, timestamp: new Date().toISOString(),
          }])
        } else {
          setScreenshotError(errMsg)
        }
      }
    } catch {
      if (addToChat) setLiveScreenshotError('Failed to analyze screenshot')
      else setScreenshotError('Failed to analyze chart.')
    } finally {
      if (addToChat) { setLiveScreenshotAnalyzing(false); setChatSending(false) }
      else setAnalyzing(false)
    }
  }

  // ── Chat follow-up (text-based, uses OHLC data endpoint) ──

  const handleChatSend = async (text: string) => {
    setChatSending(true)
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`, role: 'user', content: text, timestamp: new Date().toISOString(),
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
          ohlcData: [],
          indicators: [],
          pineScriptCode: undefined,
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
          analysis: data.analysis || null, timestamp: new Date().toISOString(),
        }])
      } else {
        setChatMessages((prev) => [...prev, {
          id: `err-${Date.now()}`, role: 'assistant',
          content: `Error: ${data.error}`, timestamp: new Date().toISOString(),
        }])
      }
    } catch {
      setChatMessages((prev) => [...prev, {
        id: `err-${Date.now()}`, role: 'assistant',
        content: 'Failed to connect. Please try again.', timestamp: new Date().toISOString(),
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
        body: JSON.stringify({ suggestionId, symbol: analysis.symbol || selectedSymbol, side: analysis.direction, quantity: 1 }),
      })
      const data = await res.json()
      if (res.ok) { fetchPortfolio(); fetchHistory() }
    } catch { /* ignore */ }
  }

  const handleChatSkip = async (suggestionId: string) => {
    try {
      await fetch('/api/ai/skip-suggestion', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestionId }),
      })
      fetchHistory()
    } catch { /* ignore */ }
  }

  const handleScreenshotTakeTrade = async (symbol: string, side: 'buy' | 'sell', quantity: number) => {
    if (!screenshotSuggestionId) return
    try {
      const res = await fetch('/api/ai/take-trade', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestionId: screenshotSuggestionId, symbol, side, quantity }),
      })
      const data = await res.json()
      if (res.ok) {
        setScreenshotMessage({ type: 'success', text: data.message })
        fetchPortfolio(); fetchHistory()
      } else {
        setScreenshotMessage({ type: 'error', text: data.error })
      }
    } catch { setScreenshotMessage({ type: 'error', text: 'Failed to execute trade' }) }
  }

  const handleScreenshotSkip = async () => {
    if (!screenshotSuggestionId) return
    try {
      await fetch('/api/ai/skip-suggestion', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestionId: screenshotSuggestionId }),
      })
      fetchHistory()
    } catch { /* ignore */ }
  }

  const handleDeleteSuggestion = async (id: string) => {
    try {
      await fetch('/api/ai/suggestions', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
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
          <button key={key} onClick={() => setTab(key)}
            className={cn('flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
              tab === key ? 'bg-brand-600 text-white' : 'text-text-secondary hover:text-text-primary')}>
            <Icon size={16} />{label}
          </button>
        ))}
      </div>

      {/* ── Live Chart Tab ── */}
      {tab === 'live' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-1">
            <Watchlist onSymbolClick={(sym) => {
              setSelectedSymbol(sym); setSelectedName(''); setChatMessages([]); setPendingSuggestionId(null)
            }} />
          </div>

          <div className="lg:col-span-4 space-y-4">
            <StockSearch onSelect={(symbol, name) => {
              setSelectedSymbol(symbol); setSelectedName(name); setChatMessages([]); setPendingSuggestionId(null)
            }} placeholder="Search stocks, forex, crypto..." />

            {selectedSymbol && (
              <>
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-bold text-text-primary text-lg">{selectedSymbol}</span>
                  {selectedName && <span className="text-text-secondary">{selectedName}</span>}
                </div>

                <IndicatorPanel
                  indicators={indicators} onIndicatorsChange={setIndicators}
                  pineScript={pineScript} onPineScriptChange={setPineScript}
                  tvStudies={tvStudies} onTvStudiesChange={setTvStudies}
                />

                <IndicatorLibrary activeIndicators={activeCustomIndicators} onActiveChange={setActiveCustomIndicators} />

                <AiChart symbol={selectedSymbol} interval={interval} onIntervalChange={setInterval} tvStudies={tvStudies} />

                {/* Screenshot & Analyze */}
                <div className="bg-surface-1 rounded-xl border border-surface-3 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <ImageIcon size={16} className="text-brand-400" />
                    <span className="text-sm font-medium text-text-primary">Screenshot & Analyze</span>
                  </div>
                  <p className="text-xs text-text-muted mb-3">
                    Screenshot the chart above (with your indicators) and paste here with <span className="text-brand-400 font-medium">Ctrl+V</span>. Claude analyzes exactly what you see.
                  </p>
                  <ImageDropZone onImageReady={(b64, mime) => analyzeScreenshot(b64, mime, true)} analyzing={liveScreenshotAnalyzing} />
                </div>

                {liveScreenshotError && (
                  <div className="bg-loss/10 text-loss px-4 py-3 rounded-lg text-sm">{liveScreenshotError}</div>
                )}

                <AiChat messages={chatMessages} onSendMessage={handleChatSend}
                  onTakeTrade={handleChatTakeTrade} onSkip={handleChatSkip}
                  sending={chatSending} cashBalance={portfolio?.cash_balance || 0}
                  pendingSuggestionId={pendingSuggestionId} />
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Screenshot Tab ── */}
      {tab === 'screenshot' && (
        <div className="space-y-6">
          <ImageDropZone onImageReady={(b64, mime) => analyzeScreenshot(b64, mime, false)} analyzing={analyzing} />

          {screenshotError && (
            <div className="bg-loss/10 text-loss px-4 py-3 rounded-lg text-sm">{screenshotError}</div>
          )}
          {screenshotMessage && (
            <div className={cn('px-4 py-3 rounded-lg text-sm',
              screenshotMessage.type === 'success' ? 'bg-profit/10 text-profit' : 'bg-loss/10 text-loss')}>
              {screenshotMessage.text}
            </div>
          )}

          {(screenshotText || screenshotAnalysis) && (
            <AnalysisDisplay text={screenshotText} analysis={screenshotAnalysis}
              suggestionId={screenshotSuggestionId} cashBalance={portfolio?.cash_balance || 0}
              onTakeTrade={handleScreenshotTakeTrade} onSkip={handleScreenshotSkip} />
          )}

          {/* History */}
          {history.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-text-secondary mb-3">Analysis History</h3>
              <div className="space-y-2">
                {history.map((s) => (
                  <div key={s.id} className="bg-surface-1 rounded-xl border border-surface-3 p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={cn('w-2 h-2 rounded-full shrink-0',
                        s.status === 'taken' ? 'bg-profit' : s.status === 'skipped' ? 'bg-text-muted' : 'bg-brand-400')} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-text-primary text-sm">{s.symbol || 'UNKNOWN'}</span>
                          {s.direction && (
                            <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded',
                              s.direction === 'buy' ? 'bg-profit/10 text-profit' : 'bg-loss/10 text-loss')}>
                              {s.direction.toUpperCase()}
                            </span>
                          )}
                          <span className={cn('text-xs px-1.5 py-0.5 rounded',
                            s.status === 'taken' ? 'bg-profit/10 text-profit' : s.status === 'skipped' ? 'bg-surface-3 text-text-muted' : 'bg-brand-600/10 text-brand-400')}>
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
                      <button onClick={() => handleDeleteSuggestion(s.id)}
                        className="p-1.5 rounded-lg hover:bg-loss/10 text-text-muted hover:text-loss transition-colors" title="Delete">
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

      <AiStatsPanel />
    </div>
  )
}
