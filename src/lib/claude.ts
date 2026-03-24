import type { ChartAnalysisResponse, ChatMessage, AnalyzeChartDataRequest, OHLC } from '@/types'
import { formatIndicatorsForPrompt } from '@/lib/indicators'

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-20250514'

function getApiKey(): string {
  return process.env.CLAUDE_API_KEY || ''
}

// ── Screenshot Analysis (image-based) ─────────────────────────────────

const CHART_ANALYSIS_PROMPT = `You are an elite institutional forex/commodities/equities trader with 20+ years on a prop desk. Analyze this chart screenshot exactly like you would brief your trading desk.

Give me your FULL read — don't hold back. Cover:

**Current Price & Context** — exact price, what time/session (Asia, London, NY pre-market, NY open), where in the session range

**Key Levels** — read EVERY level you can see. Be specific with exact prices:
- Resistance levels with exact numbers
- Support levels with exact numbers
- Volume profile / VPVR nodes if visible (where are the high volume nodes?)
- Session highs and lows (Asia H/L, London H/L, prior day H/L)
- VWAP if visible
- Any horizontal levels, order blocks, or liquidity zones

**Indicator Analysis** — read EVERY indicator on the chart:
- Moving averages (which ones, trending direction, any crosses?)
- Bollinger Bands / channels (expansion? contraction? which band is price touching?)
- Volume profile reading
- Any session boxes, overlays, custom indicators
- RSI, MACD, Stochastic, or any oscillators if visible
- Describe what the indicators ARE telling you, not just that they exist

**Price Action** — what's the STORY of this chart?
- What happened in each session visible on the chart?
- Is price at a decision point? Coiling? Breaking out? Rejecting? Consolidating?
- Any notable candle patterns (engulfing, pin bars, dojis)?
- Momentum direction and strength

**Trade Idea or Wait** — be honest:
- If there's a setup: exact entry, stop loss, take profit, and WHY
- If there's NO setup: say so and explain what you need to see before entering
- What's your bias? What would invalidate it?

**What Else You Need** — what timeframe, indicator, or session open would help you make a better call?

CRITICAL: Be SPECIFIC with prices — read the exact numbers from the chart. Don't round. Don't approximate. If you can't read a number, say so.

After your full analysis, end with a JSON block on its own line formatted exactly like this:
---TRADE_DATA---
{"symbol":"XAUUSD","direction":"buy","entry_price":4401.50,"stop_loss":4380.00,"take_profit":4462.00,"confidence":7,"patterns":["bullish engulfing","support bounce"],"trend":"uptrend","support_levels":[4380,4351,4320],"resistance_levels":[4420,4462,4500],"indicators_detected":["VWAP","EMA 20","Volume Profile","Session Boxes"],"risk_reward_ratio":2.8,"follow_up_suggestion":"Show me the 4H for trend context"}

If there is NO trade, use: {"symbol":"XAUUSD","direction":null,"entry_price":null,"stop_loss":null,"take_profit":null,"confidence":0,"patterns":[],"trend":"ranging","support_levels":[],"resistance_levels":[],"indicators_detected":[],"risk_reward_ratio":null,"follow_up_suggestion":"Wait for NY open and check the 1H"}`

export async function analyzeChart(
  imageBase64: string,
  mimeType: string
): Promise<{ text: string; analysis: ChartAnalysisResponse | null }> {
  const res = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': getApiKey(),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mimeType, data: imageBase64 },
            },
            { type: 'text', text: CHART_ANALYSIS_PROMPT },
          ],
        },
      ],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Claude API error (${res.status}): ${err}`)
  }

  const data = await res.json()
  const fullText = data.content?.[0]?.text || ''

  // Extract trade data from the end of the response
  let analysis: ChartAnalysisResponse | null = null
  let displayText = fullText

  const tradeDataMatch = fullText.match(/---TRADE_DATA---\s*(\{[\s\S]*?\})/)
  if (tradeDataMatch) {
    try {
      analysis = JSON.parse(tradeDataMatch[1])
      // Remove the trade data block from display text
      displayText = fullText.replace(/---TRADE_DATA---\s*\{[\s\S]*?\}/, '').trim()
    } catch {
      // If JSON parsing fails, just use the full text
    }
  }

  return { text: displayText, analysis }
}

// ── Conversational Chart Data Analysis ────────────────────────────────

const SYSTEM_PROMPT = `You are an elite institutional trader with 20+ years on a prop desk. You trade forex, commodities, and equities live. You are having a conversation with a trader about their chart.

Analyze like you're briefing your desk — full depth, specific prices, session context, indicator readings, the whole picture.

RULES:
1. NEVER fabricate trades. If there's no setup, say "No trade right now" and explain what you need to see.
2. Be SPECIFIC with prices — exact numbers, never approximate.
3. Ask for different timeframes if you need them.
4. Suggest indicators that would help your read.
5. If they share Pine Script code, interpret the indicator logic.
6. Give trade ideas ONLY when there's genuine confluence.

Give your full analysis as natural text. Then IF you have a trade idea (or want to explicitly say no trade), end with:
---TRADE_DATA---
{"symbol":"...","direction":"buy"|"sell"|null,"entry_price":number|null,"stop_loss":number|null,"take_profit":number|null,"confidence":0-10,"patterns":[],"trend":"uptrend"|"downtrend"|"ranging","support_levels":[],"resistance_levels":[],"indicators_detected":[],"risk_reward_ratio":number|null,"follow_up_suggestion":"string or null"}

Only include ---TRADE_DATA--- when you're giving a definitive analysis or trade call. For casual follow-up answers, just respond naturally.`

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
  request: AnalyzeChartDataRequest
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
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
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
