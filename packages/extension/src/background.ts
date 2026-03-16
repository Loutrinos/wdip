/**
 * background.ts — Minimal MV3 service worker.
 *
 * Storage operations are handled directly by content scripts via chrome.storage.local
 * (which content scripts can access in MV3 with the "storage" permission).
 * This background script exists for install-time initialisation and future extensibility.
 */

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    // Seed an empty games array so content scripts never read undefined
    chrome.storage.local.get('wdip_games', result => {
      if (!result['wdip_games']) {
        chrome.storage.local.set({ wdip_games: [] })
      }
    })
  }
})
