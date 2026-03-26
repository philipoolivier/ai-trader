const BASE_URL = 'https://api.twelvedata.com'

function getApiKey(): string {
  return process.env.TWELVEDATA_API_KEY || ''
}

// Known forex/metal bases that TwelveData expects with a slash (e.g. EUR/USD, XAU/USD)
const FOREX_BASES = ['EUR', 'GBP', 'USD', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF', 'XAU', 'XAG']

// Normalize symbols: EURUSD → EUR/USD, XAUUSD → XAU/USD
// Passes through symbols that already have a slash or aren't forex
function normalizeSymbol(symbol: string): string {
  const s = symbol.toUpperCase().trim()
  // Already has a slash — leave it
  if (s.includes('/')) return s
  // 6-char string where first 3 chars are a known forex/metal base
  if (s.length === 6 && FOREX_BASES.includes(s.slice(0, 3))) {
    return `${s.slice(0, 3)}/${s.slice(3)}`
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
  // Fetch all 4 indicators in parallel (ADX includes +DI/-DI via separate calls)
  const [vwapRaw, atrRaw, adxRaw, plusDiRaw, minusDiRaw, ichimokuRaw] = await Promise.all([
    fetchIndicator('vwap', symbol, interval),
    fetchIndicator('atr', symbol, interval, '&time_period=14'),
    fetchIndicator('adx', symbol, interval, '&time_period=14'),
    fetchIndicator('plus_di', symbol, interval, '&time_period=14'),
    fetchIndicator('minus_di', symbol, interval, '&time_period=14'),
    fetchIndicator('ichimoku', symbol, interval, '&conversion_line_period=9&base_line_period=26&leading_span_b_period=52&lagging_span_period=26'),
  ])

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
  }
}

// Format indicators into a text block for Claude
export function formatIndicatorsForClaude(data: IndicatorData): string {
  const parts: string[] = []

  // VWAP
  if (data.vwap.length > 0) {
    const latest = data.vwap[0]
    parts.push(`**VWAP**: Current ${latest.vwap.toFixed(4)} — Price ${latest.vwap > 0 ? 'relative to institutional fair value' : ''}`)
  }

  // ATR
  if (data.atr.length > 0) {
    const latest = data.atr[0]
    const prev = data.atr.length > 5 ? data.atr[5] : data.atr[data.atr.length - 1]
    const expanding = latest.atr > prev.atr
    parts.push(`**ATR(14)**: ${latest.atr.toFixed(4)} — Volatility ${expanding ? 'EXPANDING' : 'CONTRACTING'}. Use this for SL/TP sizing.`)
  }

  // ADX + DI
  if (data.adx.length > 0) {
    const latest = data.adx[0]
    let trendState = 'NO TREND (choppy, avoid trading)'
    if (latest.adx > 40) trendState = 'STRONG TREND'
    else if (latest.adx > 25) trendState = 'TRENDING'
    else if (latest.adx > 20) trendState = 'WEAK TREND'

    const direction = latest.plus_di > latest.minus_di ? 'BULLISH (+DI dominant)' : 'BEARISH (-DI dominant)'
    parts.push(`**ADX(14)**: ${latest.adx.toFixed(1)} — ${trendState}. Direction: ${direction} (+DI: ${latest.plus_di.toFixed(1)}, -DI: ${latest.minus_di.toFixed(1)})`)
  }

  // Ichimoku
  if (data.ichimoku.length > 0) {
    const latest = data.ichimoku[0]
    const cloudTop = Math.max(latest.senkou_span_a, latest.senkou_span_b)
    const cloudBottom = Math.min(latest.senkou_span_a, latest.senkou_span_b)
    const cloudBullish = latest.senkou_span_a > latest.senkou_span_b
    parts.push(`**Ichimoku Cloud**:
  - Tenkan-sen (conversion): ${latest.tenkan_sen.toFixed(4)}
  - Kijun-sen (base): ${latest.kijun_sen.toFixed(4)}
  - Cloud Top: ${cloudTop.toFixed(4)}, Cloud Bottom: ${cloudBottom.toFixed(4)} — Cloud is ${cloudBullish ? 'BULLISH (green)' : 'BEARISH (red)'}
  - Chikou Span: ${latest.chikou_span.toFixed(4)}
  - Key levels from Ichimoku: Tenkan at ${latest.tenkan_sen.toFixed(4)}, Kijun at ${latest.kijun_sen.toFixed(4)}, Cloud zone ${cloudBottom.toFixed(4)}-${cloudTop.toFixed(4)}`)
  }

  if (parts.length === 0) return ''
  return `\n## Live Technical Indicators (from TwelveData API)\n${parts.join('\n\n')}`
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
