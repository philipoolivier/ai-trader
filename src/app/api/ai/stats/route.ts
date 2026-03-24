import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import type { AiPerformanceStats } from '@/types'

const DEFAULT_USER_ID = 'default-user'

export async function GET() {
  try {
    const { data: portfolio } = await supabase
      .from('portfolios')
      .select('id')
      .eq('user_id', DEFAULT_USER_ID)
      .single()

    if (!portfolio) {
      return NextResponse.json(getEmptyStats())
    }

    const { data: suggestions } = await supabase
      .from('ai_suggestions')
      .select('*')
      .eq('portfolio_id', portfolio.id)

    if (!suggestions || suggestions.length === 0) {
      return NextResponse.json(getEmptyStats())
    }

    const taken = suggestions.filter((s) => s.status === 'taken')
    const skipped = suggestions.filter((s) => s.status === 'skipped')

    // Get trades for taken suggestions
    const takenTradeIds = taken.map((s) => s.trade_id).filter(Boolean)
    let takenTrades: { pnl: number | null }[] = []

    if (takenTradeIds.length > 0) {
      const { data } = await supabase
        .from('trades')
        .select('pnl')
        .in('id', takenTradeIds)

      takenTrades = data || []
    }

    const tradesWithPnl = takenTrades.filter((t) => t.pnl !== null)
    const wins = tradesWithPnl.filter((t) => (t.pnl || 0) > 0)
    const pnlValues = tradesWithPnl.map((t) => t.pnl || 0)

    const stats: AiPerformanceStats = {
      totalSuggestions: suggestions.length,
      takenCount: taken.length,
      skippedCount: skipped.length,
      takenWinRate: tradesWithPnl.length > 0
        ? (wins.length / tradesWithPnl.length) * 100
        : 0,
      takenAvgPnl: pnlValues.length > 0
        ? pnlValues.reduce((a, b) => a + b, 0) / pnlValues.length
        : 0,
      skippedWouldHaveWon: 0, // Would need price tracking to determine
      avgConfidence: suggestions.length > 0
        ? suggestions.reduce((sum, s) => sum + (s.confidence || 0), 0) / suggestions.length
        : 0,
      bestSuggestionPnl: pnlValues.length > 0 ? Math.max(...pnlValues) : 0,
      worstSuggestionPnl: pnlValues.length > 0 ? Math.min(...pnlValues) : 0,
    }

    return NextResponse.json(stats)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch AI stats'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function getEmptyStats(): AiPerformanceStats {
  return {
    totalSuggestions: 0,
    takenCount: 0,
    skippedCount: 0,
    takenWinRate: 0,
    takenAvgPnl: 0,
    skippedWouldHaveWon: 0,
    avgConfidence: 0,
    bestSuggestionPnl: 0,
    worstSuggestionPnl: 0,
  }
}
