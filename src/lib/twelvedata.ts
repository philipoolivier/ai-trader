const BASE_URL = 'https://api.twelvedata.com'

function getApiKey(): string {
  return process.env.TWELVEDATA_API_KEY || ''
}

// Known bases that TwelveData expects with a slash (e.g. EUR/USD, BTC/USD)
const FOREX_BASES = ['EUR', 'GBP', 'USD', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF', 'XAU', 'XAG']
const CRYPTO_BASES = ['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOT', 'LTC', 'BNB', 'DOGE', 'AVAX', 'MATIC', 'LINK', 'UNI', 'SHIB', 'ATOM']
const QUOTE_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'USDT', 'USDC', 'BTC', 'ETH']

// Normalize symbols: BTCUSD → BTC/USD, EURUSD → EUR/USD
function normalizeSymbol(symbol: string): string {
  const s = symbol.toUpperCase().trim()
  // Already has a slash — leave it
  if (s.includes('/')) return s

  // Try splitting as 3+3 (EURUSD, BTCUSD, XAUUSD)
  if (s.length === 6) {
    const base = s.slice(0, 3)
    const quote = s.slice(3)
    if (FOREX_BASES.includes(base) || CRYPTO_BASES.includes(base)) {
      return `${base}/${quote}`
    }
    // Check if quote side is known (e.g. USDCHF where USD is base)
    if (QUOTE_CURRENCIES.includes(quote)) {
      return `${base}/${quote}`
    }
  }

  // Try splitting as 3+4 (BTCUSDT) or 4+3 (DOGEBTC) or other lengths
  if (s.length >= 6 && !s.includes('/')) {
    // Try common crypto quote suffixes
    for (const q of ['USDT', 'USDC', 'USD', 'EUR', 'GBP', 'BTC', 'ETH']) {
      if (s.endsWith(q) && s.length > q.length) {
        return `${s.slice(0, s.length - q.length)}/${q}`
      }
    }
  }

  return s
}

export async function getQuote(symbol: string) {
  const sym = normalizeSymbol(symbol)
  const res = await fetch(
    `${BASE_URL}/quote?symbol=${encodeURIComponent(sym)}&apikey=${getApiKey()}`,
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
  const q = normalizeSymbol(query)
  const res = await fetch(
    `${BASE_URL}/symbol_search?symbol=${encodeURIComponent(q)}&outputsize=10&apikey=${getApiKey()}`
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
  const sym = normalizeSymbol(symbol)
  const res = await fetch(
    `${BASE_URL}/time_series?symbol=${encodeURIComponent(sym)}&interval=${interval}&outputsize=${outputsize}&apikey=${getApiKey()}`,
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

// ── Technical Indicators ──

export interface IndicatorData {
  vwap: { datetime: string; vwap: number }[]
  atr: { datetime: string; atr: number }[]
  adx: { datetime: string; adx: number; plus_di: number; minus_di: number }[]
  ichimoku: { datetime: string; tenkan_sen: number; kijun_sen: number; senkou_span_a: number; senkou_span_b: number; chikou_span: number }[]
  bbands: { datetime: string; upper: number; middle: number; lower: number }[]
  supertrend: { datetime: string; supertrend: number; direction: string }[]
  keyLevels: { pdh: number; pdl: number; pwh: number; pwl: number; currentPrice: number }
}

async function fetchIndicator(indicator: string, symbol: string, interval: string, params: string = ''): Promise<Record<string, string>[]> {
  const sym = normalizeSymbol(symbol)
  const url = `${BASE_URL}/${indicator}?symbol=${encodeURIComponent(sym)}&interval=${interval}&outputsize=30${params}&apikey=${getApiKey()}`
  const res = await fetch(url, { next: { revalidate: 60 } })
  if (!res.ok) return []
  const data = await res.json()
  if (data.status === 'error') return []
  return data.values || []
}

export async function getIndicators(symbol: string, interval: string = '5min'): Promise<IndicatorData> {
  // Only fetch what the chart CAN'T show visually:
  // ATR (exact number for SL sizing), ADX/DI (exact trend strength)
  // PDH/PDL/PWH/PWL are on the user's chart — Claude reads them from screenshots
  const [atrRaw, adxRaw, plusDiRaw, minusDiRaw] = await Promise.all([
    fetchIndicator('atr', symbol, interval, '&time_period=14'),
    fetchIndicator('adx', symbol, interval, '&time_period=14'),
    fetchIndicator('plus_di', symbol, interval, '&time_period=14'),
    fetchIndicator('minus_di', symbol, interval, '&time_period=14'),
  ])
  const dailyOhlc: Record<string, string>[] = []

  // Set empty arrays for indicators now shown on chart visually
  const vwapRaw: Record<string, string>[] = []
  const ichimokuRaw: Record<string, string>[] = []
  const bbandsRaw: Record<string, string>[] = []
  const supertrendRaw: Record<string, string>[] = []

  // Merge ADX + DI into single objects
  const adxMap = new Map<string, { adx: number; plus_di: number; minus_di: number }>()
  for (const row of adxRaw) {
    adxMap.set(row.datetime, { adx: parseFloat(row.adx), plus_di: 0, minus_di: 0 })
  }
  for (const row of plusDiRaw) {
    const entry = adxMap.get(row.datetime)
    if (entry) entry.plus_di = parseFloat(row.plus_di)
  }
  for (const row of minusDiRaw) {
    const entry = adxMap.get(row.datetime)
    if (entry) entry.minus_di = parseFloat(row.minus_di)
  }

  // Extract key daily levels (PDH, PDL, PWH, PWL)
  const dailyCandles = dailyOhlc.map(r => ({
    high: parseFloat(r.high),
    low: parseFloat(r.low),
    close: parseFloat(r.close),
  }))
  const prevDay = dailyCandles.length > 1 ? dailyCandles[1] : dailyCandles[0]
  const weekCandles = dailyCandles.slice(0, 7)
  const keyLevels = {
    pdh: prevDay?.high || 0,
    pdl: prevDay?.low || 0,
    pwh: weekCandles.length > 0 ? Math.max(...weekCandles.map(c => c.high)) : 0,
    pwl: weekCandles.length > 0 ? Math.min(...weekCandles.map(c => c.low)) : 0,
    currentPrice: dailyCandles[0]?.close || 0,
  }

  return {
    vwap: vwapRaw.map(r => ({ datetime: r.datetime, vwap: parseFloat(r.vwap) })),
    atr: atrRaw.map(r => ({ datetime: r.datetime, atr: parseFloat(r.atr) })),
    adx: Array.from(adxMap.entries()).map(([datetime, v]) => ({ datetime, ...v })),
    ichimoku: ichimokuRaw.map(r => ({
      datetime: r.datetime,
      tenkan_sen: parseFloat(r.tenkan_sen),
      kijun_sen: parseFloat(r.kijun_sen),
      senkou_span_a: parseFloat(r.senkou_span_a),
      senkou_span_b: parseFloat(r.senkou_span_b),
      chikou_span: parseFloat(r.chikou_span),
    })),
    bbands: bbandsRaw.map(r => ({
      datetime: r.datetime,
      upper: parseFloat(r.upper_band),
      middle: parseFloat(r.middle_band),
      lower: parseFloat(r.lower_band),
    })),
    supertrend: supertrendRaw.map(r => ({
      datetime: r.datetime,
      supertrend: parseFloat(r.supertrend),
      direction: parseFloat(r.supertrend) > parseFloat(r.close || '0') ? 'bearish' : 'bullish',
    })),
    keyLevels,
  }
}

// Format indicators into a text block for Claude
export function formatIndicatorsForClaude(data: IndicatorData): string {
  const parts: string[] = []
  const dp = (v: number) => {
    const abs = Math.abs(v)
    return abs > 0 && abs < 10 ? v.toFixed(5) : abs < 200 ? v.toFixed(3) : v.toFixed(2)
  }

  // Note: PDH/PDL/PWH/PWL and VWAP are visible on the user's chart
  // Claude should read these from the screenshots, not from API data

  // ATR — the key number Claude can't read from a screenshot
  if (data.atr.length > 0) {
    const latest = data.atr[0]
    const prev = data.atr.length > 5 ? data.atr[5] : data.atr[data.atr.length - 1]
    const expanding = latest.atr > prev.atr
    parts.push(`**ATR(14)**: ${dp(latest.atr)} — Volatility ${expanding ? 'EXPANDING' : 'CONTRACTING'}
  - Use this for SL/TP sizing. Scalp SL ~${dp(latest.atr * 0.5)}-${dp(latest.atr * 1.0)} based on structure`)
  }

  // ADX + DI — exact trend strength
  if (data.adx.length > 0) {
    const latest = data.adx[0]
    let trendState = 'NO TREND (choppy — avoid or scalp mean reversion only)'
    if (latest.adx > 40) trendState = 'STRONG TREND (trend-follow setups only)'
    else if (latest.adx > 25) trendState = 'TRENDING (good for directional scalps)'
    else if (latest.adx > 20) trendState = 'WEAK TREND (be cautious, smaller size)'

    const direction = latest.plus_di > latest.minus_di ? 'BULLISH (+DI dominant)' : 'BEARISH (-DI dominant)'
    parts.push(`**ADX(14)**: ${latest.adx.toFixed(1)} — ${trendState}
  - Direction: ${direction} (+DI: ${latest.plus_di.toFixed(1)}, -DI: ${latest.minus_di.toFixed(1)})`)
  }

  if (parts.length === 0) return ''
  return `\n## Live Technical Indicators & Key Levels\n${parts.join('\n\n')}`
}

export async function getPrice(symbol: string): Promise<number> {
  const sym = normalizeSymbol(symbol)
  const res = await fetch(
    `${BASE_URL}/price?symbol=${encodeURIComponent(sym)}&apikey=${getApiKey()}`,
    { next: { revalidate: 15 } }
  )
  if (!res.ok) throw new Error(`TwelveData price error: ${res.status}`)
  const data = await res.json()
  if (data.status === 'error') throw new Error(data.message)
  return parseFloat(data.price)
}
