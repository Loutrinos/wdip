// ─── Card & Board ──────────────────────────────────────────────────────────────

export interface Card {
  name: string
  id?: string
  cost?: number
  type?: string
  zone?: string
  imageUrl?: string
}

export interface BoardState {
  /** My cards keyed by zone name */
  myZones: Record<string, Card[]>
  /** Opponent's cards keyed by zone name */
  opponentZones: Record<string, Card[]>
}

// ─── Game Record ───────────────────────────────────────────────────────────────

export interface Turn {
  number: number
  /** Which player was active during this turn */
  activePlayer: 'me' | 'opponent' | 'unknown'
  boardState: BoardState
  /** Cards that appeared on the board compared to the previous turn */
  cardsPlayed: Card[]
  lifePoints: { me: number; opponent: number }
  /** ISO timestamp of when the turn was captured */
  capturedAt: string
  notes?: string
}

export interface GameRecord {
  id: string
  /** ISO timestamp of when the game was started */
  date: string
  opponent: string
  result: 'win' | 'loss' | 'unknown'
  myDeck: Card[]
  turns: Turn[]
}

// ─── In-Progress Session (extension only) ─────────────────────────────────────

export interface GameSession {
  id: string
  startedAt: string
  turns: Turn[]
  /** Snapshot from the previous capture, used to diff cardsPlayed */
  previousSnapshot: BoardState | null
}

// ─── Bridge Protocol (webapp ↔ content-bridge.ts) ─────────────────────────────

export type BridgeRequest =
  | { type: 'PING' }
  | { type: 'LIST_GAMES' }
  | { type: 'GET_GAME'; id: string }
  | { type: 'DELETE_GAME'; id: string }
  | { type: 'UPDATE_GAME'; game: GameRecord }

export type BridgeResponse =
  | { type: 'PONG' }
  | { type: 'LIST_GAMES_RESPONSE'; data: GameRecord[] }
  | { type: 'GET_GAME_RESPONSE'; data: GameRecord | null }
  | { type: 'DELETE_GAME_RESPONSE'; ok: boolean }
  | { type: 'UPDATE_GAME_RESPONSE'; ok: boolean }
  | { type: 'ERROR'; message: string }
  | { type: 'NOT_INSTALLED' }

// ─── Extension Internal Messages (popup ↔ content-game.ts) ───────────────────

export interface SelectorScanResult {
  selector: string
  found: boolean
  text?: string
  childCount?: number
  outerHTMLSnippet?: string
}

export interface DebugScanResult {
  url: string
  results: SelectorScanResult[]
  liveState: { lifePoints: { me: number; opponent: number }; activePlayer: string }
  chatRecentLines: string[]
}

export type ExtensionRequest =
  | { type: 'GET_STATUS' }
  | { type: 'CAPTURE_TURN' }
  | { type: 'END_GAME'; opponent: string; result: GameRecord['result']; myDeck: Card[] }
  | { type: 'RESET_SESSION' }
  | { type: 'DEBUG_SCAN' }

export type ExtensionResponse =
  | { type: 'STATUS'; turnCount: number; currentTurnNumber: number; sessionId: string }
  | { type: 'TURN_CAPTURED'; turnNumber: number; turnCount: number }
  | { type: 'GAME_SAVED'; gameId: string }
  | { type: 'SESSION_RESET' }
  | { type: 'DEBUG_SCAN_RESULT'; scan: DebugScanResult }
  | { type: 'ERROR'; message: string }
