import { NextResponse } from 'next/server'
import { getTimeSeries } from '@/lib/twelvedata'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const symbol = searchParams.get('symbol')
  const interval = searchParams.get('interval') || '1day'
  const outputsize = parseInt(searchParams.get('outputsize') || '100')

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol required' }, { status: 400 })
  }

  try {
    const data = await getTimeSeries(symbol, interval, outputsize)
    return NextResponse.json(data)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch history'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
