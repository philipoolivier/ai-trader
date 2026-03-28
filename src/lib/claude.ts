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

### Key Levels
IMPORTANT: Read ALL levels directly from the chart screenshots. The chart has ICT session boxes (Asia, London, NY), VRVP (volume profile), order blocks, and key horizontal levels drawn on it. Read the EXACT prices from what you SEE — do NOT make up or approximate levels.

Build a table of every key level visible on the chart:
- Session highs/lows from the colored session boxes (read exact prices from the price axis)
- Volume profile levels: POC (point of control), high volume nodes, low volume nodes from VRVP
- Order blocks and liquidity zones (colored rectangles on chart)
- Any horizontal lines or levels drawn on the chart
- PDH/PDL if visible
Format as: Level | Price | Significance

### Indicator Reading
Read EVERY indicator visible on the chart. The chart has VRVP, ICT zones, session boxes, and possibly VWAP/EMAs. Tell me what they're SAYING — where is volume concentrated? Where are the liquidity pools? What do the session ranges tell us about institutional activity?

### Trade Scenarios
This trader is a SCALPER on a small account ($500). Trade sizing must be TIGHT.

CRITICAL SIZING RULES:
- SL must be TIGHT and placed at the nearest structural invalidation — NOT wide swing levels
- For scalps: SL should be 5-15 pips on forex, $8-20 on gold, $200-500 on BTC
- For intraday: SL can be wider but still structural, not arbitrary
- TP should be at the NEAREST reaction level for scalps (quick in/out)
- The trader uses % risk position sizing, so tight SL = bigger lot size = same risk
- NEVER suggest SL that would risk more than 2% of a $500 account at 0.01 lots
- Prefer multiple small scalps over one big swing

IMPORTANT: Place SL/TP based on STRUCTURE, not fixed distances:
- SL behind the nearest micro structure: wick high/low, 5m order block, FVG edge, micro swing
- TP at the next liquidity pocket, session level, or micro structure
- Adapt to the instrument's typical range

For EACH scenario:

**SCALP — [Description]**
- Order type: MARKET / BUY STOP / SELL STOP / BUY LIMIT / SELL LIMIT
- Entry: Exact price and why here
- Stop: Exact price — TIGHT, behind nearest micro structure
- Target: Exact price — next immediate level (quick profit)
- R:R ratio (aim for minimum 1.5:1)
- Confluence: What makes this high probability

**INTRADAY — [Description]** (only if clean setup)
- Same format, slightly wider but still structural
- Partial close + runner target

**COUNTER-TREND** (if applicable)
- Same format, lower conviction

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

### Trade Scenarios
This trader is a SCALPER on a small account ($500). Trade sizing must be TIGHT.

CRITICAL SIZING RULES:
- SL must be TIGHT and placed at the nearest structural invalidation — NOT wide swing levels
- For scalps: SL should be 5-15 pips on forex, $8-20 on gold, $200-500 on BTC
- For intraday: SL can be wider but still structural, not arbitrary
- TP should be at the NEAREST reaction level for scalps (quick in/out)
- The trader uses % risk position sizing, so tight SL = bigger lot size = same risk
- NEVER suggest SL that would risk more than 2% of a $500 account at 0.01 lots
- Prefer multiple small scalps over one big swing

IMPORTANT: Place SL/TP based on STRUCTURE, not fixed distances:
- SL behind the nearest micro structure: wick high/low, 5m order block, FVG edge, micro swing
- TP at the next liquidity pocket, session level, or micro structure
- Adapt to the instrument's typical range

For EACH scenario:

**SCALP — [Description]**
- Order type: MARKET / BUY STOP / SELL STOP / BUY LIMIT / SELL LIMIT
- Entry: Exact price and why here
- Stop: Exact price — TIGHT, behind nearest micro structure
- Target: Exact price — next immediate level (quick profit)
- R:R ratio (aim for minimum 1.5:1)
- Confluence: What makes this high probability

**INTRADAY — [Description]** (only if clean setup)
- Same format, slightly wider but still structural
- Partial close + runner target

**COUNTER-TREND** (if applicable)
- Same format, lower conviction

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
