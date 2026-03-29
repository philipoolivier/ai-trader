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

    if (posErr) {
      return NextResponse.json({ error: `Position lookup failed: ${posErr.message}` }, { status: 404 })
    }
    if (!position) {
      return NextResponse.json({ error: 'Position not found' }, { status: 404 })
    }

    const symbol = position.symbol.replace('/', '').toUpperCase()
    const closeSide = position.side === 'long' ? 'sell' : 'buy'
    const orderType = closeSide === 'sell' ? 'sell_stop' : 'buy_stop'

    // Insert close signal into pending_orders
    const insertData = {
      symbol: symbol,
      side: closeSide,
      lot_size: 0.01,
      entry_price: 0.001,
      stop_loss: null,
      take_profit: null,
      order_type: orderType,
      status: 'pending',
    }

    const { data: order, error: insertErr } = await supabase
      .from('pending_orders')
      .insert(insertData)
      .select('id, symbol, side, order_type, entry_price, status')
      .single()

    if (insertErr) {
      return NextResponse.json({
        error: `DB insert failed: ${insertErr.message} | code: ${insertErr.code} | details: ${insertErr.details}`,
        insertData,
      }, { status: 500 })
    }

    // Verify it was actually inserted
    const { data: verify } = await supabase
      .from('pending_orders')
      .select('id, status, mt4_ticket')
      .eq('id', order.id)
      .single()

    return NextResponse.json({
      message: `Closing ${symbol} — order ${order.id} created (verified: ${verify ? 'YES' : 'NO'})`,
      order,
      verified: !!verify,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? `${error.message} ${error.stack}` : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
