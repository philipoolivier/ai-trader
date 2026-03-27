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
      } catch (err) {
        console.error(`Failed to get price for ${sym}:`, err)
      }
    }

    let triggered = 0
    const results: string[] = []
    const errors: string[] = []

    for (const order of orders) {
      const price = prices[order.symbol]
      if (!price) {
        errors.push(`No price for ${order.symbol}`)
        continue
      }

      // Parse entry_price as number (Supabase DECIMAL returns string)
      const entryPrice = parseFloat(order.entry_price)
      if (isNaN(entryPrice)) {
        errors.push(`Invalid entry price for ${order.symbol}: ${order.entry_price}`)
        continue
      }

      let shouldTrigger = false

      switch (order.order_type) {
        case 'buy_stop':
          shouldTrigger = price >= entryPrice
          break
        case 'buy_limit':
          shouldTrigger = price <= entryPrice
          break
        case 'sell_stop':
          shouldTrigger = price <= entryPrice
          break
        case 'sell_limit':
          shouldTrigger = price >= entryPrice
          break
      }

      if (shouldTrigger) {
        try {
          const lotSize = parseFloat(order.lot_size) || 0.01
          const sl = order.stop_loss ? parseFloat(order.stop_loss) : null
          const tp = order.take_profit ? parseFloat(order.take_profit) : null

          console.log(`Triggering ${order.order_type} for ${order.symbol}: lot=${lotSize}, price=${price}, entry=${entryPrice}`)

          const result = await executeTrade({
            symbol: order.symbol,
            side: order.side,
            lotSize,
            stopLoss: sl,
            takeProfit: tp,
            notes: `Pending ${order.order_type.replace('_', ' ')} triggered at $${price}`,
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
          const msg = err instanceof Error ? err.message : String(err)
          console.error(`Failed to trigger order ${order.id} (${order.symbol} ${order.order_type}):`, msg)
          errors.push(`${order.symbol} ${order.order_type}: ${msg}`)
        }
      }
    }

    return NextResponse.json({ triggered, results, errors })
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
