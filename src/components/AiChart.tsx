'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import TradingViewChart from '@/components/TradingViewChart'

interface AiChartProps {
  symbol: string
  interval: string
  onIntervalChange: (interval: string) => void
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

export default function AiChart({
  symbol,
  interval,
  onIntervalChange,
  tvStudies = [],
}: AiChartProps) {
  const memoizedStudies = useMemo(() => tvStudies, [JSON.stringify(tvStudies)])

  if (!symbol) {
    return (
      <div className="bg-surface-1 rounded-xl border border-surface-3 h-[650px] flex items-center justify-center text-text-muted text-sm">
        Select a symbol to view chart
      </div>
    )
  }

  return (
    <div className="space-y-3">
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

      <TradingViewChart
        symbol={symbol}
        interval={interval}
        height={650}
        studies={memoizedStudies}
      />
    </div>
  )
}
