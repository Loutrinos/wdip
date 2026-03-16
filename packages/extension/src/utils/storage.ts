import type { GameRecord } from '@wdip/shared'

const STORAGE_KEY = 'wdip_games'

export async function loadGames(): Promise<GameRecord[]> {
  const result = await chrome.storage.local.get(STORAGE_KEY)
  return (result[STORAGE_KEY] as GameRecord[] | undefined) ?? []
}

export async function saveGame(game: GameRecord): Promise<void> {
  const games = await loadGames()
  const idx = games.findIndex(g => g.id === game.id)
  if (idx >= 0) {
    games[idx] = game
  } else {
    games.push(game)
  }
  await chrome.storage.local.set({ [STORAGE_KEY]: games })
}

export async function deleteGame(id: string): Promise<void> {
  const games = await loadGames()
  await chrome.storage.local.set({
    [STORAGE_KEY]: games.filter(g => g.id !== id),
  })
}

export async function getGame(id: string): Promise<GameRecord | null> {
  const games = await loadGames()
  return games.find(g => g.id === id) ?? null
}

export async function updateGame(game: GameRecord): Promise<void> {
  await saveGame(game)
}
