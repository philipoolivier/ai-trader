'use client'

import { useEffect, useState, useCallback } from 'react'
import { DollarSign, TrendingUp, BarChart3, Activity } from 'lucide-react'
import StatCard from '@/components/StatCard'
import PendingOrdersPanel from '@/components/PendingOrdersPanel'
import PositionsTable from '@/components/PositionsTable'
import PortfolioChart from '@/components/PortfolioChart'
import TradeHistory from '@/components/TradeHistory'
import type { Portfolio, Position, Trade, PositionWithQuote, PortfolioSnapshot } from '@/types'
import { formatCurrency } from '@/lib/utils'
import { useRouter } from 'next/navigation'

interface PortfolioData {
  portfolio: Portfolio
  positions: Position[]
  trades: Trade[]
  snapshots: PortfolioSnapshot[]
}

export default function DashboardPage() {
  const [data, setData] = useState<PortfolioData | null>(null)
  const [positionsWithQuotes, setPositionsWithQuotes] = useState<PositionWithQuote[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  const fetchPortfolio = useCallback(async () => {
    try {
      const res = await fetch('/api/portfolio')
      const json = await res.json()
      if (json.portfolio) {
        setData(json)

        // Fetch current prices for positions
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
                const costBasis = pos.avg_price * pos.quantity
                // Short positions profit when price drops
                const unrealizedPnl = pos.side === 'short'
                  ? (pos.avg_price - currentPrice) * pos.quantity
                  : (currentPrice - pos.avg_price) * pos.quantity
                const unrealizedPnlPercent = pos.side === 'short'
                  ? ((pos.avg_price - currentPrice) / pos.avg_price) * 100
                  : ((currentPrice - pos.avg_price) / pos.avg_price) * 100
                return {
                  ...pos,
                  current_price: currentPrice,
                  market_value: marketValue,
                  unrealized_pnl: unrealizedPnl,
                  unrealized_pnl_percent: unrealizedPnlPercent,
                  name: quote.name,
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
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPortfolio()
    // Auto-refresh every 30 seconds + check pending orders
    const interval = setInterval(() => {
      fetchPortfolio()
      fetch('/api/orders', { method: 'POST' }).catch(() => {})
    }, 30000)
    // Check orders on load too
    fetch('/api/orders', { method: 'POST' }).catch(() => {})
    return () => clearInterval(interval)
  }, [fetchPortfolio])

  const positionsValue = positionsWithQuotes.reduce((sum, p) => sum + p.market_value, 0)
  const totalValue = (data?.portfolio?.cash_balance || 0) + positionsValue
  const totalPnl = totalValue - (data?.portfolio?.initial_balance || 500)
  const totalPnlPercent = (totalPnl / (data?.portfolio?.initial_balance || 500)) * 100
  const unrealizedPnl = positionsWithQuotes.reduce((sum, p) => sum + p.unrealized_pnl, 0)

  const closedTrades = (data?.trades || []).filter((t) => t.pnl !== null)
  const winningTrades = closedTrades.filter((t) => (t.pnl || 0) > 0)
  const winRate = closedTrades.length > 0 ? (winningTrades.length / closedTrades.length) * 100 : 0

  const chartData = (data?.snapshots || []).map((s) => ({
    date: new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    value: s.total_value,
  }))

  // Add current value as latest point
  if (totalValue > 0) {
    chartData.push({
      date: 'Now',
      value: totalValue,
    })
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 bg-surface-1 rounded-xl border border-surface-3 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
        <div className="text-sm text-text-muted">
          Cash: <span className="text-text-primary font-medium">{formatCurrency(data?.portfolio?.cash_balance || 0)}</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Portfolio Value"
          value={totalValue}
          change={totalPnl}
          changePercent={totalPnlPercent}
          icon={<DollarSign size={18} />}
          format="currency"
        />
        <StatCard
          title="Unrealized P&L"
          value={unrealizedPnl}
          icon={<TrendingUp size={18} />}
          format="currency"
        />
        <StatCard
          title="Win Rate"
          value={winRate}
          icon={<BarChart3 size={18} />}
          format="percent"
        />
        <StatCard
          title="Total Trades"
          value={data?.trades?.length || 0}
          icon={<Activity size={18} />}
        />
      </div>

      {/* Chart */}
      <div className="bg-surface-1 rounded-xl border border-surface-3 p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Portfolio Performance</h2>
        <PortfolioChart data={chartData} />
      </div>

      {/* Positions */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-3">Open Positions</h2>
        <PositionsTable
          positions={positionsWithQuotes}
          loading={false}
          onSymbolClick={(symbol) => router.push(`/dashboard/trade?symbol=${symbol}`)}
          onPositionClosed={fetchPortfolio}
        />
      </div>

      {/* Pending Orders */}
      <PendingOrdersPanel onOrderTriggered={fetchPortfolio} />

      {/* Recent Trades */}
      <div className="bg-surface-1 rounded-xl border border-surface-3 overflow-hidden">
        <div className="px-4 py-3 border-b border-surface-3">
          <h2 className="text-lg font-semibold text-text-primary">Recent Trades</h2>
        </div>
        <TradeHistory trades={(data?.trades || []).slice(0, 10)} loading={false} />
      </div>
    </div>
  )
}
