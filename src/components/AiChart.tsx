'use client'

import { useState, useCallback, useEffect } from 'react'
import { Brain } from 'lucide-react'
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
}

const INTERVALS = [
  { label: '5m', value: '5', tvValue: '5' },
  { label: '15m', value: '15', tvValue: '15' },
  { label: '1H', value: '60', tvValue: '60' },
  { label: '4H', value: '240', tvValue: '240' },
  { label: '1D', value: 'D', tvValue: 'D' },
  { label: '1W', value: 'W', tvValue: 'W' },
]

// Map TV intervals to TwelveData intervals for data fetching
const TV_TO_TWELVE: Record<string, string> = {
  '5': '5min',
  '15': '15min',
  '60': '1h',
  '240': '4h',
  'D': '1day',
  'W': '1week',
}

export default function AiChart({
  symbol,
  interval,
  onIntervalChange,
  indicators,
  onAnalyze,
  analyzing,
  tvStudies = [],
}: AiChartProps) {
  const [ohlcData, setOhlcData] = useState<OHLC[]>([])
  const [dataLoading, setDataLoading] = useState(false)

  // Fetch OHLC data from TwelveData for AI analysis (separate from chart rendering)
  const fetchOhlcForAnalysis = useCallback(async () => {
    if (!symbol) return
    setDataLoading(true)
    try {
      const twelveInterval = TV_TO_TWELVE[interval] || '1day'
      const res = await fetch(`/api/market/history?symbol=${symbol}&interval=${twelveInterval}&outputsize=100`)
      const json = await res.json()
      if (Array.isArray(json)) setOhlcData(json)
    } catch { /* ignore */ }
    finally { setDataLoading(false) }
  }, [symbol, interval])

  useEffect(() => { fetchOhlcForAnalysis() }, [fetchOhlcForAnalysis])

  const handleAnalyze = async () => {
    // Ensure we have fresh data
    if (ohlcData.length === 0) {
      await fetchOhlcForAnalysis()
    }
    const indicatorValues = indicators
      .filter((c) => c.visible)
      .map((c) => computeIndicator(ohlcData, c))
    onAnalyze(ohlcData, indicatorValues)
  }

  if (!symbol) {
    return (
      <div className="bg-surface-1 rounded-xl border border-surface-3 h-[500px] flex items-center justify-center text-text-muted text-sm">
        Select a symbol to view chart
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
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
          disabled={analyzing || dataLoading}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Brain size={14} className={analyzing ? 'animate-pulse' : ''} />
          {analyzing ? 'Analyzing...' : 'Analyze This Chart'}
        </button>
      </div>

      <TradingViewChart symbol={symbol} interval={interval} height={500} studies={tvStudies} />
    </div>
  )
}
