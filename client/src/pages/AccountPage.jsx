import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import LogoutConfirmDialog from '../components/LogoutConfirmDialog.jsx'
import Navbar from '../components/Navbar.jsx'
import { useStoreSession } from '../hooks/useStoreSession.js'
import { clearAccessToken, getAccessToken } from '../utils/authStorage.js'

const passwordPattern = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/

function formatPhoneNumber(phone = '') {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  return phone
}

function AccountPage() {
  const navigate = useNavigate()
  const {
    currentUser,
    handleLogout,
    isAdmin,
    isLoadingUser,
    isLoggedIn,
    userError,
  } = useStoreSession()
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [withdrawalPassword, setWithdrawalPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordMessage, setPasswordMessage] = useState('')
  const [withdrawalError, setWithdrawalError] = useState('')
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [isWithdrawing, setIsWithdrawing] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [accountDeleted, setAccountDeleted] = useState(false)
  const displayName = currentUser?.nickname?.trim() || currentUser?.username || ''

  function handlePasswordFieldChange(event) {
    const { name, value } = event.target
    setPasswordForm((form) => ({ ...form, [name]: value }))
    setPasswordError('')
    setPasswordMessage('')
  }

  async function handlePasswordSubmit(event) {
    event.preventDefault()
    setPasswordError('')
    setPasswordMessage('')

    if (!passwordPattern.test(passwordForm.newPassword)) {
      setPasswordError('새 비밀번호는 8자 이상이며 영문, 숫자, 특수문자를 포함해야 합니다.')
      return
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('새 비밀번호가 일치하지 않습니다.')
      return
    }

    setIsChangingPassword(true)
    try {
      const response = await fetch('/api/users/me/password', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${getAccessToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      })
      const result = await response.json()
      if (response.status === 401) {
        clearAccessToken()
        navigate('/login', { replace: true })
        return
      }
      if (!response.ok) throw new Error(result.message || '비밀번호를 변경하지 못했습니다.')

      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setPasswordMessage(result.message)
    } catch (error) {
      setPasswordError(
        error instanceof TypeError
          ? '서버에 연결할 수 없어 비밀번호를 변경하지 못했습니다.'
          : error.message || '비밀번호를 변경하지 못했습니다.',
      )
    } finally {
      setIsChangingPassword(false)
    }
  }

  async function handleWithdrawal(event) {
    event.preventDefault()
    setWithdrawalError('')
    if (!window.confirm(
      '회원 탈퇴를 진행할까요? 계정과 장바구니는 삭제되며, 주문 기록은 개인정보를 익명화해 보관합니다.',
    )) return

    setIsWithdrawing(true)
    try {
      const response = await fetch('/api/users/me', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${getAccessToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: withdrawalPassword }),
      })
      const result = await response.json()
      if (response.status === 401) {
        clearAccessToken()
        navigate('/login', { replace: true })
        return
      }
      if (!response.ok) throw new Error(result.message || '회원 탈퇴를 진행하지 못했습니다.')

      clearAccessToken()
      setAccountDeleted(true)
    } catch (error) {
      setWithdrawalError(
        error instanceof TypeError
          ? '서버에 연결할 수 없어 회원 탈퇴를 진행하지 못했습니다.'
          : error.message || '회원 탈퇴를 진행하지 못했습니다.',
      )
    } finally {
      setIsWithdrawing(false)
    }
  }

  if (accountDeleted) {
    return (
      <main className="account-page">
        <Navbar isLoggedIn={false} />
        <section className="account-content account-complete" aria-labelledby="account-title">
          <h1 id="account-title">회원 탈퇴가 완료되었습니다</h1>
          <p>주문 기록은 개인정보를 익명화하여 보관합니다.</p>
          <Link className="primary-button" to="/">메인 페이지로 이동</Link>
        </section>
      </main>
    )
  }

  return (
    <main className="account-page">
      <Navbar
        displayName={displayName}
        isAdmin={isAdmin}
        isLoadingUser={isLoadingUser}
        isLoggedIn={isLoggedIn}
        onLogoutRequest={() => setShowLogoutConfirm(true)}
      />
      <section aria-labelledby="account-title" className="account-content">
        <h1 id="account-title">내 정보</h1>
        {!isLoggedIn ? (
          <div className="account-notice">
            <p>내 정보를 확인하려면 로그인해 주세요.</p>
            <Link className="primary-button" to="/login">로그인</Link>
          </div>
        ) : isLoadingUser ? (
          <p aria-live="polite" className="account-notice">계정 정보를 불러오는 중입니다.</p>
        ) : userError ? (
          <p className="account-feedback is-error" role="alert">{userError}</p>
        ) : (
          <>
            <section aria-labelledby="account-identity-title" className="account-card">
              <h2 id="account-identity-title">계정 정보</h2>
              <label className="account-field">
                <span>이메일 아이디</span>
                <input disabled value={currentUser?.email || ''} />
              </label>
              <p className="account-help">아이디는 변경할 수 없습니다.</p>
              <label className="account-field">
                <span>휴대폰 번호</span>
                <input disabled value={formatPhoneNumber(currentUser?.phone || '')} />
              </label>
              <label className="account-field">
                <span>주소</span>
                <textarea disabled rows={2} value={currentUser?.address || ''} />
              </label>
            </section>

            <section aria-labelledby="password-title" className="account-card">
              <h2 id="password-title">비밀번호 변경</h2>
              <form className="account-form" onSubmit={handlePasswordSubmit}>
                <label className="account-field">
                  <span>현재 비밀번호</span>
                  <input
                    autoComplete="current-password"
                    name="currentPassword"
                    onChange={handlePasswordFieldChange}
                    required
                    type="password"
                    value={passwordForm.currentPassword}
                  />
                </label>
                <label className="account-field">
                  <span>새 비밀번호</span>
                  <input
                    autoComplete="new-password"
                    name="newPassword"
                    onChange={handlePasswordFieldChange}
                    required
                    type="password"
                    value={passwordForm.newPassword}
                  />
                </label>
                <label className="account-field">
                  <span>새 비밀번호 확인</span>
                  <input
                    autoComplete="new-password"
                    name="confirmPassword"
                    onChange={handlePasswordFieldChange}
                    required
                    type="password"
                    value={passwordForm.confirmPassword}
                  />
                </label>
                {passwordError && <p className="account-feedback is-error" role="alert">{passwordError}</p>}
                {passwordMessage && <p className="account-feedback" role="status">{passwordMessage}</p>}
                <button className="primary-button" disabled={isChangingPassword} type="submit">
                  {isChangingPassword ? '변경 중...' : '비밀번호 변경'}
                </button>
              </form>
            </section>

            <section aria-labelledby="withdraw-title" className="account-card account-withdraw">
              <h2 id="withdraw-title">회원 탈퇴</h2>
              <p>
                탈퇴하면 계정과 장바구니가 삭제됩니다. 처리 중이거나 배송 중인 주문이 있으면
                주문 완료 또는 취소 후 탈퇴할 수 있습니다. 완료되거나 취소된 주문은 기록을
                유지하되 개인정보를 익명화합니다.
              </p>
              <form className="account-form" onSubmit={handleWithdrawal}>
                <label className="account-field">
                  <span>비밀번호 확인</span>
                  <input
                    autoComplete="current-password"
                    onChange={(event) => {
                      setWithdrawalPassword(event.target.value)
                      setWithdrawalError('')
                    }}
                    required
                    type="password"
                    value={withdrawalPassword}
                  />
                </label>
                {withdrawalError && <p className="account-feedback is-error" role="alert">{withdrawalError}</p>}
                <button className="account-withdraw-button" disabled={isWithdrawing} type="submit">
                  {isWithdrawing ? '탈퇴 처리 중...' : '회원 탈퇴'}
                </button>
              </form>
            </section>
          </>
        )}
      </section>
      <LogoutConfirmDialog
        onCancel={() => setShowLogoutConfirm(false)}
        onConfirm={() => {
          setShowLogoutConfirm(false)
          handleLogout()
        }}
        open={showLogoutConfirm}
      />
    </main>
  )
}

export default AccountPage
