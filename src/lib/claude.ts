import type { ChartAnalysisResponse } from '@/types'

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages'

function getApiKey(): string {
  return process.env.CLAUDE_API_KEY || ''
}

const CHART_ANALYSIS_PROMPT = `You are an expert forex and stock technical analyst with 20 years of experience. Analyze this chart screenshot and provide a precise trading analysis.

Identify:
1. The instrument/symbol shown (look at title, axis labels, watermarks)
2. Current trend direction (uptrend, downtrend, ranging) with evidence
3. Key support and resistance levels (specific price numbers)
4. Chart patterns (head & shoulders, double top/bottom, triangles, flags, wedges, channels, engulfing candles, pin bars, etc.)
5. Any visible indicators (moving averages, RSI, MACD, Bollinger Bands, Stochastic, VWAP, etc.) and what they signal
6. Recommended trade: direction (buy/sell), entry price, stop loss, take profit
7. Confidence level 1-10 based on confluence of signals
8. Risk:reward ratio

Be specific with price levels. Base your entry on current price action. Set stop loss beyond the nearest support/resistance. Set take profit at the next major level.

If you cannot identify the symbol, use "UNKNOWN".

Respond ONLY with valid JSON matching this exact schema (no markdown, no code blocks, just raw JSON):
{
  "symbol": "string",
  "direction": "buy" or "sell",
  "entry_price": number,
  "stop_loss": number,
  "take_profit": number,
  "confidence": number,
  "reasoning": "string (2-4 sentences explaining the setup)",
  "patterns": ["pattern1", "pattern2"],
  "trend": "uptrend" or "downtrend" or "ranging",
  "support_levels": [number, number],
  "resistance_levels": [number, number],
  "indicators_detected": ["indicator1", "indicator2"],
  "risk_reward_ratio": number
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
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType,
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: CHART_ANALYSIS_PROMPT,
            },
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

  // Parse JSON from response (handle possible markdown wrapping)
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('Failed to parse analysis from Claude response')
  }

  const analysis: ChartAnalysisResponse = JSON.parse(jsonMatch[0])
  return analysis
}

const SENTIMENT_PROMPT = `You are a forex market sentiment analyst. Analyze these news headlines and determine the sentiment for each major currency pair mentioned.

For each currency pair affected, provide:
- The pair (e.g., EUR/USD, GBP/USD, USD/JPY)
- A sentiment score from -100 (extremely bearish) to +100 (extremely bullish)
- A label: "bullish", "bearish", or "neutral"
- A brief summary (1 sentence)

Headlines:
{HEADLINES}

Respond ONLY with valid JSON (no markdown):
{
  "pairs": [
    {
      "pair": "EUR/USD",
      "score": 35,
      "label": "bullish",
      "summary": "ECB hawkish stance and strong eurozone data support euro strength"
    }
  ]
}`

export async function analyzeSentiment(
  headlines: { title: string; source: string }[]
): Promise<{ pair: string; score: number; label: string; summary: string }[]> {
  const headlineText = headlines
    .map((h, i) => `${i + 1}. [${h.source}] ${h.title}`)
    .join('\n')

  const res = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': getApiKey(),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: SENTIMENT_PROMPT.replace('{HEADLINES}', headlineText),
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

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('Failed to parse sentiment from Claude response')
  }

  const result = JSON.parse(jsonMatch[0])
  return result.pairs || []
}
