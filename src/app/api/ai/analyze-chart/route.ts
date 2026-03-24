import { NextResponse } from 'next/server'
import { analyzeChart } from '@/lib/claude'
import { supabase } from '@/lib/supabase'

const DEFAULT_USER_ID = 'default-user'

export const maxDuration = 30

export async function POST(request: Request) {
  try {
    const { image, mimeType } = await request.json()

    if (!image || !mimeType) {
      return NextResponse.json({ error: 'Image and mimeType required' }, { status: 400 })
    }

    // Analyze chart with Claude
    const analysis = await analyzeChart(image, mimeType)

    // Get portfolio
    const { data: portfolio } = await supabase
      .from('portfolios')
      .select('id')
      .eq('user_id', DEFAULT_USER_ID)
      .single()

    if (!portfolio) {
      return NextResponse.json({ error: 'Portfolio not found' }, { status: 404 })
    }

    // Save suggestion
    const { data: suggestion, error } = await supabase
      .from('ai_suggestions')
      .insert({
        portfolio_id: portfolio.id,
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

    if (error) throw error

    return NextResponse.json({ analysis, suggestionId: suggestion.id })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Chart analysis failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
