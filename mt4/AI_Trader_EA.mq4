//+------------------------------------------------------------------+
//|                                              AI_Trader_EA.mq4    |
//|                              AI Trader - Signal Receiver EA      |
//+------------------------------------------------------------------+
#property copyright "AI Trader"
#property version   "2.00"
#property strict

//--- Input parameters
input string   API_URL     = "https://ai-trader-mocha.vercel.app";
input string   API_KEY     = "";           // Your AUTH_SECRET from Vercel
input int      PollSeconds = 5;            // How often to check for signals
input int      SyncSeconds = 10;           // How often to sync state back
input double   MaxLotSize  = 1.0;          // Max lot size safety cap
input int      MagicNumber = 20260327;     // Magic number for EA orders
input int      Slippage    = 3;            // Max slippage in points

//--- Global variables
datetime lastPoll = 0;
datetime lastSync = 0;
string   processedSignals[];
int      knownTickets[];      // Track tickets we've already synced as closed

//+------------------------------------------------------------------+
int OnInit()
{
   if(API_KEY == "")
   {
      Alert("AI Trader EA: API_KEY is empty! Set your AUTH_SECRET.");
      return(INIT_PARAMETERS_INCORRECT);
   }
   Print("AI Trader EA v3.0 initialized. Poll:", PollSeconds, "s Sync:", SyncSeconds, "s");
   Print("API URL: ", API_URL);
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
void OnTick()
{
   // Poll for new signals
   if(TimeCurrent() - lastPoll >= PollSeconds)
   {
      lastPoll = TimeCurrent();
      PollForSignals();
   }

   // Sync state back to portfolio
   if(TimeCurrent() - lastSync >= SyncSeconds)
   {
      lastSync = TimeCurrent();
      SyncFullState();
   }
}

//+------------------------------------------------------------------+
// Poll API for new pending orders
//+------------------------------------------------------------------+
void PollForSignals()
{
   string url = API_URL + "/api/mt4/signals?key=" + API_KEY;
   string headers = "Content-Type: application/json\r\n";
   char   post[];
   char   result[];
   string resultHeaders;

   int res = WebRequest("GET", url, headers, 5000, post, result, resultHeaders);

   if(res == -1)
   {
      int err = GetLastError();
      if(err == 4060)
         Print("Add '", API_URL, "' to Tools > Options > Expert Advisors > Allow WebRequest");
      else
         Print("WebRequest error: ", err);
      return;
   }

   string response = CharArrayToString(result);
   if(res != 200) { Print("API error (", res, "): ", StringSubstr(response, 0, 200)); return; }

   Print("Poll OK (", res, ") — processing...");
   ProcessSignals(response);
   ProcessCommands(response);
}

//+------------------------------------------------------------------+
// Find and report recently closed trades
//+------------------------------------------------------------------+
void SyncFullState()
{
   // ── Account info ──
   double balance = AccountBalance();
   double equity = AccountEquity();
   double freeMargin = AccountFreeMargin();
   double margin = AccountMargin();

   // ── Open positions (our magic number) ──
   string posJson = "[";
   int posCount = 0;
   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      // Report ALL positions (not just EA's magic number) so portfolio mirrors full account

      int digits = (int)MarketInfo(OrderSymbol(), MODE_DIGITS);
      if(digits == 0) digits = 5;

      if(posCount > 0) posJson += ",";
      posJson += "{";
      posJson += "\"ticket\":" + IntegerToString(OrderTicket()) + ",";
      posJson += "\"magic\":" + IntegerToString(OrderMagicNumber()) + ",";
      posJson += "\"symbol\":\"" + OrderSymbol() + "\",";
      posJson += "\"type\":" + IntegerToString(OrderType()) + ",";
      posJson += "\"side\":\"" + (OrderType() == OP_BUY ? "buy" : OrderType() == OP_SELL ? "sell" :
                  OrderType() == OP_BUYLIMIT ? "buy" : OrderType() == OP_BUYSTOP ? "buy" : "sell") + "\",";
      posJson += "\"orderType\":\"" + (OrderType() == OP_BUY ? "market" : OrderType() == OP_SELL ? "market" :
                  OrderType() == OP_BUYLIMIT ? "buy_limit" : OrderType() == OP_BUYSTOP ? "buy_stop" :
                  OrderType() == OP_SELLLIMIT ? "sell_limit" : "sell_stop") + "\",";
      posJson += "\"lots\":" + DoubleToString(OrderLots(), 2) + ",";
      posJson += "\"openPrice\":" + DoubleToString(OrderOpenPrice(), digits) + ",";
      posJson += "\"sl\":" + DoubleToString(OrderStopLoss(), digits) + ",";
      posJson += "\"tp\":" + DoubleToString(OrderTakeProfit(), digits) + ",";
      posJson += "\"profit\":" + DoubleToString(OrderProfit(), 2);
      posJson += "}";
      posCount++;
   }
   posJson += "]";

   // ── Closed trades (recent, not yet synced) ──
   string closedJson = "[";
   int closedCount = 0;
   string cancelledJson = "[";
   int cancelledCount = 0;

   for(int i = OrdersHistoryTotal() - 1; i >= 0; i--)
   {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_HISTORY)) continue;
      if(OrderMagicNumber() != MagicNumber) continue;

      int ticket = OrderTicket();
      if(IsKnownTicket(ticket)) continue;
      if(TimeCurrent() - OrderCloseTime() > 7200) continue;

      int orderType = OrderType();
      int digits = (int)MarketInfo(OrderSymbol(), MODE_DIGITS);
      if(digits == 0) digits = 5;

      if(orderType <= OP_SELL)
      {
         if(closedCount > 0) closedJson += ",";
         closedJson += "{\"ticket\":" + IntegerToString(ticket);
         closedJson += ",\"symbol\":\"" + OrderSymbol() + "\"";
         closedJson += ",\"side\":\"" + (orderType == OP_BUY ? "buy" : "sell") + "\"";
         closedJson += ",\"lots\":" + DoubleToString(OrderLots(), 2);
         closedJson += ",\"openPrice\":" + DoubleToString(OrderOpenPrice(), digits);
         closedJson += ",\"closePrice\":" + DoubleToString(OrderClosePrice(), digits);
         closedJson += ",\"profit\":" + DoubleToString(OrderProfit(), 2);
         closedJson += ",\"sl\":" + DoubleToString(OrderStopLoss(), digits);
         closedJson += ",\"tp\":" + DoubleToString(OrderTakeProfit(), digits) + "}";
         closedCount++;
      }
      else
      {
         if(cancelledCount > 0) cancelledJson += ",";
         cancelledJson += "{\"ticket\":" + IntegerToString(ticket);
         cancelledJson += ",\"symbol\":\"" + OrderSymbol() + "\"";
         cancelledJson += ",\"side\":\"" + (orderType == OP_BUYLIMIT || orderType == OP_BUYSTOP ? "buy" : "sell") + "\"";
         cancelledJson += ",\"entry\":" + DoubleToString(OrderOpenPrice(), digits) + "}";
         cancelledCount++;
      }

      AddKnownTicket(ticket);
   }
   closedJson += "]";
   cancelledJson += "]";

   // ── Send full state ──
   string url = API_URL + "/api/mt4/sync";
   string body = "{\"key\":\"" + API_KEY + "\"";
   body += ",\"balance\":" + DoubleToString(balance, 2);
   body += ",\"equity\":" + DoubleToString(equity, 2);
   body += ",\"freeMargin\":" + DoubleToString(freeMargin, 2);
   body += ",\"margin\":" + DoubleToString(margin, 2);
   body += ",\"positions\":" + posJson;
   body += ",\"closedTrades\":" + closedJson;
   body += ",\"cancelledOrders\":" + cancelledJson + "}";

   string headers = "Content-Type: application/json\r\n";
   char   postData[];
   char   result[];
   string resultHeaders;

   StringToCharArray(body, postData, 0, StringLen(body));
   int res = WebRequest("POST", url, headers, 15000, postData, result, resultHeaders);

   if(res == 200)
      Print("Sync OK: bal=", balance, " eq=", equity, " pos=", posCount,
            " closed=", closedCount, " cancelled=", cancelledCount);
   else
      Print("Sync failed (", res, "): ", StringSubstr(CharArrayToString(result), 0, 200));
}

//+------------------------------------------------------------------+
// Process signals from API
//+------------------------------------------------------------------+
void ProcessSignals(string json)
{
   // Log first 500 chars of response
   Print("API response (", StringLen(json), " chars): ", StringSubstr(json, 0, 500));

   int signalsStart = StringFind(json, "\"signals\":[");
   if(signalsStart == -1)
   {
      Print("No 'signals' array found in response");
      return;
   }

   int arrStart = StringFind(json, "[", signalsStart);
   int arrEnd = FindMatchingBracket(json, arrStart);
   if(arrEnd == -1) return;

   string signalsArr = StringSubstr(json, arrStart + 1, arrEnd - arrStart - 1);

   int objStart = 0;
   while(true)
   {
      int nextObj = StringFind(signalsArr, "{", objStart);
      if(nextObj == -1) break;

      int objEnd = StringFind(signalsArr, "}", nextObj);
      if(objEnd == -1) break;

      string signalJson = StringSubstr(signalsArr, nextObj, objEnd - nextObj + 1);
      ProcessOneSignal(signalJson);

      objStart = objEnd + 1;
   }
}

//+------------------------------------------------------------------+
void ProcessOneSignal(string json)
{
   string id     = GetJsonString(json, "id");
   string symbol = GetJsonString(json, "symbol");
   string side   = GetJsonString(json, "side");
   string type   = GetJsonString(json, "type");
   double entry  = GetJsonDouble(json, "entry");
   double sl     = GetJsonDouble(json, "sl");
   double tp     = GetJsonDouble(json, "tp");
   double lots   = GetJsonDouble(json, "lots");

   Print("Signal received: id=", id, " sym=", symbol, " side=", side, " type=", type,
         " entry=", entry, " sl=", sl, " tp=", tp, " lots=", lots);

   if(IsProcessed(id))
   {
      Print("Signal ", id, " already processed — skipping");
      return;
   }
   if(symbol == "" || id == "")
   {
      Print("Empty symbol or id — skipping");
      return;
   }
   // Skip commands that leaked into signals processing
   // Do NOT mark as processed — ProcessCommands needs to handle these
   if(type == "" && lots <= 0)
   {
      return; // Silently skip — ProcessCommands will handle it
   }
   if(lots <= 0 || lots > MaxLotSize) lots = MathMin(0.01, MaxLotSize);

   // Validate lot size against broker's min/max/step
   double minLot = MarketInfo(symbol, MODE_MINLOT);
   double maxLot = MarketInfo(symbol, MODE_MAXLOT);
   double lotStep = MarketInfo(symbol, MODE_LOTSTEP);
   if(minLot > 0 && lots < minLot) lots = minLot;
   if(maxLot > 0 && lots > maxLot) lots = maxLot;
   if(lotStep > 0) lots = MathRound(lots / lotStep) * lotStep;
   lots = NormalizeDouble(lots, 2);

   // Check if symbol exists
   if(MarketInfo(symbol, MODE_BID) == 0)
   {
      // Try common suffixes
      string suffixes[] = {".r", ".i", "m", ".", ".a", ".b"};
      bool found = false;
      for(int i = 0; i < ArraySize(suffixes); i++)
      {
         if(MarketInfo(symbol + suffixes[i], MODE_BID) > 0)
         {
            symbol = symbol + suffixes[i];
            found = true;
            break;
         }
      }
      if(!found)
      {
         Print("Symbol not found on broker: ", symbol, " — skipping (crypto may not be available on MT4)");
         MarkProcessed(id);
         ConfirmSignal(id, 0, "cancelled");
         return;
      }
   }

   // Skip any signal with entry price < 1 — these are old close signals or junk
   if(entry < 1.0)
   {
      Print("Skipping junk signal (entry=", entry, "): ", symbol, " — confirming to clear it");
      ConfirmSignal(id, 0, "executed");
      MarkProcessed(id);
      return;
   }

   int cmd = -1;
   if(type == "buy_stop")       cmd = OP_BUYSTOP;
   else if(type == "buy_limit") cmd = OP_BUYLIMIT;
   else if(type == "sell_stop")  cmd = OP_SELLSTOP;
   else if(type == "sell_limit") cmd = OP_SELLLIMIT;
   else if(side == "buy")        cmd = OP_BUY;
   else if(side == "sell")       cmd = OP_SELL;

   if(cmd == -1)
   {
      Print("Unknown order type: ", type, " / ", side);
      MarkProcessed(id);
      return;
   }

   int digits = (int)MarketInfo(symbol, MODE_DIGITS);
   double point = MarketInfo(symbol, MODE_POINT);
   double stopLevel = MarketInfo(symbol, MODE_STOPLEVEL) * point;
   double freezeLevel = MarketInfo(symbol, MODE_FREEZELEVEL) * point;

   entry = NormalizeDouble(entry, digits);
   sl    = NormalizeDouble(sl, digits);
   tp    = NormalizeDouble(tp, digits);

   double price = entry;
   if(cmd == OP_BUY)  price = MarketInfo(symbol, MODE_ASK);
   if(cmd == OP_SELL) price = MarketInfo(symbol, MODE_BID);

   // Validate stops are far enough from price
   double minDist = MathMax(stopLevel, freezeLevel) + point;
   if(minDist > 0)
   {
      double refPrice = (cmd == OP_BUY || cmd == OP_BUYSTOP || cmd == OP_BUYLIMIT) ? price : price;
      if(cmd <= OP_SELL) refPrice = price; // Market orders use current price
      else refPrice = entry; // Pending orders use entry price

      if(sl > 0 && MathAbs(refPrice - sl) < minDist)
      {
         // Adjust SL to minimum distance
         double oldSl = sl;
         if(cmd == OP_BUY || cmd == OP_BUYLIMIT || cmd == OP_BUYSTOP)
            sl = NormalizeDouble(refPrice - minDist, digits);
         else
            sl = NormalizeDouble(refPrice + minDist, digits);
         Print("Adjusted SL from ", oldSl, " to ", sl, " (min distance: ", minDist, ")");
      }
      if(tp > 0 && MathAbs(refPrice - tp) < minDist)
      {
         double oldTp = tp;
         if(cmd == OP_BUY || cmd == OP_BUYLIMIT || cmd == OP_BUYSTOP)
            tp = NormalizeDouble(refPrice + minDist, digits);
         else
            tp = NormalizeDouble(refPrice - minDist, digits);
         Print("Adjusted TP from ", oldTp, " to ", tp, " (min distance: ", minDist, ")");
      }
   }

   Print("Placing: ", symbol, " ", EnumToString((ENUM_ORDER_TYPE)cmd),
         " lots=", lots, " price=", price, " sl=", sl, " tp=", tp,
         " stopLevel=", stopLevel, " point=", point);

   Print("Broker info for ", symbol, ": minLot=", minLot, " maxLot=", maxLot,
         " lotStep=", lotStep, " stopLevel=", stopLevel, " point=", point,
         " spread=", MarketInfo(symbol, MODE_SPREAD));

   int ticket = OrderSend(symbol, cmd, lots, price, Slippage, sl, tp,
                           "AI Trader: " + id, MagicNumber, 0,
                           cmd <= OP_SELL ? (side == "buy" ? clrGreen : clrRed) : clrGold);

   if(ticket > 0)
   {
      Print("Order placed successfully. Ticket: ", ticket);
      ConfirmSignal(id, ticket, "executed");
      MarkProcessed(id); // Only mark as processed on success
   }
   else
   {
      int err = GetLastError();
      Print("Order failed! Error: ", err, " - ", ErrorDescription(err));

      // If invalid stops, try placing without SL/TP then modify
      if(err == 130 && (sl > 0 || tp > 0))
      {
         Print("Retrying without SL/TP...");
         ticket = OrderSend(symbol, cmd, lots, price, Slippage, 0, 0,
                             "AI Trader: " + id, MagicNumber, 0,
                             cmd <= OP_SELL ? (side == "buy" ? clrGreen : clrRed) : clrGold);
         if(ticket > 0)
         {
            Print("Order placed without SL/TP. Ticket: ", ticket, ". Modifying...");
            bool modified = OrderModify(ticket, price, sl, tp, 0,
                                        cmd <= OP_SELL ? (side == "buy" ? clrGreen : clrRed) : clrGold);
            if(modified)
               Print("SL/TP added successfully");
            else
               Print("SL/TP modify failed: ", GetLastError(), " — order placed without stops");
            ConfirmSignal(id, ticket, "executed");
            MarkProcessed(id); // Only mark as processed on success
         }
         else
         {
            Print("Retry also failed: ", GetLastError(), " — will retry next poll");
            // Do NOT mark as processed — will retry next poll cycle
         }
      }
      else if(err == 132 || err == 133)
      {
         // Market closed or trade disabled — don't retry
         Print("Market closed or trade disabled — cancelling signal");
         ConfirmSignal(id, 0, "cancelled");
         MarkProcessed(id);
      }
      // For other errors (134=no money, 135=price changed, etc.) — will retry
   }
}

//+------------------------------------------------------------------+
void ConfirmSignal(string id, int ticket, string action)
{
   string url = API_URL + "/api/mt4/signals";
   string postData = "{\"key\":\"" + API_KEY + "\",\"id\":\"" + id +
                     "\",\"ticket\":" + IntegerToString(ticket) +
                     ",\"action\":\"" + action + "\"}";

   string headers = "Content-Type: application/json\r\n";
   char   post[];
   char   result[];
   string resultHeaders;

   StringToCharArray(postData, post, 0, StringLen(postData));
   int res = WebRequest("POST", url, headers, 5000, post, result, resultHeaders);

   if(res == 200)
      Print("Signal ", id, " confirmed: ", action);
   else
      Print("Confirm failed (", res, "): ", CharArrayToString(result));
}

//+------------------------------------------------------------------+
// Process commands (close positions, cancel pending orders from web app)
//+------------------------------------------------------------------+
void ProcessCommands(string json)
{
   int cmdStart = StringFind(json, "\"commands\":[");
   if(cmdStart == -1) return;

   int arrStart = StringFind(json, "[", cmdStart);
   int arrEnd = FindMatchingBracket(json, arrStart);
   if(arrEnd == -1) return;

   string cmdArr = StringSubstr(json, arrStart + 1, arrEnd - arrStart - 1);
   if(StringLen(cmdArr) < 5) return; // Empty array

   int objStart = 0;
   while(true)
   {
      int nextObj = StringFind(cmdArr, "{", objStart);
      if(nextObj == -1) break;
      int objEnd = StringFind(cmdArr, "}", nextObj);
      if(objEnd == -1) break;

      string cmdJson = StringSubstr(cmdArr, nextObj, objEnd - nextObj + 1);
      string action    = GetJsonString(cmdJson, "action");
      string symbol    = GetJsonString(cmdJson, "symbol");
      string side      = GetJsonString(cmdJson, "side");
      string cmdId     = GetJsonString(cmdJson, "id");
      double entry     = GetJsonDouble(cmdJson, "entry");
      int    mt4Ticket = (int)GetJsonDouble(cmdJson, "mt4_ticket");

      // Commands always execute — no IsProcessed check
      // Duplicate execution is harmless (delete/close on already gone = just fails)

      if(action == "cancel_pending")
      {
         Print("CMD: cancel pending ", symbol, " ticket=", mt4Ticket);
         bool ok = false;
         if(mt4Ticket > 0)
         {
            if(OrderSelect(mt4Ticket, SELECT_BY_TICKET))
            {
               ok = OrderDelete(mt4Ticket);
               Print("OrderDelete #", mt4Ticket, " result: ", ok, ok ? "" : " err=" + IntegerToString(GetLastError()));
            }
            else
               Print("Ticket #", mt4Ticket, " not found (already deleted)");
         }
         else
            CancelPendingOnMT4(symbol, side, entry);
      }
      else if(action == "close_position")
      {
         Print("CMD: close position ", symbol, " side=", side);
         bool closed = ClosePositionOnMT4(symbol, side);
         if(!closed)
         {
            string oppSide = (side == "buy") ? "sell" : "buy";
            ClosePositionOnMT4(symbol, oppSide);
         }
      }
      else if(action == "close_by_ticket")
      {
         Print("CMD: close by ticket #", mt4Ticket, " ", symbol);
         CancelByTicket(mt4Ticket); // CancelByTicket handles both pending and market orders
      }

      objStart = objEnd + 1;
   }
}

void CancelByTicket(int ticket)
{
   if(OrderSelect(ticket, SELECT_BY_TICKET))
   {
      if(OrderType() > OP_SELL) // Pending order
      {
         bool deleted = OrderDelete(ticket);
         if(deleted)
            Print("Cancelled MT4 pending #", ticket);
         else
            Print("Failed to cancel #", ticket, ": ", GetLastError());
      }
      else // Market order — close it
      {
         double closePrice = (OrderType() == OP_BUY) ?
            MarketInfo(OrderSymbol(), MODE_BID) :
            MarketInfo(OrderSymbol(), MODE_ASK);
         bool closed = OrderClose(ticket, OrderLots(), closePrice, Slippage, clrRed);
         if(closed)
            Print("Closed MT4 position #", ticket);
         else
            Print("Failed to close #", ticket, ": ", GetLastError());
      }
   }
   else
   {
      Print("Ticket #", ticket, " not found");
   }
}

void CancelPendingOnMT4(string symbol, string side, double entry)
{
   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderMagicNumber() != MagicNumber) continue;
      if(OrderType() <= OP_SELL) continue; // Skip market orders
      if(OrderSymbol() != symbol) continue;

      // Match by entry price (within small tolerance)
      if(entry > 0 && MathAbs(OrderOpenPrice() - entry) > 1) continue;

      bool deleted = OrderDelete(OrderTicket());
      if(deleted)
         Print("Cancelled MT4 pending #", OrderTicket(), " ", symbol);
      else
         Print("Failed to cancel #", OrderTicket(), ": ", GetLastError());
      return; // Cancel first match
   }
   Print("No matching pending order found for ", symbol, " @ ", entry);
}

bool ClosePositionOnMT4(string symbol, string side)
{
   Print("Looking for position to close: ", symbol, " ", side, " (total orders: ", OrdersTotal(), ")");
   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      // Close ANY matching position (not just EA's magic number)
      if(OrderType() > OP_SELL) continue;

      Print("Checking order #", OrderTicket(), " ", OrderSymbol(), " type=", OrderType());

      // Match symbol (try exact and without suffix)
      string orderSym = OrderSymbol();
      if(orderSym != symbol && StringFind(orderSym, symbol) != 0) continue;

      // Match side
      if(side == "buy" && OrderType() != OP_BUY) continue;
      if(side == "sell" && OrderType() != OP_SELL) continue;

      double closePrice = (OrderType() == OP_BUY) ? MarketInfo(orderSym, MODE_BID) : MarketInfo(orderSym, MODE_ASK);
      Print("Closing #", OrderTicket(), " ", orderSym, " at ", closePrice);
      bool closed = OrderClose(OrderTicket(), OrderLots(), closePrice, Slippage, clrRed);

      if(closed)
      {
         Print("CLOSED MT4 position #", OrderTicket(), " ", orderSym, " at ", closePrice);
         return true;
      }
      else
      {
         Print("FAILED to close #", OrderTicket(), ": ", GetLastError());
         return false;
      }
   }
   Print("No matching position found for ", symbol, " ", side);
   return false;
}

//+------------------------------------------------------------------+
// JSON helpers
//+------------------------------------------------------------------+
string GetJsonString(string json, string key)
{
   string search = "\"" + key + "\":\"";
   int start = StringFind(json, search);
   if(start == -1) return "";
   start += StringLen(search);
   int end = StringFind(json, "\"", start);
   if(end == -1) return "";
   return StringSubstr(json, start, end - start);
}

double GetJsonDouble(string json, string key)
{
   string search = "\"" + key + "\":";
   int start = StringFind(json, search);
   if(start == -1) return 0;
   start += StringLen(search);

   string numStr = "";
   for(int i = start; i < StringLen(json); i++)
   {
      ushort c = StringGetCharacter(json, i);
      if((c >= '0' && c <= '9') || c == '.' || c == '-')
         numStr += ShortToString(c);
      else
         break;
   }
   return StringToDouble(numStr);
}

int FindMatchingBracket(string str, int openPos)
{
   int depth = 0;
   for(int i = openPos; i < StringLen(str); i++)
   {
      ushort c = StringGetCharacter(str, i);
      if(c == '[') depth++;
      if(c == ']') depth--;
      if(depth == 0) return i;
   }
   return -1;
}

//--- Processed signals tracking
bool IsProcessed(string id)
{
   for(int i = 0; i < ArraySize(processedSignals); i++)
      if(processedSignals[i] == id) return true;
   return false;
}

void MarkProcessed(string id)
{
   int size = ArraySize(processedSignals);
   ArrayResize(processedSignals, size + 1);
   processedSignals[size] = id;
   if(size > 100)
   {
      for(int i = 0; i < size - 50; i++)
         processedSignals[i] = processedSignals[i + 50];
      ArrayResize(processedSignals, size - 50 + 1);
   }
}

//--- Known closed tickets tracking
bool IsKnownTicket(int ticket)
{
   for(int i = 0; i < ArraySize(knownTickets); i++)
      if(knownTickets[i] == ticket) return true;
   return false;
}

void AddKnownTicket(int ticket)
{
   int size = ArraySize(knownTickets);
   ArrayResize(knownTickets, size + 1);
   knownTickets[size] = ticket;
   if(size > 200)
   {
      for(int i = 0; i < size - 100; i++)
         knownTickets[i] = knownTickets[i + 100];
      ArrayResize(knownTickets, size - 100 + 1);
   }
}

string ErrorDescription(int code)
{
   switch(code)
   {
      case 130: return "Invalid stops";
      case 131: return "Invalid trade volume";
      case 132: return "Market is closed";
      case 133: return "Trade is disabled";
      case 134: return "Not enough money";
      case 135: return "Price changed";
      case 136: return "Off quotes";
      case 138: return "Requote";
      case 148: return "Too many orders";
      default:  return "Error " + IntegerToString(code);
   }
}
//+------------------------------------------------------------------+
