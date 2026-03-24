'use client'

import { useEffect, useRef, memo } from 'react'

interface TradingViewChartProps {
  symbol: string
  interval?: string
  height?: number
  studies?: string[]
}

function TradingViewChartInner({ symbol, interval = 'D', height = 500, studies = [] }: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current || !symbol) return

    // Clear previous widget
    containerRef.current.innerHTML = ''

    // Build studies array - TradingView built-in study IDs
    const chartStudies = [...studies]

    const script = document.createElement('script')
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js'
    script.type = 'text/javascript'
    script.async = true
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: symbol,
      interval: interval,
      timezone: 'Etc/UTC',
      theme: 'dark',
      style: '1',
      locale: 'en',
      backgroundColor: 'rgba(10, 10, 15, 1)',
      gridColor: 'rgba(26, 26, 36, 1)',
      allow_symbol_change: true,
      calendar: false,
      support_host: 'https://www.tradingview.com',
      hide_volume: false,
      studies: chartStudies,
    })

    const widgetDiv = document.createElement('div')
    widgetDiv.className = 'tradingview-widget-container__widget'
    widgetDiv.style.height = `calc(${height}px - 32px)`
    widgetDiv.style.width = '100%'

    const copyrightDiv = document.createElement('div')
    copyrightDiv.className = 'tradingview-widget-copyright'

    containerRef.current.appendChild(widgetDiv)
    containerRef.current.appendChild(copyrightDiv)
    containerRef.current.appendChild(script)

    const container = containerRef.current
    return () => {
      if (container) {
        container.innerHTML = ''
      }
    }
  }, [symbol, interval, height, studies])

  if (!symbol) {
    return (
      <div
        className="bg-surface-1 rounded-xl border border-surface-3 flex items-center justify-center text-text-muted text-sm"
        style={{ height }}
      >
        Select a symbol to view chart
      </div>
    )
  }

  return (
    <div className="tradingview-widget-container rounded-xl overflow-hidden border border-surface-3" style={{ height }}>
      <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
    </div>
  )
}

export default memo(TradingViewChartInner)
