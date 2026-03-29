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
      .neq('quantity', 0)
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
    const customBalance = parseFloat(searchParams.get('balance') || '') || INITIAL_BALANCE

    const { data: portfolio } = await supabase
      .from('portfolios')
      .select('id')
      .eq('user_id', DEFAULT_USER_ID)
      .single()

    if (portfolio) {
      // Delete pending orders first (references ai_suggestions)
      const r1 = await supabase.from('pending_orders').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      if (r1.error) console.error('pending_orders delete:', r1.error)

      // Always close positions and reset balance
      const r2 = await supabase.from('positions').delete().eq('portfolio_id', portfolio.id)
      if (r2.error) console.error('positions delete:', r2.error)

      const r3 = await supabase.from('portfolio_snapshots').delete().eq('portfolio_id', portfolio.id)
      if (r3.error) console.error('snapshots delete:', r3.error)

      if (deleteHistory) {
        // Clear circular FKs first, then delete
        const r4 = await supabase.from('ai_suggestions').update({ trade_id: null }).eq('portfolio_id', portfolio.id)
        if (r4.error) console.error('ai_suggestions nullify:', r4.error)

        const r5 = await supabase.from('trades').update({ ai_suggestion_id: null }).eq('portfolio_id', portfolio.id)
        if (r5.error) console.error('trades nullify:', r5.error)

        const r6 = await supabase.from('ai_suggestions').delete().eq('portfolio_id', portfolio.id)
        if (r6.error) console.error('ai_suggestions delete:', r6.error)

        const r7 = await supabase.from('trades').delete().eq('portfolio_id', portfolio.id)
        if (r7.error) console.error('trades delete:', r7.error)
      }

      const r8 = await supabase
        .from('portfolios')
        .update({ cash_balance: customBalance, initial_balance: customBalance })
        .eq('id', portfolio.id)
      if (r8.error) console.error('portfolio update:', r8.error)
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('Reset portfolio error:', error)
    const message = error instanceof Error ? error.message : 'Failed to reset portfolio'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
