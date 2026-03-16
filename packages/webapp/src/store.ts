import m from 'mithril'
import type { GameRecord } from '@wdip/shared'
import { bridge } from './bridge'

export interface AppState {
  authenticated: boolean
  games: GameRecord[]
  selectedGame: GameRecord | null
  loading: boolean
  error: string | null
  extensionAvailable: boolean | null
}

export const state: AppState = {
  authenticated: false,
  games: [],
  selectedGame: null,
  loading: false,
  error: null,
  extensionAvailable: null,
}

export const actions = {
  setAuthenticated(val: boolean): void {
    state.authenticated = val
    m.redraw()
    if (val) this.loadGames()
  },

  async loadGames(): Promise<void> {
    state.loading = true
    state.error = null
    m.redraw()
    try {
      const available = await bridge.ping()
      state.extensionAvailable = available
      if (available) {
        state.games = await bridge.listGames()
      } else {
        state.games = []
      }
    } catch (e) {
      state.error = e instanceof Error ? e.message : String(e)
      state.extensionAvailable = false
    } finally {
      state.loading = false
      m.redraw()
    }
  },

  selectGame(game: GameRecord | null): void {
    state.selectedGame = game
    m.redraw()
  },

  async deleteGame(id: string): Promise<void> {
    try {
      if (state.extensionAvailable) await bridge.deleteGame(id)
      state.games = state.games.filter(g => g.id !== id)
      if (state.selectedGame?.id === id) state.selectedGame = null
    } catch (e) {
      state.error = e instanceof Error ? e.message : String(e)
    }
    m.redraw()
  },

  async updateGame(game: GameRecord): Promise<void> {
    try {
      if (state.extensionAvailable) await bridge.updateGame(game)
      const idx = state.games.findIndex(g => g.id === game.id)
      if (idx >= 0) state.games[idx] = game
      if (state.selectedGame?.id === game.id) state.selectedGame = game
    } catch (e) {
      state.error = e instanceof Error ? e.message : String(e)
    }
    m.redraw()
  },

  importGames(games: GameRecord[]): void {
    state.games = games
    state.extensionAvailable = false
    state.error = null
    m.redraw()
  },

  clearError(): void {
    state.error = null
    m.redraw()
  },
}
