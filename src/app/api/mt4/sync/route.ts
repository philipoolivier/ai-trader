import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const DEFAULT_USER_ID = 'default-user'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { key, balance, equity, freeMargin, margin, positions, closedTrades, cancelledOrders } = body

    if (key !== process.env.AUTH_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: portfolio } = await supabase
      .from('portfolios')
      .select('*')
      .eq('user_id', DEFAULT_USER_ID)
      .single()

    if (!portfolio) {
      return NextResponse.json({ error: 'Portfolio not found' }, { status: 404 })
    }

    const synced: string[] = []

    // ── 1. Sync account balance from MT4 ──
    if (balance !== undefined) {
      const updateData: Record<string, number> = { cash_balance: balance }

      // On first MT4 sync (no closed trades yet), set initial_balance to match MT4
      const { count } = await supabase
        .from('trades')
        .select('id', { count: 'exact', head: true })
        .eq('portfolio_id', portfolio.id)

      if (count === 0) {
        updateData.initial_balance = balance
      }

      await supabase
        .from('portfolios')
        .update(updateData)
        .eq('id', portfolio.id)
      synced.push(`Balance: $${balance}`)
    }

    // ── 2. Sync open positions from MT4 ──
    // MT4 positions are the source of truth
    if (positions && Array.isArray(positions)) {
      const mt4Positions = positions as {
        ticket: number; symbol: string; side: string; orderType: string;
        lots: number; openPrice: number; sl: number; tp: number; profit: number; type: number;
      }[]

      const openPositions = mt4Positions.filter(p => p.type <= 1)
      const pendingPositions = mt4Positions.filter(p => p.type >= 2)

      // ── Sync open market positions ──
      const { data: dbPositions } = await supabase
        .from('positions')
        .select('*')
        .eq('portfolio_id', portfolio.id)

      const mt4Map = new Map<string, typeof openPositions[0]>()
      for (const pos of openPositions) {
        mt4Map.set(`${pos.symbol}_${pos.side}`, pos)
      }

      if (dbPositions) {
        for (const dbPos of dbPositions) {
          const qty = parseFloat(dbPos.quantity) || 0
          if (qty <= 0) continue
          const sym = dbPos.symbol.replace('/', '').toUpperCase()
          const side = dbPos.side === 'long' ? 'buy' : 'sell'
          if (!mt4Map.has(`${sym}_${side}`)) {
            await supabase
              .from('positions')
              .update({ quantity: 0, updated_at: new Date().toISOString() })
              .eq('id', dbPos.id)
            synced.push(`Closed position: ${dbPos.symbol} (not on MT4)`)
          }
        }
      }

      // ── Sync pending orders from MT4 using ticket as unique key ──
      const mt4Tickets = new Set<number>()
      for (const p of pendingPositions) {
        mt4Tickets.add(p.ticket)
      }

      // Get ALL pending orders from DB (any status)
      const { data: dbPending } = await supabase
        .from('pending_orders')
        .select('*')
        .eq('status', 'pending')

      // Build set of DB mt4_tickets
      const dbTickets = new Set<string>()
      if (dbPending) {
        for (const o of dbPending) {
          if (o.mt4_ticket) dbTickets.add(String(o.mt4_ticket))
        }
      }

      // Create DB records for MT4 pending orders not yet in DB
      for (const p of pendingPositions) {
        if (!dbTickets.has(String(p.ticket))) {
          // Also check if there's a matching order without a ticket (placed from web, not yet linked)
          let linked = false
          if (dbPending) {
            for (const o of dbPending) {
              if (o.mt4_ticket) continue // Already linked
              const sym = o.symbol.replace('/', '').toUpperCase()
              const entry = parseFloat(o.entry_price)
              if (sym === p.symbol && Math.abs(entry - p.openPrice) < 1 && o.side === p.side) {
                // Link this DB order to the MT4 ticket
                await supabase
                  .from('pending_orders')
                  .update({ mt4_ticket: p.ticket, updated_at: new Date().toISOString() })
                  .eq('id', o.id)
                linked = true
                synced.push(`Linked pending ${p.symbol} to MT4 #${p.ticket}`)
                break
              }
            }
          }

          if (!linked) {
            await supabase.from('pending_orders').insert({
              symbol: p.symbol,
              side: p.side,
              lot_size: p.lots,
              entry_price: p.openPrice,
              stop_loss: p.sl || null,
              take_profit: p.tp || null,
              order_type: p.orderType || (p.side === 'buy' ? 'buy_limit' : 'sell_limit'),
              status: 'pending',
              mt4_ticket: p.ticket,
            })
            synced.push(`Added pending from MT4: ${p.symbol} #${p.ticket} @ ${p.openPrice}`)
          }
        }
      }

      // Remove DB pending orders whose MT4 ticket no longer exists on MT4
      if (dbPending) {
        for (const dbOrder of dbPending) {
          if (!dbOrder.mt4_ticket) continue // Not linked to MT4 yet
          if (!mt4Tickets.has(dbOrder.mt4_ticket)) {
            await supabase
              .from('pending_orders')
              .update({ status: 'triggered', updated_at: new Date().toISOString() })
              .eq('id', dbOrder.id)
            synced.push(`Pending #${dbOrder.mt4_ticket} removed (not on MT4)`)
          }
        }
      }
    }

    // ── 3. Process closed trades ──
    if (closedTrades && Array.isArray(closedTrades)) {
      for (const trade of closedTrades as {
        ticket: number; symbol: string; side: string;
        lots: number; openPrice: number; closePrice: number;
        profit: number; sl: number; tp: number;
      }[]) {
        // Check if we already recorded this ticket
        const { data: existing } = await supabase
          .from('trades')
          .select('id')
          .like('notes', `%#${trade.ticket}%`)
          .limit(1)

        if (existing && existing.length > 0) continue // Already synced

        // Record closing trade
        const closeSide = trade.side === 'buy' ? 'sell' : 'buy'
        await supabase.from('trades').insert({
          portfolio_id: portfolio.id,
          symbol: trade.symbol,
          side: closeSide,
          quantity: trade.lots,
          price: trade.closePrice,
          total: trade.closePrice * trade.lots,
          pnl: trade.profit,
          stop_loss: trade.sl || null,
          take_profit: trade.tp || null,
          notes: `MT4 closed #${trade.ticket} P&L: $${trade.profit}`,
          status: 'filled',
        })

        synced.push(`Closed trade: ${trade.symbol} #${trade.ticket} P&L: $${trade.profit}`)
      }
    }

    // ── 4. Process cancelled pending orders ──
    if (cancelledOrders && Array.isArray(cancelledOrders)) {
      for (const cancelled of cancelledOrders as {
        ticket: number; symbol: string; side: string; entry: number;
      }[]) {
        const sym = cancelled.symbol.toUpperCase()
        // Find matching pending order by symbol and approximate entry price
        const { data: matching } = await supabase
          .from('pending_orders')
          .select('*')
          .eq('status', 'pending')

        if (matching) {
          for (const order of matching) {
            const orderSym = order.symbol.replace('/', '').toUpperCase()
            const orderEntry = parseFloat(order.entry_price)
            if (orderSym === sym && Math.abs(orderEntry - cancelled.entry) < 1) {
              await supabase
                .from('pending_orders')
                .update({ status: 'cancelled', updated_at: new Date().toISOString() })
                .eq('id', order.id)
              synced.push(`Cancelled: ${sym} @ ${cancelled.entry}`)
              break
            }
          }
        }
      }
    }

    // ── 5. Check if portfolio has pending orders that MT4 doesn't ──
    // (user cancelled on web app → need to delete on MT4 next poll)
    // This is handled by the EA checking which signals it already placed

    return NextResponse.json({
      success: true,
      synced,
      mt4: { balance, equity, freeMargin, margin },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sync failed'
    console.error('MT4 sync error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
