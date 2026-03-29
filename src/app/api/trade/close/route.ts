import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// Simple close_commands table replacement — just use a JSON field on positions
export async function POST(request: Request) {
  try {
    const { positionId } = await request.json()
    console.log('[CLOSE] positionId:', positionId)

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

    console.log('[CLOSE] Found:', position.symbol, position.side, 'qty:', position.quantity)

    // Mark position as close_requested by setting side to 'closing_long' or 'closing_short'
    const closingSide = position.side === 'long' ? 'closing_long' : 'closing_short'
    await supabase
      .from('positions')
      .update({ side: closingSide, updated_at: new Date().toISOString() })
      .eq('id', positionId)

    console.log('[CLOSE] Marked as', closingSide)

    return NextResponse.json({
      message: `Closing ${position.symbol} — sending to MT4`,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to close position'
    console.error('[CLOSE] Error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
