const BASE_URL = 'https://api.twelvedata.com'

function getApiKey(): string {
  return process.env.TWELVEDATA_API_KEY || ''
}

export async function getQuote(symbol: string) {
  const res = await fetch(
    `${BASE_URL}/quote?symbol=${encodeURIComponent(symbol)}&apikey=${getApiKey()}`,
    { next: { revalidate: 30 } }
  )
  if (!res.ok) throw new Error(`TwelveData quote error: ${res.status}`)
  const data = await res.json()
  if (data.status === 'error') throw new Error(data.message)
  return {
    symbol: data.symbol,
    name: data.name,
    price: parseFloat(data.close),
    change: parseFloat(data.change),
    percent_change: parseFloat(data.percent_change),
    volume: parseInt(data.volume) || 0,
    open: parseFloat(data.open),
    high: parseFloat(data.high),
    low: parseFloat(data.low),
    previous_close: parseFloat(data.previous_close),
    timestamp: data.timestamp,
  }
}

export async function searchSymbol(query: string) {
  const res = await fetch(
    `${BASE_URL}/symbol_search?symbol=${encodeURIComponent(query)}&outputsize=10&apikey=${getApiKey()}`
  )
  if (!res.ok) throw new Error(`TwelveData search error: ${res.status}`)
  const data = await res.json()
  return (data.data || []).map((item: Record<string, string>) => ({
    symbol: item.symbol,
    instrument_name: item.instrument_name,
    exchange: item.exchange,
    instrument_type: item.instrument_type,
    country: item.country,
  }))
}

export async function getTimeSeries(
  symbol: string,
  interval: string = '1day',
  outputsize: number = 100
) {
  const res = await fetch(
    `${BASE_URL}/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=${outputsize}&apikey=${getApiKey()}`,
    { next: { revalidate: 60 } }
  )
  if (!res.ok) throw new Error(`TwelveData time_series error: ${res.status}`)
  const data = await res.json()
  if (data.status === 'error') throw new Error(data.message)
  return (data.values || [])
    .map((v: Record<string, string>) => ({
      time: v.datetime,
      open: parseFloat(v.open),
      high: parseFloat(v.high),
      low: parseFloat(v.low),
      close: parseFloat(v.close),
      volume: parseInt(v.volume) || 0,
    }))
    .reverse()
}

export async function getPrice(symbol: string): Promise<number> {
  const res = await fetch(
    `${BASE_URL}/price?symbol=${encodeURIComponent(symbol)}&apikey=${getApiKey()}`,
    { next: { revalidate: 15 } }
  )
  if (!res.ok) throw new Error(`TwelveData price error: ${res.status}`)
  const data = await res.json()
  if (data.status === 'error') throw new Error(data.message)
  return parseFloat(data.price)
}
