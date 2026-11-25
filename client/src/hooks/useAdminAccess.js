import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { clearAccessToken, getAccessToken } from '../utils/authStorage.js'

export function useAdminAccess() {
  const navigate = useNavigate()
  const [status, setStatus] = useState('loading')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    const token = getAccessToken()
    if (!token) {
      navigate('/', { replace: true })
      return undefined
    }

    const controller = new AbortController()
    async function verifyAdmin() {
      try {
        const response = await fetch('/api/users/me', {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        })

        if (response.status === 401) {
          clearAccessToken()
          navigate('/', { replace: true })
          return
        }

        const user = await response.json()
        if (!response.ok) {
          throw new Error(user.message || '관리자 정보를 확인하지 못했습니다.')
        }
        if (user.user_type !== 'admin') {
          navigate('/', { replace: true })
          return
        }

        setStatus('ready')
      } catch (error) {
        if (error.name === 'AbortError') return
        setErrorMessage(
          error instanceof TypeError
            ? '서버에 연결할 수 없어 관리자 정보를 확인하지 못했습니다.'
            : error.message || '관리자 정보를 확인하지 못했습니다.',
        )
        setStatus('error')
      }
    }

    verifyAdmin()
    return () => controller.abort()
  }, [navigate])

  return { status, errorMessage }
}
