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

    // Set quantity to -1 to signal close request
    const { error: updateErr } = await supabase
      .from('positions')
      .update({ quantity: -1, updated_at: new Date().toISOString() })
      .eq('id', positionId)

    if (updateErr) {
      return NextResponse.json({ error: `Update failed: ${updateErr.message}` }, { status: 500 })
    }

    // Verify
    const { data: check } = await supabase
      .from('positions')
      .select('quantity')
      .eq('id', positionId)
      .single()

    const qty = check ? parseFloat(check.quantity) : 999

    if (qty >= 0) {
      return NextResponse.json({
        error: `Close failed: quantity is ${qty} (expected -1). DB may have rejected the update.`,
      }, { status: 500 })
    }

    return NextResponse.json({
      message: `Closing ${position.symbol} — quantity set to ${qty}, waiting for EA`,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
