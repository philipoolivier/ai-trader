// Market data via Finnhub API (replaced TwelveData)
const BASE_URL = 'https://finnhub.io/api/v1'

function getApiKey(): string {
  return process.env.FINNHUB_API_KEY || ''
}

// Known forex/metal base currencies
const FOREX_BASES = ['EUR', 'GBP', 'USD', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF', 'XAU', 'XAG']

// Detect if a symbol is forex or metal (EUR/USD, EURUSD, XAUUSD, XAU/USD)
function isForexOrMetal(symbol: string): boolean {
  const s = symbol.toUpperCase()
  if (/^[A-Z]{3}\/[A-Z]{3}$/.test(s)) return true
  if (/^[A-Z]{6}$/.test(s)) {
    const base = s.slice(0, 3)
    return FOREX_BASES.includes(base)
  }
  return false
}

// Convert EUR/USD or EURUSD → OANDA:EUR_USD for Finnhub forex endpoints
function toFinnhubForex(symbol: string): string {
  const s = symbol.toUpperCase().replace('/', '')
  const base = s.slice(0, 3)
  const quote = s.slice(3, 6)
  return `OANDA:${base}_${quote}`
}

// Map TwelveData-style intervals to Finnhub resolutions
function toFinnhubResolution(interval: string): string {
  const map: Record<string, string> = {
    '1min': '1', '5min': '5', '15min': '15', '30min': '30', '60min': '60',
    '1h': '60', '4h': '60', // Finnhub free doesn't have 4h, use 60min
    '1day': 'D', '1week': 'W', '1month': 'M',
  }
  return map[interval] || 'D'
}

export async function getQuote(symbol: string) {
  const token = getApiKey()

  if (isForexOrMetal(symbol)) {
    // For forex, use the candle endpoint to get latest data
    const finnhubSymbol = toFinnhubForex(symbol)
    const now = Math.floor(Date.now() / 1000)
    const from = now - 86400 * 3 // 3 days back to ensure we get data

    const res = await fetch(
      `${BASE_URL}/forex/candle?symbol=${encodeURIComponent(finnhubSymbol)}&resolution=D&from=${from}&to=${now}&token=${token}`,
      { next: { revalidate: 30 } }
    )
    if (!res.ok) throw new Error(`Finnhub forex quote error: ${res.status}`)
    const data = await res.json()
    if (data.s === 'no_data') throw new Error(`No data for ${symbol}`)

    const last = data.c.length - 1
    const prev = last > 0 ? last - 1 : 0
    const price = data.c[last]
    const prevClose = data.c[prev]
    const change = price - prevClose
    const percentChange = prevClose ? (change / prevClose) * 100 : 0

    return {
      symbol: symbol.toUpperCase(),
      name: symbol.toUpperCase(),
      price,
      change,
      percent_change: percentChange,
      volume: data.v?.[last] || 0,
      open: data.o[last],
      high: data.h[last],
      low: data.l[last],
      previous_close: prevClose,
      timestamp: data.t[last],
    }
  }

  // Stock quote
  const res = await fetch(
    `${BASE_URL}/quote?symbol=${encodeURIComponent(symbol.toUpperCase())}&token=${token}`,
    { next: { revalidate: 30 } }
  )
  if (!res.ok) throw new Error(`Finnhub quote error: ${res.status}`)
  const data = await res.json()
  if (!data.c && data.c !== 0) throw new Error(`No data for ${symbol}`)

  return {
    symbol: symbol.toUpperCase(),
    name: symbol.toUpperCase(),
    price: data.c,
    change: data.d || 0,
    percent_change: data.dp || 0,
    volume: 0, // Finnhub quote doesn't include volume
    open: data.o,
    high: data.h,
    low: data.l,
    previous_close: data.pc,
    timestamp: data.t,
  }
}

export async function searchSymbol(query: string) {
  const token = getApiKey()
  const res = await fetch(
    `${BASE_URL}/search?q=${encodeURIComponent(query)}&token=${token}`
  )
  if (!res.ok) throw new Error(`Finnhub search error: ${res.status}`)
  const data = await res.json()
  return (data.result || []).map((item: Record<string, string>) => ({
    symbol: item.symbol,
    instrument_name: item.description,
    exchange: '',
    instrument_type: item.type || '',
    country: '',
  }))
}

export async function getTimeSeries(
  symbol: string,
  interval: string = '1day',
  outputsize: number = 100
) {
  const token = getApiKey()
  const resolution = toFinnhubResolution(interval)
  const now = Math.floor(Date.now() / 1000)

  // Calculate "from" based on outputsize and resolution
  const secondsPerBar: Record<string, number> = {
    '1': 60, '5': 300, '15': 900, '30': 1800, '60': 3600,
    'D': 86400, 'W': 604800, 'M': 2592000,
  }
  const barSeconds = secondsPerBar[resolution] || 86400
  // Add 50% buffer for weekends/holidays
  const from = now - Math.ceil(outputsize * barSeconds * 1.5)

  const isForex = isForexOrMetal(symbol)
  const endpoint = isForex ? 'forex/candle' : 'stock/candle'
  const finnhubSymbol = isForex ? toFinnhubForex(symbol) : symbol.toUpperCase()

  const res = await fetch(
    `${BASE_URL}/${endpoint}?symbol=${encodeURIComponent(finnhubSymbol)}&resolution=${resolution}&from=${from}&to=${now}&token=${token}`,
    { next: { revalidate: 60 } }
  )
  if (!res.ok) throw new Error(`Finnhub candle error: ${res.status}`)
  const data = await res.json()
  if (data.s === 'no_data') throw new Error(`No candle data for ${symbol}`)

  // Finnhub returns parallel arrays, convert to objects
  const candles = []
  const len = Math.min(data.t?.length || 0, outputsize)
  const startIdx = Math.max(0, (data.t?.length || 0) - outputsize)

  for (let i = startIdx; i < (data.t?.length || 0); i++) {
    candles.push({
      time: new Date(data.t[i] * 1000).toISOString().split('T')[0],
      open: data.o[i],
      high: data.h[i],
      low: data.l[i],
      close: data.c[i],
      volume: data.v?.[i] || 0,
    })
  }

  return candles
}

export async function getPrice(symbol: string): Promise<number> {
  const quote = await getQuote(symbol)
  return quote.price
}
