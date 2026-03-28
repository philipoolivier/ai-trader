import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { executeTrade } from '@/lib/trade'
import { getPrice } from '@/lib/twelvedata'

export async function POST(request: Request) {
  try {
    const { suggestionId, symbol, side, lotSize, entryPrice, stopLoss, takeProfit, label, orderType } = await request.json()
    const lots = lotSize || 0.01
    const validSuggestionId = suggestionId && typeof suggestionId === 'string' && suggestionId.length > 10 ? suggestionId : null
    // Normalize order type — Claude might output "sell stop", "SELL_STOP", "sell_stop" etc.
    const rawType = (orderType || 'market').toLowerCase().replace(/\s+/g, '_')
    const type = rawType === 'market' ? 'market' : rawType
    console.log('Take trade:', { symbol, side, type, lots, entryPrice, stopLoss, takeProfit, label })

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

    // If order type is explicitly a stop or limit, create pending order
    const isPendingType = ['buy_stop', 'buy_limit', 'sell_stop', 'sell_limit'].includes(type)

    if (isPendingType) {
      // For pending orders, use entry price from trade card, or fetch current price
      let pendingEntry = entryPrice ? parseFloat(entryPrice) : 0
      if (!pendingEntry) {
        try { pendingEntry = await getPrice(symbol) } catch { /* use 0 */ }
      }
      console.log('Creating pending order:', { type, pendingEntry, isPendingType })

      try {
        const { data: order, error: orderError } = await supabase
          .from('pending_orders')
          .insert({
            symbol: symbol.toUpperCase(),
            side,
            lot_size: lots,
            entry_price: pendingEntry,
            stop_loss: stopLoss ? parseFloat(stopLoss) : null,
            take_profit: takeProfit ? parseFloat(takeProfit) : null,
            order_type: type,
            status: 'pending',
            ai_suggestion_id: validSuggestionId,
          })
          .select()
          .single()

        if (orderError) throw orderError

        if (suggestion && suggestion.status === 'pending') {
          await supabase.from('ai_suggestions').update({ status: 'taken' }).eq('id', validSuggestionId)
        }

        return NextResponse.json({
          trade: order,
          message: `${type.replace('_', ' ').toUpperCase()}: ${lots} lots ${symbol.toUpperCase()} @ ${entryPrice}`,
          orderType: type,
        })
      } catch (pendingErr) {
        console.error('Pending order insert failed:', pendingErr)
        // Fall through to market order
      }
    }

    // Market order — execute in portfolio AND create signal for MT4 EA
    const tradeNotes = label
      ? `AI: ${label}${suggestion ? ` (confidence: ${suggestion.confidence}/10)` : ''}`
      : suggestion
        ? `AI suggestion (confidence: ${suggestion.confidence}/10)`
        : 'AI trade'

    const result = await executeTrade({
      symbol,
      side,
      lotSize: lots,
      stopLoss: stopLoss ? parseFloat(stopLoss) : (suggestion?.stop_loss ? parseFloat(suggestion.stop_loss) : null),
      takeProfit: takeProfit ? parseFloat(takeProfit) : (suggestion?.take_profit ? parseFloat(suggestion.take_profit) : null),
      notes: tradeNotes,
      aiSuggestionId: validSuggestionId || undefined,
    })

    // Also create a pending_orders record for MT4 EA to pick up
    try {
      const currentPrice = await getPrice(symbol)
      await supabase.from('pending_orders').insert({
        symbol: symbol.toUpperCase(),
        side,
        lot_size: lots,
        entry_price: currentPrice,
        stop_loss: stopLoss ? parseFloat(stopLoss) : (suggestion?.stop_loss ? parseFloat(suggestion.stop_loss) : null),
        take_profit: takeProfit ? parseFloat(takeProfit) : (suggestion?.take_profit ? parseFloat(suggestion.take_profit) : null),
        order_type: side === 'buy' ? 'buy_stop' : 'sell_stop', // EA treats as market since price = current
        status: 'pending',
        ai_suggestion_id: validSuggestionId,
      })
    } catch (e) {
      console.error('Failed to create MT4 signal for market order:', e)
    }

    if (suggestion && suggestion.status === 'pending' && validSuggestionId) {
      await supabase
        .from('ai_suggestions')
        .update({
          status: 'taken',
          trade_id: (result.trade as Record<string, unknown>).id as string,
        })
        .eq('id', validSuggestionId)
    }

    return NextResponse.json(result)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to execute AI trade'
    console.error('Take trade error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
