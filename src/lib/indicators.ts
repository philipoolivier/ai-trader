import type { OHLC, IndicatorConfig, IndicatorValues } from '@/types'

export function computeSMA(closes: number[], period: number): (number | null)[] {
  const result: (number | null)[] = []
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      result.push(null)
    } else {
      let sum = 0
      for (let j = i - period + 1; j <= i; j++) sum += closes[j]
      result.push(sum / period)
    }
  }
  return result
}

export function computeEMA(closes: number[], period: number): (number | null)[] {
  const result: (number | null)[] = []
  const multiplier = 2 / (period + 1)

  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      result.push(null)
    } else if (i === period - 1) {
      let sum = 0
      for (let j = 0; j < period; j++) sum += closes[j]
      result.push(sum / period)
    } else {
      const prev = result[i - 1]!
      result.push((closes[i] - prev) * multiplier + prev)
    }
  }
  return result
}

export function computeRSI(closes: number[], period: number): (number | null)[] {
  const result: (number | null)[] = []
  if (closes.length < period + 1) return closes.map(() => null)

  const gains: number[] = []
  const losses: number[] = []

  for (let i = 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1]
    gains.push(change > 0 ? change : 0)
    losses.push(change < 0 ? Math.abs(change) : 0)
  }

  result.push(null) // first bar has no change

  for (let i = 0; i < gains.length; i++) {
    if (i < period - 1) {
      result.push(null)
    } else if (i === period - 1) {
      let avgGain = 0, avgLoss = 0
      for (let j = 0; j < period; j++) {
        avgGain += gains[j]
        avgLoss += losses[j]
      }
      avgGain /= period
      avgLoss /= period
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss
      result.push(100 - 100 / (1 + rs))
    } else {
      // Wilder's smoothing - reconstruct from previous
      let avgGain = 0, avgLoss = 0
      for (let j = i - period + 1; j <= i; j++) {
        avgGain += gains[j]
        avgLoss += losses[j]
      }
      avgGain /= period
      avgLoss /= period
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss
      result.push(100 - 100 / (1 + rs))
    }
  }
  return result
}

export function computeMACD(
  closes: number[],
  fast = 12,
  slow = 26,
  signal = 9
): { macd: (number | null)[]; signal: (number | null)[]; histogram: (number | null)[] } {
  const emaFast = computeEMA(closes, fast)
  const emaSlow = computeEMA(closes, slow)

  const macdLine: (number | null)[] = []
  for (let i = 0; i < closes.length; i++) {
    if (emaFast[i] !== null && emaSlow[i] !== null) {
      macdLine.push(emaFast[i]! - emaSlow[i]!)
    } else {
      macdLine.push(null)
    }
  }

  const macdValues = macdLine.filter((v): v is number => v !== null)
  const signalLine = computeEMA(macdValues, signal)

  // Align signal line back to full array
  const fullSignal: (number | null)[] = []
  let signalIdx = 0
  for (let i = 0; i < macdLine.length; i++) {
    if (macdLine[i] === null) {
      fullSignal.push(null)
    } else {
      fullSignal.push(signalLine[signalIdx] ?? null)
      signalIdx++
    }
  }

  const histogram: (number | null)[] = []
  for (let i = 0; i < macdLine.length; i++) {
    if (macdLine[i] !== null && fullSignal[i] !== null) {
      histogram.push(macdLine[i]! - fullSignal[i]!)
    } else {
      histogram.push(null)
    }
  }

  return { macd: macdLine, signal: fullSignal, histogram }
}

export function computeBollingerBands(
  closes: number[],
  period = 20,
  multiplier = 2
): { upper: (number | null)[]; middle: (number | null)[]; lower: (number | null)[] } {
  const middle = computeSMA(closes, period)
  const upper: (number | null)[] = []
  const lower: (number | null)[] = []

  for (let i = 0; i < closes.length; i++) {
    if (middle[i] === null) {
      upper.push(null)
      lower.push(null)
    } else {
      let sumSq = 0
      for (let j = i - period + 1; j <= i; j++) {
        sumSq += (closes[j] - middle[i]!) ** 2
      }
      const stdDev = Math.sqrt(sumSq / period)
      upper.push(middle[i]! + multiplier * stdDev)
      lower.push(middle[i]! - multiplier * stdDev)
    }
  }

  return { upper, middle, lower }
}

export function computeStochastic(
  data: OHLC[],
  kPeriod = 14,
  dPeriod = 3
): { k: (number | null)[]; d: (number | null)[] } {
  const kValues: (number | null)[] = []

  for (let i = 0; i < data.length; i++) {
    if (i < kPeriod - 1) {
      kValues.push(null)
    } else {
      let highestHigh = -Infinity
      let lowestLow = Infinity
      for (let j = i - kPeriod + 1; j <= i; j++) {
        if (data[j].high > highestHigh) highestHigh = data[j].high
        if (data[j].low < lowestLow) lowestLow = data[j].low
      }
      const range = highestHigh - lowestLow
      kValues.push(range === 0 ? 50 : ((data[i].close - lowestLow) / range) * 100)
    }
  }

  const kNonNull = kValues.filter((v): v is number => v !== null)
  const dSma = computeSMA(kNonNull, dPeriod)

  const dValues: (number | null)[] = []
  let dIdx = 0
  for (let i = 0; i < kValues.length; i++) {
    if (kValues[i] === null) {
      dValues.push(null)
    } else {
      dValues.push(dSma[dIdx] ?? null)
      dIdx++
    }
  }

  return { k: kValues, d: dValues }
}

export function computeIndicator(data: OHLC[], config: IndicatorConfig): IndicatorValues {
  const closes = data.map((d) => d.close)

  switch (config.type) {
    case 'sma': {
      const period = config.params.period || 20
      return { type: 'sma', params: config.params, values: { [`SMA(${period})`]: computeSMA(closes, period) } }
    }
    case 'ema': {
      const period = config.params.period || 20
      return { type: 'ema', params: config.params, values: { [`EMA(${period})`]: computeEMA(closes, period) } }
    }
    case 'rsi': {
      const period = config.params.period || 14
      return { type: 'rsi', params: config.params, values: { [`RSI(${period})`]: computeRSI(closes, period) } }
    }
    case 'macd': {
      const fast = config.params.fast || 12
      const slow = config.params.slow || 26
      const signal = config.params.signal || 9
      const macd = computeMACD(closes, fast, slow, signal)
      return { type: 'macd', params: config.params, values: { MACD: macd.macd, Signal: macd.signal, Histogram: macd.histogram } }
    }
    case 'bollinger': {
      const period = config.params.period || 20
      const mult = config.params.multiplier || 2
      const bb = computeBollingerBands(closes, period, mult)
      return { type: 'bollinger', params: config.params, values: { Upper: bb.upper, Middle: bb.middle, Lower: bb.lower } }
    }
    case 'stochastic': {
      const k = config.params.kPeriod || 14
      const d = config.params.dPeriod || 3
      const stoch = computeStochastic(data, k, d)
      return { type: 'stochastic', params: config.params, values: { '%K': stoch.k, '%D': stoch.d } }
    }
    default:
      return { type: config.type, params: config.params, values: {} }
  }
}

export function formatIndicatorsForPrompt(indicators: IndicatorValues[], lastN = 15): string {
  if (indicators.length === 0) return ''

  const lines: string[] = ['Active Indicators (last values):']

  for (const ind of indicators) {
    for (const [seriesName, values] of Object.entries(ind.values)) {
      const recent = values.slice(-lastN).filter((v): v is number => v !== null)
      if (recent.length > 0) {
        const last = recent[recent.length - 1]
        lines.push(`- ${seriesName}: current=${last.toFixed(4)}, recent=[${recent.slice(-5).map(v => v.toFixed(2)).join(', ')}]`)
      }
    }
  }

  return lines.join('\n')
}
