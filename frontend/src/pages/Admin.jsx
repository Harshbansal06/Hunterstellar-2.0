import { useState, useEffect, useCallback } from 'react'
import { Rocket, Play, Square, Megaphone, Unlock, MessageSquare } from 'lucide-react'
import api from '../api/client'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Input } from '../components/ui/Input'
import supabase from '../api/supabase'
export default function Admin() {
  const [teams, setTeams] = useState([])
  const [selected, setSelected] = useState(null)
  const [adminSecret, setAdminSecret] = useState('')
  const [authenticated, setAuthenticated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [announceMsg, setAnnounceMsg] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const fetchTeams = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/teams', {
        headers: { 'x-admin-secret': adminSecret },
      })
      setTeams(data.teams)
    } catch (error) {
      console.error('Failed to fetch teams:', error)
      setTeams([])
    }
  }, [adminSecret])

  useEffect(() => {
    if (!authenticated) return

    // MEMOIZED Supabase realtime channel (only created once)
    const channel = supabase
      .channel('admin-teams-changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'teams' },
        () => {
          // The payload is a single changed row; simpler and less
          // error-prone to refetch the list than to patch it in place.
          fetchTeams()
        },
      )
      .subscribe()

    // Fetch-on-mount. The lint rule objects to any setState reached
    // synchronously from an effect body, but this is the initial load of a
    // list that has no other trigger -- the same exception Leaderboard.jsx
    // takes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchTeams()
    const interval = setInterval(fetchTeams, 5000)
    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
    // `fetchTeams` is memoised on adminSecret, which only changes while the
    // auth form is on screen -- and this effect returns early then. So
    // including it is honest and costs nothing.
  }, [authenticated, fetchTeams])

  async function handleAuth(e) {
    e.preventDefault()
    if (!adminSecret.trim()) return
    setLoading(true)
    try {
      await api.get('/admin/teams', {
        headers: { 'x-admin-secret': adminSecret },
      })
      setAuthenticated(true)
      fetchTeams()
    } catch {
      alert('Invalid admin secret')
    } finally {
      setLoading(false)
    }
  }

  async function handleStart() {
    if (!confirm('Start the event now?')) return
    try {
      await api.post('/admin/start', null, {
        headers: { 'x-admin-secret': adminSecret },
      })
      alert('Event started!')
    } catch {
      alert('Failed to start event')
    }
  }

  async function handleEnd() {
    if (!confirm('End the event?')) return
    try {
      await api.post('/admin/end', null, {
        headers: { 'x-admin-secret': adminSecret },
      })
      alert('Event ended!')
    } catch {
      alert('Failed to end event')
    }
  }

  async function handleUnlock(teamId) {
    try {
      await api.post(
        '/admin/unlock-team',
        { team_id: teamId },
        { headers: { 'x-admin-secret': adminSecret } },
      )
      fetchTeams()
    } catch {
      alert('Failed to unlock team')
    }
  }

  async function handleSendMessage(e) {
    e.preventDefault()
    if (!selected || !message.trim()) return
    try {
      await api.post(
        '/admin/send-message',
        { team_id: selected.id, message: message.trim() },
        { headers: { 'x-admin-secret': adminSecret } },
      )
      setMessage('')
      alert('Message sent!')
    } catch {
      alert('Failed to send message')
    }
  }

  async function handleAnnounce(e) {
    e.preventDefault()
    if (!announceMsg.trim()) return
    try {
      await api.post(
        '/admin/announce',
        { message: announceMsg.trim() },
        { headers: { 'x-admin-secret': adminSecret } },
      )
      setAnnounceMsg('')
      alert('Announcement sent!')
    } catch {
      alert('Failed to announce')
    }
  }

  if (!authenticated) {
    return (
      <div className="relative min-h-screen bg-bg grain-frame flex items-center justify-center px-6">
        <div className="w-full max-w-sm flex flex-col items-center">
          <Rocket className="w-10 h-10 text-accent mb-4" strokeWidth={1.5} />
          <h1 className="text-2xl font-semibold text-text-primary mb-6">ODYSSEY ADMIN</h1>
          <form onSubmit={handleAuth} className="w-full flex flex-col gap-4">
            <Input
              label="Admin Secret"
              type="password"
              value={adminSecret}
              onChange={(e) => setAdminSecret(e.target.value)}
              placeholder="Enter admin secret"
            />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Verifying...' : 'Enter'}
            </Button>
          </form>
        </div>
      </div>
    )
  }

  const filtered =
    statusFilter === 'all' ? teams : teams.filter((t) => t.status === statusFilter)
  const stats = {
    total: teams.length,
    active: teams.filter((t) => t.status === 'active').length,
    locked: teams.filter((t) => t.status === 'locked').length,
    finished: teams.filter((t) => t.status === 'finished').length,
  }

  return (
    <div className="relative min-h-screen bg-bg grain-frame flex flex-col">
      <header className="border-b border-surface-alt px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-text-primary">
          <Rocket className="w-5 h-5 text-accent" />
          <span className="font-semibold text-sm tracking-wide">ODYSSEY ADMIN</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={handleStart}
            className="flex items-center gap-1.5"
          >
            <Play className="w-3.5 h-3.5" /> Start
          </Button>
          <Button
            variant="danger"
            onClick={handleEnd}
            className="flex items-center gap-1.5"
          >
            <Square className="w-3.5 h-3.5" /> End
          </Button>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row">
        <aside className="w-full lg:w-72 border-b lg:border-b-0 lg:border-r border-surface-alt flex flex-col">
          <div className="p-4 border-b border-surface-alt">
            <div className="flex gap-1.5 text-xs mb-3">
              {['all', 'active', 'locked', 'finished'].map((f) => (
                <button
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  className={`px-2 py-1 rounded-md capitalize cursor-pointer transition-colors ${
                    statusFilter === f
                      ? 'bg-accent/15 text-accent'
                      : 'text-text-muted hover:text-text-secondary'
                  }`}
                >
                  {f} {f === 'all' ? `(${stats.total})` : `(${stats[f]})`}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="p-4 text-sm text-text-muted">No teams found.</p>
            ) : (
              filtered.map((team) => (
                <button
                  key={team.id}
                  onClick={() => {
                    setSelected(team)
                    setMessage('')
                  }}
                  className={`w-full text-left px-4 py-3 border-b border-surface-alt flex items-center justify-between cursor-pointer transition-colors ${
                    selected?.id === team.id ? 'bg-surface' : 'hover:bg-surface/50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        team.status === 'active'
                          ? 'bg-accent'
                          : team.status === 'locked'
                            ? 'bg-amber'
                            : 'bg-green'
                      }`}
                    />
                    <span className="text-sm text-text-primary truncate max-w-[140px]">
                      {team.team_name}
                    </span>
                  </div>
                  <span className="text-xs text-text-muted">{team.progress}/5</span>
                </button>
              ))
            )}
          </div>
          <div className="p-4 border-t border-surface-alt">
            <form onSubmit={handleAnnounce} className="flex gap-2">
              <input
                type="text"
                value={announceMsg}
                onChange={(e) => setAnnounceMsg(e.target.value)}
                placeholder="Announce to all..."
                className="flex-1 bg-surface border border-border rounded-md px-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
              />
              <button
                type="submit"
                disabled={!announceMsg.trim()}
                className="bg-indigo/15 text-indigo border border-indigo/30 rounded-md px-2 py-1.5 disabled:opacity-50 cursor-pointer hover:bg-indigo/25 transition-colors"
              >
                <Megaphone className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </aside>

        <main className="flex-1 p-6">
          {selected ? (
            <div className="max-w-lg">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-text-primary">
                  {selected.team_name}
                </h2>
                <Badge status={selected.status} />
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
                <div className="bg-surface rounded-lg p-3 border border-surface-alt">
                  <p className="text-text-muted text-xs mb-1">Progress</p>
                  <p className="text-text-primary font-semibold">{selected.progress}/5</p>
                </div>
                <div className="bg-surface rounded-lg p-3 border border-surface-alt">
                  <p className="text-text-muted text-xs mb-1">Stage</p>
                  <p className="text-text-primary font-semibold capitalize">
                    {selected.status}
                  </p>
                </div>
              </div>

              <div className="flex gap-2 mb-6">
                <Button
                  variant="secondary"
                  onClick={() => handleUnlock(selected.id)}
                  disabled={selected.status !== 'locked'}
                  className="flex items-center gap-1.5"
                >
                  <Unlock className="w-3.5 h-3.5" /> Unlock
                </Button>
              </div>

              <form onSubmit={handleSendMessage} className="flex flex-col gap-3">
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Send a message to this team..."
                  className="bg-surface border border-border rounded-lg px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
                />
                <Button
                  type="submit"
                  variant="secondary"
                  disabled={!message.trim()}
                  className="flex items-center gap-1.5 self-start"
                >
                  <MessageSquare className="w-3.5 h-3.5" /> Send Message
                </Button>
              </form>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center h-full">
              <p className="text-text-muted text-sm">Select a team to view details</p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
