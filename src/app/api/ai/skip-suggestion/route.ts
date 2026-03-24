import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request: Request) {
  try {
    const { suggestionId } = await request.json()

    if (!suggestionId) {
      return NextResponse.json({ error: 'Suggestion ID required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('ai_suggestions')
      .update({ status: 'skipped' })
      .eq('id', suggestionId)
      .eq('status', 'pending')

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to skip suggestion'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
