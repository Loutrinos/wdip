/**
 * bridge.ts
 * Communicates with the content-bridge.ts extension script via window.postMessage.
 *
 * The bridge content script is injected by the extension into this page.
 * It relays these messages to chrome.storage.local on the extension side.
 */

import type { BridgeRequest, BridgeResponse, GameRecord } from '@wdip/shared'

const SOURCE_APP = 'WDIP_APP'
const SOURCE_BRIDGE = 'WDIP_BRIDGE'
const TIMEOUT_MS = 4000

type ResponseOf<T extends BridgeRequest['type']> = Extract<BridgeResponse, { type: string }> & { type: string }

function request<R extends BridgeResponse>(req: BridgeRequest): Promise<R> {
  return new Promise<R>((resolve, reject) => {
    const expected = RESPONSE_MAP[req.type]
    const timer = setTimeout(() => {
      window.removeEventListener('message', handler)
      reject(new Error('Extension bridge timeout — is the Riftbound Recorder extension installed?'))
    }, TIMEOUT_MS)

    function handler(event: MessageEvent) {
      if (event.origin !== window.location.origin) return
      const data = event.data as (BridgeResponse & { source?: string }) | undefined
      if (!data || data.source !== SOURCE_BRIDGE) return
      if (data.type === expected || data.type === 'ERROR' || data.type === 'NOT_INSTALLED') {
        clearTimeout(timer)
        window.removeEventListener('message', handler)
        if (data.type === 'ERROR') reject(new Error((data as { type: 'ERROR'; message: string }).message))
        else if (data.type === 'NOT_INSTALLED') reject(new Error('Extension not installed'))
        else resolve(data as R)
      }
    }

    window.addEventListener('message', handler)
    window.postMessage({ source: SOURCE_APP, ...req }, window.location.origin)
  })
}

const RESPONSE_MAP: Record<BridgeRequest['type'], string> = {
  PING: 'PONG',
  LIST_GAMES: 'LIST_GAMES_RESPONSE',
  GET_GAME: 'GET_GAME_RESPONSE',
  DELETE_GAME: 'DELETE_GAME_RESPONSE',
  UPDATE_GAME: 'UPDATE_GAME_RESPONSE',
}

export const bridge = {
  /** Returns true if the extension bridge is responding. */
  async ping(): Promise<boolean> {
    try {
      await request({ type: 'PING' })
      return true
    } catch {
      return false
    }
  },

  async listGames(): Promise<GameRecord[]> {
    const res = await request<{ type: 'LIST_GAMES_RESPONSE'; data: GameRecord[] }>({ type: 'LIST_GAMES' })
    return res.data
  },

  async getGame(id: string): Promise<GameRecord | null> {
    const res = await request<{ type: 'GET_GAME_RESPONSE'; data: GameRecord | null }>({ type: 'GET_GAME', id })
    return res.data
  },

  async deleteGame(id: string): Promise<void> {
    await request({ type: 'DELETE_GAME', id })
  },

  async updateGame(game: GameRecord): Promise<void> {
    await request({ type: 'UPDATE_GAME', game })
  },
}
