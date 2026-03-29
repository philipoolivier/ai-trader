import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// POST: User clicks close → adds to close_queue on portfolios table
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { positionId } = body

    if (!positionId) {
      return NextResponse.json({ error: 'Position ID required' }, { status: 400 })
    }

    // Get position details
    const { data: position } = await supabase
      .from('positions')
      .select('*')
      .eq('id', positionId)
      .single()

    if (!position) {
      return NextResponse.json({ error: 'Position not found' }, { status: 404 })
    }

    const symbol = position.symbol.replace('/', '').toUpperCase()
    const side = position.side === 'long' ? 'buy' : 'sell'

    // Get portfolio
    const { data: portfolio } = await supabase
      .from('portfolios')
      .select('id, close_queue')
      .eq('user_id', 'default-user')
      .single()

    if (!portfolio) {
      return NextResponse.json({ error: 'Portfolio not found' }, { status: 404 })
    }

    // Add to close queue (TEXT column storing JSON array)
    let queue: { symbol: string; side: string; id: string }[] = []
    try {
      if (portfolio.close_queue) queue = JSON.parse(portfolio.close_queue)
    } catch { /* empty */ }

    const closeId = `close-${Date.now()}`
    queue.push({ symbol, side, id: closeId })

    const { error: updateErr } = await supabase
      .from('portfolios')
      .update({ close_queue: JSON.stringify(queue) })
      .eq('id', portfolio.id)

    if (updateErr) {
      console.error('[CLOSE] Queue update failed:', updateErr.message)
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    console.log('[CLOSE] Queued:', symbol, side, 'queue:', queue.length)
    return NextResponse.json({ message: `Closing ${symbol} — sending to MT4` })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
