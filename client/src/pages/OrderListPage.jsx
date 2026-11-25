import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import LogoutConfirmDialog from '../components/LogoutConfirmDialog.jsx'
import Navbar from '../components/Navbar.jsx'
import { useStoreSession } from '../hooks/useStoreSession.js'
import { clearAccessToken, getAccessToken } from '../utils/authStorage.js'

const priceFormatter = new Intl.NumberFormat('ko-KR')

const orderFilters = [
  { id: 'all', label: '전체' },
  { id: 'processing', label: '처리중' },
  { id: 'shipping', label: '배송중' },
  { id: 'completed', label: '배송 완료' },
  { id: 'cancelled', label: '주문 취소' },
]

function getOrderCategory(order) {
  if (order.fulfillmentStatus === 'cancelled' || ['cancelled', 'failed', 'refunded'].includes(order.payment?.status)) {
    return 'cancelled'
  }
  if (order.fulfillmentStatus === 'shipped') return 'shipping'
  if (order.fulfillmentStatus === 'delivered') return 'completed'
  if (['pending', 'preparing'].includes(order.fulfillmentStatus)) return 'processing'
  return 'other'
}

function getOrderStatusLabel(order) {
  if (order.fulfillmentStatus === 'cancelled' || ['cancelled', 'failed', 'refunded'].includes(order.payment?.status)) {
    return '취소'
  }
  if (order.payment?.status === 'pending') return '결제 대기'
  if (order.fulfillmentStatus === 'pending' || order.fulfillmentStatus === 'preparing') {
    return '처리중'
  }
  if (order.fulfillmentStatus === 'shipped') return '배송중'
  if (order.fulfillmentStatus === 'delivered') return '배송 완료'
  if (order.fulfillmentStatus === 'cancelled') return '취소'
  return '상태 확인 중'
}

function formatOrderDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '날짜 확인 중'

  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function getDeliveryMessage(order) {
  if (order.fulfillmentStatus === 'cancelled' || ['cancelled', 'failed', 'refunded'].includes(order.payment?.status)) {
    return '취소된 주문은 배송되지 않습니다.'
  }
  if (order.payment?.status === 'pending') {
    return '결제가 확인되면 배송이 시작됩니다.'
  }
  if (order.fulfillmentStatus === 'delivered') {
    return '상품 배송이 완료되었습니다.'
  }

  const startDate = new Date(order.createdAt)
  if (Number.isNaN(startDate.getTime())) return '예상 도착일을 확인할 수 없습니다.'

  const endDate = new Date(startDate)
  startDate.setDate(startDate.getDate() + 5)
  endDate.setDate(endDate.getDate() + 7)
  const dateFormatter = new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return `예상 도착일: ${dateFormatter.format(startDate)} ~ ${dateFormatter.format(endDate)}`
}

function shouldShowDeliveryPeriod(order) {
  return ['preparing', 'shipped'].includes(order.fulfillmentStatus)
    && order.payment?.status === 'paid'
}

function OrderListPage() {
  const {
    currentUser,
    handleLogout,
    isAdmin,
    isLoadingUser,
    isLoggedIn,
    userError,
  } = useStoreSession()
  const [orders, setOrders] = useState([])
  const [activeFilter, setActiveFilter] = useState('all')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const token = getAccessToken()
  const displayName = currentUser?.nickname?.trim() || currentUser?.username || ''

  useEffect(() => {
    const controller = new AbortController()

    async function loadOrders() {
      if (!token) {
        setError('주문 목록을 보려면 로그인해 주세요.')
        setIsLoading(false)
        return
      }

      try {
        const response = await fetch('/api/orders', {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        })
        const result = await response.json()

        if (response.status === 401) {
          clearAccessToken()
          throw new Error('로그인 시간이 만료되었습니다. 다시 로그인해 주세요.')
        }
        if (!response.ok) {
          throw new Error(result.message || '주문 목록을 불러오지 못했습니다.')
        }
        if (!Array.isArray(result.orders)) {
          throw new Error('주문 목록 응답 형식이 올바르지 않습니다.')
        }

        setOrders(result.orders)
      } catch (requestError) {
        if (requestError.name === 'AbortError') return
        setError(
          requestError instanceof TypeError
            ? '서버에 연결할 수 없어 주문 목록을 불러오지 못했습니다.'
            : requestError.message || '주문 목록을 불러오지 못했습니다.',
        )
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }

    loadOrders()
    return () => controller.abort()
  }, [token])

  const filteredOrders = useMemo(
    () => activeFilter === 'all'
      ? orders
      : orders.filter((order) => getOrderCategory(order) === activeFilter),
    [activeFilter, orders],
  )

  return (
    <main className="order-list-page">
      <Navbar
        displayName={displayName}
        isAdmin={isAdmin}
        isLoadingUser={isLoadingUser}
        isLoggedIn={isLoggedIn}
        onLogoutRequest={() => setShowLogoutConfirm(true)}
      />
      {userError && <p className="profile-load-error" role="alert">{userError}</p>}

      <section aria-labelledby="order-list-title" className="order-list-content">
        <h1 id="order-list-title">주문 목록</h1>
        <nav aria-label="주문 상태 필터" className="order-list-filters">
          {orderFilters.map((filter) => (
            <button
              aria-pressed={activeFilter === filter.id}
              className={activeFilter === filter.id ? 'order-list-filter is-active' : 'order-list-filter'}
              key={filter.id}
              onClick={() => setActiveFilter(filter.id)}
              type="button"
            >
              {filter.label}
            </button>
          ))}
        </nav>

        {isLoading ? (
          <p aria-live="polite" className="order-list-message">주문 목록을 불러오는 중입니다.</p>
        ) : error ? (
          <section aria-live="polite" className="order-list-message order-list-error">
            <p>{error}</p>
            <Link to="/login">로그인하기</Link>
          </section>
        ) : filteredOrders.length === 0 ? (
          <section className="order-list-message">
            <p>
              {activeFilter === 'all'
                ? '주문 내역이 없습니다.'
                : activeFilter === 'cancelled'
                  ? '취소된 주문이 없습니다.'
                  : '해당 상태의 주문이 없습니다.'}
            </p>
            <Link to="/">쇼핑 계속하기</Link>
          </section>
        ) : (
          <div aria-live="polite" className="order-list-cards">
            {filteredOrders.map((order) => (
              <article className="order-list-card" key={order.orderNumber}>
                <header className="order-list-card-header">
                  <div className="order-list-order-heading">
                    {order.fulfillmentStatus !== 'cancelled' && (
                      <span
                        aria-hidden="true"
                        className={`order-list-status-icon status-${order.fulfillmentStatus}`}
                      >
                        {order.fulfillmentStatus === 'delivered' ? '✓' : '◷'}
                      </span>
                    )}
                    <div>
                      <h2>주문 #{order.orderNumber}</h2>
                      <p>주문일: {formatOrderDate(order.createdAt)}</p>
                    </div>
                  </div>
                  <div className="order-list-order-status">
                    <span className={`order-list-status-badge status-${order.fulfillmentStatus}`}>
                      {getOrderStatusLabel(order)}
                    </span>
                  </div>
                </header>

                <p className="order-list-delivery-estimate">
                  <span aria-hidden="true">🚚</span>
                  {getDeliveryMessage(order)}
                  {shouldShowDeliveryPeriod(order) && (
                    <span className="order-list-delivery-period">배송 기간: 5~7일 소요</span>
                  )}
                </p>

                <div className="order-list-items">
                  {order.items.map((item, index) => (
                    <article
                      className="order-list-item"
                      key={`${item.productId || item.name}-${index}`}
                    >
                      <div className="order-list-item-image">
                        {item.image ? <img alt={item.name} src={item.image} /> : <span>이미지 없음</span>}
                      </div>
                      <div className="order-list-item-details">
                        <strong>{item.name}</strong>
                        <span>수량: {item.quantity}개</span>
                      </div>
                      <strong className="order-list-item-price">
                        {priceFormatter.format(item.lineTotal ?? item.unitPrice * item.quantity)}원
                      </strong>
                    </article>
                  ))}
                </div>
                <footer className="order-list-total">
                  <span className="order-list-shipping-fee">
                    배송비 {order.amounts?.shippingFee
                      ? `${priceFormatter.format(order.amounts.shippingFee)}원`
                      : '무료'}
                  </span>
                  <div className="order-list-total-amount">
                    <span>총 결제 금액</span>
                    <strong>{priceFormatter.format(order.amounts?.totalAmount ?? 0)}원</strong>
                  </div>
                </footer>
              </article>
            ))}
          </div>
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

export default OrderListPage
