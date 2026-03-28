// AI Trader - Background Service Worker
// Orchestrates TradingView chart capture across timeframes

const TIMEFRAMES = [
  { label: '5m', interval: '5' },
  { label: '15m', interval: '15' },
  { label: '1H', interval: '60' },
  { label: '4H', interval: '240' },
];

// TradingView symbol mapping
const TV_SYMBOL_MAP = {
  // Forex
  'EURUSD': 'OANDA:EURUSD',
  'GBPUSD': 'OANDA:GBPUSD',
  'USDJPY': 'OANDA:USDJPY',
  'AUDUSD': 'OANDA:AUDUSD',
  'NZDUSD': 'OANDA:NZDUSD',
  'USDCAD': 'OANDA:USDCAD',
  'USDCHF': 'OANDA:USDCHF',
  'EURGBP': 'OANDA:EURGBP',
  'EURJPY': 'OANDA:EURJPY',
  'GBPJPY': 'OANDA:GBPJPY',
  // Metals
  'XAUUSD': 'OANDA:XAUUSD',
  'XAGUSD': 'OANDA:XAGUSD',
  // Crypto
  'BTCUSD': 'COINBASE:BTCUSD',
  'ETHUSD': 'COINBASE:ETHUSD',
  'SOLUSD': 'COINBASE:SOLUSD',
};

function getTVSymbol(symbol) {
  const clean = symbol.replace('/', '').toUpperCase();
  return TV_SYMBOL_MAP[clean] || `FX:${clean}`;
}

// Listen for capture requests from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CAPTURE_REQUEST') {
    captureAllTimeframes(message.symbol, sender.tab.id)
      .then(screenshots => {
        // Send screenshots back to the content script
        chrome.tabs.sendMessage(sender.tab.id, {
          type: 'CAPTURE_RESULT',
          screenshots,
        });
      })
      .catch(err => {
        chrome.tabs.sendMessage(sender.tab.id, {
          type: 'CAPTURE_ERROR',
          error: err.message,
        });
      });
    return true; // Keep message channel open for async response
  }
});

async function captureAllTimeframes(symbol, originTabId) {
  const tvSymbol = getTVSymbol(symbol);
  const screenshots = [];

  for (const tf of TIMEFRAMES) {
    try {
      const screenshot = await captureTimeframe(tvSymbol, tf);
      screenshots.push(screenshot);
    } catch (err) {
      console.error(`Failed to capture ${tf.label}:`, err);
      // Continue with remaining timeframes
    }
  }

  return screenshots;
}

async function captureTimeframe(tvSymbol, tf) {
  // Open TradingView chart with specific symbol and timeframe
  const url = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol)}&interval=${tf.interval}`;

  const tab = await chrome.tabs.create({
    url,
    active: true, // Must be active to capture
  });

  // Wait for the chart to fully load and render
  await waitForChartLoad(tab.id);

  // Capture the visible tab
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
    format: 'png',
    quality: 90,
  });

  // Close the tab
  await chrome.tabs.remove(tab.id);

  // Extract base64 from data URL
  const base64 = dataUrl.split(',')[1];

  return {
    timeframe: tf.label,
    base64,
    mimeType: 'image/png',
    dataUrl,
  };
}

function waitForChartLoad(tabId) {
  return new Promise((resolve) => {
    let checks = 0;
    const maxChecks = 20; // 20 * 500ms = 10 seconds max wait

    const checkInterval = setInterval(async () => {
      checks++;

      try {
        // Check if TradingView chart has loaded by looking for the chart canvas
        const results = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            // TradingView renders charts in canvas elements
            const canvases = document.querySelectorAll('canvas');
            const chartContainer = document.querySelector('.chart-container');
            const loadingOverlay = document.querySelector('.tv-spinner');

            // Chart is loaded when: canvases exist, no spinner
            return canvases.length > 2 && !loadingOverlay;
          },
        });

        const isLoaded = results && results[0] && results[0].result;

        if (isLoaded || checks >= maxChecks) {
          clearInterval(checkInterval);
          // Extra wait for final render (indicators drawing)
          setTimeout(resolve, 2000);
        }
      } catch {
        // Tab might not be ready yet
        if (checks >= maxChecks) {
          clearInterval(checkInterval);
          setTimeout(resolve, 2000);
        }
      }
    }, 500);
  });
}
