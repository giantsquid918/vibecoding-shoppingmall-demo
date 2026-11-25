import { useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import LogoutConfirmDialog from '../components/LogoutConfirmDialog.jsx'
import Navbar from '../components/Navbar.jsx'
import { useStoreSession } from '../hooks/useStoreSession.js'

function OrderFailurePage() {
  const { state } = useLocation()
  const [searchParams] = useSearchParams()
  const {
    currentUser,
    handleLogout,
    isAdmin,
    isLoadingUser,
    isLoggedIn,
    userError,
  } = useStoreSession()
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const reason = state?.reason
    || searchParams.get('reason')
    || '결제 승인 요청이 정상적으로 완료되지 않았습니다.'
  const displayName = currentUser?.nickname?.trim() || currentUser?.username || ''

  return (
    <main className="order-failure-page">
      <Navbar
        displayName={displayName}
        isAdmin={isAdmin}
        isLoadingUser={isLoadingUser}
        isLoggedIn={isLoggedIn}
        onLogoutRequest={() => setShowLogoutConfirm(true)}
      />
      {userError && <p className="profile-load-error" role="alert">{userError}</p>}
      <section aria-labelledby="order-failure-title" className="order-failure-card">
        <span aria-hidden="true" className="order-failure-icon">!</span>
        <h1 id="order-failure-title">결제가 완료되지 않았습니다</h1>
        <div className="order-failure-reason">
          <strong>실패 사유</strong>
          <p>{reason}</p>
        </div>
        <p className="order-failure-note">
          장바구니 상품은 유지되어 있습니다. 상품을 확인한 뒤 다시 결제할 수 있습니다.
        </p>
        <div className="order-failure-actions">
          <Link className="order-failure-secondary-link" to="/cart">장바구니로 돌아가기</Link>
          <Link className="order-failure-primary-link" to="/checkout">다시 결제하기</Link>
        </div>
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

export default OrderFailurePage
