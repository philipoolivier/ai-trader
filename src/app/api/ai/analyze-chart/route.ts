import { NextResponse } from 'next/server'
import { analyzeChart } from '@/lib/claude'
import { supabase } from '@/lib/supabase'

const DEFAULT_USER_ID = 'default-user'
const INITIAL_BALANCE = 500

export const maxDuration = 30

export async function POST(request: Request) {
  try {
    const { image, mimeType } = await request.json()

    if (!image || !mimeType) {
      return NextResponse.json({ error: 'Image and mimeType are required' }, { status: 400 })
    }

    if (!process.env.CLAUDE_API_KEY) {
      return NextResponse.json({ error: 'Claude API key is not configured' }, { status: 500 })
    }

    // Analyze chart with Claude
    let analysis
    try {
      analysis = await analyzeChart(image, mimeType)
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
        .insert({
          user_id: DEFAULT_USER_ID,
          cash_balance: INITIAL_BALANCE,
          initial_balance: INITIAL_BALANCE,
        })
        .select('id')
        .single()

      if (createErr) {
        return NextResponse.json({ error: `Database error creating portfolio: ${createErr.message}` }, { status: 500 })
      }
      portfolio = newPortfolio
    }

    // Only save suggestion if there's a trade recommendation
    if (analysis.direction && analysis.confidence > 0) {
      const { data: suggestion, error: sugErr } = await supabase
        .from('ai_suggestions')
        .insert({
          portfolio_id: portfolio!.id,
          symbol: analysis.symbol,
          direction: analysis.direction,
          entry_price: analysis.entry_price,
          stop_loss: analysis.stop_loss,
          take_profit: analysis.take_profit,
          confidence: analysis.confidence,
          reasoning: analysis.reasoning,
          patterns: analysis.patterns,
          raw_analysis: analysis as unknown as Record<string, unknown>,
          status: 'pending',
        })
        .select()
        .single()

      if (sugErr) {
        // Return analysis even if suggestion save fails
        console.error('Failed to save suggestion:', sugErr.message)
        return NextResponse.json({ analysis, suggestionId: null, warning: 'Analysis succeeded but failed to save to database' })
      }

      return NextResponse.json({ analysis, suggestionId: suggestion.id })
    }

    // No trade suggestion
    return NextResponse.json({ analysis, suggestionId: null })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: `Chart analysis failed: ${message}` }, { status: 500 })
  }
}
