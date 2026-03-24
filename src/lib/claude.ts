import type { ChartAnalysisResponse, ChatMessage, AnalyzeChartDataRequest, OHLC } from '@/types'
import { formatIndicatorsForPrompt } from '@/lib/indicators'

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-20250514'

function getApiKey(): string {
  return process.env.CLAUDE_API_KEY || ''
}

function parseJsonResponse(text: string): Record<string, unknown> {
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Failed to parse JSON from Claude response')
  return JSON.parse(jsonMatch[0])
}

// ── Screenshot Analysis (image-based) ─────────────────────────────────

const CHART_ANALYSIS_PROMPT = `You are an elite institutional forex/commodities/equities trader with 20+ years of experience. You trade live and you analyze charts like a pro. Analyze this chart screenshot with the depth and specificity of a senior prop desk analyst.

YOUR ANALYSIS MUST INCLUDE:

1. CURRENT PRICE & CONTEXT: What is the exact price? Where is it relative to the session range? What time/session is this (Asia, London, NY)?

2. KEY LEVELS (be SPECIFIC with exact prices):
   - Major resistance levels (list 3-5 with exact numbers)
   - Major support levels (list 3-5 with exact numbers)
   - Volume profile nodes / VPVR levels if visible
   - Session highs/lows (Asia high/low, London high/low, NY high/low)
   - VWAP level if visible

3. INDICATOR ANALYSIS - read EVERY indicator on the chart:
   - Moving averages (which ones, are they trending, crosses?)
   - Bollinger Bands / channels (expansion? contraction? which band?)
   - Volume profile (where are the high volume nodes?)
   - Any overlays, session boxes, etc.
   - RSI, MACD, Stochastic if visible

4. PRICE ACTION CONTEXT:
   - What happened in Asia session?
   - What happened in London session?
   - Where are we relative to NY open?
   - Is price at a decision point? Consolidating? Breaking out?

5. TRADE IDEA OR WAIT:
   - If there IS a trade: exact entry, stop loss, take profit with reasoning
   - If there is NO trade: say so clearly and explain what you need to see
   - What would change your mind? What confirmation are you looking for?

6. WHAT ELSE YOU NEED:
   - What timeframe would help? (e.g., "I'd want to see the 1H/4H for trend context")
   - What indicators would help?
   - Is a session open coming that could change things?

CRITICAL RULES:
- Do NOT fabricate trades. If the setup isn't there, say "No trade right now" and explain why.
- Be SPECIFIC with price levels - never round or approximate. Read the exact numbers from the chart.
- Read EVERYTHING on the chart - session boxes, volume profile, indicators, price labels.
- If you can see the symbol in the chart header/title, identify it precisely.
- If you cannot identify the symbol, use "UNKNOWN".

Respond ONLY with valid JSON (no markdown, no code blocks):
{
  "symbol": "string",
  "direction": "buy" | "sell" | null,
  "entry_price": number | null,
  "stop_loss": number | null,
  "take_profit": number | null,
  "confidence": number (0=no trade, 1-10),
  "reasoning": "DETAILED multi-paragraph analysis. Include ALL the context: current price, session info, what each indicator shows, volume profile reading, key levels, and your trade thesis or why you're waiting. This should be 3-6 sentences minimum - be thorough.",
  "patterns": ["pattern1", "pattern2"],
  "trend": "uptrend" | "downtrend" | "ranging",
  "support_levels": [exact numbers],
  "resistance_levels": [exact numbers],
  "indicators_detected": ["every indicator visible on chart"],
  "risk_reward_ratio": number | null,
  "follow_up_suggestion": "What you'd want to see next - timeframe, indicator, or session to wait for. Null if trade is clear."
}`

export async function analyzeChart(
  imageBase64: string,
  mimeType: string
): Promise<ChartAnalysisResponse> {
  const res = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': getApiKey(),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
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
  const text = data.content?.[0]?.text || ''
  return parseJsonResponse(text) as unknown as ChartAnalysisResponse
}

// ── Conversational Chart Data Analysis ────────────────────────────────

const SYSTEM_PROMPT = `You are an elite institutional trader with 20+ years on a prop desk. You trade forex, commodities, and equities. You are having a conversation with a trader about their chart.

HOW TO ANALYZE:
- Read EVERY data point: exact price, session context (Asia/London/NY), key levels with exact numbers
- Identify volume profile nodes, VWAP, session highs/lows, support/resistance with SPECIFIC prices
- Read all visible indicators: MAs, Bollinger, RSI, MACD, volume, session boxes, etc.
- Give context: what happened in prior sessions, where are we relative to the next session open
- Be specific about price action: is it coiling? breaking out? rejecting? consolidating?

CRITICAL RULES:
1. NEVER fabricate trades. If there's no clear setup, say so and explain what you need to see.
2. Be SPECIFIC with prices - read exact numbers from the data, never approximate.
3. Ask for different timeframes if needed ("I'd want to see the 4H for trend context")
4. Suggest indicators that would help ("Add RSI - I want to check for divergence")
5. If the trader shares Pine Script code, interpret the indicator logic.
6. Give trade ideas ONLY when there's genuine confluence. Confidence 7+ means you'd put real money on it.

Your response MUST be valid JSON:
{
  "message": "Your detailed conversational response. Be thorough - cover price levels, session context, indicator readings, and your thesis. If suggesting a trade, explain the exact logic. If no trade, explain what you're watching for.",
  "analysis": {
    "symbol": "string",
    "direction": "buy" | "sell" | null,
    "entry_price": number | null,
    "stop_loss": number | null,
    "take_profit": number | null,
    "confidence": number (0=no trade),
    "reasoning": "detailed reasoning",
    "patterns": [],
    "trend": "uptrend" | "downtrend" | "ranging",
    "support_levels": [exact numbers],
    "resistance_levels": [exact numbers],
    "indicators_detected": [],
    "risk_reward_ratio": number | null,
    "follow_up_suggestion": "what timeframe/indicator/session to watch next, or null"
  }
}

Set "analysis" to null if you're just answering a question or asking for info.
Set direction to null and confidence to 0 when there's no clear trade.`

function formatOHLCForPrompt(data: OHLC[], lastN = 30): string {
  const recent = data.slice(-lastN)
  const header = 'Time | Open | High | Low | Close | Volume'
  const rows = recent.map((d) =>
    `${d.time} | ${d.open.toFixed(4)} | ${d.high.toFixed(4)} | ${d.low.toFixed(4)} | ${d.close.toFixed(4)} | ${d.volume}`
  )
  return [header, ...rows].join('\n')
}

export async function analyzeChartData(
  request: AnalyzeChartDataRequest
): Promise<{ message: string; analysis: ChartAnalysisResponse | null }> {
  const { symbol, interval, ohlcData, indicators, pineScriptCode, conversationHistory, userMessage } = request

  // Build the messages array for multi-turn conversation
  const messages: { role: string; content: string }[] = []

  // Add conversation history
  for (const msg of conversationHistory) {
    messages.push({ role: msg.role, content: msg.content })
  }

  // Build the current user message
  const parts: string[] = []

  if (userMessage) {
    parts.push(userMessage)
  } else {
    parts.push(`Analyze this chart for ${symbol} on the ${interval} timeframe.`)
  }

  parts.push(`\nOHLC Data for ${symbol} (${interval}):\n${formatOHLCForPrompt(ohlcData)}`)

  const indicatorText = formatIndicatorsForPrompt(indicators)
  if (indicatorText) parts.push(`\n${indicatorText}`)

  if (pineScriptCode) {
    parts.push(`\nUser's Pine Script indicator logic:\n\`\`\`\n${pineScriptCode}\n\`\`\`\nInterpret this indicator logic in your analysis.`)
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
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Claude API error (${res.status}): ${err}`)
  }

  const data = await res.json()
  const text = data.content?.[0]?.text || ''

  try {
    const parsed = parseJsonResponse(text)
    return {
      message: (parsed.message as string) || text,
      analysis: parsed.analysis as ChartAnalysisResponse | null,
    }
  } catch {
    // If JSON parsing fails, return the raw text as a message
    return { message: text, analysis: null }
  }
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
  const result = parseJsonResponse(text)
  return (result.pairs as { pair: string; score: number; label: string; summary: string }[]) || []
}
