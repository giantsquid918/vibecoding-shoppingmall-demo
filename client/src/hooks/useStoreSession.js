import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { clearAccessToken, getAccessToken } from '../utils/authStorage.js'

export function useStoreSession() {
  const navigate = useNavigate()
  const [isLoggedIn, setIsLoggedIn] = useState(() => Boolean(getAccessToken()))
  const [currentUser, setCurrentUser] = useState(null)
  const [isLoadingUser, setIsLoadingUser] = useState(false)
  const [userError, setUserError] = useState('')

  useEffect(() => {
    if (!isLoggedIn) return undefined

    const token = getAccessToken()
    if (!token) return undefined

    const controller = new AbortController()
    async function loadCurrentUser() {
      setCurrentUser(null)
      setUserError('')
      setIsLoadingUser(true)

      try {
        const response = await fetch('/api/users/me', {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        })
        const result = await response.json()

        if (response.status === 401) {
          clearAccessToken()
          setIsLoggedIn(false)
          setUserError('로그인 시간이 만료되었습니다. 다시 로그인해 주세요.')
          return
        }

        if (!response.ok) {
          throw new Error(result.message || '사용자 정보를 불러오지 못했습니다.')
        }

        setCurrentUser(result)
      } catch (error) {
        if (error.name === 'AbortError') return

        setUserError(
          error instanceof TypeError
            ? '서버에 연결할 수 없어 사용자 정보를 불러오지 못했습니다.'
            : error.message || '사용자 정보를 불러오지 못했습니다.',
        )
      } finally {
        if (!controller.signal.aborted) setIsLoadingUser(false)
      }
    }

    loadCurrentUser()
    return () => controller.abort()
  }, [isLoggedIn])

  const handleLogout = useCallback(() => {
    clearAccessToken()
    setIsLoggedIn(false)
    setCurrentUser(null)
    setUserError('')
    setIsLoadingUser(false)
    navigate('/', { replace: true, state: { logoutSuccess: true } })
  }, [navigate])

  return {
    currentUser,
    handleLogout,
    isAdmin: currentUser?.user_type === 'admin',
    isLoadingUser,
    isLoggedIn,
    userError,
  }
}
