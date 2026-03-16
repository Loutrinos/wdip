import type { Card } from '@wdip/shared'

// ─── DOM Selectors for tcg-arena.fr ──────────────────────────────────────────
//
// These selectors were derived from XPaths provided during in-game inspection.
// If the site structure changes, update these constants — no other code needs
// to change because all DOM reads go through the helpers below.
//
// XPath → CSS derivation:
//   //*[@id="X"]/a/b[N] → #X > a > b:nth-child(N)

export const SELECTORS = {
  // Turn number indicator
  // XPath: //*[@id="root"]/div/header/div/div/div[1]/div[1]/p
  turnNumber:
    '#root > div > header > div > div > div:nth-child(1) > div:nth-child(1) > p',

  // Chat container — used to extract HP changes and active player
  // XPath: //*[@id="root"]/div/header/div/div/div[2]/div[3]
  chat:
    '#root > div > header > div > div > div:nth-child(2) > div:nth-child(3)',

  // My board container
  // XPath: //*[@id="root"]/div/header/div/div/div[2]/div[2]/div[2]/div[1]/div
  myBoardContainer:
    '#root > div > header > div > div > div:nth-child(2) > div:nth-child(2) > div:nth-child(2) > div:nth-child(1) > div',

  // Opponent board — assumed mirror (div[2] sibling). Confirm via DevTools.
  opponentBoardContainer:
    '#root > div > header > div > div > div:nth-child(2) > div:nth-child(2) > div:nth-child(2) > div:nth-child(2) > div',

  // Relative selectors applied within a board container
  // XPath relative: /div[1]/div[1]/div[1] → zone label elements
  boardZones: ':scope > div:nth-child(1) > div:nth-child(1) > div:nth-child(1)',
  // XPath relative: /div[1]/div[1]/div[2] → card elements
  boardCards: ':scope > div:nth-child(1) > div:nth-child(1) > div:nth-child(2)',
} as const

// ─── Chat Regex Patterns ──────────────────────────────────────────────────────
//
// These patterns match system messages posted to chat by tcg-arena.fr.
// They are intentionally broad and cover both French and English UI strings.
// Update them once you observe the actual message format in a live game.
//
// Tip: open Chrome DevTools > Extensions > content-game.ts console and run:
//   Array.from(document.querySelector(SELECTORS.chat).querySelectorAll('*'))
//     .filter(e => !e.children.length && e.textContent.trim())
//     .map(e => e.textContent.trim())

export const CHAT_PATTERNS = {
  // Match turn number: "Turn 3", "Tour 3", "Round 3"
  turnNumber: /(?:turn|tour|round)[:\s]+(\d+)/i,

  // Match active player: "It's Alice's turn" / "C'est le tour de Alice"
  activePlayer: /(?:it'?s?|c'est\s+(?:le\s+tour\s+de)?)\s+(.+?)(?:'s)?\s+(?:turn|tour)/i,

  // Match a counter/HP change: "Health: 18", "HP: 20", "Life: 15", "Points: 12"
  // Also matches French variants: "Vie: 18", "PV: 20"
  hpValue: /(?:hp|health|life|points?|vie|pv)[:\s]+(\d+)/i,

  // Match a numeric value set/changed: "Counter set to 18", "Compteur: 18 → 15"
  counterSet: /\b(\d+)\s*(?:→|->|to|=)\s*(\d+)/,
} as const

// ─── DOM Helpers ──────────────────────────────────────────────────────────────

/**
 * Reads a Card from a single card DOM element.
 * Tries multiple common patterns used by tcg-arena.fr card renderers.
 */
export function readCardFromElement(el: Element): Card {
  const img = el.querySelector('img')

  // Prefer explicit title/alt on the image, then visible text, then data attrs
  const name = (
    img?.getAttribute('title') ||
    img?.getAttribute('alt') ||
    el.getAttribute('data-name') ||
    el.getAttribute('title') ||
    el.querySelector('[class*="name" i], [class*="title" i], p, span')?.textContent ||
    'Unknown'
  ).trim()

  return {
    name,
    imageUrl: img?.src,
    zone: el.closest('[data-zone]')?.getAttribute('data-zone') ?? undefined,
  }
}

/**
 * Reads all card elements inside a board-container element.
 */
export function readCardsFromBoard(boardContainer: Element): Card[] {
  const cardsWrapper = boardContainer.querySelector(SELECTORS.boardCards)
  if (!cardsWrapper) return []
  return Array.from(cardsWrapper.children).map(readCardFromElement)
}

/**
 * Returns zone names from the zone-labels element inside a board container.
 */
export function readZoneNames(boardContainer: Element): string[] {
  const zonesEl = boardContainer.querySelector(SELECTORS.boardZones)
  if (!zonesEl) return []
  return Array.from(zonesEl.children)
    .map(el => el.textContent?.trim() ?? '')
    .filter(Boolean)
}

/**
 * Groups an array of cards into Record<zoneName, Card[]>.
 * Falls back to 'battlefield' if a card has no zone.
 */
export function groupByZone(cards: Card[]): Record<string, Card[]> {
  const out: Record<string, Card[]> = {}
  for (const card of cards) {
    const zone = card.zone ?? 'battlefield'
    ;(out[zone] ??= []).push(card)
  }
  return out
}

/**
 * Polls for a selector to appear in the DOM (SPA-safe).
 * Resolves with the element or null after timeout.
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
