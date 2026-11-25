import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { clearAccessToken, getAccessToken, storeAccessToken } from '../utils/authStorage.js'

const socialProviders = [
  { name: 'Google', mark: 'G' },
  { name: 'Facebook', mark: 'f' },
  { name: 'Apple', mark: '●' },
]

function LoginPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [rememberMe, setRememberMe] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [checkingStoredToken, setCheckingStoredToken] = useState(
    () => Boolean(getAccessToken()),
  )

  useEffect(() => {
    const token = getAccessToken()
    if (!token) return undefined

    const controller = new AbortController()
    async function verifyStoredToken() {
      try {
        const response = await fetch('/api/users/me', {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        })

        if (response.status === 401) {
          clearAccessToken()
          return
        }

        if (!response.ok) {
          setMessage('저장된 로그인 상태를 확인하지 못했습니다. 다시 시도하거나 로그인해 주세요.')
          return
        }

        navigate('/', { replace: true })
      } catch (error) {
        if (error.name === 'AbortError') return
        setMessage('저장된 로그인 상태를 확인할 수 없습니다. 로그인 정보를 입력해 주세요.')
      } finally {
        if (!controller.signal.aborted) setCheckingStoredToken(false)
      }
    }

    verifyStoredToken()
    return () => controller.abort()
  }, [navigate])

  function handleChange(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
    setMessage('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setMessage('')

    if (!form.email.trim() || !form.password) {
      setMessage('이메일과 비밀번호를 입력해 주세요.')
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch('/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email.trim(), password: form.password }),
      })
      const result = await response.json()

      if (!response.ok) {
        setMessage(
          response.status >= 500
            ? '서버에 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.'
            : result.message || '로그인 정보를 확인해 주세요.',
        )
        return
      }

      if (typeof result.token !== 'string' || !result.user) {
        throw new Error('로그인 응답에 인증 토큰이 없습니다.')
      }

      storeAccessToken(result.token, rememberMe)
      navigate('/', { replace: true })
    } catch (error) {
      if (error instanceof TypeError || error instanceof SyntaxError) {
        setMessage('서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.')
      } else {
        setMessage(error.message || '로그인 중 오류가 발생했습니다. 다시 시도해 주세요.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (checkingStoredToken) {
    return (
      <main className="auth-login-page">
        <Link className="page-home-link" to="/">GHMALL</Link>
        <section aria-labelledby="login-title" className="auth-login-card">
          <Link aria-label="GHMALL 홈" className="auth-login-logo" to="/">GHMALL</Link>
          <h1 id="login-title">로그인</h1>
          <p className="auth-login-subtitle" role="status">저장된 로그인 상태를 확인하고 있습니다.</p>
        </section>
      </main>
    )
  }

  return (
    <main className="auth-login-page">
      <Link className="page-home-link" to="/">GHMALL</Link>
      <section aria-labelledby="login-title" className="auth-login-card">
        <Link aria-label="GHMALL 홈" className="auth-login-logo" to="/">GHMALL</Link>
        <h1 id="login-title">로그인</h1>
        <p className="auth-login-subtitle">계정에 로그인하여 쇼핑을 시작하세요</p>

        <form className="auth-login-form" onSubmit={handleSubmit}>
          <div className="auth-login-field">
            <label htmlFor="login-email">이메일</label>
            <input
              autoComplete="email"
              id="login-email"
              name="email"
              onChange={handleChange}
              required
              type="email"
              value={form.email}
            />
          </div>
          <div className="auth-login-field">
            <label htmlFor="login-password">비밀번호</label>
            <input
              autoComplete="current-password"
              id="login-password"
              name="password"
              onChange={handleChange}
              required
              type="password"
              value={form.password}
            />
          </div>
          <div className="auth-login-options">
            <label className="remember-me">
              <input
                checked={rememberMe}
                onChange={(event) => setRememberMe(event.target.checked)}
                type="checkbox"
              />
              <span>로그인 상태 유지</span>
            </label>
            <span aria-disabled="true" className="forgot-password">비밀번호 찾기</span>
          </div>
          {message && <p className="auth-login-message" role="alert">{message}</p>}
          <button className="auth-login-submit" disabled={submitting} type="submit">
            {submitting ? '로그인 중...' : '로그인'}
          </button>
        </form>

        <div className="auth-login-divider"><span>또는</span></div>
        <div aria-label="소셜 로그인" className="social-login-options">
          {socialProviders.map(({ name, mark }) => (
            <button className="social-login-button" disabled key={name} type="button">
              <span aria-hidden="true">{mark}</span>
              {name}로 로그인
            </button>
          ))}
        </div>
        <p className="auth-signup-prompt">
          아직 계정이 없으신가요? <Link to="/signup">회원가입</Link>
        </p>
        <p className="auth-login-terms">
          로그인하시면 이용약관 및 개인정보처리방침에 동의하는 것으로 간주됩니다.
        </p>
      </section>
    </main>
  )
}

export default LoginPage
