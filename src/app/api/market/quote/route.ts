import { NextResponse } from 'next/server'
import { getQuote } from '@/lib/twelvedata'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const symbol = searchParams.get('symbol')

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol required' }, { status: 400 })
  }

  try {
    const quote = await getQuote(symbol)
    return NextResponse.json(quote)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch quote'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
