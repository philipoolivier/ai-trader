import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

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

// POST: Disabled — MT4 EA handles order execution
// Orders stay 'pending' in the DB until the EA picks them up and confirms
export async function POST() {
  return NextResponse.json({ triggered: 0 })
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
