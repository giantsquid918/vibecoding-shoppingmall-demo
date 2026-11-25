import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAdminAccess } from '../hooks/useAdminAccess.js'
import { clearAccessToken, getAccessToken } from '../utils/authStorage.js'

const currencyFormatter = new Intl.NumberFormat('ko-KR')

const orderFilters = [
  { id: 'all', label: '전체' },
  { id: 'processing', label: '처리중' },
  { id: 'shipping', label: '배송중' },
  { id: 'completed', label: '완료' },
  { id: 'cancelled', label: '취소' },
]

function getFilterForView(view) {
  if (view === 'status') return 'processing'
  if (view === 'shipping') return 'shipping'
  if (view === 'completed') return 'completed'
  if (view === 'cancelled') return 'cancelled'
  return 'all'
}

function getOrderCategory(order) {
  if (order.fulfillmentStatus === 'cancelled') return 'cancelled'
  if (order.fulfillmentStatus === 'shipped') return 'shipping'
  if (order.fulfillmentStatus === 'delivered') return 'completed'
  if (['pending', 'preparing'].includes(order.fulfillmentStatus)) return 'processing'
  return 'other'
}

function getStatusLabel(status) {
  const labels = {
    pending: '결제 대기',
    preparing: '처리중',
    shipped: '배송중',
    delivered: '완료',
    cancelled: '취소',
  }
  return labels[status] || '상태 확인 중'
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

function getShippingAddress(address = {}) {
  return [
    address.postalCode ? `(${address.postalCode})` : '',
    address.address1,
    address.address2,
  ].filter(Boolean).join(' ')
}

function AdminOrderManagementPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const view = searchParams.get('view')
  const { status, errorMessage } = useAdminAccess()
  const [orders, setOrders] = useState([])
  const [loadStatus, setLoadStatus] = useState('loading')
  const [loadError, setLoadError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const activeFilter = getFilterForView(view)
  const [expandedOrder, setExpandedOrder] = useState('')
  const [editingShipping, setEditingShipping] = useState('')
  const [shippingForms, setShippingForms] = useState({})
  const [updatingOrder, setUpdatingOrder] = useState('')
  const [feedback, setFeedback] = useState({ message: '', type: '' })
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (status !== 'ready') return undefined

    const token = getAccessToken()
    if (!token) {
      navigate('/', { replace: true })
      return undefined
    }

    const controller = new AbortController()
    async function loadOrders() {
      try {
        const response = await fetch('/api/orders/admin', {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        })
        const result = await response.json()

        if (response.status === 401) {
          clearAccessToken()
          navigate('/', { replace: true })
          return
        }
        if (!response.ok) {
          throw new Error(result.message || '주문 목록을 불러오지 못했습니다.')
        }
        if (!Array.isArray(result.orders)) {
          throw new Error('주문 목록 응답 형식이 올바르지 않습니다.')
        }

        setOrders(result.orders)
        setLoadStatus('ready')
        setLoadError('')
      } catch (error) {
        if (error.name === 'AbortError') return
        setLoadError(
          error instanceof TypeError
            ? '서버에 연결할 수 없어 주문 목록을 불러오지 못했습니다.'
            : error.message || '주문 목록을 불러오지 못했습니다.',
        )
        setLoadStatus('error')
      }
    }

    loadOrders()
    return () => controller.abort()
  }, [navigate, reloadKey, status])

  const filteredOrders = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLocaleLowerCase()
    return orders.filter((order) => {
      const customer = order.customerSnapshot || {}
      const matchesSearch = !normalizedSearch || [
        order.orderNumber,
        customer.name,
        customer.email,
        order.shippingAddress?.phone,
      ].some((value) => String(value || '').toLocaleLowerCase().includes(normalizedSearch))
      const matchesFilter = activeFilter === 'all'
        || getOrderCategory(order) === activeFilter
      return matchesSearch && matchesFilter
    })
  }, [activeFilter, orders, searchTerm])

  async function sendOrderUpdate(order, endpoint, body, successMessage) {
    const token = getAccessToken()
    if (!token) {
      clearAccessToken()
      navigate('/', { replace: true })
      return
    }

    setUpdatingOrder(order.orderNumber)
    setFeedback({ message: '', type: '' })
    try {
      const response = await fetch(
        `/api/orders/${encodeURIComponent(order.orderNumber)}/${endpoint}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
      )
      const result = await response.json()

      if (response.status === 401) {
        clearAccessToken()
        navigate('/', { replace: true })
        return
      }
      if (response.status === 403) {
        throw new Error('관리자 권한이 없어 주문을 변경할 수 없습니다.')
      }
      if (!response.ok) {
        throw new Error(result.message || '주문 정보를 변경하지 못했습니다.')
      }

      setOrders((current) => current.map((item) =>
        item.orderNumber === order.orderNumber ? result.order : item,
      ))
      setFeedback({
        message: result.refundRequired
          ? '주문을 취소했습니다. 결제 환불은 별도로 처리해야 합니다.'
          : successMessage,
        type: result.refundRequired ? 'warning' : 'success',
      })
      setEditingShipping('')
    } catch (error) {
      setFeedback({
        message: error instanceof TypeError
          ? '서버에 연결할 수 없어 주문을 변경하지 못했습니다.'
          : error.message || '주문 정보를 변경하지 못했습니다.',
        type: 'error',
      })
    } finally {
      setUpdatingOrder('')
    }
  }

  function startShippingEdit(order) {
    setEditingShipping(order.orderNumber)
    setShippingForms((current) => ({
      ...current,
      [order.orderNumber]: {
        carrier: order.shipping?.carrier || '',
        trackingNumber: order.shipping?.trackingNumber || '',
      },
    }))
  }

  function updateShippingField(orderNumber, field, value) {
    setShippingForms((current) => ({
      ...current,
      [orderNumber]: {
        ...current[orderNumber],
        [field]: value,
      },
    }))
  }

  function submitShipping(event, order) {
    event.preventDefault()
    const form = shippingForms[order.orderNumber] || {}
    sendOrderUpdate(
      order,
      'shipping',
      { carrier: form.carrier || '', trackingNumber: form.trackingNumber || '' },
      '배송 정보가 저장되었습니다.',
    )
  }

  function changeStatusDirectly(order, fulfillmentStatus) {
    if (
      fulfillmentStatus === 'cancelled'
      && !window.confirm(
        order.payment?.status === 'paid'
          ? '주문을 취소할까요? 결제 환불은 별도로 처리해야 합니다.'
          : '이 주문을 취소할까요?',
      )
    ) {
      return
    }

    sendOrderUpdate(
      order,
      'status',
      { fulfillmentStatus },
      `주문 상태를 ${getStatusLabel(fulfillmentStatus)}(으)로 변경했습니다.`,
    )
  }

  if (status === 'loading') {
    return (
      <main className="admin-page">
        <p className="admin-status" role="status">관리자 정보를 확인하고 있습니다.</p>
      </main>
    )
  }

  if (status === 'error') {
    return (
      <main className="admin-page">
        <section className="admin-error" role="alert">
          <p>{errorMessage}</p>
          <Link className="admin-return-button" to="/admin/products">대시보드로 돌아가기</Link>
        </section>
      </main>
    )
  }

  return (
    <main className="order-admin-page">
      <header className="order-admin-header">
        <Link aria-label="관리자 대시보드로 돌아가기" to="/admin/products">←</Link>
        <h1>주문 관리</h1>
      </header>

      <section aria-label="주문 검색 및 필터" className="order-admin-toolbar">
        <label className="order-admin-search">
          <span aria-hidden="true">⌕</span>
          <span className="visually-hidden">주문번호 또는 고객명 검색</span>
          <input
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="주문번호 또는 고객명으로 검색..."
            type="search"
            value={searchTerm}
          />
        </label>
        <button
          className="order-admin-reload"
          disabled={loadStatus === 'loading'}
          onClick={() => {
            setLoadStatus('loading')
            setReloadKey((current) => current + 1)
          }}
          type="button"
        >
          새로고침
        </button>
        <nav aria-label="주문 상태 필터" className="order-admin-filters">
          {orderFilters.map((filter) => (
            <button
              aria-pressed={activeFilter === filter.id}
              className={activeFilter === filter.id ? 'order-admin-filter is-active' : 'order-admin-filter'}
              key={filter.id}
              onClick={() => setSearchParams(
                filter.id === 'all'
                  ? {}
                  : { view: filter.id === 'processing' ? 'status' : filter.id },
              )}
              type="button"
            >
              {filter.label}
            </button>
          ))}
        </nav>
      </section>

      {feedback.message && (
        <p
          className={`order-admin-feedback order-admin-feedback-${feedback.type}`}
          role={feedback.type === 'error' ? 'alert' : 'status'}
        >
          {feedback.message}
        </p>
      )}

      {loadStatus === 'loading' ? (
        <p className="order-admin-state" role="status">주문 목록을 불러오는 중입니다.</p>
      ) : loadStatus === 'error' ? (
        <section className="order-admin-state order-admin-state-error" role="alert">
          <p>{loadError}</p>
          <button
            onClick={() => {
              setLoadStatus('loading')
              setReloadKey((current) => current + 1)
            }}
            type="button"
          >
            다시 시도
          </button>
        </section>
      ) : filteredOrders.length === 0 ? (
        <p className="order-admin-state">조건에 맞는 주문이 없습니다.</p>
      ) : (
        <section aria-label="주문 목록" className="order-admin-list">
          {filteredOrders.map((order) => {
            const customer = order.customerSnapshot || {}
            const address = order.shippingAddress || {}
            const itemCount = order.items.reduce((total, item) => total + item.quantity, 0)
            const shippingForm = shippingForms[order.orderNumber] || {}
            const isUpdating = updatingOrder === order.orderNumber

            return (
              <article className="order-admin-card" key={order.orderNumber}>
                <header className="order-admin-card-header">
                  <div className="order-admin-order-title">
                    <span aria-hidden="true" className={`order-admin-status-icon status-${order.fulfillmentStatus}`}>
                      {order.fulfillmentStatus === 'shipped' ? '▣' : '◷'}
                    </span>
                    <div>
                      <h2>{order.orderNumber}</h2>
                      <p>{customer.name || '고객'} · {formatOrderDate(order.createdAt)}</p>
                    </div>
                  </div>
                  <div className="order-admin-card-tools">
                    <span className={`order-admin-status-badge status-${order.fulfillmentStatus}`}>
                      {getStatusLabel(order.fulfillmentStatus)}
                    </span>
                    <strong>{currencyFormatter.format(order.amounts?.totalAmount ?? 0)}원</strong>
                    <button
                      aria-expanded={expandedOrder === order.orderNumber}
                      className="order-admin-detail-button"
                      onClick={() => setExpandedOrder((current) =>
                        current === order.orderNumber ? '' : order.orderNumber,
                      )}
                      type="button"
                    >
                      {expandedOrder === order.orderNumber ? '닫기' : '상세보기'}
                    </button>
                  </div>
                </header>

                <div className="order-admin-summary">
                  <div>
                    <span>고객 정보</span>
                    <strong>{customer.email || '이메일 없음'}</strong>
                    <strong>{address.phone || '연락처 없음'}</strong>
                  </div>
                  <div>
                    <span>주문 상품</span>
                    <strong>{order.items.length}종 · 총 {itemCount}개</strong>
                  </div>
                  <div>
                    <span>배송 주소</span>
                    <strong>{getShippingAddress(address) || '배송 주소 없음'}</strong>
                  </div>
                </div>

                {editingShipping === order.orderNumber && (
                  <form
                    className="order-admin-shipping-form"
                    onSubmit={(event) => submitShipping(event, order)}
                  >
                    <label>
                      택배사
                      <input
                        maxLength="80"
                        onChange={(event) => updateShippingField(
                          order.orderNumber,
                          'carrier',
                          event.target.value,
                        )}
                        required
                        value={shippingForm.carrier || ''}
                      />
                    </label>
                    <label>
                      운송장 번호
                      <input
                        maxLength="100"
                        onChange={(event) => updateShippingField(
                          order.orderNumber,
                          'trackingNumber',
                          event.target.value,
                        )}
                        required
                        value={shippingForm.trackingNumber || ''}
                      />
                    </label>
                    <div className="order-admin-action-buttons">
                      <button className="order-admin-primary-button" disabled={isUpdating} type="submit">
                        {isUpdating ? '저장 중...' : '배송 정보 저장'}
                      </button>
                      <button
                        className="order-admin-secondary-button"
                        onClick={() => setEditingShipping('')}
                        type="button"
                      >
                        취소
                      </button>
                    </div>
                  </form>
                )}

                <div className="order-admin-actions">
                  {order.fulfillmentStatus === 'preparing' && (
                    <button
                      className="order-admin-primary-button"
                      disabled={isUpdating}
                      onClick={() => startShippingEdit(order)}
                      type="button"
                    >
                      배송 시작
                    </button>
                  )}
                  {order.fulfillmentStatus === 'shipped' && (
                    <>
                      <button
                        className="order-admin-primary-button"
                        disabled={isUpdating}
                        onClick={() => startShippingEdit(order)}
                        type="button"
                      >
                        배송 정보 수정
                      </button>
                      <button
                        className="order-admin-secondary-button"
                        disabled={isUpdating}
                        onClick={() => changeStatusDirectly(order, 'delivered')}
                        type="button"
                      >
                        배송 완료 처리
                      </button>
                    </>
                  )}
                  {!['cancelled', 'delivered'].includes(order.fulfillmentStatus) && (
                    <button
                      className="order-admin-secondary-button"
                      disabled={isUpdating}
                      onClick={() => changeStatusDirectly(order, 'cancelled')}
                      type="button"
                    >
                      주문 취소
                    </button>
                  )}
                </div>

                {expandedOrder === order.orderNumber && (
                  <section aria-label={`${order.orderNumber} 상세 정보`} className="order-admin-details">
                    <div className="order-admin-detail-columns">
                      <div>
                        <h3>주문 상품</h3>
                        {order.items.map((item, index) => (
                          <div className="order-admin-product" key={`${item.productId}-${index}`}>
                            {item.image && <img alt="" src={item.image} />}
                            <div>
                              <strong>{item.name}</strong>
                              <span>{item.quantity}개 × {currencyFormatter.format(item.unitPrice)}원</span>
                            </div>
                            <strong>
                              {currencyFormatter.format(item.lineTotal ?? item.unitPrice * item.quantity)}원
                            </strong>
                          </div>
                        ))}
                        <p className="order-admin-payment-info">
                          결제: {order.payment?.status === 'paid' ? '결제 완료' : getStatusLabel(order.payment?.status)}
                          {order.payment?.method ? ` · ${order.payment.method}` : ''}
                        </p>
                      </div>
                      <div>
                        <h3>배송 정보</h3>
                        <p>수령인: {address.recipientName || '정보 없음'}</p>
                        <p>주소: {getShippingAddress(address) || '주소 없음'}</p>
                        <p>택배사: {order.shipping?.carrier || '미등록'}</p>
                        <p>운송장 번호: {order.shipping?.trackingNumber || '미등록'}</p>
                      </div>
                    </div>

                  </section>
                )}
              </article>
            )
          })}
        </section>
      )}
    </main>
  )
}

export default AdminOrderManagementPage
