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
    const body = await request.json()
    const { key, positions, closedTrades, cancelledOrders } = body

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

        // Find matching position in our DB (try both XAUUSD and XAU/USD formats)
        const symbolClean = symbol.replace('/', '')
        let symbolWithSlash = symbol
        // Try to add slash for 6-char symbols
        if (!symbol.includes('/') && symbol.length === 6) {
          symbolWithSlash = symbol.slice(0, 3) + '/' + symbol.slice(3)
        }

        let { data: existingPos } = await supabase
          .from('positions')
          .select('*')
          .eq('portfolio_id', portfolio.id)
          .eq('symbol', symbolClean)
          .single()

        if (!existingPos) {
          const { data: pos2 } = await supabase
            .from('positions')
            .select('*')
            .eq('portfolio_id', portfolio.id)
            .eq('symbol', symbolWithSlash)
            .single()
          existingPos = pos2
        }
        if (!existingPos) {
          const { data: pos3 } = await supabase
            .from('positions')
            .select('*')
            .eq('portfolio_id', portfolio.id)
            .eq('symbol', symbol)
            .single()
          existingPos = pos3
        }

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

    // Process cancelled pending orders from MT4
    if (cancelledOrders && Array.isArray(cancelledOrders)) {
      for (const cancelled of cancelledOrders as { ticket: number; symbol: string; side: string; entry: number }[]) {
        const cancelSymbol = cancelled.symbol.toUpperCase()
        // Find matching pending order by symbol, side, and entry price
        const { data: matchingOrders } = await supabase
          .from('pending_orders')
          .select('*')
          .eq('status', 'pending')
          .or(`symbol.eq.${cancelSymbol},symbol.eq.${cancelSymbol.slice(0, 3)}/${cancelSymbol.slice(3)}`)

        if (matchingOrders) {
          for (const order of matchingOrders) {
            const orderEntry = parseFloat(order.entry_price)
            // Match by entry price (within small tolerance)
            if (Math.abs(orderEntry - cancelled.entry) < 0.01) {
              await supabase
                .from('pending_orders')
                .update({ status: 'cancelled', updated_at: new Date().toISOString() })
                .eq('id', order.id)
              synced.push(`Cancelled pending ${cancelSymbol} @ ${cancelled.entry} (MT4 #${cancelled.ticket})`)
              break
            }
          }
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
