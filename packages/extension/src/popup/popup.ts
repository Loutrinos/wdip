import type { DebugScanResult, ExtensionRequest, ExtensionResponse } from '@wdip/shared'

// log() is defined in the inline script in popup.html — declared here for TS
declare function log(msg: string): void

// ─── DOM refs ────────────────────────────────────────────────────────────────

const elActions   = document.getElementById('actions-section') as HTMLElement
const elEndForm   = document.getElementById('end-form')        as HTMLElement
const elDebugOut  = document.getElementById('debug-output')    as HTMLElement
const btnCapture  = document.getElementById('btn-capture')     as HTMLButtonElement
const btnEnd      = document.getElementById('btn-end')         as HTMLButtonElement
const btnReset    = document.getElementById('btn-reset')       as HTMLButtonElement
const btnSaveOk   = document.getElementById('btn-save-confirm') as HTMLButtonElement
const btnSaveCancel = document.getElementById('btn-save-cancel') as HTMLButtonElement
const btnDebug    = document.getElementById('btn-debug')       as HTMLButtonElement
const inputOpponent = document.getElementById('input-opponent') as HTMLInputElement

log('Module loaded, wiring buttons...')

// ─── Tab id ──────────────────────────────────────────────────────────────────

let activeTabId: number | null = null

// ─── Communication ───────────────────────────────────────────────────────────

async function send(msg: ExtensionRequest): Promise<ExtensionResponse | null> {
  if (!activeTabId) {
    log('send() called but no activeTabId')
    return null
  }
  log('Sending ' + msg.type + ' to tab ' + activeTabId)
  try {
    const res = await chrome.tabs.sendMessage<ExtensionRequest, ExtensionResponse>(activeTabId, msg)
    log('Response: ' + JSON.stringify(res).slice(0, 120))
    return res
  } catch (e) {
    log('sendMessage error: ' + String(e))
    return null
  }
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

function show(el: HTMLElement) { el.style.display = '' }
function hide(el: HTMLElement) { el.style.display = 'none' }

// ─── Handlers ────────────────────────────────────────────────────────────────

async function onCapture() {
  log('Capture clicked')
  const res = await send({ type: 'CAPTURE_TURN' })
  if (res?.type === 'TURN_CAPTURED') {
    log('Turn ' + res.turnNumber + ' captured, total=' + res.turnCount)
  }
}

async function onReset() {
  log('Reset clicked')
  await send({ type: 'RESET_SESSION' })
}

function onEndClick() {
  log('End clicked, showing form')
  hide(elActions)
  show(elEndForm)
  inputOpponent.focus()
}

function onCancelSave() {
  hide(elEndForm)
  show(elActions)
}

async function onSaveConfirm() {
  log('Save clicked')
  const opponent = inputOpponent.value.trim() || 'Unknown'
  const resultEl = document.querySelector<HTMLInputElement>('input[name="result"]:checked')
  const result = (resultEl?.value ?? 'unknown') as 'win' | 'loss' | 'unknown'
  const res = await send({ type: 'END_GAME', opponent, result, myDeck: [] })
  if (res?.type === 'GAME_SAVED') {
    hide(elEndForm)
    show(elActions)
    log('Game saved: ' + res.gameId)
  }
}

async function onDebugScan() {
  log('Scan clicked, activeTabId=' + activeTabId)
  show(elDebugOut)
  elDebugOut.style.display = 'block'
  elDebugOut.textContent = 'Scanning...'

  // Even if content script isn't connected, show tab info
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  let out = 'Tab id: ' + (tab?.id ?? 'none') + '\nURL: ' + (tab?.url ?? 'none') + '\n\n'

  if (!activeTabId && tab?.id) activeTabId = tab.id

  const res = await send({ type: 'DEBUG_SCAN' })
  if (res?.type === 'DEBUG_SCAN_RESULT') {
    const s = res.scan
    out += 'Content script: connected\n\n'
    out += 'Selectors:\n'
    for (const r of s.results) {
      out += (r.found ? '[OK]' : '[XX]') + ' ' + r.selector + '\n'
      if (r.found) out += '     text: ' + (r.text ?? '') + '\n'
    }
    out += '\nHistory lines:\n'
    if (s.chatRecentLines.length === 0) {
      out += '  (none found)\n'
    } else {
      s.chatRecentLines.forEach(l => { out += '  ' + l + '\n' })
    }
    out += '\nLive state: ' + JSON.stringify(s.liveState)
  } else {
    out += 'Content script: NOT CONNECTED\n'
    out += '(no response to DEBUG_SCAN)\n\n'
    out += 'Try:\n1. Reload the tcg-arena.fr tab (F5)\n2. Close & reopen this popup'
  }
  elDebugOut.textContent = out
}

// ─── Wire buttons immediately ─────────────────────────────────────────────────

try {
  btnCapture.addEventListener('click', onCapture)
  btnEnd.addEventListener('click', onEndClick)
  btnReset.addEventListener('click', onReset)
  btnSaveOk.addEventListener('click', onSaveConfirm)
  btnSaveCancel.addEventListener('click', onCancelSave)
  btnDebug.addEventListener('click', onDebugScan)
  log('Buttons wired OK')
} catch (e) {
  log('ERROR wiring buttons: ' + String(e))
}

// ─── Init ────────────────────────────────────────────────────────────────────

async function init() {
  log('init() start')

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  log('Active tab: id=' + tab?.id + ' url=' + (tab?.url ?? 'none'))

  if (!tab?.id) {
    log('No tab found, stopping')
    return
  }

  activeTabId = tab.id

  if (tab.url && !tab.url.includes('tcg-arena.fr')) {
    log('Wrong URL: ' + tab.url)
    return
  }

  // First ping
  let ping = await send({ type: 'GET_STATUS' })

  if (!ping) {
    log('No response, trying to inject content script...')
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['src/content-game.js'],
      })
      log('Injection succeeded, waiting 600ms...')
      await new Promise(r => setTimeout(r, 600))
      ping = await send({ type: 'GET_STATUS' })
    } catch (e) {
      log('Injection failed: ' + String(e))
    }
  }

  if (!ping) {
    log('Still no response after injection attempt')
    return
  }

  log('Content script connected! Status: ' + JSON.stringify(ping))
  show(elActions)
}

init().catch(e => log('init() threw: ' + String(e)))
