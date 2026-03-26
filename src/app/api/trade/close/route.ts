import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getPrice } from '@/lib/twelvedata'
import { LOT_UNIT } from '@/lib/trading-config'

const DEFAULT_USER_ID = 'default-user'
const DEFAULT_LEVERAGE = 1000

export async function POST(request: Request) {
  try {
    const { positionId } = await request.json()

    if (!positionId) {
      return NextResponse.json({ error: 'Position ID required' }, { status: 400 })
    }

    // Get position
    const { data: position } = await supabase
      .from('positions')
      .select('*')
      .eq('id', positionId)
      .single()

    if (!position || position.quantity <= 0) {
      return NextResponse.json({ error: 'Position not found or already closed' }, { status: 404 })
    }

    // Get portfolio
    const { data: portfolio } = await supabase
      .from('portfolios')
      .select('*')
      .eq('user_id', DEFAULT_USER_ID)
      .single()

    if (!portfolio) {
      return NextResponse.json({ error: 'Portfolio not found' }, { status: 404 })
    }

    // Get current price
    const price = await getPrice(position.symbol)

    // Calculate P&L
    let pnl: number
    if (position.side === 'long') {
      pnl = (price - position.avg_price) * position.quantity
    } else {
      pnl = (position.avg_price - price) * position.quantity
    }

    // Return margin + P&L to cash
    const marginReturned = (position.quantity * position.avg_price) / DEFAULT_LEVERAGE
    await supabase
      .from('portfolios')
      .update({ cash_balance: portfolio.cash_balance + marginReturned + pnl })
      .eq('id', portfolio.id)

    // Close position
    await supabase
      .from('positions')
      .update({ quantity: 0, updated_at: new Date().toISOString() })
      .eq('id', positionId)

    // Record closing trade
    const closeSide = position.side === 'long' ? 'sell' : 'buy'
    const lots = position.quantity / LOT_UNIT

    const { data: trade, error: tradeError } = await supabase
      .from('trades')
      .insert({
        portfolio_id: portfolio.id,
        symbol: position.symbol,
        side: closeSide,
        quantity: position.quantity,
        price,
        total: price * position.quantity,
        pnl,
        notes: `Closed ${lots.toFixed(2)} lots ${position.side} position`,
        status: 'filled',
      })
      .select()
      .single()

    if (tradeError) throw tradeError

    const pnlStr = pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`

    return NextResponse.json({
      trade,
      message: `Closed ${lots.toFixed(2)} lots ${position.side} ${position.symbol} at $${price.toFixed(2)} (P&L: ${pnlStr})`,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to close position'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
