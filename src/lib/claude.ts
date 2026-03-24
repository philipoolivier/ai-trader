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

const CHART_ANALYSIS_PROMPT = `You are an expert forex and stock technical analyst with 20 years of experience. Analyze this chart screenshot and provide a precise trading analysis.

CRITICAL RULES:
- If there is NO clear trade setup, set direction to null and confidence to 0. Do NOT fabricate trades.
- Only recommend a trade when you see genuine confluence of signals.
- Be honest about what you can and cannot determine from the chart.

Identify:
1. The instrument/symbol shown (look at title, axis labels, watermarks)
2. Current trend direction (uptrend, downtrend, ranging) with evidence
3. Key support and resistance levels (specific price numbers)
4. Chart patterns (H&S, double top/bottom, triangles, flags, wedges, channels, engulfing, pin bars)
5. Visible indicators and their signals
6. Trade recommendation (or explain why there's no clear setup)
7. Confidence 1-10 (0 = no trade). Only 7+ if strong confluence exists.
8. Risk:reward ratio

If you cannot identify the symbol, use "UNKNOWN".

Respond ONLY with valid JSON (no markdown, no code blocks):
{
  "symbol": "string",
  "direction": "buy" | "sell" | null,
  "entry_price": number | null,
  "stop_loss": number | null,
  "take_profit": number | null,
  "confidence": number,
  "reasoning": "string",
  "patterns": ["pattern1"],
  "trend": "uptrend" | "downtrend" | "ranging",
  "support_levels": [number],
  "resistance_levels": [number],
  "indicators_detected": ["indicator1"],
  "risk_reward_ratio": number | null,
  "follow_up_suggestion": "string or null"
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

const SYSTEM_PROMPT = `You are an expert forex and stock technical analyst with 20 years of experience. You are having a conversation with a trader about a chart they're looking at.

CRITICAL RULES:
1. If there is NO clear trade setup, SAY SO. Set direction to null and confidence to 0. NEVER fabricate trades.
2. You may ask the trader to switch timeframes, add indicators, or provide more context.
3. Only recommend a trade when you see genuine confluence of signals (confidence 7+).
4. Be conversational - explain your reasoning, ask follow-up questions, suggest what to look at next.
5. If the trader shares Pine Script code, interpret the indicator logic and incorporate it into your analysis.

Your response MUST be valid JSON with this structure:
{
  "message": "Your conversational response to the trader. Be helpful, specific, and honest.",
  "analysis": {
    "symbol": "string",
    "direction": "buy" | "sell" | null,
    "entry_price": number | null,
    "stop_loss": number | null,
    "take_profit": number | null,
    "confidence": number,
    "reasoning": "string",
    "patterns": [],
    "trend": "uptrend" | "downtrend" | "ranging",
    "support_levels": [],
    "resistance_levels": [],
    "indicators_detected": [],
    "risk_reward_ratio": number | null,
    "follow_up_suggestion": "string or null"
  }
}

Set "analysis" to null if you're just asking a question or need more information.
Set direction to null and confidence to 0 if there's no clear trade.`

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
