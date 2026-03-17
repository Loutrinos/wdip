import type { ExtensionRequest, ExtensionResponse, DebugScanResult } from '@wdip/shared'

// ─── Diagnostic log (always visible at top of popup) ─────────────────────────

const diag = document.getElementById('diag') as HTMLElement

function log(msg: string) {
  diag.textContent += '\n' + msg
  console.log('[popup]', msg)
}

// Catch unhandled promise rejections
window.addEventListener('unhandledrejection', (e) => {
  diag.style.color = '#e03b3b'
  log('UNHANDLED: ' + String(e.reason))
})

log('script start, id=' + chrome.runtime.id)

// ─── DOM refs ────────────────────────────────────────────────────────────────

const elActions     = document.getElementById('actions-section') as HTMLElement
const elEndForm     = document.getElementById('end-form')        as HTMLElement
const elDebugOut    = document.getElementById('debug-output')    as HTMLElement
const btnCapture    = document.getElementById('btn-capture')     as HTMLButtonElement
const btnEnd        = document.getElementById('btn-end')         as HTMLButtonElement
const btnReset      = document.getElementById('btn-reset')       as HTMLButtonElement
const btnSaveOk     = document.getElementById('btn-save-confirm') as HTMLButtonElement
const btnSaveCancel = document.getElementById('btn-save-cancel') as HTMLButtonElement
const btnDebug      = document.getElementById('btn-debug')       as HTMLButtonElement
const inputOpponent = document.getElementById('input-opponent')  as HTMLInputElement

log('DOM refs obtained')

// ─── State ───────────────────────────────────────────────────────────────────

let activeTabId: number | null = null

// ─── Communication ───────────────────────────────────────────────────────────

async function send(msg: ExtensionRequest): Promise<ExtensionResponse | null> {
  if (!activeTabId) { log('send: no tab id'); return null }
  log('> ' + msg.type)
  try {
    const res = await chrome.tabs.sendMessage<ExtensionRequest, ExtensionResponse>(activeTabId, msg)
    log('< ' + JSON.stringify(res).slice(0, 100))
    return res
  } catch (e) {
    log('sendMsg error: ' + String(e))
    return null
  }
}

// ─── UI ──────────────────────────────────────────────────────────────────────

function show(el: HTMLElement) { el.style.display = '' }
function hide(el: HTMLElement) { el.style.display = 'none' }

// ─── Handlers ────────────────────────────────────────────────────────────────

async function onCapture() {
  log('capture clicked')
  const res = await send({ type: 'CAPTURE_TURN' })
  if (res?.type === 'TURN_CAPTURED') log('turn ' + res.turnNumber + ' captured')
}

async function onReset() {
  log('reset clicked')
  await send({ type: 'RESET_SESSION' })
}

function onEndClick() {
  log('end clicked')
  hide(elActions); show(elEndForm)
  inputOpponent.focus()
}

function onCancelSave() { hide(elEndForm); show(elActions) }

async function onSaveConfirm() {
  log('save clicked')
  const opponent = inputOpponent.value.trim() || 'Unknown'
  const resultEl = document.querySelector<HTMLInputElement>('input[name="result"]:checked')
  const result = (resultEl?.value ?? 'unknown') as 'win' | 'loss' | 'unknown'
  const res = await send({ type: 'END_GAME', opponent, result, myDeck: [] })
  if (res?.type === 'GAME_SAVED') { hide(elEndForm); show(elActions); log('saved') }
}

async function onDebugScan() {
  log('scan clicked, tabId=' + activeTabId)
  elDebugOut.style.display = 'block'
  elDebugOut.textContent = 'scanning...'

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  let out = 'Tab: ' + tab?.id + '\nURL: ' + (tab?.url ?? 'none') + '\n'

  if (!activeTabId && tab?.id) activeTabId = tab.id

  const res = await send({ type: 'DEBUG_SCAN' })
  if (res?.type === 'DEBUG_SCAN_RESULT') {
    const s = res.scan
    out += 'Script: CONNECTED\n\nSelectors:\n'
    for (const r of s.results) {
      out += (r.found ? '[OK]' : '[XX]') + ' ' + r.selector + '\n'
      if (r.found) out += '     "' + (r.text ?? '') + '"\n'
    }
    out += '\nHistory lines:\n'
    s.chatRecentLines.forEach(l => { out += '  ' + l + '\n' })
    out += '\nState: ' + JSON.stringify(s.liveState)
  } else {
    out += 'Script: NOT CONNECTED\nReload the game tab (F5) then reopen popup'
  }
  elDebugOut.textContent = out
  log('scan done')
}

// ─── Wire buttons (sync, before any await) ───────────────────────────────────

btnCapture.addEventListener('click', onCapture)
btnEnd.addEventListener('click', onEndClick)
btnReset.addEventListener('click', onReset)
btnSaveOk.addEventListener('click', onSaveConfirm)
btnSaveCancel.addEventListener('click', onCancelSave)
btnDebug.addEventListener('click', onDebugScan)
log('buttons wired')

// ─── Init ────────────────────────────────────────────────────────────────────

async function init() {
  log('init start')
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  log('tab: ' + tab?.id + ' ' + (tab?.url ?? 'no url'))

  if (!tab?.id) { log('no tab'); return }
  activeTabId = tab.id

  if (tab.url && !tab.url.includes('tcg-arena.fr')) {
    log('wrong site'); return
  }

  let ping = await send({ type: 'GET_STATUS' })

  if (!ping) {
    log('no ping, injecting...')
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['src/content-game.js'] })
      await new Promise(r => setTimeout(r, 600))
      ping = await send({ type: 'GET_STATUS' })
    } catch (e) {
      log('inject failed: ' + String(e))
    }
  }

  if (!ping) { log('still no response'); return }

  log('connected: ' + JSON.stringify(ping))
  show(elActions)
}

init().catch(e => log('init error: ' + String(e)))
