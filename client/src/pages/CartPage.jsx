import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import LogoutConfirmDialog from '../components/LogoutConfirmDialog.jsx'
import Navbar from '../components/Navbar.jsx'
import { useStoreSession } from '../hooks/useStoreSession.js'
import { getAccessToken } from '../utils/authStorage.js'
import { notifyCartUpdated } from '../utils/cartEvents.js'

const priceFormatter = new Intl.NumberFormat('ko-KR')

function CartPage() {
  const {
    currentUser,
    handleLogout,
    isAdmin,
    isLoadingUser,
    isLoggedIn,
    userError,
  } = useStoreSession()
  const [cart, setCart] = useState(null)
  const [loadStatus, setLoadStatus] = useState('loading')
  const [cartError, setCartError] = useState('')
  const [actionError, setActionError] = useState('')
  const [pendingProductId, setPendingProductId] = useState('')
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)

  useEffect(() => {
    if (!isLoggedIn) return undefined

    const token = getAccessToken()
    if (!token) return undefined

    const controller = new AbortController()
    async function loadCart() {
      try {
        const response = await fetch('/api/cart', {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        })
        const result = await response.json()
        if (!response.ok) {
          throw new Error(result.message || '장바구니를 불러오지 못했습니다.')
        }
        if (!Array.isArray(result.items)) {
          throw new Error('장바구니 응답 형식이 올바르지 않습니다.')
        }

        setCart(result)
        setLoadStatus('ready')
      } catch (error) {
        if (error.name === 'AbortError') return
        setCartError(
          error instanceof TypeError
            ? '서버에 연결할 수 없어 장바구니를 불러오지 못했습니다.'
            : error.message || '장바구니를 불러오지 못했습니다.',
        )
        setLoadStatus('error')
      }
    }

    loadCart()
    return () => controller.abort()
  }, [isLoggedIn])

  async function changeCartItem(productId, method, quantity) {
    const token = getAccessToken()
    if (!token) {
      setActionError('로그인 시간이 만료되었습니다. 다시 로그인해 주세요.')
      return
    }

    setPendingProductId(productId)
    setActionError('')
    try {
      const request = {
        method,
        headers: { Authorization: `Bearer ${token}` },
      }
      if (quantity !== undefined) {
        request.headers['Content-Type'] = 'application/json'
        request.body = JSON.stringify({ quantity })
      }

      const response = await fetch(
        `/api/cart/items/${encodeURIComponent(productId)}`,
        request,
      )
      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.message || '장바구니를 변경하지 못했습니다.')
      }

      setCart(result)
      notifyCartUpdated()
    } catch (error) {
      setActionError(
        error instanceof TypeError
          ? '서버에 연결할 수 없어 장바구니를 변경하지 못했습니다.'
          : error.message || '장바구니를 변경하지 못했습니다.',
      )
    } finally {
      setPendingProductId('')
    }
  }

  function confirmLogout() {
    setShowLogoutConfirm(false)
    handleLogout()
  }

  const displayName = currentUser?.nickname?.trim() || currentUser?.username || ''
  const missingAccessToken = isLoggedIn && !getAccessToken()
  const productTotal = cart?.items.reduce(
    (total, item) => total + (item.lineTotal ?? item.unitPrice * item.quantity),
    0,
  ) ?? 0
  const totalQuantity = cart?.items.reduce((count, item) => count + item.quantity, 0) ?? 0
  const shippingFee = productTotal < 50000 ? 2500 : 0
  const paymentTotal = productTotal + shippingFee

  return (
    <main className="cart-page">
      <Navbar
        displayName={displayName}
        isAdmin={isAdmin}
        isLoadingUser={isLoadingUser}
        isLoggedIn={isLoggedIn}
        onLogoutRequest={() => setShowLogoutConfirm(true)}
      />
      {userError && <p className="profile-load-error" role="alert">{userError}</p>}

      <section aria-labelledby="cart-title" className="cart-content">
        <h1 id="cart-title">장바구니</h1>
        {!isLoggedIn ? (
          <div className="cart-state">
            <p>장바구니를 확인하려면 로그인해 주세요.</p>
            <Link className="cart-primary-link" to="/login">로그인</Link>
          </div>
        ) : missingAccessToken ? (
          <div className="cart-state cart-error" role="alert">
            <p>로그인 시간이 만료되었습니다. 다시 로그인해 주세요.</p>
            <Link className="cart-primary-link" to="/login">로그인</Link>
          </div>
        ) : loadStatus === 'loading' ? (
          <p className="cart-state" role="status">장바구니를 불러오는 중입니다.</p>
        ) : loadStatus === 'error' ? (
          <div className="cart-state cart-error" role="alert">
            <p>{cartError}</p>
          </div>
        ) : cart?.items.length ? (
          <div className="cart-layout">
            <div className="cart-items">
              {cart.items.map((item) => {
                const product = item.product
                const productId = product?.productId
                const lineTotal = item.lineTotal ?? item.unitPrice * item.quantity
                const isPending = pendingProductId === productId

                return (
                  <article className="cart-item" key={productId || item._id}>
                    <Link
                      aria-label={product ? `${product.name} 상품 상세` : '상품 정보 없음'}
                      className="cart-item-image"
                      to={productId ? `/products/${encodeURIComponent(productId)}` : '/'}
                    >
                      {product?.image ? (
                        <img alt={product.name} src={product.image} />
                      ) : (
                        <span>이미지 없음</span>
                      )}
                    </Link>
                    <div className="cart-item-details">
                      <div className="cart-item-heading">
                        <div>
                          <p className="cart-item-sku">{product?.productId || '삭제된 상품'}</p>
                          <h2>{product?.name || '상품 정보를 찾을 수 없습니다.'}</h2>
                        </div>
                        {productId && (
                          <button
                            aria-label={`${product?.name || '상품'} 삭제`}
                            className="cart-remove-button"
                            disabled={isPending}
                            onClick={() => changeCartItem(productId, 'DELETE')}
                            type="button"
                          >
                            삭제
                          </button>
                        )}
                      </div>
                      <p className="cart-item-unit-price">
                        개당 {priceFormatter.format(item.unitPrice)}원
                      </p>
                      <div className="cart-item-footer">
                        <div aria-label="수량 조절" className="cart-quantity-control">
                          <button
                            aria-label="수량 감소"
                            disabled={isPending || item.quantity <= 1 || !productId}
                            onClick={() => changeCartItem(productId, 'PATCH', item.quantity - 1)}
                            type="button"
                          >
                            −
                          </button>
                          <output aria-live="polite">{item.quantity}</output>
                          <button
                            aria-label="수량 증가"
                            disabled={isPending || !productId}
                            onClick={() => changeCartItem(productId, 'PATCH', item.quantity + 1)}
                            type="button"
                          >
                            +
                          </button>
                        </div>
                        <strong className="cart-item-line-total">
                          {priceFormatter.format(lineTotal)}원
                        </strong>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
            <aside aria-labelledby="cart-summary-title" className="cart-order-summary">
              <h2 id="cart-summary-title">주문 요약</h2>
              <div className="cart-summary-row">
                <span>상품 수량 ({totalQuantity}개)</span>
                <strong>{priceFormatter.format(productTotal)}원</strong>
              </div>
              <div className="cart-summary-row">
                <span>배송비</span>
                <strong className={shippingFee === 0 ? 'cart-shipping-free' : ''}>
                  {shippingFee === 0 ? '무료' : `${priceFormatter.format(shippingFee)}원`}
                </strong>
              </div>
              <div className="cart-shipping-details">
                <p>배송</p>
                <div className="product-shipping-note">
                  <strong>50,000원 이상 구매 시 무료배송</strong>
                  <span>배송 기간: 5 - 7일 소요</span>
                </div>
                <p>14일 이내 국내 무료반품</p>
              </div>
              <div className="cart-summary-total">
                <span>총 결제금액</span>
                <strong>{priceFormatter.format(paymentTotal)}원</strong>
              </div>
              {actionError && <p className="cart-action-error" role="alert">{actionError}</p>}
              <Link className="cart-checkout-button" to="/checkout">
                결제하기
              </Link>
              <Link className="cart-shopping-continue" to="/">쇼핑 계속하기</Link>
            </aside>
          </div>
        ) : (
          <div className="cart-state">
            <p>장바구니가 비어 있습니다.</p>
            <Link className="cart-primary-link" to="/">상품 보러 가기</Link>
          </div>
        )}
      </section>
      <LogoutConfirmDialog
        onCancel={() => setShowLogoutConfirm(false)}
        onConfirm={confirmLogout}
        open={showLogoutConfirm}
      />
    </main>
  )
}

export default CartPage
