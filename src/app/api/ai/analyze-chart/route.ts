import { NextResponse } from 'next/server'
import { analyzeChart } from '@/lib/claude'
import { supabase } from '@/lib/supabase'
import { getIndicators, formatIndicatorsForClaude } from '@/lib/twelvedata'

const DEFAULT_USER_ID = 'default-user'
const INITIAL_BALANCE = 500

export const maxDuration = 60

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

    // Fetch live indicator data if symbol is provided
    let indicatorContext = ''
    if (symbol) {
      try {
        const tvInterval = interval || '5min'
        const indicatorData = await getIndicators(symbol, tvInterval)
        indicatorContext = formatIndicatorsForClaude(indicatorData)
      } catch {
        // Indicators are optional — don't block analysis
      }
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
