import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { executeTrade } from '@/lib/trade'

export async function POST(request: Request) {
  try {
    const { suggestionId, symbol, side, lotSize, quantity } = await request.json()
    const lots = lotSize || 0.01 // Default to 0.01 lots for AI trades

    if (!suggestionId || !symbol || !side) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Verify suggestion exists and is pending
    const { data: suggestion } = await supabase
      .from('ai_suggestions')
      .select('*')
      .eq('id', suggestionId)
      .eq('status', 'pending')
      .single()

    if (!suggestion) {
      return NextResponse.json({ error: 'Suggestion not found or already acted on' }, { status: 404 })
    }

    // Execute the trade
    const result = await executeTrade({
      symbol,
      side,
      lotSize: lots,
      notes: `AI suggestion (confidence: ${suggestion.confidence}/10) - ${suggestion.reasoning?.slice(0, 100)}`,
      aiSuggestionId: suggestionId,
    })

    // Update suggestion status
    await supabase
      .from('ai_suggestions')
      .update({
        status: 'taken',
        trade_id: (result.trade as Record<string, unknown>).id as string,
      })
      .eq('id', suggestionId)

    return NextResponse.json(result)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to execute AI trade'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
