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

    // Mark position for closing — set quantity to 0
    // The EA will pick this up as a close_position command and close it on MT4
    // MT4 sync will then update the balance and record the trade
    await supabase
      .from('positions')
      .update({ quantity: 0, updated_at: new Date().toISOString() })
      .eq('id', positionId)

    return NextResponse.json({
      message: `Closing ${position.symbol} ${position.side} — MT4 will execute`,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to close position'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
