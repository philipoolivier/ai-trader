import { NextResponse } from 'next/server'
import { analyzeChart } from '@/lib/claude'
import { supabase } from '@/lib/supabase'
import { getIndicators, formatIndicatorsForClaude } from '@/lib/twelvedata'
import { getEconomicCalendar, getCurrentSession } from '@/lib/finnhub'

const DEFAULT_USER_ID = 'default-user'
const INITIAL_BALANCE = 500

export const maxDuration = 120

export async function POST(request: Request) {
  try {
    const { image, images, mimeType, mimeTypes, symbol, interval } = await request.json()

    // Support single image or array of images
    const imageData = images || (image ? [image] : null)
    const mimeData = mimeTypes || (mimeType ? [mimeType] : null)

    if (!imageData || !mimeData || imageData.length === 0) {
      return NextResponse.json({ error: 'At least one image is required' }, { status: 400 })
    }

    if (!process.env.CLAUDE_API_KEY) {
      return NextResponse.json({ error: 'Claude API key is not configured' }, { status: 500 })
    }

    // Fetch live data in parallel: indicators, economic calendar, session
    let indicatorContext = ''
    try {
      const [indicatorResult, calendarResult] = await Promise.all([
        symbol
          ? Promise.race([
              getIndicators(symbol, interval || '5min'),
              new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000)),
            ])
          : Promise.resolve(null),
        getEconomicCalendar().catch(() => []),
      ])

      const parts: string[] = []

      // Session context
      const session = getCurrentSession()
      parts.push(`## Current Session: ${session.name}
${session.description}
${session.note}`)

      // Indicators (ATR + ADX)
      if (indicatorResult) {
        const indText = formatIndicatorsForClaude(indicatorResult)
        if (indText) parts.push(indText)
      }

      // Economic calendar
      if (calendarResult && calendarResult.length > 0) {
        parts.push(`## Upcoming Economic Events (next 24h)
${calendarResult.map(e =>
  `- **${e.time}** ${e.country} — ${e.event} (${e.impact} impact)${e.estimate ? ` Est: ${e.estimate}` : ''}${e.previous ? ` Prev: ${e.previous}` : ''}`
).join('\n')}

Factor these events into trade timing. Avoid entering just before high-impact events. Consider closing positions or tightening stops.`)
      }

      indicatorContext = parts.join('\n\n')
    } catch {
      // All context is optional — don't block analysis
    }

    // Analyze chart with Claude — returns full text analysis + optional structured data
    let result
    try {
      result = await analyzeChart(imageData, mimeData, indicatorContext)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown Claude API error'
      return NextResponse.json({ error: `AI analysis error: ${msg}` }, { status: 500 })
    }

    // Get or create portfolio
    let { data: portfolio } = await supabase
      .from('portfolios')
      .select('id')
      .eq('user_id', DEFAULT_USER_ID)
      .single()

    if (!portfolio) {
      const { data: newPortfolio, error: createErr } = await supabase
        .from('portfolios')
        .insert({ user_id: DEFAULT_USER_ID, cash_balance: INITIAL_BALANCE, initial_balance: INITIAL_BALANCE })
        .select('id')
        .single()
      if (createErr) {
        return NextResponse.json({ error: `Database error: ${createErr.message}` }, { status: 500 })
      }
      portfolio = newPortfolio
    }

    // Try to save suggestion — don't let DB errors block the response
    let suggestionId: string | null = null
    try {
      if (result.analysis?.direction && result.analysis.confidence > 0 && portfolio) {
        const { data: suggestion } = await supabase
          .from('ai_suggestions')
          .insert({
            portfolio_id: portfolio.id,
            symbol: result.analysis.symbol,
            direction: result.analysis.direction,
            entry_price: result.analysis.entry_price,
            stop_loss: result.analysis.stop_loss,
            take_profit: result.analysis.take_profit,
            confidence: result.analysis.confidence,
            reasoning: result.text.slice(0, 2000),
            patterns: result.analysis.patterns,
            raw_analysis: result.analysis as unknown as Record<string, unknown>,
            status: 'pending',
          })
          .select('id')
          .single()
        if (suggestion) suggestionId = suggestion.id
      }
    } catch {
      // DB save failed — still return analysis
    }

    return NextResponse.json({
      text: result.text,
      analysis: result.analysis,
      trades: result.trades || [],
      suggestionId,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: `Chart analysis failed: ${message}` }, { status: 500 })
  }
}
