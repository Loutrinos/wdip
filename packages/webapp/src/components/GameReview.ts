import m from 'mithril'
import type { Card, GameRecord, Turn } from '@wdip/shared'
import { actions, state } from '../store'

interface ReviewState {
  turnIndex: number
  noteText: string
  savingNote: boolean
}

const reviewState: ReviewState = {
  turnIndex: 0,
  noteText: '',
  savingNote: false,
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString()
}

function cardChip(card: Card): m.Vnode {
  return m('span.card-chip', { title: card.name, key: card.name }, card.name)
}

function zoneBlock(title: string, zones: Record<string, Card[]>): m.Vnode {
  const entries = Object.entries(zones)
  if (entries.length === 0) return m('div.zone-empty', `${title}: (empty)`)
  return m('div.zone-group',
    m('h4.zone-group-title', title),
    ...entries.map(([zone, cards]) =>
      m('div.zone',
        m('div.zone-name', zone),
        m('div.zone-cards',
          cards.length === 0
            ? m('span.text-muted', 'empty')
            : cards.map(cardChip),
        ),
      ),
    ),
  )
}

async function saveNote(game: GameRecord, rs: ReviewState): Promise<void> {
  if (!game) return
  rs.savingNote = true
  m.redraw()

  const updated: GameRecord = {
    ...game,
    turns: game.turns.map((t, i) =>
      i === rs.turnIndex ? { ...t, notes: rs.noteText } : t,
    ),
  }
  await actions.updateGame(updated)
  rs.savingNote = false
  m.redraw()
}

const GameReview: m.Component = {
  oninit() {
    reviewState.turnIndex = 0
    reviewState.noteText = state.selectedGame?.turns[0]?.notes ?? ''
  },

  view() {
    const game = state.selectedGame
    if (!game) {
      actions.selectGame(null)
      return m('div')
    }

    const rs = reviewState
    const turns = game.turns
    const turn: Turn | undefined = turns[rs.turnIndex]

    const prevTurn = (): void => {
      if (rs.turnIndex > 0) {
        rs.turnIndex--
        rs.noteText = turns[rs.turnIndex]?.notes ?? ''
        m.redraw()
      }
    }

    const nextTurn = (): void => {
      if (rs.turnIndex < turns.length - 1) {
        rs.turnIndex++
        rs.noteText = turns[rs.turnIndex]?.notes ?? ''
        m.redraw()
      }
    }

    return m('div.page',
      m('header.page-header',
        m('button.btn.btn-sm.btn-ghost', { onclick: () => actions.selectGame(null) }, '← Back'),
        m('div.game-meta',
          m('span', `vs ${game.opponent || 'Unknown'}`),
          m('span.text-muted', formatDate(game.date)),
          m(`span.badge.badge-${game.result}`, game.result.toUpperCase()),
        ),
      ),

      turns.length === 0 && m('div.empty-state',
        m('p', 'No turns were captured for this game.'),
      ),

      turns.length > 0 && m('div.review-layout',
        // Turn navigation
        m('div.turn-nav',
          m('button.btn.btn-sm', { onclick: prevTurn, disabled: rs.turnIndex === 0 }, '← Prev'),
          m('span.turn-label', `Turn ${turn?.number ?? '?'} of ${turns.length}`),
          m('button.btn.btn-sm', { onclick: nextTurn, disabled: rs.turnIndex >= turns.length - 1 }, 'Next →'),
        ),

        turn && m('div.turn-detail',
          // Turn header
          m('div.turn-header',
            m('div.stat-row',
              m('div.stat-chip', `Active: ${turn.activePlayer === 'me' ? 'You' : turn.activePlayer === 'opponent' ? 'Opponent' : 'Unknown'}`),
              m('div.stat-chip.hp-me', `❤ You: ${turn.lifePoints.me}`),
              m('div.stat-chip.hp-opp', `💀 Opp: ${turn.lifePoints.opponent}`),
              m('div.stat-chip.text-muted', `Captured: ${new Date(turn.capturedAt).toLocaleTimeString()}`),
            ),
          ),

          // Cards played
          turn.cardsPlayed.length > 0 && m('div.section',
            m('h3.section-title', '🃏 Cards Played This Turn'),
            m('div.card-row', turn.cardsPlayed.map(cardChip)),
          ),

          // Board state
          m('div.board-layout',
            m('div.board-side',
              m('h3.section-title', '🧍 Your Board'),
              zoneBlock('Zones', turn.boardState.myZones),
            ),
            m('div.board-side',
              m('h3.section-title', '🤺 Opponent Board'),
              zoneBlock('Zones', turn.boardState.opponentZones),
            ),
          ),

          // Notes
          m('div.section notes-section',
            m('h3.section-title', '📝 Notes'),
            m('textarea.notes-input', {
              value: rs.noteText,
              placeholder: 'Add notes for this turn (key plays, mistakes, observations)…',
              oninput: (e: InputEvent) => { rs.noteText = (e.target as HTMLTextAreaElement).value },
              rows: 4,
            }),
            m('button.btn.btn-primary.btn-sm', {
              onclick: () => saveNote(game, rs),
              disabled: rs.savingNote,
            }, rs.savingNote ? 'Saving…' : 'Save Note'),
          ),
        ),
      ),
    )
  },
}

export default GameReview
