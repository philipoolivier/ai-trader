import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// Store close requests in localStorage-style approach:
// Just write to a simple key-value in portfolios table
export async function POST(request: Request) {
  try {
    const { positionId } = await request.json()

    if (!positionId) {
      return NextResponse.json({ error: 'Position ID required' }, { status: 400 })
    }

    const { data: position } = await supabase
      .from('positions')
      .select('*')
      .eq('id', positionId)
      .single()

    if (!position) {
      return NextResponse.json({ error: 'Position not found' }, { status: 404 })
    }

    const symbol = position.symbol.replace('/', '').toUpperCase()
    const side = position.side === 'long' ? 'buy' : 'sell'

    // Store close request in portfolio's updated_at field as JSON won't work
    // Instead: use a dedicated approach — write directly to a close_requests text field on portfolios
    // Or simplest: just append to notes field... No.

    // SIMPLEST APPROACH: Create a pending_orders entry with a known good order_type
    // Use sell_stop for closing longs, buy_stop for closing shorts
    // Entry price = 0.00001 signals to EA this is a close, not a real order
    const closeOrderType = side === 'buy' ? 'sell_stop' : 'buy_stop' // opposite side to close

    const { data: order, error: insertErr } = await supabase
      .from('pending_orders')
      .insert({
        symbol: symbol,
        side: side === 'buy' ? 'sell' : 'buy', // Close side is opposite
        lot_size: 0.01,
        entry_price: 0.00001, // Signal to EA: this is a close command
        stop_loss: null,
        take_profit: null,
        order_type: closeOrderType,
        status: 'pending',
      })
      .select()
      .single()

    if (insertErr) {
      console.error('[CLOSE] Insert failed:', insertErr)
      return NextResponse.json({ error: insertErr.message }, { status: 500 })
    }

    console.log('[CLOSE] Created close signal:', order.id, symbol, closeOrderType)
    return NextResponse.json({ message: `Closing ${symbol} — sending to MT4` })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
