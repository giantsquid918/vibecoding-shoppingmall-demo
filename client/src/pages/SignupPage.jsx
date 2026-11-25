import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import SignupForm from '../components/SignupForm.jsx'
import { storeAccessToken } from '../utils/authStorage.js'

const initialForm = {
  username: '',
  nickname: '',
  phone: '',
  email: '',
  address: '',
  password: '',
  passwordConfirm: '',
}

const initialAgreements = {
  terms: false,
  privacy: false,
  marketing: false,
}

const passwordPattern = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/
const usernamePattern = /^\p{L}+$/u
const usernameErrorMessage = '이름에는 문자만 입력할 수 있습니다.'

function SignupSuccess({ email, onReturnHome }) {
  return (
    <section className="signup-card signup-success" aria-live="polite">
      <div className="success-mark" aria-hidden="true">✓</div>
      <h1>회원가입이 완료됐어요</h1>
      <p><strong>{email}</strong> 계정으로 쇼핑을 시작할 수 있습니다.</p>
      <button className="primary-button" type="button" onClick={onReturnHome}>
        메인 페이지로 이동
      </button>
    </section>
  )
}

function SignupAlert({ message, onClose }) {
  if (!message) return null

  return (
    <div className="signup-alert-backdrop">
      <section
        aria-labelledby="signup-alert-title"
        aria-modal="true"
        className="signup-alert"
        role="alertdialog"
      >
        <div className="signup-alert-icon" aria-hidden="true">!</div>
        <h2 id="signup-alert-title">안내</h2>
        <p>{message}</p>
        <button autoFocus className="primary-button" onClick={onClose} type="button">
          확인
        </button>
      </section>
    </div>
  )
}

function SignupPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState(initialForm)
  const [agreements, setAgreements] = useState(initialAgreements)
  const [showPasswords, setShowPasswords] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [popupMessage, setPopupMessage] = useState('')
  const [registeredEmail, setRegisteredEmail] = useState('')
  const [checkingPhone, setCheckingPhone] = useState(false)
  const allAgreed = Object.values(agreements).every(Boolean)
  const usernameError = form.username && !usernamePattern.test(form.username)
    ? usernameErrorMessage
    : ''
  const passwordError = form.password && !passwordPattern.test(form.password)
    ? '비밀번호는 8자 이상이며 영문, 숫자, 특수문자를 포함해야 합니다.'
    : ''
  const passwordConfirmError = form.passwordConfirm && form.password !== form.passwordConfirm
    ? '비밀번호가 일치하지 않습니다.'
    : ''
  const phoneError = form.phone && !/^01[0-9]-?\d{3,4}-?\d{4}$/.test(form.phone)
    ? '올바른 휴대폰 번호를 입력해 주세요.'
    : ''

  function handleChange(event) {
    const { name, value } = event.target
    if (name === 'phone') {
      const digits = value.replace(/\D/g, '').slice(0, 11)
      let formatted = digits
      if (digits.length > 7) {
        formatted = `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
      } else if (digits.length > 3) {
        formatted = `${digits.slice(0, 3)}-${digits.slice(3)}`
      }
      setForm((current) => ({ ...current, phone: formatted }))
      return
    }
    setForm((current) => ({ ...current, [name]: value }))
  }

  function handleAllAgreements(event) {
    const checked = event.target.checked
    setAgreements({ terms: checked, privacy: checked, marketing: checked })
  }

  function handleAgreementChange(event) {
    const { name, checked } = event.target
    setAgreements((current) => ({ ...current, [name]: checked }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setMessage('')
    setPopupMessage('')

    const requiredFields = ['username', 'phone', 'email', 'address', 'password', 'passwordConfirm']
    if (requiredFields.some((field) => !form[field].trim())) {
      setPopupMessage('필수 입력란을 모두 입력해 주세요.')
      return
    }

    if (!usernamePattern.test(form.username)) {
      setPopupMessage(usernameErrorMessage)
      return
    }

    if (!agreements.terms || !agreements.privacy) {
      setPopupMessage('필수 약관에 동의해 주세요.')
      return
    }

    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) {
      setPopupMessage('올바른 이메일 주소를 입력해 주세요.')
      return
    }

    if (!/^01[0-9]-?\d{3,4}-?\d{4}$/.test(form.phone)) {
      setPopupMessage('올바른 휴대폰 번호를 입력해 주세요.')
      return
    }

    setCheckingPhone(true)
    try {
      const phone = form.phone.replace(/\D/g, '')
      const phoneResponse = await fetch(`/api/users/check-phone/${phone}`)
      const phoneResult = await phoneResponse.json()
      if (!phoneResponse.ok) throw new Error(phoneResult.message)
      if (phoneResult.exists) {
        setPopupMessage('기존에 가입된 휴대폰 번호입니다.')
        return
      }
    } finally {
      setCheckingPhone(false)
    }

    if (!passwordPattern.test(form.password)) {
      return
    }

    if (form.password !== form.passwordConfirm) {
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: form.username.trim(),
          nickname: form.nickname.trim() || undefined,
          phone: form.phone.replace(/\D/g, ''),
          email: form.email.trim(),
          address: form.address.trim(),
          password: form.password,
        }),
      })
      const result = await response.json()

      if (response.status === 409) {
        if (/휴대폰|phone/i.test(result.message || '')) {
          setPopupMessage('기존에 가입된 휴대폰 번호입니다.')
          return
        }
        setPopupMessage('이미 가입된 이메일입니다. 다른 이메일을 입력해 주세요.')
        return
      }

      if (!response.ok) {
        if (response.status >= 500) {
          throw new Error('서버에 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.')
        }

        throw new Error(result.message || '입력 정보를 확인해 주세요.')
      }

      if (typeof result.token !== 'string') {
        throw new Error('회원가입 응답에 인증 토큰이 없습니다.')
      }

      storeAccessToken(result.token, false)
      setRegisteredEmail(result.email)
    } catch (error) {
      if (error instanceof TypeError || error instanceof SyntaxError) {
        setMessage('서버에 연결할 수 없습니다. 인터넷 연결과 서버 실행 상태를 확인한 후 다시 시도해 주세요.')
      } else {
        setMessage(error.message || '회원가입 중 오류가 발생했습니다. 다시 시도해 주세요.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="signup-page">
      <Link className="page-home-link" to="/">GHMALL</Link>
      {registeredEmail ? (
        <SignupSuccess email={registeredEmail} onReturnHome={() => navigate('/')} />
      ) : (
        <section className="signup-card">
          <h1>회원가입</h1>
          <p className="signup-subtitle">새로운 계정을 만들어 쇼핑을 시작하세요</p>
          <SignupForm
            agreements={agreements}
            allAgreed={allAgreed}
            form={form}
            message={message}
            passwordConfirmError={passwordConfirmError}
            passwordError={passwordError}
            onAgreementChange={handleAgreementChange}
            onAllAgreements={handleAllAgreements}
            onChange={handleChange}
            onSubmit={handleSubmit}
            onTogglePasswords={() => setShowPasswords((visible) => !visible)}
            phoneError={phoneError}
            showPasswords={showPasswords}
            submitDisabled={checkingPhone}
            submitting={submitting}
            usernameError={usernameError}
          />
        </section>
      )}
      <SignupAlert message={popupMessage} onClose={() => setPopupMessage('')} />
    </main>
  )
}

export default SignupPage
