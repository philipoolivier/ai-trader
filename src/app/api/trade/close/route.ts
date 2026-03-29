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

    if (!position) {
      return NextResponse.json({ error: 'Position not found' }, { status: 404 })
    }

    // Just mark the position for closing by setting quantity to -1
    // (negative = close requested, sync won't recreate it, signals API sends close command)
    await supabase
      .from('positions')
      .update({ quantity: -1, updated_at: new Date().toISOString() })
      .eq('id', positionId)

    return NextResponse.json({
      message: `Closing ${position.symbol} — sending to MT4`,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
