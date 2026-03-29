import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request: Request) {
  try {
    const { positionId } = await request.json()

    if (!positionId) {
      return NextResponse.json({ error: 'Position ID required' }, { status: 400 })
    }

    const { data: position, error: posErr } = await supabase
      .from('positions')
      .select('*')
      .eq('id', positionId)
      .single()

    if (posErr || !position) {
      return NextResponse.json({ error: `Position not found: ${posErr?.message}` }, { status: 404 })
    }

    const symbol = position.symbol.replace('/', '').toUpperCase()
    const closeSide = position.side === 'long' ? 'sell' : 'buy'

    // Insert into pending_orders — use buy_stop/sell_stop which are guaranteed to work
    // The EA detects entry_price near 0 as a close command
    const { data: order, error: insertErr } = await supabase
      .from('pending_orders')
      .insert({
        symbol: symbol,
        side: closeSide,
        lot_size: 0.01,
        entry_price: 0.001,
        stop_loss: null,
        take_profit: null,
        order_type: closeSide === 'sell' ? 'sell_stop' : 'buy_stop',
        status: 'pending',
      })
      .select('id')
      .single()

    if (insertErr) {
      return NextResponse.json({ error: `Insert failed: ${insertErr.message}` }, { status: 500 })
    }

    return NextResponse.json({
      message: `Closing ${symbol} — order ${order?.id} sent to MT4`,
      orderId: order?.id,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
