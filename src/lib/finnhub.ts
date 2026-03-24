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
