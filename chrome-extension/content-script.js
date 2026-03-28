// AI Trader - Content Script
// Bridge between the web app and the Chrome extension

// Listen for messages from the web app page
window.addEventListener('message', (event) => {
  if (event.source !== window) return;

  // Respond to ping — lets the app know extension is installed
  if (event.data && event.data.type === 'AI_TRADER_PING') {
    window.postMessage({ type: 'AI_TRADER_EXTENSION_READY' }, '*');
  }

  // Handle capture request
  if (event.data && event.data.type === 'AI_TRADER_CAPTURE_REQUEST') {
    console.log('[AI Trader Extension] Capture request received:', event.data.symbol);

    chrome.runtime.sendMessage({
      type: 'CAPTURE_REQUEST',
      symbol: event.data.symbol,
    });
  }
});

// Listen for results from background service worker
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'CAPTURE_RESULT') {
    console.log('[AI Trader Extension] Screenshots received:', message.screenshots.length);

    // Send screenshots back to the web app page
    window.postMessage({
      type: 'AI_TRADER_CAPTURE_RESULT',
      screenshots: message.screenshots,
    }, '*');
  }

  if (message.type === 'CAPTURE_ERROR') {
    console.error('[AI Trader Extension] Capture error:', message.error);

    window.postMessage({
      type: 'AI_TRADER_CAPTURE_ERROR',
      error: message.error,
    }, '*');
  }
});

// Let the page know the extension is installed
window.postMessage({ type: 'AI_TRADER_EXTENSION_READY' }, '*');
console.log('[AI Trader Extension] Content script loaded');
