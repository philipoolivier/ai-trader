//+------------------------------------------------------------------+
//|                                              AI_Trader_EA.mq4    |
//|                              AI Trader - Signal Receiver EA      |
//|                         Polls API for trade signals              |
//+------------------------------------------------------------------+
#property copyright "AI Trader"
#property version   "1.00"
#property strict

//--- Input parameters
input string   API_URL     = "https://ai-trader-mocha.vercel.app/api/mt4/signals";
input string   API_KEY     = "";           // Your AUTH_SECRET from Vercel
input int      PollSeconds = 5;            // How often to check for signals
input double   MaxLotSize  = 1.0;          // Max lot size safety cap
input int      MagicNumber = 20260327;     // Magic number for EA orders
input int      Slippage    = 3;            // Max slippage in points

//--- Global variables
datetime lastPoll = 0;
string   processedSignals[];  // Track which signals we've already handled

//+------------------------------------------------------------------+
//| Expert initialization                                             |
//+------------------------------------------------------------------+
int OnInit()
{
   if(API_KEY == "")
   {
      Alert("AI Trader EA: API_KEY is empty! Set your AUTH_SECRET.");
      return(INIT_PARAMETERS_INCORRECT);
   }

   Print("AI Trader EA initialized. Polling every ", PollSeconds, " seconds.");
   Print("API URL: ", API_URL);
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert tick function                                               |
//+------------------------------------------------------------------+
void OnTick()
{
   // Only poll at the specified interval
   if(TimeCurrent() - lastPoll < PollSeconds)
      return;

   lastPoll = TimeCurrent();
   PollForSignals();
}

//+------------------------------------------------------------------+
//| Poll API for new signals                                          |
//+------------------------------------------------------------------+
void PollForSignals()
{
   string url = API_URL + "?key=" + API_KEY;
   string headers = "Content-Type: application/json\r\n";
   char   post[];
   char   result[];
   string resultHeaders;

   int res = WebRequest("GET", url, headers, 5000, post, result, resultHeaders);

   if(res == -1)
   {
      int err = GetLastError();
      if(err == 4060)
         Print("Add '", API_URL, "' to Tools > Options > Expert Advisors > Allow WebRequest for listed URL");
      else
         Print("WebRequest error: ", err);
      return;
   }

   string response = CharArrayToString(result);

   if(res != 200)
   {
      Print("API error (", res, "): ", response);
      return;
   }

   // Parse signals from JSON response
   ProcessSignals(response);
}

//+------------------------------------------------------------------+
//| Process signals from API response                                  |
//+------------------------------------------------------------------+
void ProcessSignals(string json)
{
   // Simple JSON parsing for signals array
   int signalsStart = StringFind(json, "\"signals\":[");
   if(signalsStart == -1) return;

   int arrStart = StringFind(json, "[", signalsStart);
   int arrEnd = FindMatchingBracket(json, arrStart);
   if(arrEnd == -1) return;

   string signalsArr = StringSubstr(json, arrStart + 1, arrEnd - arrStart - 1);

   // Split into individual signal objects
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
//| Process a single signal                                            |
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

   // Skip if already processed
   if(IsProcessed(id)) return;

   // Validate
   if(symbol == "" || id == "") return;
   if(lots <= 0 || lots > MaxLotSize) lots = MathMin(0.01, MaxLotSize);

   // Check if symbol exists on this broker
   if(MarketInfo(symbol, MODE_BID) == 0)
   {
      Print("Symbol not found: ", symbol, ". Trying with suffix...");
      // Try common suffixes
      string suffixes[] = {".r", ".i", "m", "."};
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
         Print("Cannot find symbol: ", symbol);
         MarkProcessed(id);
         ConfirmSignal(id, 0, "cancelled");
         return;
      }
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

   // Normalize prices to broker's digits
   int digits = (int)MarketInfo(symbol, MODE_DIGITS);
   entry = NormalizeDouble(entry, digits);
   sl    = NormalizeDouble(sl, digits);
   tp    = NormalizeDouble(tp, digits);

   // For market orders, use current price
   double price = entry;
   if(cmd == OP_BUY)  price = MarketInfo(symbol, MODE_ASK);
   if(cmd == OP_SELL) price = MarketInfo(symbol, MODE_BID);

   Print("Placing order: ", symbol, " ", EnumToString((ENUM_ORDER_TYPE)cmd),
         " lots=", lots, " price=", price, " sl=", sl, " tp=", tp);

   int ticket = OrderSend(symbol, cmd, lots, price, Slippage, sl, tp,
                           "AI Trader: " + id, MagicNumber, 0,
                           cmd <= OP_SELL ? (side == "buy" ? clrGreen : clrRed) : clrGold);

   if(ticket > 0)
   {
      Print("Order placed successfully. Ticket: ", ticket);
      ConfirmSignal(id, ticket, "executed");
   }
   else
   {
      int err = GetLastError();
      Print("Order failed! Error: ", err, " - ", ErrorDescription(err));
   }

   MarkProcessed(id);
}

//+------------------------------------------------------------------+
//| Confirm signal execution back to API                               |
//+------------------------------------------------------------------+
void ConfirmSignal(string id, int ticket, string action)
{
   string url = API_URL;
   // Remove query params from URL for POST
   int qPos = StringFind(url, "?");
   if(qPos > 0) url = StringSubstr(url, 0, qPos);

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
      Print("Signal ", id, " confirmed as ", action);
   else
      Print("Failed to confirm signal ", id, ": ", res);
}

//+------------------------------------------------------------------+
//| Simple JSON helpers                                                |
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

   // Keep list manageable
   if(size > 100)
   {
      for(int i = 0; i < size - 50; i++)
         processedSignals[i] = processedSignals[i + 50];
      ArrayResize(processedSignals, size - 50 + 1);
   }
}

//+------------------------------------------------------------------+
//| Error description helper                                           |
//+------------------------------------------------------------------+
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
