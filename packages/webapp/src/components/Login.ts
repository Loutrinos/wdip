import m from 'mithril'
import { isFirstRun, login, setupPassword } from '../auth'
import { actions } from '../store'

interface State {
  password: string
  confirm: string
  error: string
  loading: boolean
}

const Login: m.Component = {
  oninit() {
    // Redirect if already authenticated
  },

  view() {
    const firstRun = isFirstRun()
    const s: State = (this as unknown as { s: State }).s
    return m('div.login-page',
      m('div.login-card',
        m('div.login-logo', '⚔️'),
        m('h1', 'Riftbound Review'),
        m('p.login-sub', firstRun
          ? 'First time? Set a password to protect your game data.'
          : 'Enter your password to access your saved games.',
        ),

        s.error && m('div.alert.alert-error', s.error),

        m('form', { onsubmit: (e: Event) => { e.preventDefault(); handleSubmit(s, firstRun) } },
          m('label.field',
            m('span', 'Password'),
            m('input[type=password]', {
              value: s.password,
              autofocus: true,
              oninput: (e: InputEvent) => { s.password = (e.target as HTMLInputElement).value },
              placeholder: 'Enter password',
            }),
          ),

          firstRun && m('label.field',
            m('span', 'Confirm password'),
            m('input[type=password]', {
              value: s.confirm,
              oninput: (e: InputEvent) => { s.confirm = (e.target as HTMLInputElement).value },
              placeholder: 'Repeat password',
            }),
          ),

          m('button[type=submit].btn.btn-primary', { disabled: s.loading },
            s.loading ? 'Loading…' : firstRun ? 'Set password & enter' : 'Sign in',
          ),
        ),
      ),
    )
  },

  // Per-component state via closure
} as unknown as m.Component

export default {
  view() {
    const firstRun = isFirstRun()
    const s: State = (Login as unknown as { s: State }).s || ({ password: '', confirm: '', error: '', loading: false } as State)
    ;(Login as unknown as { s: State }).s = s
    return m(Login)
  },
} as m.Component

async function handleSubmit(s: State, firstRun: boolean): Promise<void> {
  s.error = ''
  s.loading = true
  m.redraw()

  if (firstRun) {
    if (s.password.length < 4) {
      s.error = 'Password must be at least 4 characters.'
      s.loading = false
      m.redraw()
      return
    }
    if (s.password !== s.confirm) {
      s.error = 'Passwords do not match.'
      s.loading = false
      m.redraw()
      return
    }
    await setupPassword(s.password)
    actions.setAuthenticated(true)
  } else {
    const ok = await login(s.password)
    if (ok) {
      actions.setAuthenticated(true)
    } else {
      s.error = 'Incorrect password.'
    }
  }

  s.loading = false
  m.redraw()
}
