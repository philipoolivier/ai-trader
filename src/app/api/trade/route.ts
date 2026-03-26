import { NextResponse } from 'next/server'
import { executeTrade } from '@/lib/trade'

export async function POST(request: Request) {
  try {
    const { symbol, side, quantity, lotSize, leverage, notes, aiSuggestionId } = await request.json()

    const result = await executeTrade({ symbol, side, lotSize: lotSize || undefined, leverage, quantity, notes, aiSuggestionId })

    return NextResponse.json(result)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Trade failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
