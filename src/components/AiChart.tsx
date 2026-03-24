'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createChart, ColorType } from 'lightweight-charts'
import { Brain } from 'lucide-react'
import { cn } from '@/lib/utils'
import { computeIndicator } from '@/lib/indicators'
import type { OHLC, IndicatorConfig, IndicatorValues } from '@/types'

interface AiChartProps {
  symbol: string
  interval: string
  onIntervalChange: (interval: string) => void
  indicators: IndicatorConfig[]
  onAnalyze: (ohlcData: OHLC[], indicatorValues: IndicatorValues[]) => void
  analyzing: boolean
}

const INTERVALS = [
  { label: '5m', value: '5min' },
  { label: '15m', value: '15min' },
  { label: '1H', value: '1h' },
  { label: '4H', value: '4h' },
  { label: '1D', value: '1day' },
  { label: '1W', value: '1week' },
]

const INDICATOR_COLORS = ['#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#06b6d4']

export default function AiChart({
  symbol,
  interval,
  onIntervalChange,
  indicators,
  onAnalyze,
  analyzing,
}: AiChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const [data, setData] = useState<OHLC[]>([])
  const [loading, setLoading] = useState(false)

  const fetchData = useCallback(async () => {
    if (!symbol) return
    setLoading(true)
    try {
      const res = await fetch(`/api/market/history?symbol=${symbol}&interval=${interval}&outputsize=120`)
      const json = await res.json()
      if (Array.isArray(json)) setData(json)
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [symbol, interval])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    if (!chartContainerRef.current || data.length === 0) return

    const chart = createChart(chartContainerRef.current, {
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#9494a8', fontSize: 11 },
      grid: { vertLines: { color: '#1a1a24' }, horzLines: { color: '#1a1a24' } },
      crosshair: { vertLine: { color: '#5e5e72', width: 1, style: 2 }, horzLine: { color: '#5e5e72', width: 1, style: 2 } },
      timeScale: { borderColor: '#232330', timeVisible: ['5min', '15min', '1h', '4h'].includes(interval) },
      rightPriceScale: { borderColor: '#232330' },
      width: chartContainerRef.current.clientWidth,
      height: 400,
    })

    // Candlestick series
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#22c55e', downColor: '#ef4444',
      borderUpColor: '#22c55e', borderDownColor: '#ef4444',
      wickUpColor: '#22c55e', wickDownColor: '#ef4444',
    })

    // Volume series
    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' }, priceScaleId: 'volume',
    })
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } })

    const formattedCandles = data.map((d) => ({
      time: d.time.split(' ')[0] as string,
      open: d.open, high: d.high, low: d.low, close: d.close,
    }))
    const formattedVolume = data.map((d) => ({
      time: d.time.split(' ')[0] as string,
      value: d.volume,
      color: d.close >= d.open ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
    }))

    candleSeries.setData(formattedCandles as Parameters<typeof candleSeries.setData>[0])
    volumeSeries.setData(formattedVolume as Parameters<typeof volumeSeries.setData>[0])

    // Overlay indicators
    let colorIdx = 0
    for (const config of indicators) {
      if (!config.visible) continue
      const computed = computeIndicator(data, config)

      for (const [seriesName, values] of Object.entries(computed.values)) {
        const isOverlay = ['ema', 'sma', 'bollinger'].includes(config.type)
        const color = INDICATOR_COLORS[colorIdx % INDICATOR_COLORS.length]
        colorIdx++

        if (isOverlay) {
          const lineSeries = chart.addLineSeries({
            color,
            lineWidth: 1,
            priceScaleId: 'right',
            title: seriesName,
          })
          const lineData = values
            .map((v, i) => v !== null ? { time: data[i].time.split(' ')[0] as string, value: v } : null)
            .filter(Boolean) as { time: string; value: number }[]
          lineSeries.setData(lineData as Parameters<typeof lineSeries.setData>[0])
        } else {
          // Oscillator - separate pane
          const lineSeries = chart.addLineSeries({
            color,
            lineWidth: 1,
            priceScaleId: seriesName,
            title: seriesName,
          })
          lineSeries.priceScale().applyOptions({
            scaleMargins: { top: 0.75, bottom: 0.02 },
          })
          const lineData = values
            .map((v, i) => v !== null ? { time: data[i].time.split(' ')[0] as string, value: v } : null)
            .filter(Boolean) as { time: string; value: number }[]
          lineSeries.setData(lineData as Parameters<typeof lineSeries.setData>[0])
        }
      }
    }

    chart.timeScale().fitContent()

    const handleResize = () => {
      if (chartContainerRef.current) chart.applyOptions({ width: chartContainerRef.current.clientWidth })
    }
    window.addEventListener('resize', handleResize)
    return () => { window.removeEventListener('resize', handleResize); chart.remove() }
  }, [data, indicators, interval])

  const handleAnalyze = () => {
    const indicatorValues = indicators
      .filter((c) => c.visible)
      .map((c) => computeIndicator(data, c))
    onAnalyze(data, indicatorValues)
  }

  if (!symbol) {
    return (
      <div className="bg-surface-1 rounded-xl border border-surface-3 h-[400px] flex items-center justify-center text-text-muted text-sm">
        Select a symbol to view chart
      </div>
    )
  }

  return (
    <div className="bg-surface-1 rounded-xl border border-surface-3 p-4">
      <div className="flex items-center justify-between mb-3">
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
          disabled={analyzing || data.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Brain size={14} className={analyzing ? 'animate-pulse' : ''} />
          {analyzing ? 'Analyzing...' : 'Analyze This Chart'}
        </button>
      </div>

      <div className="relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface-1/50 z-10">
            <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <div ref={chartContainerRef} />
      </div>
    </div>
  )
}
