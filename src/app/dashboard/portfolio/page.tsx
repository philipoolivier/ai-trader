'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { DollarSign, TrendingUp, Target, Percent, RotateCcw } from 'lucide-react'
import PendingOrdersPanel from '@/components/PendingOrdersPanel'
import StatCard from '@/components/StatCard'
import PositionsTable from '@/components/PositionsTable'
import PortfolioChart from '@/components/PortfolioChart'
import TradeHistory from '@/components/TradeHistory'
import { formatCurrency } from '@/lib/utils'
import type { Portfolio, Position, Trade, PositionWithQuote, PortfolioSnapshot } from '@/types'

interface PortfolioData {
  portfolio: Portfolio
  positions: Position[]
  trades: Trade[]
  snapshots: PortfolioSnapshot[]
}

export default function PortfolioPage() {
  const [data, setData] = useState<PortfolioData | null>(null)
  const [positionsWithQuotes, setPositionsWithQuotes] = useState<PositionWithQuote[]>([])
  const [loading, setLoading] = useState(true)
  const [resetting, setResetting] = useState(false)
  const router = useRouter()

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/portfolio')
      const json = await res.json()
      if (json.portfolio) {
        setData(json)

        const activePositions = (json.positions || []).filter(
          (p: Position) => p.quantity > 0
        )

        if (activePositions.length > 0) {
          const withQuotes = await Promise.all(
            activePositions.map(async (pos: Position) => {
              try {
                const quoteRes = await fetch(`/api/market/quote?symbol=${pos.symbol}`)
                const quote = await quoteRes.json()
                const currentPrice = quote.price || pos.avg_price
                const marketValue = currentPrice * pos.quantity
                const unrealizedPnl = pos.side === 'short'
                  ? (pos.avg_price - currentPrice) * pos.quantity
                  : (currentPrice - pos.avg_price) * pos.quantity
                const unrealizedPnlPercent = pos.side === 'short'
                  ? ((pos.avg_price - currentPrice) / pos.avg_price) * 100
                  : ((currentPrice - pos.avg_price) / pos.avg_price) * 100
                const latestTrade = (json.trades || []).find(
                  (t: { symbol: string; stop_loss?: number; take_profit?: number }) =>
                    t.symbol === pos.symbol && (t.stop_loss || t.take_profit)
                )
                return {
                  ...pos,
                  current_price: currentPrice,
                  market_value: marketValue,
                  unrealized_pnl: unrealizedPnl,
                  unrealized_pnl_percent: unrealizedPnlPercent,
                  name: quote.name,
                  stop_loss: latestTrade?.stop_loss || null,
                  take_profit: latestTrade?.take_profit || null,
                }
              } catch {
                return {
                  ...pos,
                  current_price: pos.avg_price,
                  market_value: pos.avg_price * pos.quantity,
                  unrealized_pnl: 0,
                  unrealized_pnl_percent: 0,
                }
              }
            })
          )
          setPositionsWithQuotes(withQuotes)
        } else {
          setPositionsWithQuotes([])
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [fetchData])

  const handleReset = async (deleteHistory: boolean = false) => {
    const msg = deleteHistory
      ? 'Reset portfolio to $500 AND delete all trade history? This cannot be undone.'
      : 'Reset portfolio to $500? Open positions will be closed but trade history will be kept.'
    if (!confirm(msg)) return
    setResetting(true)
    try {
      await fetch(`/api/portfolio?deleteHistory=${deleteHistory}`, { method: 'DELETE' })
      setPositionsWithQuotes([])
      await fetchData()
    } catch {
      // ignore
    } finally {
      setResetting(false)
    }
  }

  const positionsValue = positionsWithQuotes.reduce((sum, p) => sum + p.market_value, 0)
  const totalValue = (data?.portfolio?.cash_balance || 0) + positionsValue
  const initialBalance = data?.portfolio?.initial_balance || 100000
  const totalPnl = totalValue - initialBalance
  const totalPnlPercent = (totalPnl / initialBalance) * 100

  const closedTrades = (data?.trades || []).filter((t) => t.pnl !== null)
  const winningTrades = closedTrades.filter((t) => (t.pnl || 0) > 0)
  const losingTrades = closedTrades.filter((t) => (t.pnl || 0) < 0)
  const winRate = closedTrades.length > 0 ? (winningTrades.length / closedTrades.length) * 100 : 0
  const avgWin = winningTrades.length > 0
    ? winningTrades.reduce((sum, t) => sum + (t.pnl || 0), 0) / winningTrades.length
    : 0
  const avgLoss = losingTrades.length > 0
    ? Math.abs(losingTrades.reduce((sum, t) => sum + (t.pnl || 0), 0) / losingTrades.length)
    : 0
  const totalWins = winningTrades.reduce((sum, t) => sum + (t.pnl || 0), 0)
  const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + (t.pnl || 0), 0))
  const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0

  const chartData = (data?.snapshots || []).map((s) => ({
    date: new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    value: s.total_value,
  }))

  if (totalValue > 0) {
    chartData.push({ date: 'Now', value: totalValue })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Portfolio</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleReset(false)}
            disabled={resetting}
            className="flex items-center gap-2 px-4 py-2 text-sm text-text-secondary hover:text-brand-400 bg-surface-1 border border-surface-3 rounded-lg hover:border-brand-600/30 transition-colors disabled:opacity-50"
          >
            <RotateCcw size={14} className={resetting ? 'animate-spin' : ''} />
            Reset Balance
          </button>
          <button
            onClick={() => handleReset(true)}
            disabled={resetting}
            className="flex items-center gap-2 px-4 py-2 text-sm text-text-secondary hover:text-loss bg-surface-1 border border-surface-3 rounded-lg hover:border-loss/30 transition-colors disabled:opacity-50"
          >
            <RotateCcw size={14} className={resetting ? 'animate-spin' : ''} />
            Reset All + History
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Value"
          value={totalValue}
          change={totalPnl}
          changePercent={totalPnlPercent}
          icon={<DollarSign size={18} />}
          format="currency"
        />
        <StatCard
          title="Cash Available"
          value={data?.portfolio?.cash_balance || 0}
          icon={<DollarSign size={18} />}
          format="currency"
        />
        <StatCard
          title="Win Rate"
          value={winRate}
          icon={<Target size={18} />}
          format="percent"
        />
        <StatCard
          title="Profit Factor"
          value={profitFactor === Infinity ? '∞' : profitFactor.toFixed(2)}
          icon={<Percent size={18} />}
        />
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface-1 rounded-xl border border-surface-3 p-4">
          <span className="text-xs text-text-muted block mb-1">Closed Trades</span>
          <span className="text-lg font-bold text-text-primary">{closedTrades.length}</span>
        </div>
        <div className="bg-surface-1 rounded-xl border border-surface-3 p-4">
          <span className="text-xs text-text-muted block mb-1">Avg Win</span>
          <span className="text-lg font-bold text-profit">{formatCurrency(avgWin)}</span>
        </div>
        <div className="bg-surface-1 rounded-xl border border-surface-3 p-4">
          <span className="text-xs text-text-muted block mb-1">Avg Loss</span>
          <span className="text-lg font-bold text-loss">{formatCurrency(avgLoss)}</span>
        </div>
        <div className="bg-surface-1 rounded-xl border border-surface-3 p-4">
          <span className="text-xs text-text-muted block mb-1">Realized P&L</span>
          <span className={`text-lg font-bold ${totalWins - totalLosses >= 0 ? 'text-profit' : 'text-loss'}`}>
            {formatCurrency(totalWins - totalLosses)}
          </span>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-surface-1 rounded-xl border border-surface-3 p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Equity Curve</h2>
        <PortfolioChart data={chartData} />
      </div>

      {/* Positions */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-3">Open Positions</h2>
        <PositionsTable
          positions={positionsWithQuotes}
          loading={loading}
          onSymbolClick={(symbol) => router.push(`/dashboard/trade?symbol=${symbol}`)}
          onPositionClosed={fetchData}
        />
      </div>

      {/* Pending Orders */}
      <PendingOrdersPanel onOrderTriggered={fetchData} />

      {/* Trade History */}
      <div className="bg-surface-1 rounded-xl border border-surface-3 overflow-hidden">
        <div className="px-4 py-3 border-b border-surface-3">
          <h2 className="text-lg font-semibold text-text-primary">Trade History</h2>
        </div>
        <TradeHistory trades={data?.trades || []} loading={loading} />
      </div>
    </div>
  )
}
