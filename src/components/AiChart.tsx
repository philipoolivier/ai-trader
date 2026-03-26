'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { Brain, Loader2, Camera, X } from 'lucide-react'
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

const INTERVALS = [
  { label: '1m', value: '1' },
  { label: '5m', value: '5' },
  { label: '15m', value: '15' },
  { label: '1H', value: '60' },
  { label: '4H', value: '240' },
  { label: '1D', value: 'D' },
  { label: '1W', value: 'W' },
]

const TV_TO_TWELVE: Record<string, string> = {
  '1': '1min', '5': '5min', '15': '15min', '60': '1h', '240': '4h', 'D': '1day', 'W': '1week',
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
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const prevSymbolRef = useRef(symbol)

  // When symbol changes, save current snapshots and load previous ones
  useEffect(() => {
    if (prevSymbolRef.current !== symbol) {
      // Save current symbol's snapshots
      if (prevSymbolRef.current && snapshots.length > 0) {
        setAllSnapshots(prev => ({ ...prev, [prevSymbolRef.current]: snapshots }))
      }
      // Load new symbol's snapshots (or empty)
      setSnapshots(allSnapshots[symbol] || [])
      prevSymbolRef.current = symbol
    }
  }, [symbol, snapshots, allSnapshots])

  const memoizedStudies = useMemo(() => tvStudies, [JSON.stringify(tvStudies)])

  const tfLabel = INTERVALS.find(i => i.value === interval)?.label || interval

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

  useEffect(() => {
    fetchOhlcData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, interval])

  const handleAnalyze = async () => {
    let data = ohlcData
    if (data.length === 0) {
      data = await fetchOhlcData()
    }
    if (data.length === 0) {
      onAnalyze([], [])
      return
    }
    const indicatorValues = indicators
      .filter((c) => c.visible)
      .map((c) => computeIndicator(data, c))
    onAnalyze(data, indicatorValues)
  }

  const captureChart = async () => {
    if (!symbol) return
    setCapturing(true)
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
        console.error('Capture failed', err)
      }
    } finally {
      setCapturing(false)
    }
  }

  const removeSnapshot = (id: string) => {
    setSnapshots(prev => prev.filter(s => s.id !== id))
  }

  const handleScreenshotAnalyze = () => {
    if (snapshots.length === 0 || !onScreenshotAnalyze) return
    onScreenshotAnalyze(
      snapshots.map(s => s.base64),
      snapshots.map(s => s.mimeType)
    )
  }

  if (!symbol) {
    return (
      <div className="bg-surface-1 rounded-xl border border-surface-3 h-[650px] flex items-center justify-center text-text-muted text-sm">
        Select a symbol to view chart
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Timeframe selector */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1">
          {INTERVALS.map((i) => (
            <button
              key={i.value}
              onClick={() => onIntervalChange(i.value)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                interval === i.value ? 'bg-brand-600 text-white' : 'bg-surface-2 text-text-secondary hover:text-text-primary'
              )}
            >
              {i.label}
            </button>
          ))}
        </div>
        <button
          onClick={handleAnalyze}
          disabled={analyzing}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {analyzing ? <Loader2 size={14} className="animate-spin" /> : <Brain size={14} />}
          {analyzing ? 'Analyzing...' : fetchingData ? 'Loading data...' : 'Analyze This Chart'}
        </button>
      </div>

      {/* Chart */}
      <div ref={chartContainerRef}>
        <TradingViewChart
          symbol={symbol}
          interval={interval}
          height={650}
          studies={memoizedStudies}
        />
      </div>

      {/* Screenshot capture button */}
      <button
        onClick={captureChart}
        disabled={capturing}
        className={cn(
          'flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors w-full justify-center',
          capturing
            ? 'bg-surface-3 text-text-muted'
            : 'bg-surface-1 hover:bg-surface-2 text-text-primary border border-surface-3'
        )}
      >
        {capturing ? (
          <><Loader2 size={16} className="animate-spin" /> Capturing...</>
        ) : (
          <><Camera size={16} /> Add Screenshot to List</>
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

          <button
            onClick={handleScreenshotAnalyze}
            disabled={analyzing}
            className={cn(
              'flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-colors w-full justify-center',
              analyzing
                ? 'bg-surface-3 text-text-muted'
                : 'bg-brand-600 hover:bg-brand-700 text-white'
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
    </div>
  )
}
