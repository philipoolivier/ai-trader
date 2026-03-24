import { NextResponse } from 'next/server'
import { analyzeChartData } from '@/lib/claude'
import { supabase } from '@/lib/supabase'
import type { AnalyzeChartDataRequest } from '@/types'

const DEFAULT_USER_ID = 'default-user'
const INITIAL_BALANCE = 500

export const maxDuration = 30

export async function POST(request: Request) {
  try {
    const body: AnalyzeChartDataRequest = await request.json()

    if (!body.symbol) {
      return NextResponse.json({ error: 'Symbol is required' }, { status: 400 })
    }

    // If no OHLC data, set empty array - Claude will analyze with just context
    if (!body.ohlcData) body.ohlcData = []

    if (!process.env.CLAUDE_API_KEY) {
      return NextResponse.json({ error: 'Claude API key is not configured' }, { status: 500 })
    }

    const result = await analyzeChartData(body)

    // Save suggestion if there's a trade recommendation
    let suggestionId: string | null = null
    if (result.analysis?.direction && result.analysis.confidence > 0) {
      let { data: portfolio } = await supabase
        .from('portfolios')
        .select('id')
        .eq('user_id', DEFAULT_USER_ID)
        .single()

      if (!portfolio) {
        const { data: newPortfolio } = await supabase
          .from('portfolios')
          .insert({ user_id: DEFAULT_USER_ID, cash_balance: INITIAL_BALANCE, initial_balance: INITIAL_BALANCE })
          .select('id')
          .single()
        portfolio = newPortfolio
      }

      if (portfolio) {
        const { data: suggestion } = await supabase
          .from('ai_suggestions')
          .insert({
            portfolio_id: portfolio.id,
            symbol: result.analysis.symbol || body.symbol,
            direction: result.analysis.direction,
            entry_price: result.analysis.entry_price,
            stop_loss: result.analysis.stop_loss,
            take_profit: result.analysis.take_profit,
            confidence: result.analysis.confidence,
            reasoning: result.analysis.reasoning,
            patterns: result.analysis.patterns,
            raw_analysis: result.analysis as unknown as Record<string, unknown>,
            status: 'pending',
          })
          .select('id')
          .single()

        suggestionId = suggestion?.id || null
      }
    }

    return NextResponse.json({ ...result, suggestionId })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Analysis failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
