import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const DEFAULT_USER_ID = 'default-user'
const INITIAL_BALANCE = 500

export async function GET() {
  try {
    // Get or create portfolio
    let { data: portfolio } = await supabase
      .from('portfolios')
      .select('*')
      .eq('user_id', DEFAULT_USER_ID)
      .single()

    if (!portfolio) {
      const { data: newPortfolio, error } = await supabase
        .from('portfolios')
        .insert({
          user_id: DEFAULT_USER_ID,
          cash_balance: INITIAL_BALANCE,
          initial_balance: INITIAL_BALANCE,
        })
        .select()
        .single()

      if (error) throw error
      portfolio = newPortfolio
    }

    // Get positions
    const { data: positions } = await supabase
      .from('positions')
      .select('*')
      .eq('portfolio_id', portfolio.id)
      .gt('quantity', 0)
      .order('updated_at', { ascending: false })

    // Get recent trades
    const { data: trades } = await supabase
      .from('trades')
      .select('*')
      .eq('portfolio_id', portfolio.id)
      .order('created_at', { ascending: false })
      .limit(50)

    // Get portfolio snapshots for chart
    const { data: snapshots } = await supabase
      .from('portfolio_snapshots')
      .select('*')
      .eq('portfolio_id', portfolio.id)
      .order('created_at', { ascending: true })
      .limit(365)

    return NextResponse.json({
      portfolio,
      positions: positions || [],
      trades: trades || [],
      snapshots: snapshots || [],
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch portfolio'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// Reset portfolio
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const deleteHistory = searchParams.get('deleteHistory') === 'true'

    const { data: portfolio } = await supabase
      .from('portfolios')
      .select('id')
      .eq('user_id', DEFAULT_USER_ID)
      .single()

    if (portfolio) {
      // Always close positions and reset balance
      await supabase.from('positions').delete().eq('portfolio_id', portfolio.id)
      await supabase.from('portfolio_snapshots').delete().eq('portfolio_id', portfolio.id)

      if (deleteHistory) {
        // Clear circular FKs first, then delete
        await supabase.from('ai_suggestions').update({ trade_id: null }).eq('portfolio_id', portfolio.id)
        await supabase.from('trades').update({ ai_suggestion_id: null }).eq('portfolio_id', portfolio.id)
        await supabase.from('ai_suggestions').delete().eq('portfolio_id', portfolio.id)
        await supabase.from('trades').delete().eq('portfolio_id', portfolio.id)
      }

      await supabase
        .from('portfolios')
        .update({ cash_balance: INITIAL_BALANCE, initial_balance: INITIAL_BALANCE })
        .eq('id', portfolio.id)
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to reset portfolio'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
