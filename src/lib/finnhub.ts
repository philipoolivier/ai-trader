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

// Session context from market timestamp
export function getSessionFromTimestamp(timestamp: number | string): { name: string; description: string; note: string } {
  // TwelveData returns UNIX timestamp or datetime string
  const date = typeof timestamp === 'number'
    ? new Date(timestamp * 1000)
    : new Date(timestamp)

  const utcHour = date.getUTCHours()
  const utcMin = date.getUTCMinutes()
  const utcTime = `${String(utcHour).padStart(2, '0')}:${String(utcMin).padStart(2, '0')} UTC`
  const marketDay = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][date.getUTCDay()]

  // Weekend check
  const day = date.getUTCDay()
  if (day === 0 || day === 6) {
    return {
      name: `Market Closed (${marketDay} ${utcTime})`,
      description: 'Weekend — forex/metals markets closed. Crypto may still trade.',
      note: 'No trading. Analyze for Monday open preparation.',
    }
  }

  // Session times (UTC)
  let session = ''
  let desc = ''
  let note = ''

  if (utcHour >= 12 && utcHour < 16) {
    session = `London/NY Overlap (${utcTime})`
    desc = 'Highest volume and volatility. Best time for breakouts and trend continuation.'
    note = 'Most liquid session — strong zone reactions, clean moves. Best scalping window.'
  } else if (utcHour >= 7 && utcHour < 12) {
    session = `London Session (${utcTime})`
    desc = 'High volume. Institutional activity. Key reversals and trend starts.'
    note = 'London often sweeps Asia highs/lows before reversing. Watch for liquidity grabs at Asia range.'
  } else if (utcHour >= 16 && utcHour < 21) {
    session = `New York PM (${utcTime})`
    desc = 'Declining volume after overlap. Often consolidates or extends earlier moves.'
    note = 'Tighter stops. Less conviction on new entries. Better for managing existing trades.'
  } else if (utcHour >= 12 && utcHour < 21) {
    session = `New York Session (${utcTime})`
    desc = 'Second highest volume. Often continues or reverses London direction.'
    note = 'NY open (12:00-14:00 UTC) can be volatile. After 16:00 UTC volume drops.'
  } else if (utcHour >= 22 || utcHour < 7) {
    session = `Asia/Pacific Session (${utcTime})`
    desc = 'Lower volume. Range-building. Sets up liquidity for London.'
    note = 'Asia highs/lows will likely get swept in London. Smaller moves, wider spreads.'
  } else {
    session = `Pre-London (${utcTime})`
    desc = 'Transition period. Early European traders entering.'
    note = 'Watch for early directional signals ahead of London open.'
  }

  return { name: session, description: desc, note: note }
}
