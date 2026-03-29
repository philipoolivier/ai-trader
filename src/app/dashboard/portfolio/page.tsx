'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { DollarSign, TrendingUp, Target, Percent, RotateCcw, Settings2 } from 'lucide-react'
import PendingOrdersPanel from '@/components/PendingOrdersPanel'
import StatCard from '@/components/StatCard'
import PositionsTable from '@/components/PositionsTable'
import PortfolioChart from '@/components/PortfolioChart'
import TradeHistory from '@/components/TradeHistory'
import { formatCurrency, cn } from '@/lib/utils'
import {
  getTradingConfig,
  saveTradingConfig,
  LOT_PRESETS,
  type TradingConfig,
} from '@/lib/trading-config'
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
  const [showSettings, setShowSettings] = useState(false)
  const [config, setConfig] = useState<TradingConfig>({
    leverage: 1000, defaultLotSize: 0.01, riskPerTradePercent: 2, maxOpenPositions: 10, maxLotSize: 10,
  })
  const [newBalance, setNewBalance] = useState('')
  const router = useRouter()

  useEffect(() => {
    setConfig(getTradingConfig())
  }, [])

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
    const interval = setInterval(fetchData, 5000)
    return () => clearInterval(interval)
  }, [fetchData])

  const handleReset = async (deleteHistory: boolean = false) => {
    const balance = parseFloat(newBalance) || 500
    const msg = deleteHistory
      ? `Reset portfolio to $${balance} AND delete all trade history?`
      : `Reset portfolio to $${balance}? Open positions will be closed but trade history kept.`
    if (!confirm(msg)) return
    setResetting(true)
    try {
      await fetch(`/api/portfolio?deleteHistory=${deleteHistory}&balance=${balance}`, { method: 'DELETE' })
      setPositionsWithQuotes([])
      await fetchData()
    } catch {
      // ignore
    } finally {
      setResetting(false)
    }
  }

  const handleConfigChange = (key: keyof TradingConfig, value: number) => {
    const updated = saveTradingConfig({ [key]: value })
    setConfig(updated)
  }

  // Balance from MT4 sync (cash_balance in DB), Equity = balance + floating P&L
  const floatingPnl = positionsWithQuotes.reduce((sum, p) => sum + p.unrealized_pnl, 0)
  const initialBalance = data?.portfolio?.initial_balance || 500
  const balance = data?.portfolio?.cash_balance || initialBalance
  const equity = balance + floatingPnl
  const totalPnl = balance - initialBalance
  const totalPnlPercent = initialBalance > 0 ? (totalPnl / initialBalance) * 100 : 0

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

  // Build equity curve: starts at initial balance, each closed trade adds a point
  const equityCurve: { date: string; value: number }[] = [
    { date: 'Start', value: initialBalance },
  ]
  let runningBalance = initialBalance
  const sortedTrades = [...(data?.trades || [])]
    .filter(t => t.pnl !== null)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  for (const trade of sortedTrades) {
    runningBalance += trade.pnl || 0
    equityCurve.push({
      date: new Date(trade.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      value: runningBalance,
    })
  }
  // Always add current balance as final point
  equityCurve.push({ date: 'Now', value: balance })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-text-primary">Portfolio</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-2 px-4 py-2 text-sm text-text-secondary hover:text-text-primary bg-surface-1 border border-surface-3 rounded-lg transition-colors"
          >
            <Settings2 size={14} />
            Settings
          </button>
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
            Reset All
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="bg-surface-1 rounded-xl border border-surface-3 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-text-primary">Trading Settings</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <label className="text-xs text-text-muted block mb-1">Starting Balance ($)</label>
              <input
                type="number"
                value={newBalance}
                onChange={(e) => setNewBalance(e.target.value)}
                placeholder={String(initialBalance)}
                className="w-full px-3 py-2 bg-surface-2 border border-surface-4 rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
              <span className="text-[10px] text-text-muted">Used on next reset</span>
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Leverage</label>
              <select
                value={config.leverage}
                onChange={(e) => handleConfigChange('leverage', parseInt(e.target.value))}
                className="w-full px-3 py-2 bg-surface-2 border border-surface-4 rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
              >
                {[50, 100, 200, 500, 1000].map((l) => (
                  <option key={l} value={l}>{l}:1</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Default Lot Size</label>
              <select
                value={config.defaultLotSize}
                onChange={(e) => handleConfigChange('defaultLotSize', parseFloat(e.target.value))}
                className="w-full px-3 py-2 bg-surface-2 border border-surface-4 rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
              >
                {LOT_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Risk per Trade</label>
              <select
                value={config.riskPerTradePercent}
                onChange={(e) => handleConfigChange('riskPerTradePercent', parseFloat(e.target.value))}
                className="w-full px-3 py-2 bg-surface-2 border border-surface-4 rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
              >
                {[0.5, 1, 2, 3, 5, 10].map((r) => (
                  <option key={r} value={r}>{r}%</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Max Lot Size</label>
              <select
                value={config.maxLotSize}
                onChange={(e) => handleConfigChange('maxLotSize', parseFloat(e.target.value))}
                className="w-full px-3 py-2 bg-surface-2 border border-surface-4 rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
              >
                {[1, 5, 10, 50, 100].map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Balance / Equity / Floating P&L */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-surface-1 rounded-xl border border-surface-3 p-5">
          <span className="text-xs text-text-muted block mb-1">Balance</span>
          <span className="text-2xl font-bold text-text-primary">{formatCurrency(balance)}</span>
          <span className={cn('text-xs block mt-1', totalPnl >= 0 ? 'text-profit' : 'text-loss')}>
            {totalPnl >= 0 ? '+' : ''}{formatCurrency(totalPnl)} ({totalPnlPercent >= 0 ? '+' : ''}{totalPnlPercent.toFixed(1)}%)
          </span>
        </div>
        <div className="bg-surface-1 rounded-xl border border-surface-3 p-5">
          <span className="text-xs text-text-muted block mb-1">Equity</span>
          <span className={cn('text-2xl font-bold', equity >= balance ? 'text-profit' : 'text-loss')}>{formatCurrency(equity)}</span>
          <span className="text-xs text-text-muted block mt-1">Balance {floatingPnl >= 0 ? '+' : '−'} floating</span>
        </div>
        <div className="bg-surface-1 rounded-xl border border-surface-3 p-5">
          <span className="text-xs text-text-muted block mb-1">Floating P&L</span>
          <span className={cn('text-2xl font-bold', floatingPnl >= 0 ? 'text-profit' : 'text-loss')}>
            {floatingPnl >= 0 ? '+' : ''}{formatCurrency(floatingPnl)}
          </span>
          <span className="text-xs text-text-muted block mt-1">{positionsWithQuotes.length} open position{positionsWithQuotes.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface-1 rounded-xl border border-surface-3 p-4">
          <span className="text-xs text-text-muted block mb-1">Win Rate</span>
          <span className={cn('text-lg font-bold', winRate >= 50 ? 'text-profit' : 'text-loss')}>{winRate.toFixed(1)}%</span>
          <span className="text-[10px] text-text-muted block">{closedTrades.length} trades</span>
        </div>
        <div className="bg-surface-1 rounded-xl border border-surface-3 p-4">
          <span className="text-xs text-text-muted block mb-1">Profit Factor</span>
          <span className={cn('text-lg font-bold', profitFactor >= 1 ? 'text-profit' : 'text-loss')}>
            {profitFactor === Infinity ? '∞' : profitFactor.toFixed(2)}
          </span>
        </div>
        <div className="bg-surface-1 rounded-xl border border-surface-3 p-4">
          <span className="text-xs text-text-muted block mb-1">Avg Win</span>
          <span className="text-lg font-bold text-profit">{formatCurrency(avgWin)}</span>
        </div>
        <div className="bg-surface-1 rounded-xl border border-surface-3 p-4">
          <span className="text-xs text-text-muted block mb-1">Avg Loss</span>
          <span className="text-lg font-bold text-loss">{formatCurrency(avgLoss)}</span>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-surface-1 rounded-xl border border-surface-3 p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Equity Curve</h2>
        <PortfolioChart data={equityCurve} initialBalance={initialBalance} />
      </div>

      {/* Open Positions */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-3">Open Positions</h2>
        <PositionsTable
          positions={positionsWithQuotes}
          loading={loading}
          onSymbolClick={(symbol) => router.push(`/dashboard/trade?symbol=${symbol}`)}
          onPositionClosed={fetchData}
        />
      </div>

      {/* Pending Orders - always show section */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-3">Pending Orders</h2>
        <PendingOrdersPanel onOrderTriggered={fetchData} />
      </div>

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
