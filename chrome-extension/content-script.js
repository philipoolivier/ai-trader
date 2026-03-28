// AI Trader - Content Script
// Bridge between the web app and the Chrome extension

window.addEventListener('message', (event) => {
  if (event.source !== window) return;

  if (event.data && event.data.type === 'AI_TRADER_PING') {
    window.postMessage({ type: 'AI_TRADER_EXTENSION_READY' }, '*');
  }

  if (event.data && event.data.type === 'AI_TRADER_CAPTURE_REQUEST') {
    console.log('[AI Trader] Capture request:', event.data.symbol, 'TFs:', event.data.timeframes);
    chrome.runtime.sendMessage({
      type: 'CAPTURE_REQUEST',
      symbol: event.data.symbol,
      timeframes: event.data.timeframes,
    });
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'CAPTURE_RESULT') {
    console.log('[AI Trader] Screenshots received:', message.screenshots.length);
    window.postMessage({ type: 'AI_TRADER_CAPTURE_RESULT', screenshots: message.screenshots }, '*');
  }
  if (message.type === 'CAPTURE_ERROR') {
    window.postMessage({ type: 'AI_TRADER_CAPTURE_ERROR', error: message.error }, '*');
  }
  if (message.type === 'CAPTURE_PROGRESS') {
    window.postMessage({ type: 'AI_TRADER_CAPTURE_PROGRESS', message: message.message }, '*');
  }
});

window.postMessage({ type: 'AI_TRADER_EXTENSION_READY' }, '*');
console.log('[AI Trader] Content script loaded');
