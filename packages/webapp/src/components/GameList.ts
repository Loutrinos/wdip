import m from 'mithril'
import type { GameRecord } from '@wdip/shared'
import { actions, state } from '../store'
import { logout } from '../auth'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString()
}

function exportJSON(): void {
  const blob = new Blob([JSON.stringify(state.games, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `riftbound-games-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function importJSON(file: File): void {
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const games = JSON.parse(reader.result as string) as GameRecord[]
      if (!Array.isArray(games)) throw new Error('Invalid format')
      actions.importGames(games)
    } catch {
      actions.importGames([]) // reset on failure
      state.error = 'Could not parse JSON file.'
      m.redraw()
    }
  }
  reader.readAsText(file)
}

function resultBadge(result: GameRecord['result']): m.Vnode {
  const cls = result === 'win' ? 'badge-win' : result === 'loss' ? 'badge-loss' : 'badge-unknown'
  const label = result === 'win' ? 'W' : result === 'loss' ? 'L' : '?'
  return m(`span.badge.${cls}`, label)
}

const GameList: m.Component = {
  view() {
    return m('div.page',
      m('header.page-header',
        m('h1', '⚔️ Riftbound Review'),
        m('div.header-actions',
          m('button.btn.btn-sm', { onclick: exportJSON }, '⬇ Export JSON'),
          m('label.btn.btn-sm',
            '⬆ Import JSON',
            m('input[type=file][accept=.json]', {
              style: 'display:none',
              onchange: (e: Event) => {
                const f = (e.target as HTMLInputElement).files?.[0]
                if (f) importJSON(f)
              },
            }),
          ),
          m('button.btn.btn-sm.btn-ghost', {
            onclick: () => { logout(); actions.setAuthenticated(false) },
          }, 'Sign out'),
        ),
      ),

      state.error && m('div.alert.alert-error',
        state.error,
        m('button.alert-close', { onclick: actions.clearError.bind(actions) }, '×'),
      ),

      !state.extensionAvailable && !state.loading && m('div.alert.alert-warning',
        '⚠ Extension not detected. Install the Riftbound Recorder extension and refresh. ',
        'You can still browse imported games.',
      ),

      state.loading && m('div.loading', m('div.spinner')),

      !state.loading && state.games.length === 0 && m('div.empty-state',
        m('div.empty-icon', '🃏'),
        m('p', 'No games recorded yet.'),
        m('p.text-muted',
          'Play a game on tcg-arena.fr, capture turns with the extension popup, then come back here.',
        ),
      ),

      !state.loading && state.games.length > 0 && m('div.game-list',
        state.games
          .slice()
          .sort((a, b) => b.date.localeCompare(a.date))
          .map(game =>
            m('div.game-card', { key: game.id, onclick: () => actions.selectGame(game) },
              m('div.game-card-header',
                resultBadge(game.result),
                m('span.game-opponent', game.opponent || 'Unknown'),
                m('span.game-date.text-muted', formatDate(game.date)),
              ),
              m('div.game-card-footer',
                m('span.text-muted', `${game.turns.length} turn${game.turns.length !== 1 ? 's' : ''}`),
                m('button.btn.btn-sm.btn-danger', {
                  onclick: (e: MouseEvent) => {
                    e.stopPropagation()
                    if (confirm('Delete this game?')) actions.deleteGame(game.id)
                  },
                }, '🗑'),
              ),
            ),
          ),
      ),
    )
  },
}

export default GameList
