import type { DebugScanResult, ExtensionRequest, ExtensionResponse } from '@wdip/shared'

// ─── DOM refs ────────────────────────────────────────────────────────────────

const elTurnNumber  = document.getElementById('turn-number')!
const elTurnCount   = document.getElementById('turn-count')!
const elWrongPage   = document.getElementById('wrong-page')!
const elActions     = document.getElementById('actions-section')!
const elEndForm     = document.getElementById('end-form')!
const elToast       = document.getElementById('toast')!
const elDebugOut    = document.getElementById('debug-output') as HTMLDivElement
const elStatus      = document.getElementById('init-status')!

const btnCapture    = document.getElementById('btn-capture')     as HTMLButtonElement
const btnEnd        = document.getElementById('btn-end')         as HTMLButtonElement
const btnReset      = document.getElementById('btn-reset')       as HTMLButtonElement
const btnSaveOk     = document.getElementById('btn-save-confirm') as HTMLButtonElement
const btnSaveCancel = document.getElementById('btn-save-cancel') as HTMLButtonElement
const btnDebug      = document.getElementById('btn-debug')       as HTMLButtonElement
const inputOpponent = document.getElementById('input-opponent')  as HTMLInputElement

// ─── Module-level tab id (set during init) ────────────────────────────────────

let activeTabId: number | null = null

// ─── Communication ───────────────────────────────────────────────────────────

async function send(msg: ExtensionRequest): Promise<ExtensionResponse | null> {
  const tabId = activeTabId ?? await freshTabId()
  if (!tabId) { showStatus('No active tab found'); return null }
  try {
    return await chrome.tabs.sendMessage<ExtensionRequest, ExtensionResponse>(tabId, msg)
  } catch (e) {
    showStatus('Content script not reachable: ' + String(e))
    return null
  }
}

async function freshTabId(): Promise<number | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab?.id ?? null
}

// ─── Toast ────────────────────────────────────────────────────────────────────

let toastTimer: ReturnType<typeof setTimeout> | null = null
function showToast(text: string, type: 'success' | 'error' | 'warning' = 'success') {
  elToast.textContent = text
  elToast.className = `banner ${type}`
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => elToast.classList.add('hidden'), 4000)
}

function showStatus(msg: string) {
  elStatus.textContent = msg
  elStatus.classList.remove('hidden')
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

function showActions() {
  elWrongPage.classList.add('hidden')
  elActions.classList.remove('hidden')
  elStatus.classList.add('hidden')
}

function showWrongPage(msg?: string) {
  elActions.classList.add('hidden')
  elWrongPage.classList.remove('hidden')
  if (msg) elWrongPage.innerHTML = msg
}

function showEndForm() {
  elActions.classList.add('hidden')
  elEndForm.classList.remove('hidden')
  inputOpponent.focus()
}

function hideEndForm() {
  elEndForm.classList.add('hidden')
  elActions.classList.remove('hidden')
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async function onCapture() {
  btnCapture.disabled = true
  const res = await send({ type: 'CAPTURE_TURN' })
  btnCapture.disabled = false
  if (res?.type === 'TURN_CAPTURED') {
    elTurnCount.textContent = String(res.turnCount)
    showToast(`Turn ${res.turnNumber} captured`)
  } else {
    showToast('Capture failed — is content script running?', 'error')
  }
}

async function onSaveConfirm() {
  const opponent = inputOpponent.value.trim() || 'Unknown'
  const resultEl = document.querySelector<HTMLInputElement>('input[name="result"]:checked')
  const result = (resultEl?.value ?? 'unknown') as 'win' | 'loss' | 'unknown'
  btnSaveOk.disabled = true
  const res = await send({ type: 'END_GAME', opponent, result, myDeck: [] })
  btnSaveOk.disabled = false
  if (res?.type === 'GAME_SAVED') {
    hideEndForm()
    elTurnCount.textContent = '0'
    elTurnNumber.textContent = '—'
    inputOpponent.value = ''
    showToast('Game saved!')
  } else {
    showToast('Save failed — check DevTools', 'error')
  }
}

async function onReset() {
  const res = await send({ type: 'RESET_SESSION' })
  if (res?.type === 'SESSION_RESET') {
    elTurnCount.textContent = '0'
    elTurnNumber.textContent = '—'
    showToast('Session reset', 'warning')
  }
}

// ─── Debug panel ──────────────────────────────────────────────────────────────

function renderDebug(scan: DebugScanResult) {
  const lines: string[] = [`<b>URL:</b> ${scan.url}`, '']
  lines.push('<b>Selectors:</b>')
  for (const r of scan.results) {
    const ok = r.found ? '<span class="ok">✓</span>' : '<span class="fail">✗</span>'
    const key = r.selector.split(':')[0]
    const detail = r.found ? ` (${r.childCount} children) "${r.text?.slice(0, 60) ?? ''}"` : ''
    lines.push(`${ok} ${key}${detail}`)
  }
  lines.push('')
  lines.push('<b>History log (last lines):</b>')
  if (scan.chatRecentLines.length === 0) {
    lines.push('<span class="fail">empty</span>')
  } else {
    scan.chatRecentLines.forEach(l => lines.push(`<span class="dim">${l}</span>`))
  }
  lines.push('')
  lines.push(`<b>Live state:</b> hp me=${scan.liveState.lifePoints.me} opp=${scan.liveState.lifePoints.opponent} active=${scan.liveState.activePlayer}`)
  elDebugOut.innerHTML = lines.join('\n')
  elDebugOut.classList.remove('hidden')
}

async function onDebugScan() {
  btnDebug.textContent = '⏳ Scanning…'
  btnDebug.disabled = true
  const res = await send({ type: 'DEBUG_SCAN' })
  btnDebug.textContent = '🔍 Scan DOM'
  btnDebug.disabled = false
  if (res?.type === 'DEBUG_SCAN_RESULT') {
    renderDebug(res.scan)
  } else {
    elDebugOut.innerHTML = `<span class="fail">No response from content script.<br>Try: reload the tcg-arena.fr tab, then reopen this popup.</span>`
    elDebugOut.classList.remove('hidden')
  }
}

// ─── Wire buttons immediately (before any async code) ────────────────────────
// This ensures clicks always work even if init() throws.

btnCapture.addEventListener('click', onCapture)
btnEnd.addEventListener('click', showEndForm)
btnReset.addEventListener('click', onReset)
btnSaveOk.addEventListener('click', onSaveConfirm)
btnSaveCancel.addEventListener('click', hideEndForm)
btnDebug.addEventListener('click', onDebugScan)

// ─── Init ────────────────────────────────────────────────────────────────────

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) {
    showWrongPage('Could not get active tab.')
    return
  }

  activeTabId = tab.id

  if (tab.url && !tab.url.includes('tcg-arena.fr')) {
    showWrongPage(`Not a tcg-arena.fr tab.<br><small>${tab.url}</small>`)
    return
  }

  // Ping — content script may already be running
  let ping = await send({ type: 'GET_STATUS' })

  if (!ping) {
    // Try to inject content script (needed when tab was open before extension loaded)
    showStatus('Injecting content script…')
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['src/content-game.js'] })
      await new Promise(r => setTimeout(r, 500))
    } catch (e) {
      showStatus('Injection failed: ' + String(e))
    }
    ping = await send({ type: 'GET_STATUS' })
  }

  if (!ping) {
    showWrongPage(
      'Could not connect to the game page.<br>' +
      'Make sure you are inside an active game room.<br>' +
      '<b>Click "🔍 Scan DOM" below to diagnose.</b>'
    )
    return
  }

  showActions()
  if (ping.type === 'STATUS') {
    elTurnNumber.textContent = String(ping.currentTurnNumber)
    elTurnCount.textContent  = String(ping.turnCount)
  }
}

// Visible error catch
window.addEventListener('unhandledrejection', e => {
  showStatus('Error: ' + String(e.reason))
})

init().catch(e => showStatus('Init failed: ' + String(e)))
