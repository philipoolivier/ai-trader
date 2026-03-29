import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getPrice } from '@/lib/twelvedata'

export async function POST(request: Request) {
  try {
    const { suggestionId, symbol, side, lotSize, entryPrice, stopLoss, takeProfit, label, orderType } = await request.json()
    const lots = lotSize || 0.01
    const validSuggestionId = suggestionId && typeof suggestionId === 'string' && suggestionId.length > 10 ? suggestionId : null
    const rawType = (orderType || 'market').toLowerCase().replace(/\s+/g, '_')
    console.log('Take trade:', { symbol, side, rawType, lots, entryPrice, stopLoss, takeProfit, label })

    if (!symbol || !side) {
      return NextResponse.json({ error: 'Symbol and side are required' }, { status: 400 })
    }

    // Try to find suggestion
    let suggestion = null
    if (validSuggestionId) {
      const { data } = await supabase
        .from('ai_suggestions')
        .select('*')
        .eq('id', validSuggestionId)
        .single()
      suggestion = data
    }

    // Determine order type and entry price
    const isPending = ['buy_stop', 'buy_limit', 'sell_stop', 'sell_limit'].includes(rawType)
    let finalEntry = entryPrice ? parseFloat(entryPrice) : 0
    let finalType = rawType

    if (!isPending || !finalEntry) {
      // Market order — get current price as entry
      finalEntry = await getPrice(symbol)
      // Use stop/limit based on side for MT4 (market orders are placed as immediate pending)
      finalType = side === 'buy' ? 'buy_stop' : 'sell_stop'
    }

    // Create pending_orders record — EA picks this up and places on MT4
    // Portfolio position is created by MT4 sync when the trade executes
    const sl = stopLoss ? parseFloat(stopLoss) : (suggestion?.stop_loss ? parseFloat(suggestion.stop_loss) : null)
    const tp = takeProfit ? parseFloat(takeProfit) : (suggestion?.take_profit ? parseFloat(suggestion.take_profit) : null)

    const { data: order, error: orderError } = await supabase
      .from('pending_orders')
      .insert({
        symbol: symbol.toUpperCase(),
        side,
        lot_size: lots,
        entry_price: finalEntry,
        stop_loss: sl,
        take_profit: tp,
        order_type: finalType,
        status: 'pending',
        ai_suggestion_id: validSuggestionId,
      })
      .select()
      .single()

    if (orderError) {
      console.error('Pending order insert failed:', orderError)
      return NextResponse.json({ error: `Failed to create order: ${orderError.message}` }, { status: 500 })
    }

    // Mark suggestion as taken
    if (suggestion && suggestion.status === 'pending' && validSuggestionId) {
      await supabase.from('ai_suggestions').update({ status: 'taken' }).eq('id', validSuggestionId)
    }

    const typeLabel = isPending ? finalType.replace('_', ' ').toUpperCase() : 'MARKET'
    return NextResponse.json({
      trade: order,
      message: `${typeLabel}: ${lots} lots ${symbol.toUpperCase()} @ ${finalEntry}`,
      orderType: finalType,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to execute AI trade'
    console.error('Take trade error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
