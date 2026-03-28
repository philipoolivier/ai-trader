// AI Trader - Content Script

let polling = false;

window.addEventListener('message', (event) => {
  if (event.source !== window) return;

  if (event.data?.type === 'AI_TRADER_PING') {
    window.postMessage({ type: 'AI_TRADER_EXTENSION_READY' }, '*');
  }

  if (event.data?.type === 'AI_TRADER_CAPTURE_REQUEST') {
    console.log('[AI Trader] Capture request:', event.data.symbol);
    chrome.runtime.sendMessage({
      type: 'CAPTURE_REQUEST',
      symbol: event.data.symbol,
      timeframes: event.data.timeframes,
    });

    // Start polling for results
    startPolling();
  }
});

function startPolling() {
  if (polling) return;
  polling = true;

  const iv = setInterval(() => {
    chrome.runtime.sendMessage({ type: 'CHECK_CAPTURE_STATUS' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[AI Trader] Poll error:', chrome.runtime.lastError);
        return;
      }

      if (!response) return;

      // Send progress
      if (response.captureProgress) {
        window.postMessage({
          type: 'AI_TRADER_CAPTURE_PROGRESS',
          message: response.captureProgress,
        }, '*');
      }

      // Check if done
      if (response.captureStatus === 'done') {
        clearInterval(iv);
        polling = false;

        const screenshots = response.captureScreenshots || [];
        console.log('[AI Trader] Capture done:', screenshots.length, 'screenshots');

        window.postMessage({
          type: 'AI_TRADER_CAPTURE_RESULT',
          screenshots,
        }, '*');

        // Clear storage
        chrome.storage.local.set({ captureStatus: null, captureScreenshots: [], captureProgress: '' });
      }
    });
  }, 1000);

  // Timeout after 2 minutes
  setTimeout(() => {
    if (polling) {
      clearInterval(iv);
      polling = false;
      window.postMessage({ type: 'AI_TRADER_CAPTURE_ERROR', error: 'Capture timed out' }, '*');
    }
  }, 120000);
}

window.postMessage({ type: 'AI_TRADER_EXTENSION_READY' }, '*');
console.log('[AI Trader] Content script loaded');
