import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getPrice } from '@/lib/twelvedata'
import { executeTrade } from '@/lib/trade'

// GET: List pending orders
export async function GET() {
  try {
    const { data: orders } = await supabase
      .from('pending_orders')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    return NextResponse.json(orders || [])
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch orders'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST: Check and trigger pending orders
export async function POST() {
  try {
    const { data: orders } = await supabase
      .from('pending_orders')
      .select('*')
      .eq('status', 'pending')

    if (!orders || orders.length === 0) {
      return NextResponse.json({ triggered: 0 })
    }

    // Group by symbol to minimize API calls
    const symbols = Array.from(new Set(orders.map(o => o.symbol)))
    const prices: Record<string, number> = {}

    for (const sym of symbols) {
      try {
        prices[sym] = await getPrice(sym)
      } catch {
        // Skip symbols we can't price
      }
    }

    let triggered = 0
    const results: string[] = []

    for (const order of orders) {
      const price = prices[order.symbol]
      if (!price) continue

      let shouldTrigger = false

      switch (order.order_type) {
        case 'buy_stop':
          // Triggers when price rises to or above entry
          shouldTrigger = price >= order.entry_price
          break
        case 'buy_limit':
          // Triggers when price falls to or below entry
          shouldTrigger = price <= order.entry_price
          break
        case 'sell_stop':
          // Triggers when price falls to or below entry
          shouldTrigger = price <= order.entry_price
          break
        case 'sell_limit':
          // Triggers when price rises to or above entry
          shouldTrigger = price >= order.entry_price
          break
      }

      if (shouldTrigger) {
        try {
          const result = await executeTrade({
            symbol: order.symbol,
            side: order.side,
            lotSize: parseFloat(order.lot_size),
            stopLoss: order.stop_loss ? parseFloat(order.stop_loss) : null,
            takeProfit: order.take_profit ? parseFloat(order.take_profit) : null,
            notes: `Pending ${order.order_type.replace('_', ' ')} triggered at $${price.toFixed(2)}`,
          })

          await supabase
            .from('pending_orders')
            .update({
              status: 'triggered',
              triggered_trade_id: (result.trade as Record<string, unknown>).id as string,
              updated_at: new Date().toISOString(),
            })
            .eq('id', order.id)

          triggered++
          results.push(result.message)
        } catch (err) {
          // Log but continue with other orders
          console.error(`Failed to trigger order ${order.id}:`, err)
        }
      }
    }

    return NextResponse.json({ triggered, results })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to check orders'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// DELETE: Cancel a pending order
export async function DELETE(request: Request) {
  try {
    const { id } = await request.json()
    if (!id) return NextResponse.json({ error: 'Order ID required' }, { status: 400 })

    await supabase
      .from('pending_orders')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', id)

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to cancel order'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
