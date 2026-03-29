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

      // ── Sync individual positions by MT4 ticket ──
      // Each MT4 order = one DB position row (no aggregation)

      // Build set of MT4 tickets currently open
      const mt4OpenTickets = new Set<string>()
      for (const pos of openPositions) {
        mt4OpenTickets.add(String(pos.ticket))
      }

      // Build map of DB positions by mt4_ticket
      const dbTicketMap = new Map<string, string>() // ticket → position id
      if (dbPositions) {
        for (const dbPos of dbPositions) {
          if (dbPos.mt4_ticket) {
            dbTicketMap.set(String(dbPos.mt4_ticket), dbPos.id)
          }
        }
      }

      // Create/update positions from MT4
      for (const pos of openPositions) {
        const ticketStr = String(pos.ticket)
        const positionSide = pos.side === 'buy' ? 'long' : 'short'
        const existingId = dbTicketMap.get(ticketStr)

        if (existingId) {
          // Update existing
          await supabase
            .from('positions')
            .update({
              quantity: pos.lots,
              avg_price: pos.openPrice,
              side: positionSide,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingId)
          dbTicketMap.delete(ticketStr)
        } else {
          // New position from MT4
          await supabase
            .from('positions')
            .insert({
              portfolio_id: portfolio.id,
              symbol: pos.symbol,
              quantity: pos.lots,
              avg_price: pos.openPrice,
              side: positionSide,
              mt4_ticket: pos.ticket,
            })
          synced.push(`New position: ${pos.symbol} ${positionSide} #${pos.ticket}`)
        }
      }

      // Close DB positions whose MT4 ticket is no longer open
      const remainingDbTickets = Array.from(dbTicketMap.values())
      for (const posId of remainingDbTickets) {
        await supabase
          .from('positions')
          .update({ quantity: 0, updated_at: new Date().toISOString() })
          .eq('id', posId)
      }

      // ── Clean up close requests for tickets no longer on MT4 ──
      const { data: closeReqs } = await supabase
        .from('pending_orders')
        .select('id, mt4_ticket')
        .eq('status', 'close_requested')

      if (closeReqs) {
        for (const req of closeReqs) {
          if (req.mt4_ticket && !mt4OpenTickets.has(String(req.mt4_ticket))) {
            await supabase.from('pending_orders')
              .update({ status: 'triggered' })
              .eq('id', req.id)
            synced.push(`Close request done: #${req.mt4_ticket}`)
          }
        }
      }

      // ── Pending orders: two-way sync ──
      const mt4TicketStrings = new Set<string>()
      for (const p of pendingPositions) {
        mt4TicketStrings.add(String(p.ticket))
      }

      // Get ALL pending_orders from DB (any status) so we know every ticket we've ever seen
      const { data: allDbOrders } = await supabase
        .from('pending_orders')
        .select('id, status, mt4_ticket, symbol, side, entry_price')

      // Every mt4_ticket we've ever known about (pending, cancelled, triggered)
      const everSeenTickets = new Set<string>()
      if (allDbOrders) {
        for (const o of allDbOrders) {
          if (o.mt4_ticket) everSeenTickets.add(String(o.mt4_ticket))
        }
      }

      // MT4 → Portfolio: create orders for MT4 tickets we've NEVER seen
      for (const p of pendingPositions) {
        const ticketStr = String(p.ticket)
        if (!everSeenTickets.has(ticketStr)) {
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
          synced.push(`New from MT4: ${p.symbol} #${p.ticket}`)
        }
      }

      // Portfolio → MT4: mark as triggered if MT4 no longer has the ticket
      if (allDbOrders) {
        for (const dbOrder of allDbOrders) {
          if (dbOrder.status !== 'pending') continue
          if (!dbOrder.mt4_ticket) continue
          if (!mt4TicketStrings.has(String(dbOrder.mt4_ticket))) {
            await supabase
              .from('pending_orders')
              .update({ status: 'triggered', updated_at: new Date().toISOString() })
              .eq('id', dbOrder.id)
            synced.push(`Removed: #${dbOrder.mt4_ticket} (gone from MT4)`)
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
