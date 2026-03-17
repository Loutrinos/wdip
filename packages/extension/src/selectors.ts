import type { Card } from '@wdip/shared'

// Verified selectors against actual /play page DOM (March 2026).
// Cards are absolutely positioned; zone is encoded in the card's class list.
// History log is the primary data source for game events.

export const SELECTORS = {
  // Scrollable history/chat container
  historyContent: '.history .content',

  // Turn number text: "Turn 1" in the left sidebar
  turnNumber: '.left-bar p.text-nowrap',

  // Flash element shown when the turn changes: "Loutrinos's turn"
  newTurnMessage: '.new-turn-message p',

  // Current player's display name (shown in the counter widget)
  myPlayerName: '.player-counters-wrapper .pseudo',

  // All card elements -- zone is the second class name (e.g. "Mana", "Hand")
  allCards: 'div.game-card',
} as const

// History Log Regex Patterns
// Matched against text in .history .content child divs.
// Observed examples:
//   "Loutrinos starting turn 1"           (full-width system message)
//   "drew 2"                              (player action p.text-start)
//   "played Ferrous Forerunner from hand" (player action)
//   "counter 1 increased by 2 to 2"      (counter update)

export const CHAT_PATTERNS = {
  // "Loutrinos starting turn 1"
  turnStart: /^(.+?)\s+starting\s+turn\s+(\d+)$/i,

  // Turn number from sidebar: "Turn 1"
  turnNumber: /Turn\s+(\d+)/i,

  // "counter 1 increased by 2 to 2"
  counterChange: /counter\s+\d+\s+(?:increased|decreased)\s+by\s+\d+\s+to\s+(\d+)/i,

  // "drew 2"
  drew: /^drew\s+(\d+)$/i,
} as const

// DOM Helpers

// Classes to skip when finding the zone class on a game-card div
const IGNORED_CLASSES = new Set([
  'game-card', 'card-hidden-no', 'card-hidden-yes', 'extra-deck',
  'card-horizontal', 'tapped',
])

/**
 * Reads a Card from a game-card div.
 * Zone comes from the second class; card ID from the front image URL.
 */
export function readCardFromElement(el: Element): Card {
  const img = el.querySelector('img.card-front')
  const src = img?.getAttribute('src') ?? ''
  // e.g. https://cdn.rgpub.io/.../cards/OGN-249/full-desktop-2x.avif
  const idMatch = src.match(/\/cards\/([^/]+)\//)
  const cardId = idMatch?.[1] ?? ''

  const zone =
    Array.from(el.classList).find(
      c => !IGNORED_CLASSES.has(c) && !/^(index|reversed-index)-\d+$/.test(c),
    ) ?? 'unknown'

  return {
    name: cardId || 'unknown',
    id: cardId || undefined,
    imageUrl: src || undefined,
    zone,
  }
}

/**
 * Returns all visible (non-extra-deck) cards that have a revealed front face.
 */
export function readAllBoardCards(): Card[] {
  return Array.from(document.querySelectorAll(SELECTORS.allCards))
    .filter(el => !el.classList.contains('extra-deck'))
    .filter(el => el.querySelector('img.card-front') !== null)
    .map(readCardFromElement)
}

/**
 * Groups an array of cards into Record<zoneName, Card[]>.
 */
export function groupByZone(cards: Card[]): Record<string, Card[]> {
  const out: Record<string, Card[]> = {}
  for (const card of cards) {
    const zone = card.zone ?? 'unknown'
    ;(out[zone] ??= []).push(card)
  }
  return out
}

/**
 * Polls for a selector to appear in the DOM (SPA-safe).
 */
export async function waitForSelector(
  selector: string,
  timeoutMs = 15_000,
): Promise<Element | null> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const el = document.querySelector(selector)
    if (el) return el
    await new Promise(r => setTimeout(r, 300))
  }
  return null
}