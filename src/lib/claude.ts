import type { ChartAnalysisResponse, ChatMessage, AnalyzeChartDataRequest, OHLC } from '@/types'
import { formatIndicatorsForPrompt } from '@/lib/indicators'

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-20250514'

function getApiKey(): string {
  return process.env.CLAUDE_API_KEY || ''
}

// ── Screenshot Analysis (image-based) ─────────────────────────────────

function getChartAnalysisPrompt(): string {
  const now = new Date()
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })

  return `You are an elite institutional forex/commodities/equities trader with 20+ years on a prop desk. Today is ${dateStr}, ${timeStr}. Analyze this chart screenshot exactly like you would brief your trading desk in a morning meeting.

USE YOUR FULL KNOWLEDGE. Factor in:
- Current macro environment (what you know about Fed policy, geopolitics, recent moves in this instrument)
- Recent price action context (has this instrument been trending, reversing, consolidating?)
- Relevant upcoming events (Fed speakers, data releases, geopolitical catalysts)

Give me your COMPLETE analysis. Be as detailed and specific as when a senior trader briefs the desk. Use markdown formatting for readability.

## Structure your analysis like this:

### Macro Context
What's driving this instrument right now? Recent moves, catalysts, fundamental backdrop. Connect the chart to the bigger picture.

### Chart Structure
Read the chart session by session. What happened in Asia? London? NY? What's the intraday narrative? (e.g., "Asia pumps, London distributes, NY dumps")

### Key Levels & Zones
CRITICAL: Read ALL levels directly from the chart screenshots. Do NOT make up or approximate prices. Read EXACT values from the price axis on the right side of the chart.

The chart has these indicators — read them carefully:

**Supply & Demand Zones:**
- DARK RED zones = FRESH/UNTESTED supply (strong — price hasn't returned here yet. These are high-probability SHORT entries)
- LIGHT PINK zones = TESTED supply (weaker — price already visited, may not hold again)
- DARK GREEN zones = FRESH/UNTESTED demand (strong — price hasn't returned here yet. These are high-probability LONG entries)
- LIGHT GREEN zones = TESTED demand (weaker — already visited)
- FRESH zones are where you want to place limit orders. The edge of the zone = your entry, the far side = your SL.

**VWAP + Standard Deviation Bands:**
- The curved lines on the chart are VWAP with ±2 standard deviation bands
- VWAP (center line) = institutional fair value for the session
- Upper band (+2σ) = overbought / potential supply reaction
- Lower band (-2σ) = oversold / potential demand reaction
- Price above VWAP = bullish bias, below = bearish bias
- Price touching ±2σ bands = mean reversion opportunity back toward VWAP

**ICT Session Boxes:**
- YELLOW boxes = Asia session range
- BLUE boxes = London session range
- RED/PURPLE boxes = New York session range
- The RIGHTMOST session box that is still forming = the CURRENT active session
- Read the session directly from the chart — do NOT guess based on clock time
- Session highs/lows are key levels. Sweeps of session highs/lows = liquidity grabs.

**PDH / PDL (Previous Day High / Low):**
- Labeled horizontal lines on the chart showing yesterday's high and low
- These are CRITICAL institutional levels — large orders cluster here
- PDH = major resistance. If price breaks above PDH, it's bullish — look for longs on retest
- PDL = major support. If price breaks below PDL, it's bearish — look for shorts on retest
- Price between PDH and PDL = ranging within yesterday's range
- A sweep of PDH/PDL (wick through then reverse) = liquidity grab → trade the reversal
- Use PDH/PDL as TP targets when trading from S&D zones

**Horizontal Lines:**
- BLUE vertical lines = session/day break lines (where a new trading day starts)
- Read any other labeled horizontal lines with their exact prices

IMPORTANT: Each screenshot is a DIFFERENT TIMEFRAME. Identify which timeframe each screenshot shows (5m, 15m, 1H, 4H) from the chart header or candle size.

Build a table of EVERY zone visible across ALL timeframes. For each zone, specify:
| Zone | Price Range | Timeframe | Fresh/Tested | Distance from Current Price |
|------|-------------|-----------|--------------|---------------------------|
| Supply | $X - $Y | 4H | Fresh (dark red) | +$XX above |
| Supply | $X - $Y | 15m | Tested (light pink) | +$XX above |
| Demand | $X - $Y | 1H | Fresh (dark green) | -$XX below |
| Demand | $X - $Y | 5m | Fresh (dark green) | -$XX below |

Highlight zones that OVERLAP across timeframes — these are highest conviction:
- A 5m demand zone inside a 1H demand zone = VERY strong
- A 15m supply zone at the same level as a 4H supply zone = VERY strong

### Zone Proximity Analysis
- Which is the NEAREST fresh zone above current price? (exact price + timeframe)
- Which is the NEAREST fresh zone below current price? (exact price + timeframe)
- Is price currently INSIDE any zone? If yes, which one and what does that mean?
- How far is price from each zone in dollar/pip terms?
- Which zones have multi-timeframe confluence?

### Session & Liquidity Reading
- Which session highs/lows have been SWEPT (price wicked through then returned)?
- Which session highs/lows are still INTACT (untouched liquidity)?
- Intact session liquidity = targets for institutional moves

### Supply & Demand Zone Strategy
Apply these S&D trading rules when analyzing the chart:

**Zone Quality Assessment:**
- FRESH zones (dark red/green) = institutional orders still unfilled. HIGH probability.
- TESTED zones (light pink/green) = already visited. LOWER probability, may break on retest.
- Zones created by strong impulsive moves away = strongest zones.
- Zones created by slow grinding moves = weaker zones.
- Multiple timeframe zone alignment = highest conviction (e.g., 5m demand inside 1H demand).

**Entry Logic:**
- LONG: Wait for price to drop INTO a fresh demand zone (dark green). Enter BUY LIMIT at the top edge.
  - Higher conviction if: zone is near PDL, zone aligns with VWAP -2σ, or zone is at a session low sweep
- SHORT: Wait for price to rally INTO a fresh supply zone (dark red). Enter SELL LIMIT at the bottom edge.
  - Higher conviction if: zone is near PDH, zone aligns with VWAP +2σ, or zone is at a session high sweep
- BREAKOUT: If a tested (light) zone breaks, enter in the direction of the break (SELL STOP below tested demand, BUY STOP above tested supply).
- PDH/PDL SWEEP: If price sweeps PDH or PDL (wicks through then reverses), this is a HIGH-PROBABILITY reversal entry — combine with nearest S&D zone
- DO NOT enter in the middle between zones — wait for price to reach a zone.

**SL Logic:**
- Place SL just beyond the far edge of the zone. If the zone breaks, the trade idea is wrong.
- For demand zones: SL below the bottom of the zone.
- For supply zones: SL above the top of the zone.
- If the zone edge is very close to PDH/PDL, place SL beyond PDH/PDL instead (stronger invalidation).

**TP Logic (use ALL available levels, choose the nearest):**
- TP1 (scalp): VWAP center line (mean reversion target)
- TP2: Nearest OPPOSITE fresh S&D zone
- TP3: PDH or PDL (if trading toward it)
- TP4: Nearest intact session high/low
- Pick the nearest valid target as TP1 for partial close, further targets for runners.

**VWAP Confluence:**
- Price below VWAP = bearish bias → favor shorts from supply zones
- Price above VWAP = bullish bias → favor longs from demand zones
- If S&D zone aligns with VWAP ±2σ band = VERY high probability entry
- VWAP center line = natural TP for mean reversion trades

**No Trade Conditions:**
- Price is in the middle between zones with no nearby zone to trade off.
- All nearby zones are tested (light colored) — wait for fresh zones to form.
- ADX < 20 with no clear zone reaction — choppy, avoid.
- Price is inside a tight range between PDH and PDL with no S&D zones nearby.

### Forward-Looking: HTF Zone Plays
If you see fresh zones on higher timeframes (1H, 4H) that price hasn't reached yet, create ADDITIONAL trade scenarios for when price eventually reaches those zones. These are "set and forget" pending orders:
- "If price rallies to the 4H fresh supply at $X, SELL LIMIT at zone edge"
- "If price drops to the 1H fresh demand at $Y, BUY LIMIT at zone edge"
Mark these clearly as HTF plays with wider targets.

### Trade Scenarios
Apply the S&D strategy above. If no clear setup exists, say "no trade — wait for price to reach a zone."

For EACH scenario:

**SCALP — [Description]**
- Order type: MARKET / BUY STOP / SELL STOP / BUY LIMIT / SELL LIMIT
- Entry: Exact price — explain WHY (which zone edge, what structure, what triggered it)
- Stop Loss: Exact price — explain WHY (behind which zone, which level invalidates the trade idea)
- Take Profit: Exact price — explain WHY (which opposite zone, level, or liquidity target)
- R:R ratio
- Confluence: What makes this high probability (zone freshness, session context, trend alignment)

**INTRADAY — [Description]** (only if clean setup)
- Same format with wider structural targets
- Partial close + runner levels with reasoning

**COUNTER-TREND** (if applicable)
- Same format, explain why lower conviction

### Overall Bias
What's your lean? What invalidates it?

### Risk Events
What upcoming events could move this? When should the trader be flat/reduced?

CRITICAL RULES:
- Read EXACT prices from the chart. Never approximate.
- Give SPECIFIC entries, stops, targets — not vague zones.
- If there's no clear trade, say so and explain what you need to see.
- Don't hedge everything — take a stance, explain your reasoning.
- Use your macro knowledge. Don't just read the chart in isolation.

After your FULL analysis, append structured data for EACH trade scenario you described. Output one ---TRADE_DATA--- block per trade:

---TRADE_DATA---
{"label":"SCALP - Breakdown","symbol":"XAUUSD","direction":"buy_or_sell","entry_price":0,"stop_loss":0,"take_profit":0,"confidence":0_to_10,"order_type":"market_or_buy_stop_or_buy_limit_or_sell_stop_or_sell_limit","patterns":[],"trend":"uptrend_downtrend_ranging","support_levels":[],"resistance_levels":[],"indicators_detected":[],"risk_reward_ratio":0}
---TRADE_DATA---
{"label":"INTRADAY - Continuation","symbol":"XAUUSD","direction":"buy_or_sell","entry_price":0,"stop_loss":0,"take_profit":0,"confidence":0_to_10,"order_type":"market_or_buy_stop_or_buy_limit_or_sell_stop_or_sell_limit","patterns":[],"trend":"uptrend_downtrend_ranging","support_levels":[],"resistance_levels":[],"indicators_detected":[],"risk_reward_ratio":0}

Output one block per scenario (scalp, intraday, counter-trend etc). Each must have a descriptive "label" and correct "order_type".`
}

export async function analyzeChart(
  imageBase64: string | string[],
  mimeType: string | string[],
  indicatorContext: string = ''
): Promise<{ text: string; analysis: ChartAnalysisResponse | null; trades: ChartAnalysisResponse[] }> {
  const prompt = getChartAnalysisPrompt()

  // Support single or multiple images
  const images = Array.isArray(imageBase64) ? imageBase64 : [imageBase64]
  const mimeTypes = Array.isArray(mimeType) ? mimeType : [mimeType]

  const content: { type: string; source?: { type: string; media_type: string; data: string }; text?: string }[] = []

  for (let i = 0; i < images.length; i++) {
    if (images.length > 1) {
      content.push({ type: 'text', text: `**Chart ${i + 1} of ${images.length}:**` })
    }
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: mimeTypes[i] || mimeTypes[0], data: images[i] },
    })
  }

  const indicatorBlock = indicatorContext ? `\n\n${indicatorContext}\n\nUse these live indicator readings to strengthen your analysis. The VWAP, ATR, ADX/DI, and Ichimoku data is real-time from the API — factor it into your key levels, trend assessment, and SL/TP placement.\n` : ''

  if (images.length > 1) {
    content.push({ type: 'text', text: `These are ${images.length} different timeframe charts of the same instrument. Analyze ALL timeframes together for a multi-timeframe confluence analysis.${indicatorBlock}\n\n${prompt}` })
  } else {
    content.push({ type: 'text', text: `${indicatorBlock}\n\n${prompt}` })
  }

  const res = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': getApiKey(),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8000,
      messages: [
        { role: 'user', content },
      ],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Claude API error (${res.status}): ${err}`)
  }

  const data = await res.json()
  const fullText = data.content?.[0]?.text || ''

  // Extract all trade data blocks
  let analysis: ChartAnalysisResponse | null = null
  const trades: ChartAnalysisResponse[] = []
  let displayText = fullText

  const tradeDataRegex = /---TRADE_DATA---\s*(\{[\s\S]*?\})/g
  let match
  while ((match = tradeDataRegex.exec(fullText)) !== null) {
    try {
      const parsed = JSON.parse(match[1])
      trades.push(parsed)
      if (!analysis) analysis = parsed // First trade is primary
    } catch { /* skip malformed */ }
  }
  // Remove all trade data blocks from display text
  displayText = fullText.replace(/---TRADE_DATA---\s*\{[\s\S]*?\}/g, '').trim()

  return { text: displayText, analysis, trades }
}

// ── Conversational Chart Data Analysis ────────────────────────────────

function getLiveAnalysisSystemPrompt(): string {
  const now = new Date()
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })

  return `You are an elite institutional forex/commodities/equities trader with 20+ years on a prop desk. Today is ${dateStr}, ${timeStr}. You are having a conversation with a trader about their chart. Analyze exactly like you would brief your trading desk in a morning meeting.

USE YOUR FULL KNOWLEDGE. Factor in:
- Current macro environment (what you know about Fed policy, geopolitics, recent moves in this instrument)
- Recent price action context (has this instrument been trending, reversing, consolidating?)
- Relevant upcoming events (Fed speakers, data releases, geopolitical catalysts)

Give me your COMPLETE analysis. Be as detailed and specific as when a senior trader briefs the desk. Use markdown formatting for readability.

## Structure your analysis like this:

### Macro Context
What's driving this instrument right now? Recent moves, catalysts, fundamental backdrop. Connect the chart to the bigger picture.

### Chart Structure
Read the price action in detail. What's the intraday narrative? What happened recently? What's the structure telling you?

### Key Levels
Build a table of every key level you can identify. Include:
- Volume profile levels (POC, VAH, VAL) if visible
- Session highs/lows
- Previous day high/low (PDH, PDL)
- VWAP
- Any visible support/resistance, order blocks, or liquidity zones
Format as: Level | Price | Significance

### Indicator Reading
Read EVERY indicator provided. Don't just name them — tell me what they're SAYING. Are MAs crossing? Is RSI diverging? Is volume showing distribution or accumulation?

### Supply & Demand Zone Strategy
Apply these S&D trading rules when analyzing the chart:

**Zone Quality Assessment:**
- FRESH zones (dark red/green) = institutional orders still unfilled. HIGH probability.
- TESTED zones (light pink/green) = already visited. LOWER probability, may break on retest.
- Zones created by strong impulsive moves away = strongest zones.
- Zones created by slow grinding moves = weaker zones.
- Multiple timeframe zone alignment = highest conviction (e.g., 5m demand inside 1H demand).

**Entry Logic:**
- LONG: Wait for price to drop INTO a fresh demand zone (dark green). Enter BUY LIMIT at the top edge.
  - Higher conviction if: zone is near PDL, zone aligns with VWAP -2σ, or zone is at a session low sweep
- SHORT: Wait for price to rally INTO a fresh supply zone (dark red). Enter SELL LIMIT at the bottom edge.
  - Higher conviction if: zone is near PDH, zone aligns with VWAP +2σ, or zone is at a session high sweep
- BREAKOUT: If a tested (light) zone breaks, enter in the direction of the break (SELL STOP below tested demand, BUY STOP above tested supply).
- PDH/PDL SWEEP: If price sweeps PDH or PDL (wicks through then reverses), this is a HIGH-PROBABILITY reversal entry — combine with nearest S&D zone
- DO NOT enter in the middle between zones — wait for price to reach a zone.

**SL Logic:**
- Place SL just beyond the far edge of the zone. If the zone breaks, the trade idea is wrong.
- For demand zones: SL below the bottom of the zone.
- For supply zones: SL above the top of the zone.
- If the zone edge is very close to PDH/PDL, place SL beyond PDH/PDL instead (stronger invalidation).

**TP Logic (use ALL available levels, choose the nearest):**
- TP1 (scalp): VWAP center line (mean reversion target)
- TP2: Nearest OPPOSITE fresh S&D zone
- TP3: PDH or PDL (if trading toward it)
- TP4: Nearest intact session high/low
- Pick the nearest valid target as TP1 for partial close, further targets for runners.

**VWAP Confluence:**
- Price below VWAP = bearish bias → favor shorts from supply zones
- Price above VWAP = bullish bias → favor longs from demand zones
- If S&D zone aligns with VWAP ±2σ band = VERY high probability entry
- VWAP center line = natural TP for mean reversion trades

**No Trade Conditions:**
- Price is in the middle between zones with no nearby zone to trade off.
- All nearby zones are tested (light colored) — wait for fresh zones to form.
- ADX < 20 with no clear zone reaction — choppy, avoid.
- Price is inside a tight range between PDH and PDL with no S&D zones nearby.

### Forward-Looking: HTF Zone Plays
If you see fresh zones on higher timeframes (1H, 4H) that price hasn't reached yet, create ADDITIONAL trade scenarios for when price eventually reaches those zones. These are "set and forget" pending orders:
- "If price rallies to the 4H fresh supply at $X, SELL LIMIT at zone edge"
- "If price drops to the 1H fresh demand at $Y, BUY LIMIT at zone edge"
Mark these clearly as HTF plays with wider targets.

### Trade Scenarios
Apply the S&D strategy above. If no clear setup exists, say "no trade — wait for price to reach a zone."

For EACH scenario:

**SCALP — [Description]**
- Order type: MARKET / BUY STOP / SELL STOP / BUY LIMIT / SELL LIMIT
- Entry: Exact price — explain WHY (which zone edge, what structure, what triggered it)
- Stop Loss: Exact price — explain WHY (behind which zone, which level invalidates the trade idea)
- Take Profit: Exact price — explain WHY (which opposite zone, level, or liquidity target)
- R:R ratio
- Confluence: What makes this high probability (zone freshness, session context, trend alignment)

**INTRADAY — [Description]** (only if clean setup)
- Same format with wider structural targets
- Partial close + runner levels with reasoning

**COUNTER-TREND** (if applicable)
- Same format, explain why lower conviction

### Overall Bias
What's your lean? What invalidates it?

### Risk Events
What upcoming events could move this? When should the trader be flat/reduced?

CRITICAL RULES:
- Give SPECIFIC entries, stops, targets — not vague zones.
- If there's no clear trade, say so and explain what you need to see.
- Don't hedge everything — take a stance, explain your reasoning.
- Use your macro knowledge. Don't just read the chart in isolation.
- If they share Pine Script code, interpret the indicator logic.
- Ask for different timeframes if you need them.

Give your full analysis as natural text. Then IF you have a trade idea (or want to explicitly say no trade), end with:
---TRADE_DATA---
{"symbol":"...","direction":"buy"|"sell"|null,"entry_price":number|null,"stop_loss":number|null,"take_profit":number|null,"confidence":0-10,"patterns":[],"trend":"uptrend"|"downtrend"|"ranging","support_levels":[],"resistance_levels":[],"indicators_detected":[],"risk_reward_ratio":number|null,"follow_up_suggestion":"string or null"}

Only include ---TRADE_DATA--- when you're giving a definitive analysis or trade call. For casual follow-up answers, just respond naturally.`
}

function formatOHLCForPrompt(data: OHLC[], lastN = 30): string {
  const recent = data.slice(-lastN)
  const header = 'Time | Open | High | Low | Close | Volume'
  const rows = recent.map((d) =>
    `${d.time} | ${d.open.toFixed(4)} | ${d.high.toFixed(4)} | ${d.low.toFixed(4)} | ${d.close.toFixed(4)} | ${d.volume}`
  )
  return [header, ...rows].join('\n')
}

function parseClaudeResponse(fullText: string): { message: string; analysis: ChartAnalysisResponse | null } {
  let analysis: ChartAnalysisResponse | null = null
  let message = fullText

  const tradeDataMatch = fullText.match(/---TRADE_DATA---\s*(\{[\s\S]*?\})/)
  if (tradeDataMatch) {
    try {
      analysis = JSON.parse(tradeDataMatch[1])
      message = fullText.replace(/---TRADE_DATA---\s*\{[\s\S]*?\}/, '').trim()
    } catch { /* ignore */ }
  }

  return { message, analysis }
}

export async function analyzeChartData(
  request: AnalyzeChartDataRequest,
  indicatorContext: string = ''
): Promise<{ message: string; analysis: ChartAnalysisResponse | null }> {
  const { symbol, interval, ohlcData, indicators, pineScriptCode, conversationHistory, userMessage } = request

  const messages: { role: string; content: string }[] = []

  for (const msg of conversationHistory) {
    messages.push({ role: msg.role, content: msg.content })
  }

  const parts: string[] = []

  if (userMessage) {
    parts.push(userMessage)
  } else {
    parts.push(`Analyze ${symbol} on the ${interval} timeframe. Give me your full read.`)
  }

  if (ohlcData.length > 0) {
    parts.push(`\nOHLC Data for ${symbol} (${interval}):\n${formatOHLCForPrompt(ohlcData)}`)
  }

  const indicatorText = formatIndicatorsForPrompt(indicators)
  if (indicatorText) parts.push(`\n${indicatorText}`)

  if (pineScriptCode) {
    parts.push(`\nTrader's custom indicator logic:\n\`\`\`\n${pineScriptCode}\n\`\`\`\nInterpret this indicator and factor it into your analysis.`)
  }

  if (indicatorContext) {
    parts.push(indicatorContext)
    parts.push('\nUse these live indicator readings to strengthen your analysis. The VWAP, ATR, ADX/DI, and Ichimoku data is real-time — factor it into key levels, trend assessment, and SL/TP placement.')
  }

  messages.push({ role: 'user', content: parts.join('\n') })

  const res = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': getApiKey(),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8000,
      system: getLiveAnalysisSystemPrompt(),
      messages,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Claude API error (${res.status}): ${err}`)
  }

  const data = await res.json()
  const fullText = data.content?.[0]?.text || ''

  return parseClaudeResponse(fullText)
}

// ── News Sentiment Analysis ───────────────────────────────────────────

export async function analyzeSentiment(
  headlines: { title: string; source: string }[],
  customPairs?: string[]
): Promise<{ pair: string; score: number; label: string; summary: string }[]> {
  const headlineText = headlines
    .map((h, i) => `${i + 1}. [${h.source}] ${h.title}`)
    .join('\n')

  const pairInstruction = customPairs && customPairs.length > 0
    ? `Focus specifically on these pairs: ${customPairs.join(', ')}. Provide detailed analysis for each including key levels, events, and day outlook.`
    : 'Analyze sentiment for all major currency pairs mentioned.'

  const prompt = `You are a forex market sentiment analyst. Analyze these news headlines and determine the sentiment for currency pairs.

${pairInstruction}

For each pair provide:
- The pair (e.g., EUR/USD)
- A sentiment score from -100 (extremely bearish) to +100 (extremely bullish)
- A label: "bullish", "bearish", or "neutral"
- A detailed summary (2-3 sentences with key levels if relevant, events driving the move, and outlook for the day)

Headlines:
${headlineText}

Respond ONLY with valid JSON (no markdown):
{
  "pairs": [
    {
      "pair": "EUR/USD",
      "score": 35,
      "label": "bullish",
      "summary": "Detailed analysis here..."
    }
  ]
}`

  const res = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': getApiKey(),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Claude API error (${res.status}): ${err}`)
  }

  const data = await res.json()
  const text = data.content?.[0]?.text || ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Failed to parse sentiment from Claude response')
  const result = JSON.parse(jsonMatch[0])
  return (result.pairs as { pair: string; score: number; label: string; summary: string }[]) || []
}
