import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET: EA polls for unexecuted signals
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const apiKey = searchParams.get('key')

  // Simple API key auth for EA
  if (apiKey !== process.env.AUTH_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get pending orders that haven't been sent to MT4
    const { data: pending } = await supabase
      .from('pending_orders')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })

    // Get open positions (for position sync)
    const { data: positions } = await supabase
      .from('positions')
      .select('*')
      .gt('quantity', 0)

    // Format signals for MT4 EA
    const signals = (pending || []).map(order => ({
      id: order.id,
      symbol: order.symbol.replace('/', ''), // MT4 uses EURUSD not EUR/USD
      side: order.side,
      type: order.order_type, // buy_stop, sell_limit, etc.
      entry: parseFloat(order.entry_price),
      sl: order.stop_loss ? parseFloat(order.stop_loss) : 0,
      tp: order.take_profit ? parseFloat(order.take_profit) : 0,
      lots: parseFloat(order.lot_size),
      created: order.created_at,
    }))

    const openPositions = (positions || []).map(pos => ({
      symbol: pos.symbol.replace('/', ''),
      side: pos.side,
      quantity: parseFloat(pos.quantity),
      avg_price: parseFloat(pos.avg_price),
    }))

    return NextResponse.json({
      signals,
      positions: openPositions,
      timestamp: new Date().toISOString(),
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch signals'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST: EA confirms it executed a signal
export async function POST(request: Request) {
  try {
    const { key, id, ticket, action } = await request.json()

    if (key !== process.env.AUTH_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!id) {
      return NextResponse.json({ error: 'Signal ID required' }, { status: 400 })
    }

    if (action === 'executed') {
      // Mark pending order as triggered by MT4
      await supabase
        .from('pending_orders')
        .update({
          status: 'triggered',
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)

      return NextResponse.json({ success: true, message: `Signal ${id} marked as executed (MT4 ticket: ${ticket})` })
    }

    if (action === 'cancelled') {
      await supabase
        .from('pending_orders')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)

      return NextResponse.json({ success: true, message: `Signal ${id} cancelled` })
    }

    return NextResponse.json({ error: 'Invalid action. Use "executed" or "cancelled"' }, { status: 400 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to confirm signal'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
