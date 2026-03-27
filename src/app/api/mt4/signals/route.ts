import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { executeTrade } from '@/lib/trade'

// IC Markets symbol mapping — adjust if your broker uses different names
const MT4_SYMBOL_MAP: Record<string, string> = {
  // IC Markets uses standard names for forex and metals
  // Add overrides here if needed, e.g.:
  // 'BTCUSD': 'BTCUSD.a',
}

function mapSymbolToMT4(symbol: string): string {
  const clean = symbol.replace('/', '').toUpperCase()
  return MT4_SYMBOL_MAP[clean] || clean
}

// GET: EA polls for unexecuted signals
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const apiKey = searchParams.get('key')

  if (apiKey !== process.env.AUTH_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get pending orders (stop/limit)
    const { data: pending } = await supabase
      .from('pending_orders')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })

    // Get recent trades not yet sent to MT4 (market orders)
    const { data: recentTrades } = await supabase
      .from('trades')
      .select('*')
      .is('ai_suggestion_id', null) // Only non-suggestion trades OR
      .order('created_at', { ascending: false })
      .limit(10)

    // Also get trades with notes containing 'AI:' that haven't been marked as mt4_sent
    const { data: aiTrades } = await supabase
      .from('trades')
      .select('*')
      .like('notes', 'AI:%')
      .order('created_at', { ascending: false })
      .limit(20)

    // Pending order signals
    const pendingSignals = (pending || []).map(order => ({
      id: order.id,
      source: 'pending_order',
      symbol: mapSymbolToMT4(order.symbol),
      side: order.side,
      type: order.order_type,
      entry: parseFloat(order.entry_price),
      sl: order.stop_loss ? parseFloat(order.stop_loss) : 0,
      tp: order.take_profit ? parseFloat(order.take_profit) : 0,
      lots: parseFloat(order.lot_size),
      created: order.created_at,
    }))

    return NextResponse.json({
      signals: pendingSignals,
      timestamp: new Date().toISOString(),
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch signals'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST: EA confirms it executed a signal — also creates position in portfolio
export async function POST(request: Request) {
  try {
    const { key, id, ticket, action, executedPrice } = await request.json()

    if (key !== process.env.AUTH_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!id) {
      return NextResponse.json({ error: 'Signal ID required' }, { status: 400 })
    }

    // Get the pending order details
    const { data: order } = await supabase
      .from('pending_orders')
      .select('*')
      .eq('id', id)
      .single()

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (action === 'executed') {
      // Create position in our portfolio
      try {
        const result = await executeTrade({
          symbol: order.symbol,
          side: order.side,
          lotSize: parseFloat(order.lot_size),
          stopLoss: order.stop_loss ? parseFloat(order.stop_loss) : null,
          takeProfit: order.take_profit ? parseFloat(order.take_profit) : null,
          notes: `MT4 executed: ${order.order_type.replace('_', ' ')} ticket #${ticket} at ${executedPrice || order.entry_price}`,
        })

        // Mark pending order as triggered
        await supabase
          .from('pending_orders')
          .update({
            status: 'triggered',
            triggered_trade_id: (result.trade as Record<string, unknown>).id as string,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)

        return NextResponse.json({
          success: true,
          message: `Signal ${id} executed on MT4 (ticket: ${ticket}) and added to portfolio`,
          trade: result.trade,
        })
      } catch (err) {
        // Still mark as triggered even if portfolio update fails
        await supabase
          .from('pending_orders')
          .update({ status: 'triggered', updated_at: new Date().toISOString() })
          .eq('id', id)

        const msg = err instanceof Error ? err.message : String(err)
        return NextResponse.json({
          success: true,
          message: `MT4 executed but portfolio update failed: ${msg}`,
          warning: msg,
        })
      }
    }

    if (action === 'cancelled') {
      await supabase
        .from('pending_orders')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', id)

      return NextResponse.json({ success: true, message: `Signal ${id} cancelled` })
    }

    return NextResponse.json({ error: 'Invalid action. Use "executed" or "cancelled"' }, { status: 400 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to confirm signal'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
