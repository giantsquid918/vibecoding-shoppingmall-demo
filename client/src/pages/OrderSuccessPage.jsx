import { Link, useLocation } from 'react-router-dom'

const priceFormatter = new Intl.NumberFormat('ko-KR')

function formatOrderDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '확인 중'

  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function OrderSuccessPage() {
  const { state } = useLocation()
  const order = state?.order

  if (!order || order.payment?.status !== 'paid' || !Array.isArray(order.items)) {
    return (
      <main className="order-success-page">
        <section className="order-success-empty">
          <h1>주문 정보를 확인할 수 없습니다.</h1>
          <p>결제 내역에서 주문 상태를 확인해 주세요.</p>
          <Link className="order-success-home-link" to="/">쇼핑몰로 이동</Link>
        </section>
      </main>
    )
  }

  const orderDate = formatOrderDate(order.payment.paidAt || order.createdAt)

  return (
    <main className="order-success-page">
      <header className="order-success-header">
        <Link aria-label="GHMALL 홈으로 이동" className="order-success-brand" to="/">
          GHMALL
        </Link>
      </header>

      <div className="order-success-content">
        <section aria-labelledby="order-success-title" className="order-success-hero">
          <span aria-hidden="true" className="order-success-icon">✓</span>
          <h1 id="order-success-title">주문이 성공적으로 완료되었습니다!</h1>
          <p>주문해 주셔서 감사합니다.</p>
          <p>결제가 확인되어 주문이 접수되었습니다.</p>
        </section>

        <section aria-labelledby="order-success-info-title" className="order-success-card">
          <h2 id="order-success-info-title">
            <span aria-hidden="true">▤</span> 주문 정보
          </h2>
          <dl className="order-success-meta">
            <div>
              <dt>주문 번호</dt>
              <dd>{order.orderNumber}</dd>
            </div>
            <div>
              <dt>주문 날짜</dt>
              <dd>{orderDate}</dd>
            </div>
          </dl>

          <h3>주문 상품</h3>
          <div className="order-success-items">
            {order.items.map((item, index) => (
              <article
                className="order-success-item"
                key={`${item.productId || item.name}-${index}`}
              >
                <div className="order-success-item-image">
                  {item.image ? (
                    <img alt={item.name} src={item.image} />
                  ) : (
                    <span>이미지 없음</span>
                  )}
                </div>
                <div className="order-success-item-details">
                  <strong>{item.name}</strong>
                  <span>SKU: {item.productId}</span>
                  <span>수량: {item.quantity}</span>
                </div>
                <strong className="order-success-item-price">
                  {priceFormatter.format(item.lineTotal ?? item.unitPrice * item.quantity)}원
                </strong>
              </article>
            ))}
          </div>

          <div className="order-success-total">
            <span>총 결제 금액</span>
            <strong>{priceFormatter.format(order.amounts.totalAmount)}원</strong>
          </div>
          <div className="order-success-actions">
            <Link className="order-success-home-link" to="/">쇼핑 계속하기</Link>
            <Link className="order-success-orders-link" to="/orders">주문 목록 보기</Link>
          </div>
        </section>
      </div>
    </main>
  )
}

export default OrderSuccessPage
