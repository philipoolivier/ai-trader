// AI Trader - Background Service Worker v3

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
  return TV_SYMBOL_MAP[clean] || clean;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CAPTURE_REQUEST') {
    console.log('Capture request received:', message.symbol);
    chrome.storage.local.set({
      captureStatus: 'capturing',
      captureScreenshots: [],
      captureProgress: 'Starting...',
    });

    const timeframes = message.timeframes || [
      { label: '5m', interval: '5' },
      { label: '15m', interval: '15' },
      { label: '1H', interval: '60' },
      { label: '4H', interval: '240' },
    ];

    doCapture(message.symbol, timeframes, sender.tab.id, sender.tab.windowId);
    return true;
  }

  if (message.type === 'CHECK_CAPTURE_STATUS') {
    chrome.storage.local.get(['captureStatus', 'captureScreenshots', 'captureProgress'], (data) => {
      sendResponse(data || {});
    });
    return true;
  }
});

async function doCapture(symbol, timeframes, originTabId, originWindowId) {
  const tvSymbol = getTVSymbol(symbol);
  const screenshots = [];
  let openTabId = null;

  try {
    // Open ONE tab and reuse it for all timeframes
    const firstUrl = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol)}&interval=${timeframes[0].interval}`;
    console.log('Opening tab:', firstUrl);

    const tab = await chrome.tabs.create({ url: firstUrl, active: true });
    openTabId = tab.id;

    // Wait for initial page load
    await delay(6000);

    for (let i = 0; i < timeframes.length; i++) {
      const tf = timeframes[i];
      const progress = `Capturing ${tf.label} (${i + 1}/${timeframes.length})...`;
      console.log(progress);
      chrome.storage.local.set({ captureProgress: progress });

      try {
        // Navigate to the timeframe URL
        if (i > 0) {
          const url = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol)}&interval=${tf.interval}`;
          await chrome.tabs.update(openTabId, { url });
          await delay(6000); // Wait for chart + indicators to load
        }

        // Auto-fit: double-click the price scale to reset vertical zoom
        try {
          await chrome.scripting.executeScript({
            target: { tabId: openTabId },
            func: () => {
              // The price scale is a separate pane on the right side of the chart
              // Find it by looking for the narrow canvas/div on the right
              const containers = document.querySelectorAll('td, div');
              for (const el of containers) {
                const rect = el.getBoundingClientRect();
                // Price scale is typically ~60-80px wide, on the far right, full height
                if (rect.width > 40 && rect.width < 120 && rect.height > 300 &&
                    rect.right > window.innerWidth - 150) {
                  // Double-click to auto-scale
                  el.dispatchEvent(new MouseEvent('dblclick', {
                    clientX: rect.left + rect.width / 2,
                    clientY: rect.top + rect.height / 2,
                    bubbles: true, cancelable: true, view: window,
                  }));
                  console.log('Double-clicked price scale at', rect.left, rect.top);
                  break;
                }
              }
            },
          });
        } catch (e) { console.log('Auto-fit:', e.message); }

        await delay(1500);

        // Focus window for capture
        try {
          await chrome.windows.update(tab.windowId, { focused: true });
        } catch (e) { console.log('Focus failed:', e); }

        await delay(500);

        // Take screenshot
        const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
        console.log('Captured', tf.label, '- size:', dataUrl.length);

        screenshots.push({
          timeframe: tf.label,
          base64: dataUrl.split(',')[1],
          mimeType: 'image/png',
          dataUrl: dataUrl,
        });

      } catch (err) {
        console.error('Capture failed for', tf.label, ':', err.message || err);
      }
    }
  } catch (err) {
    console.error('Overall capture error:', err.message || err);
  }

  // Close the tab
  if (openTabId) {
    try {
      await chrome.tabs.remove(openTabId);
      console.log('Tab closed');
    } catch (e) {
      console.log('Tab close failed:', e);
    }
  }

  // Focus back on original tab
  try {
    await chrome.tabs.update(originTabId, { active: true });
    await chrome.windows.update(originWindowId, { focused: true });
  } catch (e) { console.log('Refocus failed:', e); }

  // Save results
  console.log('Saving', screenshots.length, 'screenshots to storage');
  chrome.storage.local.set({
    captureStatus: 'done',
    captureScreenshots: screenshots,
    captureProgress: `Done - ${screenshots.length} screenshots`,
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
