import { memo, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAccessToken } from '../utils/authStorage.js'

const noop = () => {}

function AccountMenu({ displayName, isLoadingUser, onLogoutRequest }) {
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false)
  const accountMenuRef = useRef(null)

  useEffect(() => {
    if (!isAccountMenuOpen) return undefined

    function handlePointerDown(event) {
      if (!accountMenuRef.current?.contains(event.target)) {
        setIsAccountMenuOpen(false)
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') setIsAccountMenuOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isAccountMenuOpen])

  return (
    <div className="account-menu" ref={accountMenuRef}>
      <button
        aria-expanded={isAccountMenuOpen}
        aria-haspopup="menu"
        className="header-user-name"
        onClick={() => setIsAccountMenuOpen((isOpen) => !isOpen)}
        type="button"
      >
        {displayName
          ? `${displayName}님`
          : isLoadingUser
            ? '사용자 정보 불러오는 중...'
            : '계정 메뉴'}
      </button>
      {isAccountMenuOpen && (
        <div aria-label="계정 메뉴" className="account-dropdown" role="menu">
          <Link
            className="account-dropdown-item"
            onClick={() => setIsAccountMenuOpen(false)}
            role="menuitem"
            to="/account"
          >
            내 정보
          </Link>
          <Link
            className="account-dropdown-item"
            onClick={() => setIsAccountMenuOpen(false)}
            role="menuitem"
            to="/orders"
          >
            내 주문목록
          </Link>
          <button
            className="account-dropdown-item account-dropdown-logout"
            onClick={() => {
              setIsAccountMenuOpen(false)
              onLogoutRequest()
            }}
            role="menuitem"
            type="button"
          >
            로그아웃
          </button>
        </div>
      )}
    </div>
  )
}

const MemoizedAccountMenu = memo(AccountMenu)

function Navbar({
  displayName = '',
  isAdmin = false,
  isLoadingUser = false,
  isLoggedIn = false,
  onLogoutRequest = noop,
  onSearchChange = noop,
  searchTerm = '',
}) {
  const [cartItemCount, setCartItemCount] = useState(0)
  const [cartRequestError, setCartRequestError] = useState('')
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  useEffect(() => {
    if (!isMobileMenuOpen) return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function handleKeyDown(event) {
      if (event.key === 'Escape') setIsMobileMenuOpen(false)
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isMobileMenuOpen])

  useEffect(() => {
    if (!isLoggedIn) return undefined

    const token = getAccessToken()
    if (!token) return undefined

    let controller
    async function loadCart() {
      controller?.abort()
      controller = new AbortController()

      try {
        const response = await fetch('/api/cart', {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        })
        const result = await response.json()
        if (!response.ok) {
          throw new Error(result.message || '장바구니 개수를 불러오지 못했습니다.')
        }
        if (!Array.isArray(result.items)) {
          throw new Error('장바구니 응답 형식이 올바르지 않습니다.')
        }

        const itemCount = result.items.reduce(
          (count, item) => count + (Number.isInteger(item.quantity) ? item.quantity : 0),
          0,
        )
        setCartItemCount(itemCount)
        setCartRequestError('')
      } catch (error) {
        if (error.name === 'AbortError') return
        setCartRequestError(
          error instanceof TypeError
            ? '서버에 연결할 수 없어 장바구니 개수를 불러오지 못했습니다.'
            : error.message || '장바구니 개수를 불러오지 못했습니다.',
        )
      }
    }

    window.addEventListener('cart-updated', loadCart)
    loadCart()
    return () => {
      controller?.abort()
      window.removeEventListener('cart-updated', loadCart)
    }
  }, [isLoggedIn])

  const hasAccessToken = Boolean(getAccessToken())
  const visibleCartItemCount = isLoggedIn && hasAccessToken ? cartItemCount : 0
  const cartLoadError = isLoggedIn && !hasAccessToken
    ? '장바구니를 불러오려면 다시 로그인해 주세요.'
    : cartRequestError

  return (
    <header className="site-header store-header">
      <button
        aria-controls="mobile-account-menu"
        aria-expanded={isMobileMenuOpen}
        aria-label="계정 메뉴 열기"
        className="store-menu-button"
        onClick={() => setIsMobileMenuOpen((isOpen) => !isOpen)}
        type="button"
      >
        <svg aria-hidden="true" fill="none" height="22" viewBox="0 0 24 24" width="22">
          <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
        </svg>
      </button>
      <div className="store-header-center">
        <Link className="site-logo" to="/">GHMALL</Link>
        <form
          className="store-search"
          onSubmit={(event) => event.preventDefault()}
          role="search"
        >
          <input
            aria-label="상품 검색"
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="가디건"
            type="search"
            value={searchTerm}
          />
          <button aria-label="검색" type="submit">
            <svg aria-hidden="true" fill="none" height="21" viewBox="0 0 24 24" width="21">
              <circle cx="10.8" cy="10.8" r="6.8" stroke="currentColor" strokeWidth="2.2" />
              <path d="m16 16 4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />
            </svg>
          </button>
        </form>
      </div>
      <nav aria-label="계정 및 쇼핑 메뉴" className="home-header-actions store-header-actions">
        {isLoggedIn && isAdmin && (
          <Link className="admin-products-button" to="/admin/products">
            상품관리
          </Link>
        )}
        {isLoggedIn ? (
          <MemoizedAccountMenu
            displayName={displayName}
            isLoadingUser={isLoadingUser}
            onLogoutRequest={onLogoutRequest}
          />
        ) : (
          <div className="store-auth-links">
            <Link className="header-signup" to="/login">로그인</Link>
            <Link className="header-signup" to="/signup">회원가입</Link>
          </div>
        )}
        <Link
          aria-label={`장바구니${visibleCartItemCount ? `, 상품 ${visibleCartItemCount}개` : ''}`}
          className="store-icon-button cart-icon-button"
          to="/cart"
        >
          <svg aria-hidden="true" fill="none" height="25" viewBox="0 0 24 24" width="25">
            <path d="M5 8h14l1 13H4L5 8Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
            <path d="M9 9V6a3 3 0 0 1 6 0v3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
          </svg>
          {visibleCartItemCount > 0 && (
            <span aria-hidden="true" className="cart-item-count">{visibleCartItemCount}</span>
          )}
        </Link>
      </nav>
      {cartLoadError && <span aria-live="polite" className="visually-hidden" role="status">{cartLoadError}</span>}
      <div
        aria-hidden={!isMobileMenuOpen}
        className={`mobile-menu-layer${isMobileMenuOpen ? ' is-open' : ''}`}
        id="mobile-account-menu"
      >
        <button
          aria-label="메뉴 닫기"
          className="mobile-menu-backdrop"
          onClick={() => setIsMobileMenuOpen(false)}
          tabIndex={isMobileMenuOpen ? 0 : -1}
          type="button"
        />
        <aside
          aria-label="모바일 계정 메뉴"
          aria-modal={isMobileMenuOpen}
          className="mobile-menu-drawer"
          role="dialog"
        >
          <div className="mobile-menu-heading">
            <strong>{isLoggedIn ? `${displayName || '계정'}님` : '계정 메뉴'}</strong>
            <button
              aria-label="메뉴 닫기"
              className="mobile-menu-close"
              onClick={() => setIsMobileMenuOpen(false)}
              type="button"
            >
              ×
            </button>
          </div>
          <nav aria-label="모바일 계정 메뉴 항목" className="mobile-menu-items">
            {isLoggedIn ? (
              <>
                {isAdmin && (
                  <Link
                    className="mobile-menu-item"
                    onClick={() => setIsMobileMenuOpen(false)}
                    to="/admin/products"
                  >
                    상품관리
                  </Link>
                )}
                <Link
                  className="mobile-menu-item"
                  onClick={() => setIsMobileMenuOpen(false)}
                  to="/account"
                >
                  내 정보
                </Link>
                <Link
                  className="mobile-menu-item"
                  onClick={() => setIsMobileMenuOpen(false)}
                  to="/orders"
                >
                  내 주문목록
                </Link>
                <button
                  className="mobile-menu-item mobile-menu-logout"
                  onClick={() => {
                    setIsMobileMenuOpen(false)
                    onLogoutRequest()
                  }}
                  type="button"
                >
                  로그아웃
                </button>
              </>
            ) : (
              <>
                <Link
                  className="mobile-menu-item"
                  onClick={() => setIsMobileMenuOpen(false)}
                  to="/login"
                >
                  로그인
                </Link>
                <Link
                  className="mobile-menu-item"
                  onClick={() => setIsMobileMenuOpen(false)}
                  to="/signup"
                >
                  회원가입
                </Link>
              </>
            )}
          </nav>
        </aside>
      </div>
    </header>
  )
}

export default memo(Navbar)
