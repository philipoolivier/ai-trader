'use client'

import { useEffect, useState, useCallback, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Camera, X, Play, Loader2, Brain } from 'lucide-react'
import StockSearch from '@/components/StockSearch'
import TradingViewChart from '@/components/TradingViewChart'
import TradeForm from '@/components/TradeForm'
import { formatCurrency, formatPercent, formatCompactNumber, getPnlColor, cn } from '@/lib/utils'
import type { Quote, Position, Portfolio, ChartAnalysisResponse } from '@/types'

const TIMEFRAMES = [
  { label: '1m', value: '1' },
  { label: '5m', value: '5' },
  { label: '15m', value: '15' },
  { label: '1H', value: '60' },
  { label: '4H', value: '240' },
  { label: 'D', value: 'D' },
  { label: 'W', value: 'W' },
]

interface ChartSnapshot {
  id: string
  base64: string
  mimeType: string
  timeframe: string
  preview: string
}

function TradePageContent() {
  const searchParams = useSearchParams()
  const initialSymbol = searchParams.get('symbol') || ''

  const [selectedSymbol, setSelectedSymbol] = useState(initialSymbol)
  const [selectedName, setSelectedName] = useState('')
  const [quote, setQuote] = useState<Quote | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [positions, setPositions] = useState<Position[]>([])

  // Chart state
  const [interval, setInterval] = useState('5')
  const chartContainerRef = useRef<HTMLDivElement>(null)

  // Screenshot collection
  const [snapshots, setSnapshots] = useState<ChartSnapshot[]>([])
  const [capturing, setCapturing] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState('')
  const [aiAnalysis, setAiAnalysis] = useState<ChartAnalysisResponse | null>(null)
  const [analysisText, setAnalysisText] = useState('')

  const fetchQuote = useCallback(async (symbol: string) => {
    if (!symbol) return
    setQuoteLoading(true)
    try {
      const res = await fetch(`/api/market/quote?symbol=${symbol}`)
      const data = await res.json()
      if (data.price) {
        setQuote(data)
        setSelectedName(data.name || '')
      }
    } catch {
      // ignore
    } finally {
      setQuoteLoading(false)
    }
  }, [])

  const fetchPortfolio = useCallback(async () => {
    try {
      const res = await fetch('/api/portfolio')
      const data = await res.json()
      if (data.portfolio) {
        setPortfolio(data.portfolio)
        setPositions(data.positions || [])
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => { fetchPortfolio() }, [fetchPortfolio])
  useEffect(() => { if (selectedSymbol) fetchQuote(selectedSymbol) }, [selectedSymbol, fetchQuote])

  const currentPosition = positions.find(
    (p) => p.symbol === selectedSymbol.toUpperCase() && p.quantity > 0
  )

  const handleTradeComplete = () => {
    fetchPortfolio()
    if (selectedSymbol) fetchQuote(selectedSymbol)
  }

  const tfLabel = TIMEFRAMES.find(t => t.value === interval)?.label || interval

  // Capture current chart view
  const captureCurrentChart = async () => {
    if (!selectedSymbol) return
    setCapturing(true)
    setAnalysisError('')

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        preferCurrentTab: true,
      } as DisplayMediaStreamOptions)

      const video = document.createElement('video')
      video.srcObject = stream
      video.autoplay = true
      await new Promise<void>((resolve) => {
        video.onloadedmetadata = () => { video.play(); setTimeout(resolve, 500) }
      })

      const canvas = document.createElement('canvas')
      if (chartContainerRef.current) {
        const rect = chartContainerRef.current.getBoundingClientRect()
        const scaleX = video.videoWidth / window.innerWidth
        const scaleY = video.videoHeight / window.innerHeight
        canvas.width = Math.round(rect.width * scaleX)
        canvas.height = Math.round(rect.height * scaleY)
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(video,
          Math.round(rect.left * scaleX), Math.round(rect.top * scaleY),
          canvas.width, canvas.height,
          0, 0, canvas.width, canvas.height
        )
      } else {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        canvas.getContext('2d')!.drawImage(video, 0, 0)
      }

      stream.getTracks().forEach(t => t.stop())
      video.srcObject = null

      const dataUrl = canvas.toDataURL('image/png')
      const base64 = dataUrl.split(',')[1]

      setSnapshots(prev => [...prev, {
        id: `snap-${Date.now()}`,
        base64,
        mimeType: 'image/png',
        timeframe: tfLabel,
        preview: dataUrl,
      }])
    } catch (err) {
      if (err instanceof Error && err.name !== 'NotAllowedError') {
        setAnalysisError('Failed to capture chart')
      }
    } finally {
      setCapturing(false)
    }
  }

  const removeSnapshot = (id: string) => {
    setSnapshots(prev => prev.filter(s => s.id !== id))
  }

  const analyzeAll = async () => {
    if (snapshots.length === 0) return
    setAnalyzing(true)
    setAnalysisError('')
    setAiAnalysis(null)
    setAnalysisText('')

    try {
      const res = await fetch('/api/ai/analyze-chart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: snapshots.map(s => s.base64),
          mimeTypes: snapshots.map(s => s.mimeType),
        }),
      })
      const data = await res.json()
      if (res.ok && (data.text || data.analysis)) {
        setAnalysisText(data.text || '')
        setAiAnalysis(data.analysis || null)
      } else {
        setAnalysisError(data.error || 'Analysis failed')
      }
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-text-primary">Trade</h1>

      <StockSearch
        onSelect={(symbol, name) => {
          setSelectedSymbol(symbol)
          setSelectedName(name)
          setSnapshots([])
          setAiAnalysis(null)
          setAnalysisText('')
        }}
        placeholder="Search forex, metals, crypto..."
      />

      {/* Quote Bar */}
      {quote && (
        <div className="bg-surface-1 rounded-xl border border-surface-3 p-5">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-xl font-bold text-text-primary">{quote.symbol}</h2>
                {quoteLoading && (
                  <div className="w-4 h-4 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
                )}
              </div>
              <p className="text-sm text-text-secondary">{selectedName}</p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-text-primary">{formatCurrency(quote.price)}</div>
              <div className={cn('text-sm font-medium', getPnlColor(quote.change))}>
                {quote.change >= 0 ? '+' : ''}{formatCurrency(quote.change)} ({formatPercent(quote.percent_change)})
              </div>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-4 mt-4 pt-4 border-t border-surface-3">
            <div><span className="text-xs text-text-muted block">Open</span><span className="text-sm text-text-primary">{formatCurrency(quote.open)}</span></div>
            <div><span className="text-xs text-text-muted block">High</span><span className="text-sm text-text-primary">{formatCurrency(quote.high)}</span></div>
            <div><span className="text-xs text-text-muted block">Low</span><span className="text-sm text-text-primary">{formatCurrency(quote.low)}</span></div>
            <div><span className="text-xs text-text-muted block">Volume</span><span className="text-sm text-text-primary">{formatCompactNumber(quote.volume)}</span></div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart + Analysis */}
        <div className="lg:col-span-2 space-y-3">
          {/* Timeframe selector */}
          <div className="flex items-center gap-1 bg-surface-1 rounded-lg p-1 border border-surface-3 w-fit">
            {TIMEFRAMES.map(tf => (
              <button
                key={tf.value}
                onClick={() => setInterval(tf.value)}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                  interval === tf.value
                    ? 'bg-brand-600 text-white'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
                )}
              >
                {tf.label}
              </button>
            ))}
          </div>

          {/* Chart */}
          <div ref={chartContainerRef}>
            <TradingViewChart symbol={selectedSymbol} interval={interval} height={450} />
          </div>

          {/* Capture button */}
          <button
            onClick={captureCurrentChart}
            disabled={capturing || !selectedSymbol}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors w-full justify-center',
              capturing ? 'bg-surface-3 text-text-muted' : 'bg-surface-1 hover:bg-surface-2 text-text-primary border border-surface-3'
            )}
          >
            {capturing ? (
              <><Loader2 size={16} className="animate-spin" /> Capturing...</>
            ) : (
              <><Camera size={16} /> Add {tfLabel} Screenshot to List</>
            )}
          </button>

          {/* Snapshot list */}
          {snapshots.length > 0 && (
            <div className="bg-surface-1 rounded-xl border border-surface-3 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-text-primary">
                  Screenshots ({snapshots.length})
                </span>
                <button
                  onClick={() => setSnapshots([])}
                  className="text-xs text-text-muted hover:text-loss transition-colors"
                >
                  Clear all
                </button>
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1">
                {snapshots.map((ss) => (
                  <div key={ss.id} className="relative flex-shrink-0 group">
                    <img
                      src={ss.preview}
                      alt={ss.timeframe}
                      className="w-32 h-20 object-cover rounded-lg border border-surface-3"
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs px-2 py-1 rounded-b-lg text-center font-medium">
                      {ss.timeframe}
                    </div>
                    <button
                      onClick={() => removeSnapshot(ss.id)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-loss rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Analyze button */}
              <button
                onClick={analyzeAll}
                disabled={analyzing}
                className={cn(
                  'flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-colors w-full justify-center',
                  analyzing ? 'bg-surface-3 text-text-muted' : 'bg-brand-600 hover:bg-brand-700 text-white'
                )}
              >
                {analyzing ? (
                  <><Loader2 size={16} className="animate-spin" /> Analyzing {snapshots.length} timeframe{snapshots.length > 1 ? 's' : ''}...</>
                ) : (
                  <><Brain size={16} /> Analyze {snapshots.length} Timeframe{snapshots.length > 1 ? 's' : ''}</>
                )}
              </button>
            </div>
          )}

          {analysisError && (
            <div className="text-sm px-4 py-2.5 rounded-lg bg-loss/10 text-loss">{analysisError}</div>
          )}

          {/* Analysis results */}
          {aiAnalysis && (
            <div className="bg-surface-1 rounded-xl border border-surface-3 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                  <Brain size={16} className="text-brand-400" />
                  AI Analysis
                </h4>
                {aiAnalysis.confidence !== undefined && (
                  <span className={cn(
                    'text-xs font-medium px-2 py-0.5 rounded',
                    aiAnalysis.confidence >= 7 ? 'bg-profit/10 text-profit' :
                    aiAnalysis.confidence >= 4 ? 'bg-yellow-500/10 text-yellow-400' :
                    'bg-loss/10 text-loss'
                  )}>
                    {aiAnalysis.confidence}/10
                  </span>
                )}
              </div>

              {aiAnalysis.direction && (
                <div className="flex items-center gap-3">
                  <span className={cn(
                    'px-3 py-1 rounded-lg text-sm font-bold',
                    aiAnalysis.direction === 'buy' ? 'bg-profit/10 text-profit' : 'bg-loss/10 text-loss'
                  )}>
                    {aiAnalysis.direction.toUpperCase()}
                  </span>
                  <span className="text-sm text-text-secondary">{aiAnalysis.symbol || selectedSymbol}</span>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2 text-sm">
                {aiAnalysis.entry_price && (
                  <div className="bg-surface-2 rounded-lg p-2">
                    <span className="text-xs text-text-muted block">Entry</span>
                    <span className="text-text-primary font-medium">{formatCurrency(aiAnalysis.entry_price)}</span>
                  </div>
                )}
                {aiAnalysis.stop_loss && (
                  <div className="bg-surface-2 rounded-lg p-2">
                    <span className="text-xs text-text-muted block">Stop Loss</span>
                    <span className="text-loss font-medium">{formatCurrency(aiAnalysis.stop_loss)}</span>
                  </div>
                )}
                {aiAnalysis.take_profit && (
                  <div className="bg-surface-2 rounded-lg p-2">
                    <span className="text-xs text-text-muted block">Take Profit</span>
                    <span className="text-profit font-medium">{formatCurrency(aiAnalysis.take_profit)}</span>
                  </div>
                )}
              </div>

              {aiAnalysis.risk_reward_ratio && (
                <div className="text-xs text-text-muted">
                  R:R <span className="text-text-primary font-medium">1:{aiAnalysis.risk_reward_ratio.toFixed(1)}</span>
                </div>
              )}

              {(aiAnalysis.trend || (aiAnalysis.patterns && aiAnalysis.patterns.length > 0)) && (
                <div className="flex flex-wrap gap-1.5">
                  {aiAnalysis.trend && (
                    <span className={cn(
                      'text-xs px-2 py-0.5 rounded',
                      aiAnalysis.trend === 'uptrend' ? 'bg-profit/10 text-profit' :
                      aiAnalysis.trend === 'downtrend' ? 'bg-loss/10 text-loss' :
                      'bg-surface-3 text-text-secondary'
                    )}>{aiAnalysis.trend}</span>
                  )}
                  {aiAnalysis.patterns?.map((p, i) => (
                    <span key={i} className="text-xs px-2 py-0.5 rounded bg-surface-3 text-text-secondary">{p}</span>
                  ))}
                </div>
              )}

              {analysisText && (
                <div className="text-sm text-text-secondary leading-relaxed max-h-96 overflow-y-auto prose prose-invert prose-sm">
                  <div dangerouslySetInnerHTML={{ __html: analysisText.replace(/\n/g, '<br/>') }} />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Trade Form */}
        <div>
          <TradeForm
            symbol={selectedSymbol}
            currentPrice={quote?.price || 0}
            cashBalance={portfolio?.cash_balance || 0}
            currentShares={currentPosition?.quantity || 0}
            onTradeComplete={handleTradeComplete}
            aiSuggestedSl={aiAnalysis?.stop_loss}
            aiSuggestedTp={aiAnalysis?.take_profit}
            aiSuggestedSide={aiAnalysis?.direction}
          />

          {currentPosition && (
            <div className="mt-4 bg-surface-1 rounded-xl border border-surface-3 p-5">
              <h4 className="text-sm font-medium text-text-secondary mb-3">Current Position</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-text-muted">Lots</span>
                  <span className="text-text-primary">{(currentPosition.quantity / 100_000).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Side</span>
                  <span className={currentPosition.side === 'long' ? 'text-profit' : 'text-loss'}>{currentPosition.side?.toUpperCase()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Avg Price</span>
                  <span className="text-text-primary">{formatCurrency(currentPosition.avg_price)}</span>
                </div>
                {quote && (
                  <div className="flex justify-between border-t border-surface-3 pt-2">
                    <span className="text-text-muted">Unrealized P&L</span>
                    <span className={cn('font-medium', getPnlColor(
                      currentPosition.side === 'short'
                        ? (currentPosition.avg_price - quote.price) * currentPosition.quantity
                        : (quote.price - currentPosition.avg_price) * currentPosition.quantity
                    ))}>
                      {formatCurrency(
                        currentPosition.side === 'short'
                          ? (currentPosition.avg_price - quote.price) * currentPosition.quantity
                          : (quote.price - currentPosition.avg_price) * currentPosition.quantity
                      )}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function TradePage() {
  return (
    <Suspense fallback={<div className="text-text-secondary">Loading...</div>}>
      <TradePageContent />
    </Suspense>
  )
}
