/**
 * popup.ts
 * Runs as a module script in the popup page context.
 * Communicates with content-game.ts via chrome.tabs.sendMessage.
 */

import type { ExtensionRequest, ExtensionResponse } from '@wdip/shared'

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const turnNumber = document.getElementById('turn-number')!
const turnCount = document.getElementById('turn-count')!
const wrongPage = document.getElementById('wrong-page')!
const actionsSection = document.getElementById('actions-section')!
const endForm = document.getElementById('end-form')!
const toast = document.getElementById('toast')!

const btnCapture = document.getElementById('btn-capture') as HTMLButtonElement
const btnEnd = document.getElementById('btn-end') as HTMLButtonElement
const btnReset = document.getElementById('btn-reset') as HTMLButtonElement
const btnSaveConfirm = document.getElementById('btn-save-confirm') as HTMLButtonElement
const btnSaveCancel = document.getElementById('btn-save-cancel') as HTMLButtonElement
const inputOpponent = document.getElementById('input-opponent') as HTMLInputElement

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab ?? null
}

async function sendToContent(
  tabId: number,
  msg: ExtensionRequest,
): Promise<ExtensionResponse | null> {
  try {
    return await chrome.tabs.sendMessage<ExtensionRequest, ExtensionResponse>(tabId, msg)
  } catch {
    return null
  }
}

let toastTimer: ReturnType<typeof setTimeout> | null = null

function showToast(text: string, type: 'success' | 'error' | 'warning' = 'success') {
  toast.textContent = text
  toast.className = `banner ${type}`
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 3000)
}

function setLoading(btn: HTMLButtonElement, loading: boolean) {
  btn.disabled = loading
}

// ─── UI state ─────────────────────────────────────────────────────────────────

function showActions(): void {
  wrongPage.classList.add('hidden')
  actionsSection.classList.remove('hidden')
}

function showWrongPage(): void {
  actionsSection.classList.add('hidden')
  wrongPage.classList.remove('hidden')
}

function showEndForm(): void {
  actionsSection.classList.add('hidden')
  endForm.classList.remove('hidden')
  inputOpponent.focus()
}

function hideEndForm(): void {
  endForm.classList.add('hidden')
  actionsSection.classList.remove('hidden')
}

// ─── Button handlers ──────────────────────────────────────────────────────────

async function onCapture(tabId: number): Promise<void> {
  setLoading(btnCapture, true)
  const res = await sendToContent(tabId, { type: 'CAPTURE_TURN' })
  setLoading(btnCapture, false)
  if (res?.type === 'TURN_CAPTURED') {
    turnCount.textContent = String(res.turnCount)
    showToast(`Turn ${res.turnNumber} captured ✓`)
  } else {
    showToast('Capture failed — check DevTools', 'error')
  }
}

async function onSaveConfirm(tabId: number): Promise<void> {
  const opponent = inputOpponent.value.trim() || 'Unknown'
  const resultInput = document.querySelector<HTMLInputElement>('input[name="result"]:checked')
  const result = (resultInput?.value ?? 'unknown') as 'win' | 'loss' | 'unknown'

  setLoading(btnSaveConfirm, true)
  const res = await sendToContent(tabId, {
    type: 'END_GAME',
    opponent,
    result,
    myDeck: [],
  })
  setLoading(btnSaveConfirm, false)

  if (res?.type === 'GAME_SAVED') {
    hideEndForm()
    turnCount.textContent = '0'
    turnNumber.textContent = '—'
    inputOpponent.value = ''
    showToast('Game saved! Open the web app to review.', 'success')
  } else if (res?.type === 'ERROR') {
    showToast(`Error: ${res.message}`, 'error')
  } else {
    showToast('Save failed — check DevTools', 'error')
  }
}

async function onReset(tabId: number): Promise<void> {
  const res = await sendToContent(tabId, { type: 'RESET_SESSION' })
  if (res?.type === 'SESSION_RESET') {
    turnCount.textContent = '0'
    turnNumber.textContent = '—'
    showToast('Session reset', 'warning')
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  const tab = await getActiveTab()

  if (!tab?.id) {
    showWrongPage()
    return
  }

  // tab.url requires "tabs" permission; if undefined (old build) fall through to
  // the content-script ping below which handles it gracefully.
  const urlOk = tab.url === undefined || tab.url.includes('tcg-arena.fr')
  if (!urlOk) {
    showWrongPage()
    return
  }

  const tabId = tab.id

  // Ping the content script — if it doesn't respond it either hasn't loaded yet
  // or there was an error. Show an actionable message rather than silent failure.
  const ping = await sendToContent(tabId, { type: 'GET_STATUS' })
  if (!ping) {
    wrongPage.innerHTML =
      'Could not connect to the game page.<br>' +
      '<strong>Try:</strong> reload tcg-arena.fr then reopen this popup.<br>' +
      '<small>Make sure you\'re inside an active game room.</small>'
    showWrongPage()
    return
  }

  showActions()

  if (ping.type === 'STATUS') {
    turnNumber.textContent = String(ping.currentTurnNumber)
    turnCount.textContent = String(ping.turnCount)
  }

  btnCapture.addEventListener('click', () => onCapture(tabId))
  btnEnd.addEventListener('click', showEndForm)
  btnReset.addEventListener('click', () => onReset(tabId))
  btnSaveConfirm.addEventListener('click', () => onSaveConfirm(tabId))
  btnSaveCancel.addEventListener('click', hideEndForm)
}

init()
