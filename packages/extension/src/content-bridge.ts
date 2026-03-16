/**
 * content-bridge.ts
 * Injected into the GitHub Pages web app (and localhost:5173 for dev).
 *
 * Bridges window.postMessage (from the Mithril SPA) to chrome.storage.local.
 * The web app cannot access Chrome APIs directly, so this script acts as a relay.
 *
 * Security:
 *  - Only processes messages with source === 'WDIP_APP'
 *  - Only accepts messages from the same origin (event.origin check)
 *  - Sends responses tagged with source === 'WDIP_BRIDGE'
 */

import type { BridgeRequest, BridgeResponse } from '@wdip/shared'
import { deleteGame, getGame, loadGames, updateGame } from './utils/storage'

const SOURCE_APP = 'WDIP_APP'
const SOURCE_BRIDGE = 'WDIP_BRIDGE'

function reply(res: BridgeResponse) {
  window.postMessage({ source: SOURCE_BRIDGE, ...res }, window.location.origin)
}

async function handleRequest(req: BridgeRequest) {
  try {
    switch (req.type) {
      case 'PING':
        reply({ type: 'PONG' })
        break

      case 'LIST_GAMES': {
        const data = await loadGames()
        reply({ type: 'LIST_GAMES_RESPONSE', data })
        break
      }

      case 'GET_GAME': {
        const data = await getGame(req.id)
        reply({ type: 'GET_GAME_RESPONSE', data })
        break
      }

      case 'DELETE_GAME': {
        await deleteGame(req.id)
        reply({ type: 'DELETE_GAME_RESPONSE', ok: true })
        break
      }

      case 'UPDATE_GAME': {
        await updateGame(req.game)
        reply({ type: 'UPDATE_GAME_RESPONSE', ok: true })
        break
      }

      default:
        reply({ type: 'ERROR', message: `Unknown request type: ${(req as BridgeRequest).type}` })
    }
  } catch (err) {
    reply({ type: 'ERROR', message: String(err) })
  }
}

window.addEventListener('message', (event: MessageEvent) => {
  // Security: reject messages from different origins
  if (event.origin !== window.location.origin) return

  const data = event.data as ({ source?: string } & BridgeRequest) | undefined
  if (!data || data.source !== SOURCE_APP) return

  const { source: _source, ...req } = data
  handleRequest(req as BridgeRequest)
})

// Announce bridge presence so the web app knows the extension is installed
window.postMessage({ source: SOURCE_BRIDGE, type: 'PONG' }, window.location.origin)
