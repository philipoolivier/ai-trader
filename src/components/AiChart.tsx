'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { Brain, Loader2 } from 'lucide-react'
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
  { label: '5m', value: '5' },
  { label: '15m', value: '15' },
  { label: '1H', value: '60' },
  { label: '4H', value: '240' },
  { label: '1D', value: 'D' },
  { label: '1W', value: 'W' },
]

const TV_TO_TWELVE: Record<string, string> = {
  '5': '5min', '15': '15min', '60': '1h', '240': '4h', 'D': '1day', 'W': '1week',
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
  const [fetchingData, setFetchingData] = useState(false)

  // Memoize studies array to prevent TradingView widget re-renders
  const memoizedStudies = useMemo(() => tvStudies, [JSON.stringify(tvStudies)])

  // Fetch OHLC data whenever symbol or interval changes
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

  // Pre-fetch data on mount and when symbol/interval change
  useEffect(() => {
    fetchOhlcData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, interval])

  const handleAnalyze = async () => {
    // Always fetch fresh data before analysis
    let data = ohlcData
    if (data.length === 0) {
      data = await fetchOhlcData()
    }

    if (data.length === 0) {
      // Still no data — analyze without OHLC (screenshot-style with just the symbol)
      onAnalyze([], [])
      return
    }

    const indicatorValues = indicators
      .filter((c) => c.visible)
      .map((c) => computeIndicator(data, c))
    onAnalyze(data, indicatorValues)
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
          {analyzing ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Brain size={14} />
          )}
          {analyzing ? 'Analyzing...' : fetchingData ? 'Loading data...' : 'Analyze This Chart'}
        </button>
      </div>

      <TradingViewChart
        symbol={symbol}
        interval={interval}
        height={650}
        studies={memoizedStudies}
      />
    </div>
  )
}
