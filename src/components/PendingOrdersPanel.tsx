'use client'

import { useState, useEffect, useCallback } from 'react'
import { Clock, X, ChevronDown, ChevronUp, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import MiniPriceLadder from '@/components/MiniPriceLadder'

interface PendingOrder {
  id: string
  symbol: string
  side: 'buy' | 'sell'
  lot_size: number
  entry_price: number
  stop_loss: number | null
  take_profit: number | null
  order_type: string
  status: string
  created_at: string
}

interface PendingOrdersPanelProps {
  onOrderTriggered?: () => void
}

const ORDER_TYPE_LABELS: Record<string, { label: string; color: string; description: string }> = {
  buy_stop: { label: 'BUY STOP', color: 'text-profit', description: 'Triggers when price rises to entry' },
  buy_limit: { label: 'BUY LIMIT', color: 'text-profit', description: 'Triggers when price drops to entry' },
  sell_stop: { label: 'SELL STOP', color: 'text-loss', description: 'Triggers when price drops to entry' },
  sell_limit: { label: 'SELL LIMIT', color: 'text-loss', description: 'Triggers when price rises to entry' },
}

export default function PendingOrdersPanel({ onOrderTriggered }: PendingOrdersPanelProps) {
  const [orders, setOrders] = useState<PendingOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/orders')
      const data = await res.json()
      if (Array.isArray(data)) setOrders(data)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    fetchOrders()
    const interval = setInterval(async () => {
      // Check and trigger orders
      try {
        const res = await fetch('/api/orders', { method: 'POST' })
        const data = await res.json()
        if (data.triggered > 0) {
          onOrderTriggered?.()
        }
      } catch { /* ignore */ }
      fetchOrders()
    }, 5000)
    return () => clearInterval(interval)
  }, [fetchOrders, onOrderTriggered])

  const cancelOrder = async (id: string) => {
    setCancelling(id)
    try {
      await fetch('/api/orders', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      setOrders(prev => prev.filter(o => o.id !== id))
    } catch { /* ignore */ }
    finally { setCancelling(null) }
  }

  if (loading) {
    return (
      <div className="bg-surface-1 rounded-xl border border-surface-3 p-4">
        <div className="animate-pulse h-8 bg-surface-3 rounded w-40" />
      </div>
    )
  }

  if (orders.length === 0) {
    return (
      <div className="bg-surface-1 rounded-xl border border-surface-3 p-6 text-center">
        <p className="text-text-secondary text-sm">No pending orders</p>
        <p className="text-text-muted text-xs mt-1">Stop and limit orders will appear here</p>
      </div>
    )
  }

  return (
    <div className="bg-surface-1 rounded-xl border border-surface-3 overflow-hidden">
      <div className="px-4 py-3 border-b border-surface-3 flex items-center gap-2">
        <Clock size={16} className="text-brand-400" />
        <h3 className="text-sm font-semibold text-text-primary">Pending Orders</h3>
        <span className="text-xs text-text-muted bg-surface-3 px-2 py-0.5 rounded-full">{orders.length}</span>
      </div>

      <div className="divide-y divide-surface-3/50">
        {orders.map(order => {
          const typeInfo = ORDER_TYPE_LABELS[order.order_type] || { label: order.order_type, color: 'text-text-primary', description: '' }
          const isExpanded = expandedId === order.id
          const isBuy = order.side === 'buy'

          return (
            <div key={order.id} className="hover:bg-surface-2/50 transition-colors">
              {/* Main row */}
              <div
                className="px-4 py-3 flex items-center gap-3 cursor-pointer"
                onClick={() => setExpandedId(isExpanded ? null : order.id)}
              >
                <div className={cn('w-1.5 h-8 rounded-full', isBuy ? 'bg-profit' : 'bg-loss')} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-text-primary text-sm">{order.symbol}</span>
                    <span className={cn('text-xs font-bold px-2 py-0.5 rounded', typeInfo.color,
                      isBuy ? 'bg-profit/10' : 'bg-loss/10'
                    )}>
                      {typeInfo.label}
                    </span>
                    <span className="text-xs text-text-muted">{order.lot_size} lots</span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-text-muted">
                    <span>Entry: <span className="text-text-primary">{formatCurrency(order.entry_price)}</span></span>
                    {order.stop_loss && <span>SL: <span className="text-loss">{formatCurrency(order.stop_loss)}</span></span>}
                    {order.take_profit && <span>TP: <span className="text-profit">{formatCurrency(order.take_profit)}</span></span>}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isBuy ? <ArrowUpRight size={14} className="text-profit" /> : <ArrowDownRight size={14} className="text-loss" />}
                  {isExpanded ? <ChevronUp size={14} className="text-text-muted" /> : <ChevronDown size={14} className="text-text-muted" />}
                </div>
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className="px-4 pb-3 space-y-3">
                  {/* Mini price ladder */}
                  {(order.stop_loss || order.take_profit) && (
                    <MiniPriceLadder
                      currentPrice={order.entry_price}
                      entryPrice={order.entry_price}
                      stopLoss={order.stop_loss}
                      takeProfit={order.take_profit}
                      side={order.side}
                      width={280}
                      height={90}
                    />
                  )}

                  <div className="bg-surface-2 rounded-lg p-3 space-y-2">
                    <div className="text-xs text-text-muted">{typeInfo.description}</div>

                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <span className="text-xs text-text-muted block">Entry Price</span>
                        <span className="text-text-primary font-medium">{formatCurrency(order.entry_price)}</span>
                      </div>
                      <div>
                        <span className="text-xs text-text-muted block">Stop Loss</span>
                        <span className={order.stop_loss ? 'text-loss font-medium' : 'text-text-muted'}>
                          {order.stop_loss ? formatCurrency(order.stop_loss) : 'None'}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-text-muted block">Take Profit</span>
                        <span className={order.take_profit ? 'text-profit font-medium' : 'text-text-muted'}>
                          {order.take_profit ? formatCurrency(order.take_profit) : 'None'}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <span className="text-xs text-text-muted block">Lot Size</span>
                        <span className="text-text-primary">{order.lot_size}</span>
                      </div>
                      <div>
                        <span className="text-xs text-text-muted block">Side</span>
                        <span className={isBuy ? 'text-profit font-medium' : 'text-loss font-medium'}>
                          {order.side.toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-text-muted block">Created</span>
                        <span className="text-text-secondary">
                          {new Date(order.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>

                    {order.stop_loss && order.take_profit && (
                      <div>
                        <span className="text-xs text-text-muted block">Risk / Reward</span>
                        <span className="text-text-primary text-sm font-medium">
                          1 : {Math.abs((order.take_profit - order.entry_price) / (order.entry_price - order.stop_loss)).toFixed(1)}
                        </span>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={(e) => { e.stopPropagation(); cancelOrder(order.id) }}
                    disabled={cancelling === order.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-loss/10 text-loss hover:bg-loss/20 transition-colors disabled:opacity-50"
                  >
                    <X size={12} />
                    {cancelling === order.id ? 'Cancelling...' : 'Cancel Order'}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
