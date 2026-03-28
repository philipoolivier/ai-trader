const BASE_URL = 'https://finnhub.io/api/v1'

function getApiKey(): string {
  return process.env.FINNHUB_API_KEY || ''
}

interface FinnhubNews {
  category: string
  datetime: number
  headline: string
  id: number
  image: string
  related: string
  source: string
  summary: string
  url: string
}

export async function getForexNews(): Promise<
  { title: string; source: string; url: string; published_at: string }[]
> {
  const apiKey = getApiKey()

  // If no Finnhub key, fall back to a general news fetch
  if (!apiKey) {
    return getFallbackNews()
  }

  const res = await fetch(
    `${BASE_URL}/news?category=forex&apikey=${apiKey}`,
    { next: { revalidate: 1800 } } // 30 min cache
  )

  if (!res.ok) {
    console.error('Finnhub error:', res.status)
    return getFallbackNews()
  }

  const data: FinnhubNews[] = await res.json()

  return data.slice(0, 20).map((item) => ({
    title: item.headline,
    source: item.source,
    url: item.url,
    published_at: new Date(item.datetime * 1000).toISOString(),
  }))
}

// Fallback: use general Finnhub news filtered for forex keywords
async function getFallbackNews(): Promise<
  { title: string; source: string; url: string; published_at: string }[]
> {
  const apiKey = getApiKey()
  if (!apiKey) {
    // Return placeholder headlines for sentiment analysis
    return [
      { title: 'USD strengthens on Fed rate decision expectations', source: 'Market News', url: '', published_at: new Date().toISOString() },
      { title: 'EUR/USD tests key support as ECB signals pause', source: 'Forex Daily', url: '', published_at: new Date().toISOString() },
      { title: 'GBP/USD rises on better-than-expected UK data', source: 'FX Wire', url: '', published_at: new Date().toISOString() },
      { title: 'USD/JPY reaches multi-week high amid risk appetite', source: 'Asia FX', url: '', published_at: new Date().toISOString() },
      { title: 'Gold prices steady as traders await inflation data', source: 'Commodities', url: '', published_at: new Date().toISOString() },
    ]
  }

  const res = await fetch(
    `${BASE_URL}/news?category=general&apikey=${apiKey}`,
    { next: { revalidate: 1800 } }
  )

  if (!res.ok) return []

  const data: FinnhubNews[] = await res.json()
  const forexKeywords = ['forex', 'currency', 'USD', 'EUR', 'GBP', 'JPY', 'fed', 'ecb', 'boj', 'rate', 'inflation']

  return data
    .filter((item) =>
      forexKeywords.some((kw) =>
        item.headline.toLowerCase().includes(kw.toLowerCase())
      )
    )
    .slice(0, 20)
    .map((item) => ({
      title: item.headline,
      source: item.source,
      url: item.url,
      published_at: new Date(item.datetime * 1000).toISOString(),
    }))
}

// Economic Calendar — upcoming high-impact events
export async function getEconomicCalendar(): Promise<
  { time: string; event: string; country: string; impact: string; estimate: string; previous: string; actual: string }[]
> {
  const apiKey = getApiKey()
  if (!apiKey) return []

  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const from = today.toISOString().split('T')[0]
  const to = tomorrow.toISOString().split('T')[0]

  try {
    const res = await fetch(
      `${BASE_URL}/calendar/economic?from=${from}&to=${to}&token=${apiKey}`,
      { next: { revalidate: 300 } } // 5 min cache
    )

    if (!res.ok) return []
    const data = await res.json()

    // Filter for high/medium impact events
    return (data.economicCalendar || [])
      .filter((e: { impact: string }) => e.impact === 'high' || e.impact === 'medium')
      .slice(0, 15)
      .map((e: { time: string; event: string; country: string; impact: string; estimate: string; prev: string; actual: string }) => ({
        time: e.time,
        event: e.event,
        country: e.country,
        impact: e.impact,
        estimate: e.estimate || '',
        previous: e.prev || '',
        actual: e.actual || '',
      }))
  } catch {
    return []
  }
}

// Current trading session based on UTC time
export function getCurrentSession(): { name: string; description: string; note: string } {
  const now = new Date()
  const utcHour = now.getUTCHours()

  // Asia: 00:00 - 08:00 UTC (Tokyo 9am-5pm)
  // London: 07:00 - 16:00 UTC (London 7am-4pm)
  // New York: 12:00 - 21:00 UTC (NY 8am-5pm)
  // London/NY overlap: 12:00 - 16:00 UTC

  if (utcHour >= 12 && utcHour < 16) {
    return {
      name: 'London/NY Overlap',
      description: 'Highest volume and volatility. Best time for breakouts and trend moves.',
      note: 'This is the most liquid session — expect strong moves and zone reactions.',
    }
  }
  if (utcHour >= 7 && utcHour < 16) {
    return {
      name: 'London Session',
      description: 'High volume. Institutional activity. Key reversals and trend starts.',
      note: 'London often sweeps Asia highs/lows before reversing. Watch for liquidity grabs.',
    }
  }
  if (utcHour >= 12 && utcHour < 21) {
    return {
      name: 'New York Session',
      description: 'Second highest volume. Often continues or reverses London moves.',
      note: 'NY PM session (after 16:00 UTC) is typically lower volume — tighter stops.',
    }
  }
  if (utcHour >= 0 && utcHour < 8) {
    return {
      name: 'Asia Session',
      description: 'Lower volume. Range-building. Sets up the day\'s liquidity.',
      note: 'Asia ranges get swept in London. Mark Asia high/low for liquidity targets.',
    }
  }

  return {
    name: 'Off-hours',
    description: 'Between major sessions. Lower liquidity.',
    note: 'Wider spreads, less reliable moves. Consider waiting for the next session.',
  }
}
