import m from 'mithril'
import { isUnlocked } from './auth'
import { actions, state } from './store'
import Login from './components/Login'
import GameList from './components/GameList'
import GameReview from './components/GameReview'
import './styles.css'

/**
 * Root app shell.
 * Handles the auth gate and switching between GameList and GameReview.
 * Uses simple conditional rendering (no m.route needed for this two-screen app).
 */
const App: m.Component = {
  oninit() {
    if (isUnlocked()) {
      state.authenticated = true
      actions.loadGames()
    }
  },

  view() {
    if (!state.authenticated) {
      return m(Login)
    }
    if (state.selectedGame) {
      return m(GameReview)
    }
    return m(GameList)
  },
}

m.mount(document.getElementById('app')!, App)
