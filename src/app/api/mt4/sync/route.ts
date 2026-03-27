import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getLotUnit } from '@/lib/trading-config'

const DEFAULT_USER_ID = 'default-user'
const DEFAULT_LEVERAGE = 1000

interface MT4Position {
  ticket: number
  symbol: string
  side: 'buy' | 'sell'
  lots: number
  openPrice: number
  sl: number
  tp: number
  profit: number
}

interface MT4ClosedTrade {
  ticket: number
  symbol: string
  side: 'buy' | 'sell'
  lots: number
  openPrice: number
  closePrice: number
  profit: number
  sl: number
  tp: number
}

// POST: EA sends its current state for sync
export async function POST(request: Request) {
  try {
    const { key, positions, closedTrades, pendingOrders } = await request.json()

    if (key !== process.env.AUTH_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: portfolio } = await supabase
      .from('portfolios')
      .select('*')
      .eq('user_id', DEFAULT_USER_ID)
      .single()

    if (!portfolio) {
      return NextResponse.json({ error: 'Portfolio not found' }, { status: 404 })
    }

    const synced: string[] = []

    // Process closed trades from MT4
    if (closedTrades && Array.isArray(closedTrades)) {
      for (const trade of closedTrades as MT4ClosedTrade[]) {
        const symbol = trade.symbol.toUpperCase()
        const lotUnit = getLotUnit(symbol)
        const units = trade.lots * lotUnit
        const positionSide = trade.side === 'buy' ? 'long' : 'short'

        // Calculate P&L
        let pnl: number
        if (positionSide === 'long') {
          pnl = (trade.closePrice - trade.openPrice) * units
        } else {
          pnl = (trade.openPrice - trade.closePrice) * units
        }

        // Find matching position in our DB
        const { data: existingPos } = await supabase
          .from('positions')
          .select('*')
          .eq('portfolio_id', portfolio.id)
          .eq('symbol', symbol)
          .single()

        if (existingPos && parseFloat(existingPos.quantity) > 0) {
          const posQty = parseFloat(existingPos.quantity)
          const closeUnits = Math.min(units, posQty)
          const remaining = posQty - closeUnits

          // Return margin + P&L
          const marginReturned = (closeUnits * parseFloat(existingPos.avg_price)) / DEFAULT_LEVERAGE
          await supabase
            .from('portfolios')
            .update({ cash_balance: parseFloat(portfolio.cash_balance) + marginReturned + pnl })
            .eq('id', portfolio.id)

          // Update position
          await supabase
            .from('positions')
            .update({ quantity: remaining, updated_at: new Date().toISOString() })
            .eq('id', existingPos.id)

          // Record trade
          await supabase.from('trades').insert({
            portfolio_id: portfolio.id,
            symbol,
            side: trade.side === 'buy' ? 'sell' : 'buy', // Closing side is opposite
            quantity: closeUnits,
            price: trade.closePrice,
            total: trade.closePrice * closeUnits,
            pnl,
            stop_loss: trade.sl || null,
            take_profit: trade.tp || null,
            notes: `MT4 closed: ticket #${trade.ticket} P&L: $${pnl.toFixed(2)}`,
            status: 'filled',
          })

          synced.push(`Closed ${symbol} MT4#${trade.ticket} P&L: $${pnl.toFixed(2)}`)
        }
      }
    }

    // Sync pending orders — cancel any that MT4 no longer has
    if (pendingOrders && Array.isArray(pendingOrders)) {
      const mt4Symbols = (pendingOrders as { symbol: string }[]).map(o => o.symbol.toUpperCase())

      const { data: ourPending } = await supabase
        .from('pending_orders')
        .select('*')
        .eq('status', 'pending')

      if (ourPending) {
        for (const order of ourPending) {
          const orderSymbol = order.symbol.replace('/', '').toUpperCase()
          // If we have a pending order but MT4 doesn't, it was cancelled on MT4
          const existsOnMT4 = mt4Symbols.some(s =>
            s.replace(/[^A-Z]/g, '') === orderSymbol
          )
          // Don't auto-cancel — MT4 might not have the symbol at all (crypto)
        }
      }
    }

    return NextResponse.json({
      success: true,
      synced,
      message: `Synced ${synced.length} trades`,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sync failed'
    console.error('MT4 sync error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
