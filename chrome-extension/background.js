// AI Trader - Background Service Worker

const TV_SYMBOL_MAP = {
  'EURUSD': 'OANDA:EURUSD', 'GBPUSD': 'OANDA:GBPUSD', 'USDJPY': 'OANDA:USDJPY',
  'AUDUSD': 'OANDA:AUDUSD', 'NZDUSD': 'OANDA:NZDUSD', 'USDCAD': 'OANDA:USDCAD',
  'USDCHF': 'OANDA:USDCHF', 'EURGBP': 'OANDA:EURGBP', 'EURJPY': 'OANDA:EURJPY',
  'GBPJPY': 'OANDA:GBPJPY',
  'XAUUSD': 'OANDA:XAUUSD', 'XAGUSD': 'OANDA:XAGUSD',
  'BTCUSD': 'COINBASE:BTCUSD', 'ETHUSD': 'COINBASE:ETHUSD', 'SOLUSD': 'COINBASE:SOLUSD',
};

function getTVSymbol(symbol) {
  const clean = symbol.replace('/', '').toUpperCase();
  return TV_SYMBOL_MAP[clean] || `FX:${clean}`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CAPTURE_REQUEST') {
    const originTabId = sender.tab.id;
    const originWindowId = sender.tab.windowId;
    const timeframes = message.timeframes || [
      { label: '5m', interval: '5' },
      { label: '15m', interval: '15' },
      { label: '1H', interval: '60' },
      { label: '4H', interval: '240' },
    ];

    // Clear any previous results
    chrome.storage.local.set({ captureStatus: 'capturing', captureScreenshots: [], captureProgress: 'Starting...' });
    captureAll(message.symbol, timeframes, originTabId, originWindowId);
    return true;
  }

  if (message.type === 'CHECK_CAPTURE_STATUS') {
    chrome.storage.local.get(['captureStatus', 'captureScreenshots', 'captureProgress'], (data) => {
      sendResponse(data);
    });
    return true; // async response
  }
});

async function captureAll(symbol, timeframes, originTabId, originWindowId) {
  const tvSymbol = getTVSymbol(symbol);
  const screenshots = [];

  for (let i = 0; i < timeframes.length; i++) {
    const tf = timeframes[i];
    chrome.storage.local.set({ captureProgress: `Capturing ${tf.label} (${i + 1}/${timeframes.length})...` });

    try {
      const screenshot = await captureOne(tvSymbol, tf);
      screenshots.push(screenshot);
    } catch (err) {
      console.error(`Failed ${tf.label}:`, err.message);
    }
  }

  // Store results and mark done
  chrome.storage.local.set({
    captureStatus: 'done',
    captureScreenshots: screenshots,
    captureProgress: `Done - ${screenshots.length} screenshots`,
  });

  // Focus back on original tab
  try {
    await chrome.tabs.update(originTabId, { active: true });
    await chrome.windows.update(originWindowId, { focused: true });
  } catch (e) { /* tab might be closed */ }
}

async function captureOne(tvSymbol, tf) {
  const url = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol)}&interval=${tf.interval}`;
  const tab = await chrome.tabs.create({ url, active: true });

  try {
    // Wait for chart to load
    await waitForChart(tab.id);

    // Extra time for indicators
    await sleep(3000);

    // Ensure window is focused for capture
    await chrome.windows.update(tab.windowId, { focused: true });
    await sleep(300);

    // Capture
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });

    return {
      timeframe: tf.label,
      base64: dataUrl.split(',')[1],
      mimeType: 'image/png',
      dataUrl,
    };
  } finally {
    try { await chrome.tabs.remove(tab.id); } catch (e) {}
  }
}

function waitForChart(tabId) {
  return new Promise((resolve) => {
    let checks = 0;
    const iv = setInterval(async () => {
      checks++;
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => document.querySelectorAll('canvas').length > 0,
        });
        if ((results?.[0]?.result) || checks >= 25) {
          clearInterval(iv);
          resolve();
        }
      } catch {
        if (checks >= 25) { clearInterval(iv); resolve(); }
      }
    }, 500);
  });
}
