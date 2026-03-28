// AI Trader - Background Service Worker
// Orchestrates TradingView chart capture across timeframes

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

// Listen for capture requests
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CAPTURE_REQUEST') {
    const originTabId = sender.tab.id;
    const timeframes = message.timeframes || [
      { label: '5m', interval: '5' },
      { label: '15m', interval: '15' },
      { label: '1H', interval: '60' },
      { label: '4H', interval: '240' },
    ];

    captureAllTimeframes(message.symbol, timeframes, originTabId);
    return true;
  }
});

async function captureAllTimeframes(symbol, timeframes, originTabId) {
  const tvSymbol = getTVSymbol(symbol);
  const screenshots = [];

  // Send progress updates
  function sendProgress(msg) {
    try {
      chrome.tabs.sendMessage(originTabId, { type: 'CAPTURE_PROGRESS', message: msg });
    } catch (e) { /* ignore */ }
  }

  for (let i = 0; i < timeframes.length; i++) {
    const tf = timeframes[i];
    sendProgress(`Capturing ${tf.label} (${i + 1}/${timeframes.length})...`);

    try {
      const screenshot = await captureOneTimeframe(tvSymbol, tf);
      screenshots.push(screenshot);
    } catch (err) {
      console.error(`Failed to capture ${tf.label}:`, err.message);
      sendProgress(`Failed ${tf.label}: ${err.message}`);
    }
  }

  // Send results back
  try {
    chrome.tabs.sendMessage(originTabId, {
      type: 'CAPTURE_RESULT',
      screenshots,
    });
  } catch (err) {
    console.error('Failed to send results back:', err);
  }

  // Focus back on the original tab
  try {
    chrome.tabs.update(originTabId, { active: true });
  } catch (e) { /* ignore */ }
}

async function captureOneTimeframe(tvSymbol, tf) {
  const url = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol)}&interval=${tf.interval}`;

  // Create tab
  const tab = await chrome.tabs.create({ url, active: true });

  try {
    // Wait for chart to load
    await waitForChartLoad(tab.id);

    // Extra wait for indicators to finish drawing
    await sleep(3000);

    // Focus the tab's window to ensure captureVisibleTab works
    await chrome.windows.update(tab.windowId, { focused: true });
    await sleep(500);

    // Capture screenshot
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: 'png',
    });

    const base64 = dataUrl.split(',')[1];

    return {
      timeframe: tf.label,
      base64,
      mimeType: 'image/png',
      dataUrl,
    };
  } finally {
    // Always close the tab
    try {
      await chrome.tabs.remove(tab.id);
    } catch (e) {
      console.error('Failed to close tab:', e);
    }
  }
}

function waitForChartLoad(tabId) {
  return new Promise((resolve, reject) => {
    let checks = 0;
    const maxChecks = 30; // 30 * 500ms = 15 seconds max

    const checkInterval = setInterval(async () => {
      checks++;

      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            const canvases = document.querySelectorAll('canvas');
            const spinner = document.querySelector('[class*="spinner"]') ||
                           document.querySelector('[class*="loading"]');
            return canvases.length > 0 && !spinner;
          },
        });

        if ((results && results[0] && results[0].result) || checks >= maxChecks) {
          clearInterval(checkInterval);
          resolve();
        }
      } catch (err) {
        if (checks >= maxChecks) {
          clearInterval(checkInterval);
          resolve(); // Still try to capture even if check fails
        }
      }
    }, 500);
  });
}
