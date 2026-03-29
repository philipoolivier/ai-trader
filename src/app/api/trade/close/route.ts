import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request: Request) {
  try {
    const { positionId } = await request.json()
    console.log('[CLOSE] Request received, positionId:', positionId)

    if (!positionId) {
      return NextResponse.json({ error: 'Position ID required' }, { status: 400 })
    }

    const { data: position, error: posError } = await supabase
      .from('positions')
      .select('*')
      .eq('id', positionId)
      .single()

    console.log('[CLOSE] Position lookup:', position ? `${position.symbol} ${position.side} qty=${position.quantity}` : 'NOT FOUND', posError?.message || '')

    if (!position || parseFloat(position.quantity) <= 0) {
      return NextResponse.json({ error: 'Position not found or already closed' }, { status: 404 })
    }

    // Create a close command as a pending_orders record
    const closeSide = position.side === 'long' ? 'sell' : 'buy'
    console.log('[CLOSE] Creating close_market order:', position.symbol, 'closeSide:', closeSide, 'qty:', position.quantity)

    const { data: order, error: insertError } = await supabase
      .from('pending_orders')
      .insert({
        symbol: position.symbol,
        side: closeSide,
        lot_size: parseFloat(position.quantity),
        entry_price: 0.00001, // Minimal non-zero value
        order_type: 'close_market',
        status: 'pending',
      })
      .select()
      .single()

    if (insertError) {
      console.error('[CLOSE] INSERT FAILED:', insertError.message, insertError.details, insertError.hint)
      return NextResponse.json({ error: `Failed: ${insertError.message}` }, { status: 500 })
    }

    console.log('[CLOSE] SUCCESS - pending_orders record created:', order?.id)

    return NextResponse.json({
      message: `Closing ${position.symbol} ${position.side} — sending to MT4`,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to close position'
    console.error('[CLOSE] EXCEPTION:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
