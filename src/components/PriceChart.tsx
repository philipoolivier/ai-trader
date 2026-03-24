'use client'

import { useEffect, useRef, useState } from 'react'
import { createChart, ColorType, CandlestickSeries, HistogramSeries } from 'lightweight-charts'
import type { OHLC } from '@/types'

interface PriceChartProps {
  symbol: string
}

export default function PriceChart({ symbol }: PriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const [interval, setInterval] = useState('1day')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<OHLC[]>([])

  useEffect(() => {
    if (!symbol) return

    const fetchData = async () => {
      setLoading(true)
      try {
        const res = await fetch(
          `/api/market/history?symbol=${symbol}&interval=${interval}&outputsize=100`
        )
        const json = await res.json()
        if (Array.isArray(json)) setData(json)
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [symbol, interval])

  useEffect(() => {
    if (!chartContainerRef.current || data.length === 0) return

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#9494a8',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#1a1a24' },
        horzLines: { color: '#1a1a24' },
      },
      crosshair: {
        vertLine: { color: '#5e5e72', width: 1, style: 2 },
        horzLine: { color: '#5e5e72', width: 1, style: 2 },
      },
      timeScale: {
        borderColor: '#232330',
        timeVisible: interval.includes('min') || interval.includes('hour'),
      },
      rightPriceScale: {
        borderColor: '#232330',
      },
      width: chartContainerRef.current.clientWidth,
      height: 400,
    })

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    })

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    })

    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    })

    const formattedCandles = data.map((d) => ({
      time: d.time.split(' ')[0],
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }))

    const formattedVolume = data.map((d) => ({
      time: d.time.split(' ')[0],
      value: d.volume,
      color: d.close >= d.open ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
    }))

    candleSeries.setData(formattedCandles as Parameters<typeof candleSeries.setData>[0])
    volumeSeries.setData(formattedVolume as Parameters<typeof volumeSeries.setData>[0])

    chart.timeScale().fitContent()

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth })
      }
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.remove()
    }
  }, [data, interval])

  const intervals = [
    { label: '5m', value: '5min' },
    { label: '15m', value: '15min' },
    { label: '1H', value: '1h' },
    { label: '1D', value: '1day' },
    { label: '1W', value: '1week' },
  ]

  if (!symbol) {
    return (
      <div className="h-[400px] flex items-center justify-center text-text-muted text-sm">
        Select a stock to view chart
      </div>
    )
  }

  return (
    <div>
      <div className="flex gap-1 mb-3">
        {intervals.map((i) => (
          <button
            key={i.value}
            onClick={() => setInterval(i.value)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              interval === i.value
                ? 'bg-brand-600 text-white'
                : 'bg-surface-2 text-text-secondary hover:text-text-primary'
            }`}
          >
            {i.label}
          </button>
        ))}
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
