import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAdminAccess } from '../hooks/useAdminAccess.js'
import { clearAccessToken, getAccessToken } from '../utils/authStorage.js'

const pageSize = 5
const currencyFormatter = new Intl.NumberFormat('ko-KR')

function ProductInventoryPage() {
  const navigate = useNavigate()
  const { status, errorMessage } = useAdminAccess()
  const [products, setProducts] = useState([])
  const [loadStatus, setLoadStatus] = useState('loading')
  const [loadError, setLoadError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [page, setPage] = useState(1)
  const [deletingProductId, setDeletingProductId] = useState('')
  const [feedback, setFeedback] = useState({ message: '', type: '' })
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (status !== 'ready') return undefined

    const controller = new AbortController()
    async function loadProducts() {
      try {
        const response = await fetch('/api/products', { signal: controller.signal })
        const result = await response.json()
        if (!response.ok) {
          throw new Error(result.message || '상품 목록을 불러오지 못했습니다.')
        }

        setProducts(result)
        setLoadStatus('ready')
        setLoadError('')
      } catch (error) {
        if (error.name === 'AbortError') return
        setLoadError(
          error instanceof TypeError
            ? '서버에 연결할 수 없어 상품 목록을 불러오지 못했습니다.'
            : error.message || '상품 목록을 불러오지 못했습니다.',
        )
        setLoadStatus('error')
      }
    }

    loadProducts()
    return () => controller.abort()
  }, [reloadKey, status])

  const filteredProducts = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLocaleLowerCase()
    if (!normalizedSearch) return products

    return products.filter((product) =>
      product.name.toLocaleLowerCase().includes(normalizedSearch)
      || product.productId.toLocaleLowerCase().includes(normalizedSearch),
    )
  }, [products, searchTerm])

  const pageCount = Math.max(1, Math.ceil(filteredProducts.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const visibleProducts = filteredProducts.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  )
  const firstVisiblePage = Math.max(1, Math.min(currentPage - 2, pageCount - 4))
  const pageNumbers = Array.from(
    { length: Math.min(pageCount, 5) },
    (_, index) => firstVisiblePage + index,
  )

  async function handleDelete(product) {
    if (!window.confirm(`"${product.name}" 상품을 삭제할까요?`)) return

    const token = getAccessToken()
    if (!token) {
      navigate('/', { replace: true })
      return
    }

    setDeletingProductId(product.productId)
    setFeedback({ message: '', type: '' })
    try {
      const response = await fetch(
        `/api/products/${encodeURIComponent(product.productId)}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        },
      )
      const result = await response.json()

      if (response.status === 401) {
        clearAccessToken()
        navigate('/', { replace: true })
        return
      }
      if (!response.ok) {
        throw new Error(result.message || '상품을 삭제하지 못했습니다.')
      }

      setProducts((current) =>
        current.filter((item) => item.productId !== product.productId),
      )
      setFeedback({ message: '상품이 삭제되었습니다.', type: 'success' })
    } catch (error) {
      setFeedback({
        message: error instanceof TypeError
          ? '서버에 연결할 수 없어 상품을 삭제하지 못했습니다.'
          : error.message || '상품을 삭제하지 못했습니다.',
        type: 'error',
      })
    } finally {
      setDeletingProductId('')
    }
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
    <main className="inventory-page">
      <aside className="inventory-sidebar">
        <nav aria-label="관리자 메뉴" className="inventory-nav">
          <Link to="/admin/products">대시보드</Link>
          <Link aria-current="page" className="inventory-nav-active" to="/admin/products/inventory">
            상품
          </Link>
          <Link to="/admin/orders">주문</Link>
        </nav>
      </aside>

      <section className="inventory-main">
        <div className="inventory-toolbar">
          <Link className="inventory-create-button" to="/admin/products/register">
            상품 등록하기
          </Link>
          <h1>어드민 상품 관리 페이지</h1>
          <label className="inventory-search">
            <span className="visually-hidden">상품명 또는 SKU 검색</span>
            <input
              onChange={(event) => {
                setSearchTerm(event.target.value)
                setPage(1)
              }}
              placeholder="상품명 또는 SKU로 검색"
              type="search"
              value={searchTerm}
            />
          </label>
        </div>

        {feedback.message && (
          <p
            className={`inventory-feedback inventory-feedback-${feedback.type}`}
            role={feedback.type === 'error' ? 'alert' : 'status'}
          >
            {feedback.message}
          </p>
        )}

        {loadStatus === 'loading' && (
          <p className="inventory-state" role="status">상품 목록을 불러오는 중입니다.</p>
        )}
        {loadStatus === 'error' && (
          <div className="inventory-state inventory-state-error" role="alert">
            <p>{loadError}</p>
            <button
              className="inventory-retry-button"
              onClick={() => {
                setLoadStatus('loading')
                setReloadKey((current) => current + 1)
              }}
              type="button"
            >
              다시 시도
            </button>
          </div>
        )}

        {loadStatus === 'ready' && (
          <div className="inventory-table-card">
            <div className="inventory-table-scroll">
              <table className="inventory-table">
                <thead>
                  <tr>
                    <th scope="col">SKU</th>
                    <th scope="col">카테고리</th>
                    <th scope="col">상품명</th>
                    <th scope="col">설명</th>
                    <th scope="col">가격</th>
                    <th scope="col">이미지</th>
                    <th scope="col">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleProducts.map((product) => (
                    <tr key={product._id || product.productId}>
                      <td>{product.productId}</td>
                      <td>{product.category}</td>
                      <td>{product.name}</td>
                      <td>{product.description || '—'}</td>
                      <td>{currencyFormatter.format(product.price)}원</td>
                      <td>
                        {product.image ? (
                          <img
                            alt={`${product.name} 상품 이미지`}
                            className="inventory-product-image"
                            loading="lazy"
                            src={product.image}
                          />
                        ) : (
                          <span className="inventory-no-image">이미지 없음</span>
                        )}
                      </td>
                      <td>
                        <Link
                          aria-label={`${product.name} 수정`}
                          className="inventory-edit-button"
                          to={`/admin/products/${encodeURIComponent(product.productId)}/edit`}
                        >
                          수정
                        </Link>
                        <button
                          aria-label={`${product.name} 삭제`}
                          className="inventory-delete-button"
                          disabled={Boolean(deletingProductId)}
                          onClick={() => handleDelete(product)}
                          type="button"
                        >
                          <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                            <path d="M4 7h16M10 11v6m4-6v6M5 7l1 14h12l1-14M9 7V4h6v3" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                  {visibleProducts.length === 0 && (
                    <tr>
                      <td className="inventory-empty-row" colSpan="7">
                        {searchTerm ? '검색 결과가 없습니다.' : '등록된 상품이 없습니다.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {filteredProducts.length > 0 && (
              <nav aria-label="상품 목록 페이지" className="inventory-pagination">
                <button
                  aria-label="첫 페이지"
                  disabled={currentPage === 1}
                  onClick={() => setPage(1)}
                  type="button"
                >
                  «
                </button>
                <button
                  aria-label="이전 페이지"
                  disabled={currentPage === 1}
                  onClick={() => setPage(currentPage - 1)}
                  type="button"
                >
                  ‹
                </button>
                {pageNumbers.map((pageNumber) => (
                  <button
                    aria-current={currentPage === pageNumber ? 'page' : undefined}
                    className={currentPage === pageNumber ? 'inventory-page-active' : ''}
                    key={pageNumber}
                    onClick={() => setPage(pageNumber)}
                    type="button"
                  >
                    {pageNumber}
                  </button>
                ))}
                <button
                  aria-label="다음 페이지"
                  disabled={currentPage === pageCount}
                  onClick={() => setPage(currentPage + 1)}
                  type="button"
                >
                  ›
                </button>
                <button
                  aria-label="마지막 페이지"
                  disabled={currentPage === pageCount}
                  onClick={() => setPage(pageCount)}
                  type="button"
                >
                  »
                </button>
              </nav>
            )}
          </div>
        )}
      </section>
    </main>
  )
}

export default ProductInventoryPage
