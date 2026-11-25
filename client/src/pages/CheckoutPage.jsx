import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useStoreSession } from '../hooks/useStoreSession.js'
import { getAccessToken } from '../utils/authStorage.js'

const priceFormatter = new Intl.NumberFormat('ko-KR')
const portoneStoreId = 'imp08400369'
const portonePg = import.meta.env.VITE_PORTONE_PG || 'html5_inicis.INIpayTest'

const portonePaymentMethods = {
  card: 'card',
  bank_transfer: 'trans',
  virtual_account: 'vbank',
  mobile_payment: 'phone',
}

const paymentOptions = [
  { value: 'card', label: '신용카드' },
  { value: 'bank_transfer', label: '계좌이체' },
  { value: 'virtual_account', label: '가상계좌' },
  { value: 'mobile_payment', label: '휴대폰 결제' },
]

function formatPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  return phone || ''
}

async function postAuthorizedJson(url, token, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const result = await response.json()
  if (!response.ok) {
    throw new Error(result.message || '요청을 처리하지 못했습니다.')
  }
  return result
}

async function verifyOrderPayment(token, orderNumber, impUid) {
  const response = await fetch(`/api/orders/${encodeURIComponent(orderNumber)}/verify-payment`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ imp_uid: impUid }),
  })
  const result = await response.json()
  if (!response.ok && response.status !== 202) {
    const error = new Error(result.message || '결제 확인에 실패했습니다.')
    error.status = response.status
    throw error
  }
  return result
}

function CheckoutPage() {
  const { currentUser, isLoggedIn } = useStoreSession()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const processedRedirectRef = useRef('')
  const [cart, setCart] = useState(null)
  const [loadStatus, setLoadStatus] = useState('loading')
  const [loadError, setLoadError] = useState('')
  const [submitMessage, setSubmitMessage] = useState('')
  const [isPaying, setIsPaying] = useState(false)
  const [isPaymentReady, setIsPaymentReady] = useState(false)
  const [paymentResult, setPaymentResult] = useState(null)
  const [unverifiedPayment, setUnverifiedPayment] = useState(null)
  const [checkoutKey, setCheckoutKey] = useState(() => globalThis.crypto.randomUUID())
  const [activeTerms, setActiveTerms] = useState('')
  const [paymentInitError, setPaymentInitError] = useState('')
  const [form, setForm] = useState({
    customerName: null,
    email: null,
    recipientName: null,
    phone: null,
    postalCode: '',
    address1: null,
    address2: '',
    deliveryNote: '',
    paymentMethod: 'card',
  })

  useEffect(() => {
    let isActive = true

    Promise.resolve()
      .then(() => {
        if (typeof window.IMP?.init !== 'function') {
          throw new Error('포트원 결제 SDK를 불러오지 못했습니다.')
        }

        window.IMP.init(portoneStoreId)
        if (!isActive) return
        setIsPaymentReady(true)
      })
      .catch((error) => {
        if (!isActive) return
        setPaymentInitError(
          error instanceof Error
            ? error.message
            : '포트원 결제 모듈을 초기화하지 못했습니다.',
        )
      })

    return () => {
      isActive = false
    }
  }, [])

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
          throw new Error(result.message || '주문 상품을 불러오지 못했습니다.')
        }
        if (!Array.isArray(result.items)) {
          throw new Error('장바구니 응답 형식이 올바르지 않습니다.')
        }

        setCart(result)
        setLoadStatus('ready')
      } catch (error) {
        if (error.name === 'AbortError') return
        setLoadError(
          error instanceof TypeError
            ? '서버에 연결할 수 없어 주문 상품을 불러오지 못했습니다.'
            : error.message || '주문 상품을 불러오지 못했습니다.',
        )
        setLoadStatus('error')
      }
    }

    loadCart()
    return () => controller.abort()
  }, [isLoggedIn])

  useEffect(() => {
    const orderNumber = searchParams.get('merchant_uid')
    if (!orderNumber) return undefined

    const impUid = searchParams.get('imp_uid')
    const succeeded = searchParams.get('imp_success') === 'true'
    const redirectKey = `${orderNumber}:${impUid || ''}:${succeeded}`
    if (processedRedirectRef.current === redirectKey) return undefined
    processedRedirectRef.current = redirectKey

    let isActive = true
    let hasNavigated = false
    Promise.resolve()
      .then(async () => {
        const token = getAccessToken()
        if (!token) throw new Error('결제 결과를 확인하려면 다시 로그인해 주세요.')

        if (!succeeded) {
          await postAuthorizedJson(
            `/api/orders/${encodeURIComponent(orderNumber)}/cancel`,
            token,
            {},
          )
          if (isActive) {
            setCheckoutKey(globalThis.crypto.randomUUID())
            hasNavigated = true
            navigate('/order-failure', {
              replace: true,
              state: {
                reason: searchParams.get('error_msg') || '결제가 취소되었습니다.',
              },
            })
          }
          return null
        }
        if (!impUid) {
          setUnverifiedPayment({ orderNumber, impUid: '' })
          throw new Error('결제 결과 ID를 받지 못했습니다. 주문 내역을 확인해 주세요.')
        }

        setUnverifiedPayment({ orderNumber, impUid })
        return verifyOrderPayment(token, orderNumber, impUid)
      })
      .then((result) => {
        if (isActive && result) {
          setUnverifiedPayment(null)
          setSubmitMessage('')
          if (result.order.payment?.status === 'paid') {
            hasNavigated = true
            navigate('/order-success', {
              replace: true,
              state: { order: result.order },
            })
          } else {
            setPaymentResult(result.order)
          }
        }
      })
      .catch((error) => {
        if (isActive) {
          if (!succeeded || error.status === 402) {
            hasNavigated = true
            navigate('/order-failure', {
              replace: true,
              state: { reason: error.message || '결제가 승인되지 않았습니다.' },
            })
          } else {
            setSubmitMessage(error.message || '결제 결과를 확인하지 못했습니다.')
          }
        }
      })
      .finally(() => {
        if (isActive) {
          setIsPaying(false)
          if (!hasNavigated) setSearchParams({}, { replace: true })
        }
      })

    return () => {
      isActive = false
    }
  }, [navigate, searchParams, setSearchParams])

  function updateField(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  function formValue(name, fallback = '') {
    return form[name] ?? fallback ?? ''
  }

  async function submitOrder(event) {
    event.preventDefault()
    if (isPaying) return

    const token = getAccessToken()
    if (!token) {
      setSubmitMessage('결제를 진행하려면 다시 로그인해 주세요.')
      return
    }
    if (!isPaymentReady || typeof window.IMP?.request_pay !== 'function') {
      setSubmitMessage('포트원 결제 모듈을 사용할 수 없습니다. 페이지를 새로고침해 주세요.')
      return
    }

    setIsPaying(true)
    setSubmitMessage('')
    let orderNumber = ''
    let shouldCancelOrder = true

    try {
      const preflight = await postAuthorizedJson('/api/orders/preflight', token, {})
      if (preflight.action === 'paid') {
        navigate('/order-success', {
          replace: true,
          state: { order: preflight.order },
        })
        return
      }
      if (preflight.action === 'pending') {
        setPaymentResult(preflight.order)
        return
      }
      if (preflight.action !== 'create') {
        throw new Error('주문 중복 여부를 확인하지 못했습니다.')
      }

      const order = await postAuthorizedJson('/api/orders', token, {
        checkoutKey,
        paymentMethod: form.paymentMethod,
        shippingAddress: {
          recipientName: formValue('recipientName', currentUser?.username),
          postalCode: form.postalCode,
          address1: formValue('address1', currentUser?.address),
          address2: form.address2,
          deliveryNote: form.deliveryNote,
        },
      })
      orderNumber = order.orderNumber

      const paymentResponse = await new Promise((resolve, reject) => {
        try {
          window.IMP.request_pay({
            pg: portonePg,
            pay_method: portonePaymentMethods[form.paymentMethod],
            merchant_uid: order.orderNumber,
            name: order.items.map((item) => item.name).join(', ').slice(0, 40),
            amount: order.amounts.totalAmount,
            buyer_email: order.customerSnapshot.email,
            buyer_name: order.customerSnapshot.name,
            buyer_tel: order.shippingAddress.phone,
            buyer_addr: [
              order.shippingAddress.address1,
              order.shippingAddress.address2,
            ].filter(Boolean).join(' '),
            buyer_postcode: order.shippingAddress.postalCode,
            m_redirect_url: `${window.location.origin}/checkout`,
          }, resolve)
        } catch (error) {
          reject(error)
        }
      })

      if (!paymentResponse?.success) {
        throw new Error(paymentResponse?.error_msg || '결제가 취소되었습니다.')
      }

      shouldCancelOrder = false
      setUnverifiedPayment({
        orderNumber: order.orderNumber,
        impUid: paymentResponse.imp_uid || '',
      })
      if (!paymentResponse.imp_uid) {
        throw new Error('결제 결과 ID를 받지 못했습니다. 주문 내역을 확인해 주세요.')
      }

      const result = await verifyOrderPayment(token, order.orderNumber, paymentResponse.imp_uid)
      setUnverifiedPayment(null)
      if (result.order.payment?.status === 'paid') {
        navigate('/order-success', {
          replace: true,
          state: { order: result.order },
        })
      } else {
        setPaymentResult(result.order)
      }
    } catch (error) {
      let message = error.message || '결제를 진행하지 못했습니다.'
      if (orderNumber && shouldCancelOrder) {
        try {
          await postAuthorizedJson(
            `/api/orders/${encodeURIComponent(orderNumber)}/cancel`,
            token,
            {},
          )
          setCheckoutKey(globalThis.crypto.randomUUID())
        } catch (cancelError) {
          message = `${message} 주문 상태를 확인하지 못했습니다: ${cancelError.message}`
        }
      }
      if (shouldCancelOrder) {
        navigate('/order-failure', {
          replace: true,
          state: { reason: message },
        })
      } else if (error.status === 402) {
        navigate('/order-failure', {
          replace: true,
          state: { reason: message },
        })
      } else {
        setSubmitMessage(message)
      }
    } finally {
      setIsPaying(false)
    }
  }

  async function checkPendingPayment() {
    const token = getAccessToken()
    const orderNumber = unverifiedPayment?.orderNumber || paymentResult?.orderNumber
    const impUid = unverifiedPayment?.impUid || paymentResult?.payment?.transactionId
    if (!token || !orderNumber || !impUid || isPaying) return

    setIsPaying(true)
    setSubmitMessage('')
    try {
      const result = await verifyOrderPayment(token, orderNumber, impUid)
      setUnverifiedPayment(null)
      if (result.order.payment?.status === 'paid') {
        navigate('/order-success', {
          replace: true,
          state: { order: result.order },
        })
      } else {
        setPaymentResult(result.order)
      }
    } catch (error) {
      setSubmitMessage(error.message || '입금 상태를 확인하지 못했습니다.')
    } finally {
      setIsPaying(false)
    }
  }

  const items = cart?.items || []
  const itemCount = items.reduce((count, item) => count + item.quantity, 0)
  const subtotal = items.reduce(
    (total, item) => total + (item.lineTotal ?? item.unitPrice * item.quantity),
    0,
  )
  const shippingFee = subtotal < 50000 ? 2500 : 0
  const totalAmount = subtotal + shippingFee

  return (
    <main className="checkout-page">
      <header className="checkout-header">
        <Link aria-label="장바구니로 돌아가기" className="checkout-back-link" to="/cart">
          ←
        </Link>
        <Link className="checkout-brand" to="/">GHMALL</Link>
      </header>

      <div className="checkout-content">
        <div className="checkout-page-heading">
          <h1>주문/결제</h1>
          <nav aria-label="주문 진행 경로" className="checkout-breadcrumb">
            <Link to="/cart">장바구니</Link>
            <span aria-hidden="true">&gt;</span>
            <span aria-current={!paymentResult ? 'page' : undefined}>주문/결제</span>
            <span aria-hidden="true">&gt;</span>
            <span
              aria-current={paymentResult?.payment?.status === 'paid' ? 'page' : undefined}
              className={paymentResult?.payment?.status === 'paid' ? '' : 'checkout-breadcrumb-upcoming'}
            >
              주문완료
            </span>
          </nav>
        </div>
        {paymentInitError && (
          <p className="checkout-sdk-error" role="alert">{paymentInitError}</p>
        )}

        {unverifiedPayment ? (
          <section aria-live="polite" className="checkout-state checkout-payment-result">
            <h2>결제 결과를 확인 중입니다.</h2>
            <p>주문번호: {unverifiedPayment.orderNumber}</p>
            {unverifiedPayment.impUid && (
              <button
                className="checkout-place-order"
                disabled={isPaying}
                onClick={checkPendingPayment}
                type="button"
              >
                {isPaying ? '확인 중...' : '결제 결과 다시 확인'}
              </button>
            )}
            {submitMessage && <p className="checkout-submit-message" role="alert">{submitMessage}</p>}
          </section>
        ) : paymentResult ? (
          <section aria-live="polite" className="checkout-state checkout-payment-result">
            <h2>
              {paymentResult.payment?.status === 'paid'
                ? '결제가 완료되었습니다.'
                : '입금 확인 대기 중입니다.'}
            </h2>
            <p>주문번호: {paymentResult.orderNumber}</p>
            {paymentResult.payment?.status === 'pending' && (
              <>
                {paymentResult.payment.virtualAccount?.accountNumber && (
                  <p>
                    {paymentResult.payment.virtualAccount.bankName} {' '}
                    {paymentResult.payment.virtualAccount.accountNumber}
                    {paymentResult.payment.virtualAccount.holder
                      ? ` (${paymentResult.payment.virtualAccount.holder})`
                      : ''}
                  </p>
                )}
                {paymentResult.payment.transactionId && (
                  <button
                    className="checkout-place-order"
                    disabled={isPaying}
                    onClick={checkPendingPayment}
                    type="button"
                  >
                    {isPaying ? '확인 중...' : '입금 확인'}
                  </button>
                )}
              </>
            )}
            {submitMessage && <p className="checkout-submit-message" role="alert">{submitMessage}</p>}
            <Link className="checkout-primary-link" to="/">쇼핑 계속하기</Link>
          </section>
        ) : !isLoggedIn ? (
          <section className="checkout-state">
            <p>주문하려면 로그인이 필요합니다.</p>
            <Link className="checkout-primary-link" to="/login">로그인</Link>
          </section>
        ) : loadStatus === 'loading' ? (
          <p className="checkout-state" role="status">주문 정보를 불러오는 중입니다.</p>
        ) : loadStatus === 'error' ? (
          <section className="checkout-state checkout-error" role="alert">
            <p>{loadError}</p>
            <Link to="/cart">장바구니로 돌아가기</Link>
          </section>
        ) : items.length === 0 ? (
          <section className="checkout-state">
            <p>장바구니가 비어 있습니다.</p>
            <Link className="checkout-primary-link" to="/cart">장바구니로 돌아가기</Link>
          </section>
        ) : (
          <div className="checkout-layout">
            <form className="checkout-form" id="checkout-form" onSubmit={submitOrder}>
              <section aria-labelledby="checkout-shipping-title" className="checkout-panel">
                <h1 id="checkout-shipping-title">
                  <span aria-hidden="true">▣</span> 배송 정보
                </h1>
                <div className="checkout-form-grid">
                  <label>
                    주문자 이름
                    <input
                      autoComplete="name"
                      required
                      readOnly
                      value={formValue('customerName', currentUser?.username)}
                    />
                  </label>
                  <label>
                    이메일
                    <input
                      autoComplete="email"
                      required
                      readOnly
                      type="email"
                      value={formValue('email', currentUser?.email)}
                    />
                  </label>
                  <label>
                    수령인
                    <input
                      autoComplete="shipping name"
                      name="recipientName"
                      onChange={updateField}
                      required
                      value={formValue('recipientName', currentUser?.username)}
                    />
                  </label>
                  <label>
                    휴대전화
                    <input
                      autoComplete="tel"
                      required
                      readOnly
                      type="tel"
                      value={formValue('phone', formatPhone(currentUser?.phone))}
                    />
                  </label>
                  <label className="checkout-field-wide">
                    우편번호
                    <input
                      autoComplete="shipping postal-code"
                      name="postalCode"
                      onChange={updateField}
                      placeholder="우편번호"
                      required
                      value={form.postalCode}
                    />
                  </label>
                  <label className="checkout-field-wide">
                    주소
                    <input
                      autoComplete="shipping address-line1"
                      name="address1"
                      onChange={updateField}
                      required
                      value={formValue('address1', currentUser?.address)}
                    />
                  </label>
                  <label className="checkout-field-wide">
                    상세 주소
                    <input
                      autoComplete="shipping address-line2"
                      name="address2"
                      onChange={updateField}
                      placeholder="동, 호수 등 (선택)"
                      value={form.address2}
                    />
                  </label>
                  <label className="checkout-field-wide">
                    배송 메모
                    <textarea
                      name="deliveryNote"
                      onChange={updateField}
                      placeholder="배송 시 요청사항 (선택)"
                      rows="3"
                      value={form.deliveryNote}
                    />
                  </label>
                </div>
              </section>

              <section aria-labelledby="checkout-payment-title" className="checkout-panel">
                <h2 id="checkout-payment-title">결제 수단</h2>
                <div className="checkout-payment-options">
                  {paymentOptions.map((option) => (
                    <label className="checkout-payment-option" key={option.value}>
                      <input
                        checked={form.paymentMethod === option.value}
                        name="paymentMethod"
                        onChange={updateField}
                        type="radio"
                        value={option.value}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </section>

            </form>

            <aside aria-labelledby="checkout-summary-title" className="checkout-summary">
              <h2 id="checkout-summary-title">주문 확인</h2>
              <div className="checkout-summary-items">
                {items.map((item) => (
                  <article className="checkout-summary-item" key={item.product?.productId || item._id}>
                    <div className="checkout-summary-image">
                      {item.product?.image ? (
                        <img alt={item.product.name} src={item.product.image} />
                      ) : (
                        <span>이미지 없음</span>
                      )}
                      <span className="checkout-summary-quantity">{item.quantity}</span>
                    </div>
                    <div className="checkout-summary-product">
                      <strong>{item.product?.name || item.productId}</strong>
                      <span>SKU: {item.product?.productId || item.productId}</span>
                      <span>
                        {priceFormatter.format(item.unitPrice)}원 × {item.quantity}
                      </span>
                    </div>
                    <strong className="checkout-summary-line-total">
                      {priceFormatter.format(item.lineTotal ?? item.unitPrice * item.quantity)}원
                    </strong>
                  </article>
                ))}
              </div>
              <div className="checkout-summary-row">
                <span>상품 수량 ({itemCount}개)</span>
                <strong>{priceFormatter.format(subtotal)}원</strong>
              </div>
              <div className="checkout-summary-row">
                <span>배송비</span>
                <strong className={shippingFee === 0 ? 'checkout-free-shipping' : ''}>
                  {shippingFee === 0 ? '무료' : `${priceFormatter.format(shippingFee)}원`}
                </strong>
              </div>
              <div className="checkout-shipping-details">
                <p>배송</p>
                <div className="product-shipping-note">
                  <strong>50,000원 이상 구매 시 무료배송</strong>
                  <span>배송 기간: 5 - 7일 소요</span>
                </div>
                <p>14일 이내 국내 무료반품</p>
              </div>
              <div className="checkout-summary-total">
                <span>총 결제 금액</span>
                <strong>{priceFormatter.format(totalAmount)}원</strong>
              </div>
              <div className="checkout-terms">
                <div className="checkout-term-row">
                  <span>구매조건 확인 및 결제대행 서비스 약관 동의</span>
                  <button onClick={() => setActiveTerms('purchase')} type="button">보기</button>
                </div>
                <div className="checkout-term-row">
                  <span>개인정보 수집 및 이용 안내</span>
                  <button onClick={() => setActiveTerms('privacy')} type="button">보기</button>
                </div>
              </div>
              <p className="checkout-consent-copy">
                위 주문 내용을 확인하였으며, 회원 본인은 개인정보 이용 및 제공(해외직구의 경우 국외제공) 및 결제에 동의합니다.
              </p>
              {submitMessage && <p className="checkout-submit-message" role="status">{submitMessage}</p>}
              <button
                className="checkout-place-order"
                disabled={isPaying || !isPaymentReady || Boolean(paymentInitError)}
                form="checkout-form"
                type="submit"
              >
                {isPaying ? '결제 진행 중...' : '결제하기'}
              </button>
            </aside>
          </div>
        )}
      </div>
      {activeTerms && (
        <div className="logout-confirm-backdrop">
          <section
            aria-labelledby="checkout-terms-title"
            aria-modal="true"
            className="logout-confirm-dialog checkout-terms-dialog"
            onKeyDown={(event) => {
              if (event.key === 'Escape') setActiveTerms('')
            }}
            role="dialog"
          >
            <h2 id="checkout-terms-title">
              {activeTerms === 'purchase' ? '구매조건 및 결제 안내' : '개인정보 수집 및 이용 안내'}
            </h2>
            <p>
              {activeTerms === 'purchase'
                ? '주문 상품과 수량, 배송비 및 총 결제 금액을 확인한 뒤 결제를 진행합니다.'
                : '주문 및 배송 처리를 위해 주문자 이름, 이메일, 휴대전화, 배송지와 주문 상품 정보를 이용합니다.'}
            </p>
            <div className="logout-confirm-actions">
              <button className="primary-button" onClick={() => setActiveTerms('')} type="button">
                확인
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}

export default CheckoutPage
