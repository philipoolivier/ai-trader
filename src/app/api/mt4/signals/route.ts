import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const MT4_SYMBOL_MAP: Record<string, string> = {}

function mapSymbolToMT4(symbol: string): string {
  const clean = symbol.replace('/', '').toUpperCase()
  return MT4_SYMBOL_MAP[clean] || clean
}

// GET: EA polls for new signals + commands
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const apiKey = searchParams.get('key')

  if (apiKey !== process.env.AUTH_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // New pending orders (not yet placed on MT4 — no mt4_ticket)
    // Includes close_market orders
    const { data: pending } = await supabase
      .from('pending_orders')
      .select('*')
      .eq('status', 'pending')
      .is('mt4_ticket', null)
      .order('created_at', { ascending: true })

    if (pending && pending.length > 0) {
      console.log('[SIGNALS] Returning', pending.length, 'orders:', pending.map(o => `${o.order_type} ${o.symbol} id=${o.id}`).join(', '))
    }

    const signals = (pending || []).map(order => ({
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

    // Commands: cancelled orders + closed positions from web app
    const commands: { action: string; symbol: string; side: string; entry?: number; id: string; mt4_ticket?: number }[] = []

    // Recently cancelled pending orders (within last 2 minutes)
    const { data: cancelled } = await supabase
      .from('pending_orders')
      .select('*')
      .eq('status', 'cancelled')
      .gt('updated_at', new Date(Date.now() - 120000).toISOString())

    if (cancelled) {
      for (const order of cancelled) {
        if (order.mt4_ticket) {
          commands.push({
            action: 'cancel_pending',
            symbol: mapSymbolToMT4(order.symbol),
            side: order.side,
            entry: parseFloat(order.entry_price),
            id: `cancel-${order.id}`, // Different ID so EA doesn't skip it as "already processed"
            mt4_ticket: order.mt4_ticket,
          })
        }
      }
    }

    // Close commands come through pending_orders with entry_price near 0
    // EA detects entry < 0.01 and closes the position instead of opening

    return NextResponse.json({ signals, commands, timestamp: new Date().toISOString() })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch signals'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST: EA confirms it placed a pending order on MT4
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
      // EA placed the order on MT4 — store the ticket number
      // Order stays 'pending' — portfolio position created when MT4 fills it (via sync)
      await supabase
        .from('pending_orders')
        .update({ mt4_ticket: ticket, updated_at: new Date().toISOString() })
        .eq('id', id)

      return NextResponse.json({ success: true, message: `Placed on MT4 ticket #${ticket}` })
    }

    if (action === 'cancelled') {
      await supabase
        .from('pending_orders')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', id)

      return NextResponse.json({ success: true, message: `Signal ${id} cancelled` })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to confirm signal'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
