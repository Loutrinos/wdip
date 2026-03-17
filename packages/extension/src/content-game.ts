/**
 * content-game.ts
 * Injected into tcg-arena.fr to capture game state turn by turn.
 *
 * Lifecycle:
 *  1. Waits for the history log container to appear (SPA may take a moment).
 *  2. Sets up a MutationObserver on the history log to track turn starts
 *     and player actions ("played X from hand", counter changes, etc.).
 *  3. Listens for chrome.runtime messages from popup.ts.
 *  4. On CAPTURE_TURN: snapshots all visible board cards + live state.
 *  5. On END_GAME: builds final GameRecord -> saves to chrome.storage.local.
 *
 * DOM facts (verified against /play page, March 2026):
 *  - History entries are direct children of .history .content
 *    - System: <div class="full-width"><p>Loutrinos starting turn 1</p></div>
 *    - Action:  <div><h5 class="sender">X</h5><p class="text-start">drew 2</p></div>
 *  - Turn # lives in .left-bar p.text-nowrap ("Turn 1")
 *  - Cards are in div.visible-cards as div.game-card.{ZONE} (absolutely positioned)
 *    - Zone class: Mana | Base | Legend | Chosen_Champion | Hand | Battlefields | Sideboard
 *    - Card ID from img.card-front src: .../cards/OGN-249/full-desktop-2x.avif
 *  - Player name: .player-counters-wrapper .pseudo
 */

import type {
  BoardState,
  Card,
  DebugScanResult,
  ExtensionRequest,
  ExtensionResponse,
  GameRecord,
  GameSession,
  Turn,
} from '@wdip/shared'
import {
  CHAT_PATTERNS,
  SELECTORS,
  groupByZone,
  readAllBoardCards,
  waitForSelector,
} from './selectors'
import { saveGame } from './utils/storage'

// Session state (in-memory, not persisted)

function newSession(): GameSession {
  return {
    id: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    turns: [],
    previousSnapshot: null,
  }
}

let session: GameSession = newSession()

// Live state updated by history observer

const liveState = {
  lifePoints: { me: 3, opponent: 3 },
  activePlayer: 'unknown' as 'me' | 'opponent' | 'unknown',
}

// DOM Readers

function readTurnNumber(): number {
  const el = document.querySelector(SELECTORS.turnNumber)
  if (!el) return session.turns.length + 1
  const match = el.textContent?.match(CHAT_PATTERNS.turnNumber)
  return match ? parseInt(match[1], 10) : session.turns.length + 1
}

function getMyPlayerName(): string {
  return document.querySelector(SELECTORS.myPlayerName)?.textContent?.trim() ?? ''
}

function snapshotBoard(): BoardState {
  const allCards = readAllBoardCards()
  // Hand cards belong to the current player; everything else is on the board.
  // We cannot reliably split by my/opponent without network data, so all
  // visible board cards go into myZones keyed by their zone class.
  const handCards = allCards.filter(c => c.zone === 'Hand')
  const boardCards = allCards.filter(c => c.zone !== 'Hand')
  return {
    myZones: { ...groupByZone(boardCards), Hand: handCards },
    opponentZones: {},
  }
}

function diffCards(prev: BoardState | null, curr: BoardState): Card[] {
  if (!prev) return []
  const prevNames = new Set(
    [...Object.values(prev.myZones), ...Object.values(prev.opponentZones)].flat().map(c => c.name),
  )
  return [...Object.values(curr.myZones), ...Object.values(curr.opponentZones)]
    .flat()
    .filter(c => !prevNames.has(c.name))
}

// History Observer

function parseHistoryEntry(el: Element): void {
  // System message: <div class="full-width"><p>Loutrinos starting turn 1</p></div>
  const fullText = el.querySelector('.full-width p')?.textContent?.trim()
  if (fullText) {
    const m = fullText.match(CHAT_PATTERNS.turnStart)
    if (m) {
      const playerName = m[1].trim()
      const myName = getMyPlayerName()
      liveState.activePlayer =
        myName && playerName.toLowerCase() === myName.toLowerCase() ? 'me' : 'opponent'
    }
    return
  }

  // Player action: counter changes
  const actionText = el.querySelector('p.text-start')?.textContent?.trim() ?? ''
  const counterM = actionText.match(CHAT_PATTERNS.counterChange)
  if (counterM) {
    const val = parseInt(counterM[1], 10)
    if (!Number.isNaN(val)) {
      // Counter updates track the active player's life/counter
      if (liveState.activePlayer === 'me') {
        liveState.lifePoints.me = val
      } else {
        liveState.lifePoints.opponent = val
      }
    }
  }
}

function observeHistory(contentEl: Element): void {
  // Process any existing entries first
  for (const child of Array.from(contentEl.children)) {
    parseHistoryEntry(child)
  }

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          parseHistoryEntry(node as Element)
        }
      }
    }
  })
  observer.observe(contentEl, { childList: true })
}

// Turn capture

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

// Message handler (from popup)

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
        sendResponse({
          type: 'TURN_CAPTURED',
          turnNumber: turn.number,
          turnCount: session.turns.length,
        })
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
        liveState.lifePoints = { me: 3, opponent: 3 }
        liveState.activePlayer = 'unknown'
        sendResponse({ type: 'SESSION_RESET' })
        break
      }

      case 'DEBUG_SCAN': {
        const historyEl = document.querySelector(SELECTORS.historyContent)
        const recentLines: string[] = []
        if (historyEl) {
          // Collect last 15 text lines from history entries
          const leaves = Array.from(historyEl.querySelectorAll('*')).filter(
            el => el.children.length === 0 && (el.textContent?.trim().length ?? 0) > 0,
          )
          recentLines.push(...leaves.slice(-15).map(el => el.textContent!.trim()))
        }

        const scan: DebugScanResult = {
          url: window.location.href,
          liveState: {
            lifePoints: { ...liveState.lifePoints },
            activePlayer: liveState.activePlayer,
          },
          chatRecentLines: recentLines,
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

    // Return undefined for synchronous responses (already sent above)
  },
)

// Init

async function init() {
  const historyEl = await waitForSelector(SELECTORS.historyContent, 30_000)
  if (historyEl) {
    observeHistory(historyEl)
  }
}

init()