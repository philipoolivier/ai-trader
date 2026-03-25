import { NextResponse } from 'next/server'
import { analyzeChart } from '@/lib/claude'
import { supabase } from '@/lib/supabase'

const DEFAULT_USER_ID = 'default-user'
const INITIAL_BALANCE = 500

export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const { image, mimeType } = await request.json()

    if (!image || !mimeType) {
      return NextResponse.json({ error: 'Image and mimeType are required' }, { status: 400 })
    }

    if (!process.env.CLAUDE_API_KEY) {
      return NextResponse.json({ error: 'Claude API key is not configured' }, { status: 500 })
    }

    // Analyze chart with Claude — returns full text analysis + optional structured data
    let result
    try {
      result = await analyzeChart(image, mimeType)
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
      suggestionId,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: `Chart analysis failed: ${message}` }, { status: 500 })
  }
}
