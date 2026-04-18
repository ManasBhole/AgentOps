import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth, type UserRole } from '../context/AuthContext'

/**
 * Handles the redirect back from the OAuth provider.
 * Backend redirects to /oauth/callback#access_token=...&refresh_token=...&...
 * We parse the fragment, store the session, then redirect to the dashboard.
 */
export default function OAuthCallback() {
  const navigate = useNavigate()
  const { storeOAuthSession } = useAuth()

  useEffect(() => {
    const hash = window.location.hash.slice(1)
    const params = new URLSearchParams(hash)

    const accessToken  = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    const userId       = params.get('user_id')
    const email        = params.get('email')
    const name         = params.get('name')
    const avatarUrl    = params.get('avatar_url') ?? ''
    const role         = params.get('role') ?? 'viewer'

    if (!accessToken || !refreshToken || !email) {
      navigate('/login?error=OAuth+failed', { replace: true })
      return
    }

    storeOAuthSession({
      access_token:  accessToken,
      refresh_token: refreshToken,
      user: { id: userId ?? '', email, name: name ?? email, role: (role as UserRole), avatar_url: avatarUrl },
    })

    navigate('/', { replace: true })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="flex flex-col items-center gap-3 text-gray-400">
        <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
        <p className="text-sm">Completing sign-in…</p>
      </div>
    </div>
  )
}
