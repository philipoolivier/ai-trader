'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { Brain, Loader2, Camera, X, Zap, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import TradingViewChart from '@/components/TradingViewChart'
import { computeIndicator } from '@/lib/indicators'
import type { OHLC, IndicatorConfig, IndicatorValues } from '@/types'

interface AiChartProps {
  symbol: string
  interval: string
  onIntervalChange: (interval: string) => void
  indicators: IndicatorConfig[]
  onAnalyze: (ohlcData: OHLC[], indicatorValues: IndicatorValues[]) => void
  analyzing: boolean
  tvStudies?: string[]
  onScreenshotAnalyze?: (images: string[], mimeTypes: string[]) => void
}

interface ChartSnapshot {
  id: string
  base64: string
  mimeType: string
  timeframe: string
  preview: string
}

const ALL_TIMEFRAMES = [
  { label: '1m', value: '1', default: false },
  { label: '5m', value: '5', default: true },
  { label: '15m', value: '15', default: true },
  { label: '30m', value: '30', default: false },
  { label: '1H', value: '60', default: true },
  { label: '4H', value: '240', default: true },
  { label: 'D', value: 'D', default: false },
  { label: 'W', value: 'W', default: false },
]

const TV_TO_TWELVE: Record<string, string> = {
  '1': '1min', '5': '5min', '15': '15min', '30': '30min', '60': '1h', '240': '4h', 'D': '1day', 'W': '1week',
}

export default function AiChart({
  symbol,
  interval,
  onIntervalChange,
  indicators,
  onAnalyze,
  analyzing,
  tvStudies = [],
  onScreenshotAnalyze,
}: AiChartProps) {
  const [ohlcData, setOhlcData] = useState<OHLC[]>([])
  const [fetchingData, setFetchingData] = useState(false)
  const [snapshots, setSnapshots] = useState<ChartSnapshot[]>([])
  const [allSnapshots, setAllSnapshots] = useState<Record<string, ChartSnapshot[]>>({})
  const [capturing, setCapturing] = useState(false)
  const [autoCapturing, setAutoCapturing] = useState(false)
  const [captureProgress, setCaptureProgress] = useState('')
  const [extensionReady, setExtensionReady] = useState(false)
  const [selectedTFs, setSelectedTFs] = useState<string[]>(
    ALL_TIMEFRAMES.filter(t => t.default).map(t => t.label)
  )
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const prevSymbolRef = useRef(symbol)

  const memoizedStudies = useMemo(() => tvStudies, [JSON.stringify(tvStudies)])

  // Listen for Chrome extension messages
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'AI_TRADER_EXTENSION_READY') {
        setExtensionReady(true)
      }
      if (event.data?.type === 'AI_TRADER_CAPTURE_RESULT') {
        const screenshots = event.data.screenshots as { timeframe: string; base64: string; mimeType: string; dataUrl: string }[]
        const newSnapshots = screenshots.map(ss => ({
          id: `auto-${Date.now()}-${ss.timeframe}`,
          base64: ss.base64,
          mimeType: ss.mimeType,
          timeframe: ss.timeframe,
          preview: ss.dataUrl,
        }))
        setSnapshots(newSnapshots)
        setAutoCapturing(false)
        setCaptureProgress('')
      }
      if (event.data?.type === 'AI_TRADER_CAPTURE_ERROR') {
        setAutoCapturing(false)
        setCaptureProgress('')
      }
      if (event.data?.type === 'AI_TRADER_CAPTURE_PROGRESS') {
        setCaptureProgress(event.data.message)
      }
    }
    window.addEventListener('message', handleMessage)
    window.postMessage({ type: 'AI_TRADER_PING' }, '*')
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  // Save/restore snapshots per symbol
  useEffect(() => {
    if (prevSymbolRef.current !== symbol) {
      if (prevSymbolRef.current && snapshots.length > 0) {
        setAllSnapshots(prev => ({ ...prev, [prevSymbolRef.current]: snapshots }))
      }
      setSnapshots(allSnapshots[symbol] || [])
      prevSymbolRef.current = symbol
    }
  }, [symbol, snapshots, allSnapshots])

  const fetchOhlcData = useCallback(async () => {
    if (!symbol) return []
    setFetchingData(true)
    try {
      const twelveInterval = TV_TO_TWELVE[interval] || '1day'
      const res = await fetch(`/api/market/history?symbol=${symbol}&interval=${twelveInterval}&outputsize=100`)
      const json = await res.json()
      if (Array.isArray(json) && json.length > 0) {
        setOhlcData(json)
        return json
      }
    } catch { /* ignore */ }
    finally { setFetchingData(false) }
    return ohlcData
  }, [symbol, interval, ohlcData])

  useEffect(() => { fetchOhlcData() }, [symbol, interval])

  const handleAnalyze = async () => {
    let data = ohlcData
    if (data.length === 0) data = await fetchOhlcData()
    if (data.length === 0) { onAnalyze([], []); return }
    const indicatorValues = indicators.filter(c => c.visible).map(c => computeIndicator(data, c))
    onAnalyze(data, indicatorValues)
  }

  const captureChart = async () => {
    if (!symbol) return
    setCapturing(true)
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true, preferCurrentTab: true,
      } as DisplayMediaStreamOptions)
      const video = document.createElement('video')
      video.srcObject = stream
      video.autoplay = true
      await new Promise<void>(r => { video.onloadedmetadata = () => { video.play(); setTimeout(r, 500) } })
      const canvas = document.createElement('canvas')
      if (chartContainerRef.current) {
        const rect = chartContainerRef.current.getBoundingClientRect()
        const sx = video.videoWidth / window.innerWidth, sy = video.videoHeight / window.innerHeight
        canvas.width = Math.round(rect.width * sx); canvas.height = Math.round(rect.height * sy)
        canvas.getContext('2d')!.drawImage(video, Math.round(rect.left * sx), Math.round(rect.top * sy), canvas.width, canvas.height, 0, 0, canvas.width, canvas.height)
      } else {
        canvas.width = video.videoWidth; canvas.height = video.videoHeight
        canvas.getContext('2d')!.drawImage(video, 0, 0)
      }
      stream.getTracks().forEach(t => t.stop()); video.srcObject = null
      const dataUrl = canvas.toDataURL('image/png')
      const tfLabel = ALL_TIMEFRAMES.find(t => t.value === interval)?.label || interval
      setSnapshots(prev => [...prev, { id: `snap-${Date.now()}`, base64: dataUrl.split(',')[1], mimeType: 'image/png', timeframe: tfLabel, preview: dataUrl }])
    } catch (err) { if (err instanceof Error && err.name !== 'NotAllowedError') console.error(err) }
    finally { setCapturing(false) }
  }

  const handleAutoCapture = () => {
    if (!extensionReady || !symbol) return
    setAutoCapturing(true)
    setSnapshots([])
    setCaptureProgress('Starting capture...')
    const timeframes = selectedTFs.map(label => {
      const tf = ALL_TIMEFRAMES.find(t => t.label === label)
      return tf ? { label: tf.label, interval: tf.value } : null
    }).filter(Boolean)

    window.postMessage({
      type: 'AI_TRADER_CAPTURE_REQUEST',
      symbol,
      timeframes,
    }, '*')
  }

  const toggleTF = (label: string) => {
    setSelectedTFs(prev =>
      prev.includes(label) ? prev.filter(t => t !== label) : [...prev, label]
    )
  }

  const handleScreenshotAnalyze = () => {
    if (snapshots.length === 0 || !onScreenshotAnalyze) return
    onScreenshotAnalyze(snapshots.map(s => s.base64), snapshots.map(s => s.mimeType))
  }

  if (!symbol) {
    return (
      <div className="bg-surface-1 rounded-xl border border-surface-3 h-[400px] flex items-center justify-center text-text-muted text-sm">
        Select a symbol to view chart
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Timeframe selector for live chart */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1">
          {ALL_TIMEFRAMES.map(tf => (
            <button
              key={tf.value}
              onClick={() => onIntervalChange(tf.value)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                interval === tf.value ? 'bg-brand-600 text-white' : 'bg-surface-2 text-text-secondary hover:text-text-primary'
              )}
            >
              {tf.label}
            </button>
          ))}
        </div>
        <button
          onClick={handleAnalyze}
          disabled={analyzing}
          className="flex items-center gap-2 px-4 py-2 bg-surface-2 hover:bg-surface-3 disabled:opacity-50 text-text-primary text-sm font-medium rounded-lg transition-colors border border-surface-3"
        >
          {analyzing ? <Loader2 size={14} className="animate-spin" /> : <Brain size={14} />}
          {analyzing ? 'Analyzing...' : 'Analyze Data'}
        </button>
      </div>

      {/* Chart area */}
      <div ref={chartContainerRef}>
        {extensionReady ? (
          /* Nice visual when extension handles chart capture */
          <div className="bg-surface-1 rounded-xl border border-surface-3 p-8 text-center" style={{ minHeight: 300 }}>
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-brand-600/10 flex items-center justify-center">
                <TrendingUp size={32} className="text-brand-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-text-primary mb-1">{symbol}</h3>
                <p className="text-sm text-text-secondary">
                  Use Auto Capture to grab your TradingView charts with all your indicators
                </p>
              </div>

              {/* TF selector for auto capture */}
              <div className="flex flex-col items-center gap-2">
                <span className="text-xs text-text-muted">Select timeframes to capture:</span>
                <div className="flex gap-1.5">
                  {ALL_TIMEFRAMES.map(tf => (
                    <button
                      key={tf.label}
                      onClick={() => toggleTF(tf.label)}
                      className={cn(
                        'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors border',
                        selectedTFs.includes(tf.label)
                          ? 'bg-brand-600 text-white border-brand-600'
                          : 'bg-surface-2 text-text-muted border-surface-3 hover:text-text-primary'
                      )}
                    >
                      {tf.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Auto capture button */}
              <button
                onClick={handleAutoCapture}
                disabled={autoCapturing || selectedTFs.length === 0}
                className={cn(
                  'flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-colors',
                  autoCapturing ? 'bg-surface-3 text-text-muted' : 'bg-brand-600 hover:bg-brand-700 text-white'
                )}
              >
                {autoCapturing ? (
                  <><Loader2 size={16} className="animate-spin" /> {captureProgress || 'Capturing...'}</>
                ) : (
                  <><Zap size={16} /> Auto Capture {selectedTFs.length} Timeframes</>
                )}
              </button>

              {/* Manual capture option */}
              <button
                onClick={captureChart}
                disabled={capturing}
                className="text-xs text-text-muted hover:text-text-secondary transition-colors"
              >
                {capturing ? 'Capturing...' : 'or manually screenshot current screen'}
              </button>
            </div>
          </div>
        ) : (
          /* Show TradingView widget when extension not installed */
          <TradingViewChart symbol={symbol} interval={interval} height={450} studies={memoizedStudies} />
        )}
      </div>

      {/* Manual capture for non-extension users */}
      {!extensionReady && (
        <button
          onClick={captureChart}
          disabled={capturing}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors w-full justify-center',
            capturing ? 'bg-surface-3 text-text-muted' : 'bg-surface-1 hover:bg-surface-2 text-text-primary border border-surface-3'
          )}
        >
          {capturing ? <><Loader2 size={16} className="animate-spin" /> Capturing...</> : <><Camera size={16} /> Add Screenshot to List</>}
        </button>
      )}

      {/* Snapshot list */}
      {snapshots.length > 0 && (
        <div className="bg-surface-1 rounded-xl border border-surface-3 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-text-primary">
              Screenshots ({snapshots.length})
            </span>
            <button onClick={() => setSnapshots([])} className="text-xs text-text-muted hover:text-loss transition-colors">
              Clear all
            </button>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {snapshots.map(ss => (
              <div key={ss.id} className="relative flex-shrink-0 group">
                <img src={ss.preview} alt={ss.timeframe} className="w-32 h-20 object-cover rounded-lg border border-surface-3" />
                <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs px-2 py-1 rounded-b-lg text-center font-medium">
                  {ss.timeframe}
                </div>
                <button
                  onClick={() => setSnapshots(prev => prev.filter(s => s.id !== ss.id))}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-loss rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={handleScreenshotAnalyze}
            disabled={analyzing}
            className={cn(
              'flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-colors w-full justify-center',
              analyzing ? 'bg-surface-3 text-text-muted' : 'bg-brand-600 hover:bg-brand-700 text-white'
            )}
          >
            {analyzing ? (
              <><Loader2 size={16} className="animate-spin" /> Analyzing...</>
            ) : (
              <><Brain size={16} /> Analyze {snapshots.length} Timeframe{snapshots.length > 1 ? 's' : ''}</>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
