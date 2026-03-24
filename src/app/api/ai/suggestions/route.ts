import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const DEFAULT_USER_ID = 'default-user'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    const { data: portfolio } = await supabase
      .from('portfolios')
      .select('id')
      .eq('user_id', DEFAULT_USER_ID)
      .single()

    if (!portfolio) {
      return NextResponse.json([])
    }

    let query = supabase
      .from('ai_suggestions')
      .select('*')
      .eq('portfolio_id', portfolio.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (status) {
      query = query.eq('status', status)
    }

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json(data || [])
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch suggestions'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const { id } = await request.json()

    if (!id) {
      return NextResponse.json({ error: 'Suggestion ID required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('ai_suggestions')
      .delete()
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete suggestion'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
