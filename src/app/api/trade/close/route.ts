import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

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

    if (!position || parseFloat(position.quantity) <= 0) {
      return NextResponse.json({ error: 'Position not found or already closed' }, { status: 404 })
    }

    // Create a close command as a pending_orders record
    // EA picks this up and closes the position on MT4
    const closeSide = position.side === 'long' ? 'sell' : 'buy'
    const { error: insertError } = await supabase
      .from('pending_orders')
      .insert({
        symbol: position.symbol,
        side: closeSide,
        lot_size: parseFloat(position.quantity),
        entry_price: 0,
        order_type: 'close_market',
        status: 'pending',
      })

    if (insertError) {
      console.error('Close command insert failed:', insertError)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    console.log('Close command created for', position.symbol, position.side)

    return NextResponse.json({
      message: `Closing ${position.symbol} ${position.side} — sending to MT4`,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to close position'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
