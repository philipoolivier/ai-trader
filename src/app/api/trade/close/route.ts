import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// Store close requests in pending_orders with a special marker
// The EA reads them as signals and closes by ticket
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

    if (!position.mt4_ticket) {
      return NextResponse.json({ error: 'No MT4 ticket — cannot close' }, { status: 400 })
    }

    // Store the close request — EA will pick it up via the signals API commands
    // Use a dedicated pending_orders entry with the MT4 ticket
    const closeSide = position.side === 'long' ? 'sell' : 'buy'
    await supabase.from('pending_orders').insert({
      symbol: position.symbol,
      side: closeSide,
      lot_size: parseFloat(position.quantity) || 0.01,
      entry_price: position.mt4_ticket, // Store ticket in entry_price as identifier
      order_type: closeSide === 'sell' ? 'sell_stop' : 'buy_stop',
      status: 'close_requested',
      mt4_ticket: position.mt4_ticket,
    })

    return NextResponse.json({
      message: `Closing ${position.symbol} #${position.mt4_ticket} — sending to MT4`,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
