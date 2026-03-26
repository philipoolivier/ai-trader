import { NextResponse } from 'next/server'
import { getIndicators, formatIndicatorsForClaude } from '@/lib/twelvedata'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const symbol = searchParams.get('symbol')
  const interval = searchParams.get('interval') || '5min'

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol required' }, { status: 400 })
  }

  try {
    const data = await getIndicators(symbol, interval)
    const formatted = formatIndicatorsForClaude(data)
    return NextResponse.json({ data, formatted })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch indicators'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
