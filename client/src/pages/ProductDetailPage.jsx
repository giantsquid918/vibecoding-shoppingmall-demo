import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import LogoutConfirmDialog from '../components/LogoutConfirmDialog.jsx'
import Navbar from '../components/Navbar.jsx'
import { useStoreSession } from '../hooks/useStoreSession.js'
import { getAccessToken } from '../utils/authStorage.js'
import { notifyCartUpdated } from '../utils/cartEvents.js'

const priceFormatter = new Intl.NumberFormat('ko-KR')

function AccordionSection({ children, expanded, id, onToggle, title }) {
  return (
    <section className="detail-accordion-section">
      <button
        aria-controls={`${id}-content`}
        aria-expanded={expanded}
        className="detail-accordion-toggle"
        onClick={onToggle}
        type="button"
      >
        <span>{title}</span>
        <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
          <path d={expanded ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'} />
        </svg>
      </button>
      {expanded && (
        <div className="detail-accordion-content" id={`${id}-content`}>
          {children}
        </div>
      )}
    </section>
  )
}

function ProductDetailPage() {
  const { productId } = useParams()
  const {
    currentUser,
    handleLogout,
    isAdmin,
    isLoadingUser,
    isLoggedIn,
    userError,
  } = useStoreSession()
  const [product, setProduct] = useState(null)
  const [loadStatus, setLoadStatus] = useState('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [cartError, setCartError] = useState('')
  const [isAddingToCart, setIsAddingToCart] = useState(false)
  const [isCartAddedDialogOpen, setIsCartAddedDialogOpen] = useState(false)
  const [expandedSections, setExpandedSections] = useState({ shipping: true })
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const requestLogout = useCallback(() => setShowLogoutConfirm(true), [])

  function confirmLogout() {
    setShowLogoutConfirm(false)
    handleLogout()
  }

  useEffect(() => {
    const controller = new AbortController()
    async function loadProduct() {
      try {
        const response = await fetch(
          `/api/products/${encodeURIComponent(productId)}`,
          { signal: controller.signal },
        )
        const result = await response.json()
        if (!response.ok) {
          throw new Error(
            response.status === 404
              ? '상품을 찾을 수 없습니다.'
              : result.message || '상품 정보를 불러오지 못했습니다.',
          )
        }

        setProduct(result)
        setLoadStatus('ready')
      } catch (error) {
        if (error.name === 'AbortError') return
        setErrorMessage(
          error instanceof TypeError
            ? '서버에 연결할 수 없어 상품 정보를 불러오지 못했습니다.'
            : error.message || '상품 정보를 불러오지 못했습니다.',
        )
        setLoadStatus('error')
      }
    }

    loadProduct()
    return () => controller.abort()
  }, [productId])

  function toggleSection(section) {
    setExpandedSections((current) => ({ ...current, [section]: !current[section] }))
  }

  async function addToCart() {
    const token = getAccessToken()
    if (!isLoggedIn || !token) {
      setCartError('장바구니에 담으려면 먼저 로그인해 주세요.')
      return
    }

    setIsAddingToCart(true)
    setCartError('')
    try {
      const response = await fetch('/api/cart/items', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ productId: product.productId, quantity }),
      })
      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.message || '장바구니에 상품을 담지 못했습니다.')
      }

      notifyCartUpdated()
      setIsCartAddedDialogOpen(true)
    } catch (error) {
      setCartError(
        error instanceof TypeError
          ? '서버에 연결할 수 없어 장바구니에 상품을 담지 못했습니다.'
          : error.message || '장바구니에 상품을 담지 못했습니다.',
      )
    } finally {
      setIsAddingToCart(false)
    }
  }

  return (
    <main className="product-detail-page">
      <Navbar
        displayName={currentUser?.nickname?.trim() || currentUser?.username || ''}
        isAdmin={isAdmin}
        isLoadingUser={isLoadingUser}
        isLoggedIn={isLoggedIn}
        onLogoutRequest={requestLogout}
      />
      {userError && <p className="profile-load-error" role="alert">{userError}</p>}

      {loadStatus === 'loading' && (
        <p className="product-detail-state" role="status">상품 정보를 불러오는 중입니다.</p>
      )}
      {loadStatus === 'error' && (
        <section className="product-detail-state product-detail-error" role="alert">
          <p>{errorMessage}</p>
          <Link className="product-detail-back-link" to="/">쇼핑몰로 돌아가기</Link>
        </section>
      )}
      {loadStatus === 'ready' && product && (
        <div className="product-detail-card">
          <div className="product-detail-image-wrap">
            {product.image ? (
              <img alt={product.name} className="product-detail-image" src={product.image} />
            ) : (
              <div className="product-detail-image-placeholder">이미지 없음</div>
            )}
          </div>

          <section aria-labelledby="product-detail-title" className="product-detail-info">
            <p className="product-detail-sku">{product.productId}</p>
            <h1 id="product-detail-title">{product.name}</h1>
            <p className="product-detail-price">
              {Number.isFinite(Number(product.price))
                ? `${priceFormatter.format(Number(product.price))}원`
                : '가격 정보 없음'}
            </p>

            <div aria-label="수량 선택" className="product-quantity-control">
              <button
                aria-label="수량 감소"
                disabled={quantity <= 1}
                onClick={() => setQuantity((current) => Math.max(1, current - 1))}
                type="button"
              >
                −
              </button>
              <output aria-live="polite">{quantity}</output>
              <button
                aria-label="수량 증가"
                onClick={() => setQuantity((current) => current + 1)}
                type="button"
              >
                +
              </button>
            </div>

            <button
              className="product-add-to-cart"
              disabled={isAddingToCart}
              onClick={addToCart}
              type="button"
            >
              <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                <path d="M5 8h14l1 13H4L5 8Z" />
                <path d="M9 9V6a3 3 0 0 1 6 0v3" />
              </svg>
              {isAddingToCart ? '담는 중...' : '장바구니에 담기'}
            </button>
            {cartError && <p className="product-cart-feedback" role="alert">{cartError}</p>}

            <div className="product-detail-accordions">
              <AccordionSection
                expanded={Boolean(expandedSections.shipping)}
                id="shipping"
                onToggle={() => toggleSection('shipping')}
                title="배송지 SOUTH KOREA"
              >
                <p>배송</p>
                <div className="product-shipping-note">
                  <strong>50,000원 이상 구매 시 무료배송</strong>
                  <span>배송 기간: 5 - 7일 소요</span>
                </div>
                <p>14일 이내 국내 무료반품</p>
              </AccordionSection>

              <AccordionSection
                expanded={Boolean(expandedSections.details)}
                id="details"
                onToggle={() => toggleSection('details')}
                title="제품 상세사항"
              >
                <p>{product.description || '등록된 상품 설명이 없습니다.'}</p>
                <dl className="product-detail-specs">
                  <dt>상품 ID</dt>
                  <dd>{product.productId}</dd>
                  <dt>카테고리</dt>
                  <dd>{product.category}</dd>
                </dl>
              </AccordionSection>

              <AccordionSection
                expanded={Boolean(expandedSections.care)}
                id="care"
                onToggle={() => toggleSection('care')}
                title="세탁방법"
              >
                <p>제품 라벨에 표기된 세탁 방법을 따라 주세요.</p>
              </AccordionSection>
            </div>
          </section>
        </div>
      )}
      <LogoutConfirmDialog
        onCancel={() => setShowLogoutConfirm(false)}
        onConfirm={confirmLogout}
        open={showLogoutConfirm}
      />
      {isCartAddedDialogOpen && product && (
        <div className="logout-confirm-backdrop">
          <section
            aria-labelledby="cart-added-title"
            aria-modal="true"
            className="logout-confirm-dialog"
            onKeyDown={(event) => {
              if (event.key === 'Escape') setIsCartAddedDialogOpen(false)
            }}
            role="dialog"
          >
            <h2 id="cart-added-title">장바구니에 담았습니다</h2>
            <p>{product.name} {quantity}개를 장바구니에 담았습니다.</p>
            <div className="logout-confirm-actions">
              <button
                autoFocus
                className="logout-cancel-button"
                onClick={() => setIsCartAddedDialogOpen(false)}
                type="button"
              >
                계속 쇼핑하기
              </button>
              <Link className="primary-button" onClick={() => setIsCartAddedDialogOpen(false)} to="/cart">
                장바구니 보기
              </Link>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}

export default ProductDetailPage
