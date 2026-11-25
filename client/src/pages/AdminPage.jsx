import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAdminAccess } from '../hooks/useAdminAccess.js'
import { clearAccessToken, getAccessToken } from '../utils/authStorage.js'

const countFormatter = new Intl.NumberFormat('ko-KR')
const currencyFormatter = new Intl.NumberFormat('ko-KR')
const summaryItems = [
  { label: '총 주문', key: 'totalOrders', change: '등록된 전체 주문 건수', color: 'blue', icon: 'cart' },
  { label: '총 상품', key: 'totalProducts', change: '현재 등록된 상품 수', color: 'green', icon: 'box' },
  { label: '총 고객', key: 'totalCustomers', change: '가입한 고객 계정 수', color: 'purple', icon: 'users' },
  { label: '총 매출', key: 'totalRevenue', change: '결제가 완료된 주문 금액 합계', color: 'orange', icon: 'trend' },
]

function SummaryIcon({ name }) {
  const paths = {
    cart: (
      <>
        <path d="M3 4h2l2.2 11.2a2 2 0 0 0 2 1.6h8.4a2 2 0 0 0 1.9-1.4L22 8H6" />
        <circle cx="10" cy="21" r="1" />
        <circle cx="18" cy="21" r="1" />
      </>
    ),
    box: (
      <>
        <path d="m12 2 9 5v10l-9 5-9-5V7l9-5Z" />
        <path d="m3.3 7 8.7 5 8.7-5M12 22V12M7.5 4.5l9 5" />
      </>
    ),
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
        <circle cx="9.5" cy="7" r="4" />
        <path d="M20 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
      </>
    ),
    trend: <path d="m3 17 6-6 4 4 8-9M15 6h6v6" />,
  }

  return (
    <svg aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
      {paths[name]}
    </svg>
  )
}

const managementMenus = {
  products: [
    { label: '상품 등록', to: '/admin/products/register' },
    { label: '상품 수정', to: '/admin/products/inventory' },
    { label: '상품 삭제', to: '/admin/products/inventory' },
    { label: '재고 관리', to: '/admin/products/inventory' },
  ],
  orders: [
    { label: '주문 조회', to: '/admin/orders' },
    { label: '상태 변경', to: '/admin/orders?view=status' },
    { label: '배송 관리', to: '/admin/orders?view=shipping' },
  ],
}

function ManagementCard({ description, expanded, icon, id, items, onToggle, title, tone }) {
  return (
    <section className="admin-management-card">
      <button
        aria-controls={`${id}-menu`}
        aria-expanded={expanded}
        className="admin-management-toggle"
        onClick={onToggle}
        type="button"
      >
        <span className={`admin-management-icon admin-icon-${tone}`}>
          <SummaryIcon name={icon} />
        </span>
        <h2>{title}</h2>
        <p>{description}</p>
        <span aria-hidden="true" className="admin-management-chevron">
          {expanded ? '⌃' : '⌄'}
        </span>
      </button>
      {expanded && (
        <ul className="admin-management-menu" id={`${id}-menu`}>
          {items.map((item) => (
            <li key={item.label}>
              {item.to ? (
                <Link to={item.to}>{item.label}</Link>
              ) : (
                <span>{item.label}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function AdminPage() {
  const navigate = useNavigate()
  const { status, errorMessage } = useAdminAccess()
  const [expandedMenu, setExpandedMenu] = useState(null)
  const [dashboardStats, setDashboardStats] = useState(null)
  const [statsStatus, setStatsStatus] = useState('loading')
  const [statsError, setStatsError] = useState('')
  const [statsReloadKey, setStatsReloadKey] = useState(0)

  useEffect(() => {
    if (status !== 'ready') return undefined

    const token = getAccessToken()
    if (!token) {
      navigate('/', { replace: true })
      return undefined
    }

    const controller = new AbortController()
    async function loadDashboardStats() {
      try {
        const response = await fetch('/api/admin/dashboard', {
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
          throw new Error(result.message || '대시보드 통계를 불러오지 못했습니다.')
        }

        const statKeys = ['totalOrders', 'totalProducts', 'totalCustomers', 'totalRevenue']
        if (statKeys.some((key) => !Number.isFinite(result[key]) || result[key] < 0)) {
          throw new Error('대시보드 통계 응답 형식이 올바르지 않습니다.')
        }

        setDashboardStats(result)
        setStatsStatus('ready')
        setStatsError('')
      } catch (error) {
        if (error.name === 'AbortError') return
        setStatsError(
          error instanceof TypeError
            ? '서버에 연결할 수 없어 대시보드 통계를 불러오지 못했습니다.'
            : error.message || '대시보드 통계를 불러오지 못했습니다.',
        )
        setStatsStatus('error')
      }
    }

    loadDashboardStats()
    return () => controller.abort()
  }, [navigate, statsReloadKey, status])

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
          <Link className="admin-return-button" to="/">쇼핑몰로 돌아가기</Link>
        </section>
      </main>
    )
  }

  return (
    <main className="admin-page">
      <header className="admin-header">
        <div className="admin-brand">
          <Link aria-label="GHMALL 홈" className="admin-logo" to="/">GHMALL</Link>
          <span className="admin-badge">ADMIN</span>
        </div>
        <Link className="admin-return-button" to="/">쇼핑몰로 돌아가기</Link>
      </header>

      <div className="admin-content">
        <section aria-labelledby="admin-title" className="admin-intro">
          <h1 id="admin-title">관리자 대시보드</h1>
          <p>GHMALL 쇼핑몰 관리 시스템에 오신 것을 환영합니다.</p>
        </section>

        {statsStatus === 'error' && (
          <section className="admin-dashboard-error" role="alert">
            <p>{statsError}</p>
            <button
              onClick={() => {
                setStatsStatus('loading')
                setStatsReloadKey((current) => current + 1)
              }}
              type="button"
            >
              다시 시도
            </button>
          </section>
        )}

        <section aria-label="쇼핑몰 요약" className="admin-summary-grid">
          {summaryItems.map((item) => (
            <article className="admin-summary-card" key={item.label}>
              <div className="admin-summary-copy">
                <h2>{item.label}</h2>
                <p className="admin-summary-value">
                  {statsStatus === 'loading'
                    ? '불러오는 중...'
                    : statsStatus === 'ready'
                      ? item.key === 'totalRevenue'
                        ? `${currencyFormatter.format(dashboardStats[item.key])}원`
                        : countFormatter.format(dashboardStats[item.key])
                      : '—'}
                </p>
                <p className="admin-summary-note">{item.change}</p>
              </div>
              <span className={`admin-summary-icon admin-icon-${item.color}`}>
                <SummaryIcon name={item.icon} />
              </span>
            </article>
          ))}
        </section>

        <section aria-label="관리 메뉴" className="admin-management-grid">
          <ManagementCard
            description="상품 등록, 수정, 삭제 및 재고 관리"
            expanded={expandedMenu === 'products'}
            icon="box"
            id="products"
            items={managementMenus.products}
            onToggle={() => setExpandedMenu(
              expandedMenu === 'products' ? null : 'products',
            )}
            title="상품 관리"
            tone="blue"
          />
          <ManagementCard
            description="주문 조회, 상태 변경 및 배송 관리"
            expanded={expandedMenu === 'orders'}
            icon="cart"
            id="orders"
            items={managementMenus.orders}
            onToggle={() => setExpandedMenu(
              expandedMenu === 'orders' ? null : 'orders',
            )}
            title="주문 관리"
            tone="green"
          />
        </section>
      </div>
    </main>
  )
}

export default AdminPage
