'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import StockSearch from '@/components/StockSearch'
import TradingViewChart from '@/components/TradingViewChart'
import TradeForm from '@/components/TradeForm'
import { formatCurrency, formatPercent, formatCompactNumber, getPnlColor, cn } from '@/lib/utils'
import type { Quote, Position, Portfolio } from '@/types'

function TradePageContent() {
  const searchParams = useSearchParams()
  const initialSymbol = searchParams.get('symbol') || ''

  const [selectedSymbol, setSelectedSymbol] = useState(initialSymbol)
  const [selectedName, setSelectedName] = useState('')
  const [quote, setQuote] = useState<Quote | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [positions, setPositions] = useState<Position[]>([])

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

  useEffect(() => {
    fetchPortfolio()
  }, [fetchPortfolio])

  useEffect(() => {
    if (selectedSymbol) fetchQuote(selectedSymbol)
  }, [selectedSymbol, fetchQuote])

  const currentPosition = positions.find(
    (p) => p.symbol === selectedSymbol.toUpperCase() && p.quantity > 0
  )

  const handleTradeComplete = () => {
    fetchPortfolio()
    if (selectedSymbol) fetchQuote(selectedSymbol)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-text-primary">Trade</h1>

      {/* Search */}
      <StockSearch
        onSelect={(symbol, name) => {
          setSelectedSymbol(symbol)
          setSelectedName(name)
        }}
        placeholder="Search stocks, ETFs, crypto..."
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
                {quote.change >= 0 ? '+' : ''}
                {formatCurrency(quote.change)} ({formatPercent(quote.percent_change)})
              </div>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-4 mt-4 pt-4 border-t border-surface-3">
            <div>
              <span className="text-xs text-text-muted block">Open</span>
              <span className="text-sm text-text-primary">{formatCurrency(quote.open)}</span>
            </div>
            <div>
              <span className="text-xs text-text-muted block">High</span>
              <span className="text-sm text-text-primary">{formatCurrency(quote.high)}</span>
            </div>
            <div>
              <span className="text-xs text-text-muted block">Low</span>
              <span className="text-sm text-text-primary">{formatCurrency(quote.low)}</span>
            </div>
            <div>
              <span className="text-xs text-text-muted block">Volume</span>
              <span className="text-sm text-text-primary">{formatCompactNumber(quote.volume)}</span>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart */}
        <div className="lg:col-span-2 bg-surface-1 rounded-xl border border-surface-3 p-5">
          <TradingViewChart symbol={selectedSymbol} interval="D" height={450} />
        </div>

        {/* Trade Form */}
        <div>
          <TradeForm
            symbol={selectedSymbol}
            currentPrice={quote?.price || 0}
            cashBalance={portfolio?.cash_balance || 0}
            currentShares={currentPosition?.quantity || 0}
            onTradeComplete={handleTradeComplete}
          />

          {/* Current Position Info */}
          {currentPosition && (
            <div className="mt-4 bg-surface-1 rounded-xl border border-surface-3 p-5">
              <h4 className="text-sm font-medium text-text-secondary mb-3">
                Current Position
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-text-muted">Shares</span>
                  <span className="text-text-primary">{currentPosition.quantity}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Avg Price</span>
                  <span className="text-text-primary">
                    {formatCurrency(currentPosition.avg_price)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Cost Basis</span>
                  <span className="text-text-primary">
                    {formatCurrency(currentPosition.avg_price * currentPosition.quantity)}
                  </span>
                </div>
                {quote && (
                  <>
                    <div className="flex justify-between border-t border-surface-3 pt-2">
                      <span className="text-text-muted">Market Value</span>
                      <span className="text-text-primary">
                        {formatCurrency(quote.price * currentPosition.quantity)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-muted">Unrealized P&L</span>
                      <span
                        className={cn(
                          'font-medium',
                          getPnlColor(
                            (quote.price - currentPosition.avg_price) * currentPosition.quantity
                          )
                        )}
                      >
                        {formatCurrency(
                          (quote.price - currentPosition.avg_price) * currentPosition.quantity
                        )}
                      </span>
                    </div>
                  </>
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
