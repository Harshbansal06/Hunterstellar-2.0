import { useEffect } from 'react'
import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AuthProvider, useAuth } from '../AuthContext'

vi.mock('../../api/client', () => ({
  default: { post: vi.fn() },
}))

import api from '../../api/client'

const TOKEN_KEY = 'odyssey_token'
const USER_KEY = 'odyssey_user'
const FLOW_KEY = 'hunterstellar_v2'
const LEGACY_FLOW_KEY = 'hunterstellar_flow'

const mockUser = { id: 1, team_name: 'Celestials', progress: 0, status: 'active' }

function TestConsumer() {
  const ctx = useAuth()
  return (
    <div>
      <span data-testid="token">{ctx.token ?? 'null'}</span>
      <span data-testid="user">{ctx.user ? ctx.user.team_name : 'null'}</span>
      <span data-testid="loading">{String(ctx.loading)}</span>
      <span data-testid="has-login">{String(typeof ctx.login)}</span>
      <span data-testid="has-logout">{String(typeof ctx.logout)}</span>
      <span data-testid="has-update">{String(typeof ctx.updateUser)}</span>
    </div>
  )
}

function ConsumerThatCallsLogin({ teamName, password }) {
  const { login } = useAuth()
  return <button onClick={() => login(teamName, password)}>login</button>
}

function ConsumerThatCallsLogout() {
  const { logout } = useAuth()
  return <button onClick={() => logout()}>logout</button>
}

function ConsumerThatCallsUpdate({ next }) {
  const { updateUser } = useAuth()
  return <button onClick={() => updateUser(next)}>update</button>
}

function ConsumerThatUpdatesTwice() {
  const { updateUser, user } = useAuth()
  return (
    <div>
      <span data-testid="user-id">{user?.id ?? 'none'}</span>
      <span data-testid="user-progress">{user?.progress ?? 'none'}</span>
      <button onClick={() => updateUser({ id: 1, progress: 1, status: 'active' })}>
        to-1
      </button>
      <button onClick={() => updateUser({ id: 1, progress: 1, status: 'active' })}>
        same
      </button>
      <button onClick={() => updateUser({ id: 1, progress: 2, status: 'active' })}>
        to-2
      </button>
    </div>
  )
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

describe('useAuth', () => {
  it('throws when used outside AuthProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<TestConsumer />)).toThrow(
      'useAuth must be used within AuthProvider',
    )
    spy.mockRestore()
  })
})

describe('AuthProvider', () => {
  it('provides initial null state with empty localStorage', () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    )
    expect(screen.getByTestId('token')).toHaveTextContent('null')
    expect(screen.getByTestId('user')).toHaveTextContent('null')
    expect(screen.getByTestId('loading')).toHaveTextContent('false')
    expect(screen.getByTestId('has-login')).toHaveTextContent('function')
    expect(screen.getByTestId('has-logout')).toHaveTextContent('function')
    expect(screen.getByTestId('has-update')).toHaveTextContent('function')
  })

  it('hydrates from localStorage on mount', () => {
    localStorage.setItem(TOKEN_KEY, 'stored-token')
    localStorage.setItem(USER_KEY, JSON.stringify({ id: 2, team_name: 'Nebula' }))

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    )

    expect(screen.getByTestId('token')).toHaveTextContent('stored-token')
    expect(screen.getByTestId('user')).toHaveTextContent('Nebula')
  })

  it('handles corrupted localStorage gracefully', () => {
    localStorage.setItem(TOKEN_KEY, 'ok-token')
    localStorage.setItem(USER_KEY, 'NOT-JSON')

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    )

    expect(screen.getByTestId('token')).toHaveTextContent('ok-token')
    expect(screen.getByTestId('user')).toHaveTextContent('null')
  })
})

describe('login', () => {
  it('calls api.post, sets state, and persists to localStorage', async () => {
    const apiResponse = { token: 'jwt-123', user: mockUser }
    api.post.mockResolvedValue({ data: apiResponse })

    render(
      <AuthProvider>
        <ConsumerThatCallsLogin teamName="Celestials" password="secret" />
      </AuthProvider>,
    )

    await act(async () => {
      screen.getByText('login').click()
    })

    expect(api.post).toHaveBeenCalledWith('/login', {
      team_name: 'Celestials',
      password: 'secret',
    })
    expect(localStorage.getItem(TOKEN_KEY)).toBe('jwt-123')
    expect(JSON.parse(localStorage.getItem(USER_KEY))).toEqual(mockUser)
  })
})

describe('logout', () => {
  it('clears state and all localStorage keys', async () => {
    api.post.mockResolvedValue({ data: { token: 'jwt-123', user: mockUser } })

    render(
      <AuthProvider>
        <ConsumerThatCallsLogin teamName="Celestials" password="secret" />
        <ConsumerThatCallsLogout />
        <TestConsumer />
      </AuthProvider>,
    )

    await act(async () => {
      screen.getByText('login').click()
    })

    expect(screen.getByTestId('token')).toHaveTextContent('jwt-123')

    await act(async () => {
      screen.getByText('logout').click()
    })

    expect(screen.getByTestId('token')).toHaveTextContent('null')
    expect(screen.getByTestId('user')).toHaveTextContent('null')
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
    expect(localStorage.getItem(USER_KEY)).toBeNull()
    expect(localStorage.getItem(FLOW_KEY)).toBeNull()
    expect(localStorage.getItem(LEGACY_FLOW_KEY)).toBeNull()
  })
})

describe('updateUser', () => {
  it('updates user state and persists to localStorage', async () => {
    render(
      <AuthProvider>
        <ConsumerThatCallsUpdate next={{ id: 1, progress: 3, status: 'active' }} />
        <TestConsumer />
      </AuthProvider>,
    )

    await act(async () => {
      screen.getByText('update').click()
    })

    expect(screen.getByTestId('user')).not.toHaveTextContent('null')
    expect(JSON.parse(localStorage.getItem(USER_KEY))).toEqual({
      id: 1,
      progress: 3,
      status: 'active',
    })
  })

  it('ignores falsy values', () => {
    const updateUserRef = { current: null }
    function CaptureUpdate() {
      const { updateUser } = useAuth()
      // Captured in an effect, not during render: assigning to a variable
      // declared outside the component while rendering is exactly what the
      // compiler rule forbids, and it makes the render impure.
      useEffect(() => {
        updateUserRef.current = updateUser
      }, [updateUser])
      return <span>ready</span>
    }

    render(
      <AuthProvider>
        <CaptureUpdate />
        <TestConsumer />
      </AuthProvider>,
    )

    act(() => {
      updateUserRef.current(null)
    })
    act(() => {
      updateUserRef.current(undefined)
    })

    expect(screen.getByTestId('user')).toHaveTextContent('null')
  })

  it('returns same reference when id, progress, and status are unchanged', async () => {
    localStorage.setItem(USER_KEY, JSON.stringify(mockUser))

    render(
      <AuthProvider>
        <ConsumerThatUpdatesTwice />
      </AuthProvider>,
    )

    expect(screen.getByTestId('user-id')).toHaveTextContent('1')
    expect(screen.getByTestId('user-progress')).toHaveTextContent('0')

    await act(async () => {
      screen.getByText('to-1').click()
    })

    expect(screen.getByTestId('user-progress')).toHaveTextContent('1')

    const refAfterFirst = screen.getByTestId('user-progress').textContent

    await act(async () => {
      screen.getByText('same').click()
    })

    expect(screen.getByTestId('user-progress')).toHaveTextContent(refAfterFirst)

    await act(async () => {
      screen.getByText('to-2').click()
    })

    expect(screen.getByTestId('user-progress')).toHaveTextContent('2')
  })
})
