import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'
import LogoutConfirmDialog from '../components/LogoutConfirmDialog.jsx'
import LogoutSuccessDialog from '../components/LogoutSuccessDialog.jsx'
import { useStoreSession } from '../hooks/useStoreSession.js'

const priceFormatter = new Intl.NumberFormat('ko-KR')
const categories = ['상의', '하의', '악세사리']

function ProductCatalog({ searchTerm }) {
  const [products, setProducts] = useState([])
  const [loadStatus, setLoadStatus] = useState('loading')
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [showBestSelling, setShowBestSelling] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    async function loadProducts() {
      try {
        const response = await fetch(
          showBestSelling ? '/api/products?sort=best-selling' : '/api/products',
          { signal: controller.signal },
        )
        const result = await response.json()
        if (!response.ok) {
          throw new Error(result.message || '상품을 불러오지 못했습니다.')
        }
        if (!Array.isArray(result)) {
          throw new Error('상품 목록 응답 형식이 올바르지 않습니다.')
        }

        setProducts(result)
        setLoadError('')
        setLoadStatus('ready')
      } catch (error) {
        if (error.name === 'AbortError') return
        setLoadError(
          error instanceof TypeError
            ? '서버에 연결할 수 없어 상품을 불러오지 못했습니다.'
            : error.message || '상품을 불러오지 못했습니다.',
        )
        setLoadStatus('error')
      }
    }

    loadProducts()
    return () => controller.abort()
  }, [reloadKey, showBestSelling])

  const normalizedSearchTerm = searchTerm.trim().toLowerCase()
  const filteredProducts = products.filter((product) =>
    (!selectedCategory || product.category === selectedCategory)
    && (product.name.toLowerCase().includes(normalizedSearchTerm)
      || product.productId.toLowerCase().includes(normalizedSearchTerm)),
  )

  return (
    <section aria-label="상품 목록" className="store-main">
      <div aria-label="상품 필터" className="product-toolbar">
        <button
          aria-pressed={showBestSelling}
          className="product-filter-chip product-filter-featured"
          onClick={() => {
            setLoadStatus('loading')
            setShowBestSelling((current) => !current)
          }}
          type="button"
        >
          <span aria-hidden="true">🔥</span>
          추천상품
        </button>
        {categories.map((category) => (
          <button
            aria-pressed={selectedCategory === category}
            className="product-filter-chip"
            key={category}
            onClick={() => setSelectedCategory(
              (current) => current === category ? '' : category,
            )}
            type="button"
          >
            {category}
          </button>
        ))}
      </div>
      {loadStatus === 'loading' ? (
        <p className="product-api-state" role="status">상품을 불러오는 중입니다.</p>
      ) : loadStatus === 'error' ? (
        <div className="product-api-state product-api-error" role="alert">
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
        </div>
      ) : filteredProducts.length > 0 ? (
        <div className="product-grid">
          {filteredProducts.map((product) => (
            <article className="product-card" key={product.productId}>
              <Link
                aria-label={`${product.name} 상세 보기${showBestSelling && product.salesRank ? `, 판매 ${product.salesRank}위` : ''}`}
                className="product-card-link"
                to={`/products/${encodeURIComponent(product.productId)}`}
              >
                <div className="product-image">
                  {showBestSelling && product.salesRank >= 1 && product.salesRank <= 3 && (
                    <span className="product-rank-badge">{product.salesRank}위</span>
                  )}
                  {product.image ? (
                    <img
                      alt={product.name}
                      className="product-live-image"
                      loading="lazy"
                      src={product.image}
                    />
                  ) : (
                    <span className="product-image-placeholder">이미지 없음</span>
                  )}
                </div>
                <h2 className="product-name">{product.name}</h2>
                <p className="product-price">
                  {Number.isFinite(Number(product.price))
                    ? `${priceFormatter.format(Number(product.price))}원`
                    : '가격 정보 없음'}
                </p>
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <p className="product-empty-state">
          {normalizedSearchTerm
            ? '검색 결과가 없습니다.'
            : selectedCategory
              ? '해당 카테고리에 등록된 상품이 없습니다.'
              : '등록된 상품이 없습니다.'}
        </p>
      )}
    </section>
  )
}

function Storefront({ displayName, isAdmin, isLoadingUser, isLoggedIn, onLogout }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const requestLogout = useCallback(() => setShowLogoutConfirm(true), [])

  function confirmLogout() {
    setShowLogoutConfirm(false)
    onLogout()
  }

  return (
    <>
      <Navbar
        displayName={displayName}
        isAdmin={isAdmin}
        isLoadingUser={isLoadingUser}
        isLoggedIn={isLoggedIn}
        onLogoutRequest={requestLogout}
        onSearchChange={setSearchTerm}
        searchTerm={searchTerm}
      />
      <ProductCatalog searchTerm={searchTerm} />
      <LogoutConfirmDialog
        onCancel={() => setShowLogoutConfirm(false)}
        onConfirm={confirmLogout}
        open={showLogoutConfirm}
      />
    </>
  )
}

function MainPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { currentUser, handleLogout, isAdmin, isLoadingUser, isLoggedIn, userError } =
    useStoreSession()
  const displayName = currentUser?.nickname?.trim() || currentUser?.username || ''
  const showLogoutSuccess = location.state?.logoutSuccess === true

  function dismissLogoutSuccess() {
    navigate(location.pathname, { replace: true, state: null })
  }

  return (
    <main className="home-page">
      <Storefront
        displayName={displayName}
        isAdmin={isAdmin}
        isLoadingUser={isLoadingUser}
        isLoggedIn={isLoggedIn}
        onLogout={handleLogout}
      />
      {userError && (
        <p className="profile-load-error" role="alert">{userError}</p>
      )}
      <LogoutSuccessDialog onClose={dismissLogoutSuccess} open={showLogoutSuccess} />
    </main>
  )
}

export default MainPage
