/**
 * content-game.ts
 * Injected into tcg-arena.fr to capture game state turn by turn.
 *
 * Lifecycle:
 *  1. Waits for the board to appear (SPA may take a moment to render).
 *  2. Sets up a MutationObserver on the chat to track HP/active-player changes.
 *  3. Listens for messages from popup.ts via chrome.runtime.onMessage.
 *  4. On CAPTURE_TURN: snapshots board state + chat-parsed info → appends to session.
 *  5. On END_GAME: builds final GameRecord → saves to chrome.storage.local.
 */

import type { BoardState, Card, DebugScanResult, ExtensionRequest, ExtensionResponse, GameRecord, GameSession, Turn } from '@wdip/shared'
import {
  CHAT_PATTERNS,
  SELECTORS,
  groupByZone,
  readCardsFromBoard,
  waitForSelector,
} from './selectors'
import { saveGame } from './utils/storage'

// ─── Session state (in-memory, not persisted) ─────────────────────────────────

function newSession(): GameSession {
  return {
    id: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    turns: [],
    previousSnapshot: null,
  }
}

let session: GameSession = newSession()

// ─── Chat-parsed live state ───────────────────────────────────────────────────

const liveState = {
  lifePoints: { me: 20, opponent: 20 },
  activePlayer: 'unknown' as 'me' | 'opponent' | 'unknown',
}

// ─── DOM Readers ──────────────────────────────────────────────────────────────

function readTurnNumber(): number {
  const el = document.querySelector(SELECTORS.turnNumber)
  if (!el) return session.turns.length + 1
  const match = el.textContent?.match(/\d+/)
  return match ? parseInt(match[0], 10) : session.turns.length + 1
}

function snapshotBoard(): BoardState {
  const myBoard = document.querySelector(SELECTORS.myBoardContainer)
  const oppBoard = document.querySelector(SELECTORS.opponentBoardContainer)

  const myCards: Card[] = myBoard ? readCardsFromBoard(myBoard) : []
  const oppCards: Card[] = oppBoard ? readCardsFromBoard(oppBoard) : []

  return {
    myZones: groupByZone(myCards),
    opponentZones: groupByZone(oppCards),
  }
}

function diffCards(prev: BoardState | null, curr: BoardState): Card[] {
  if (!prev) return []
  const prevNames = new Set(
    [...Object.values(prev.myZones), ...Object.values(prev.opponentZones)]
      .flat()
      .map(c => c.name),
  )
  const newCards = [...Object.values(curr.myZones), ...Object.values(curr.opponentZones)]
    .flat()
    .filter(c => !prevNames.has(c.name))
  return newCards
}

// ─── Chat Observer ────────────────────────────────────────────────────────────

function parseChatMessage(text: string): void {
  // Active player
  const playerMatch = text.match(CHAT_PATTERNS.activePlayer)
  if (playerMatch) {
    // If the matched player name looks like "you/vous/votre", it's my turn
    const name = playerMatch[1].toLowerCase()
    liveState.activePlayer =
      name === 'you' || name === 'vous' || name === 'votre' ? 'me' : 'opponent'
  }

  // HP — basic counter update, e.g. "HP: 20 → 18" or "HP: 18"
  const counterMatch = text.match(CHAT_PATTERNS.counterSet)
  if (counterMatch) {
    // We can't reliably tell whose HP it is without context.
    // The first counter change after a game start is usually the opponent's.
    // This will be refined once actual message format is observed.
    const newVal = parseInt(counterMatch[2], 10)
    if (!Number.isNaN(newVal)) {
      // Heuristic: if value is less than current "me" hp and "me" hp started at 20
      // treat as opponent; otherwise treat as self. Adjust based on real messages.
      if (newVal <= liveState.lifePoints.me) {
        liveState.lifePoints.me = newVal
      } else {
        liveState.lifePoints.opponent = newVal
      }
    }
  }

  // Standalone HP value: "Health: 18"
  const hpMatch = text.match(CHAT_PATTERNS.hpValue)
  if (hpMatch && !counterMatch) {
    const val = parseInt(hpMatch[1], 10)
    if (!Number.isNaN(val)) {
      liveState.lifePoints.me = val
    }
  }
}

function observeChat(chatEl: Element): void {
  const observer = new MutationObserver(() => {
    // Walk leaf text nodes in the chat (avoid re-processing the whole history)
    const leaves = Array.from(chatEl.querySelectorAll('*')).filter(
      el => el.children.length === 0 && (el.textContent?.trim().length ?? 0) > 0,
    )
    const recent = leaves.slice(-20) // only consider the most recent messages
    for (const el of recent) {
      parseChatMessage(el.textContent!.trim())
    }
  })
  observer.observe(chatEl, { childList: true, subtree: true })
}

// ─── Turn capture ─────────────────────────────────────────────────────────────

function captureTurn(): Turn {
  const boardState = snapshotBoard()
  const cardsPlayed = diffCards(session.previousSnapshot, boardState)
  const turn: Turn = {
    number: readTurnNumber(),
    activePlayer: liveState.activePlayer,
    boardState,
    cardsPlayed,
    lifePoints: { ...liveState.lifePoints },
    capturedAt: new Date().toISOString(),
  }
  session.turns.push(turn)
  session.previousSnapshot = boardState
  return turn
}

// ─── Message handler (from popup) ────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (raw: ExtensionRequest, _sender, sendResponse: (r: ExtensionResponse) => void) => {
    switch (raw.type) {
      case 'GET_STATUS': {
        sendResponse({
          type: 'STATUS',
          turnCount: session.turns.length,
          currentTurnNumber: readTurnNumber(),
          sessionId: session.id,
        })
        break
      }

      case 'CAPTURE_TURN': {
        const turn = captureTurn()
        sendResponse({ type: 'TURN_CAPTURED', turnNumber: turn.number, turnCount: session.turns.length })
        break
      }

      case 'END_GAME': {
        const { opponent, result, myDeck } = raw
        const gameRecord: GameRecord = {
          id: session.id,
          date: session.startedAt,
          opponent,
          result,
          myDeck,
          turns: session.turns,
        }
        saveGame(gameRecord)
          .then(() => {
            sendResponse({ type: 'GAME_SAVED', gameId: gameRecord.id })
            session = newSession()
          })
          .catch((err: unknown) => {
            sendResponse({ type: 'ERROR', message: String(err) })
          })
        return true // keep channel open for async response
      }

      case 'RESET_SESSION': {
        session = newSession()
        liveState.lifePoints = { me: 20, opponent: 20 }
        liveState.activePlayer = 'unknown'
        sendResponse({ type: 'SESSION_RESET' })
        break
      }

      case 'DEBUG_SCAN': {
        const scan: DebugScanResult = {
          url: window.location.href,
          liveState: {
            lifePoints: { ...liveState.lifePoints },
            activePlayer: liveState.activePlayer,
          },
          chatRecentLines: (() => {
            const chat = document.querySelector(SELECTORS.chat)
            if (!chat) return []
            return Array.from(chat.querySelectorAll('*'))
              .filter(el => el.children.length === 0 && (el.textContent?.trim().length ?? 0) > 0)
              .slice(-15)
              .map(el => el.textContent!.trim())
          })(),
          results: Object.entries(SELECTORS).map(([key, selector]) => {
            const el = document.querySelector(selector)
            return {
              selector: `${key}: ${selector}`,
              found: !!el,
              text: el?.textContent?.trim().slice(0, 80),
              childCount: el?.children.length,
              outerHTMLSnippet: el?.outerHTML.slice(0, 120),
            }
          }),
        }
        sendResponse({ type: 'DEBUG_SCAN_RESULT', scan })
        break
      }
    }
  },
)

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  // The board may not exist immediately on document_idle if the user hasn't
  // navigated to a game room yet — waitForSelector handles this gracefully.
  const chatEl = await waitForSelector(SELECTORS.chat, 30_000)
  if (chatEl) {
    observeChat(chatEl)
  }
  // Board container watcher (optional — card detection is on-demand via popup)
  // We don't set up a continuous board observer to keep CPU usage low.
}

init()
