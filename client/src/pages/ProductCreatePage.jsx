import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAdminAccess } from '../hooks/useAdminAccess.js'
import { clearAccessToken, getAccessToken } from '../utils/authStorage.js'

const cloudinaryScriptUrl = 'https://upload-widget.cloudinary.com/latest/global/all.js'
let cloudinaryWidgetPromise

const initialForm = {
  productId: '',
  name: '',
  price: '',
  category: '',
  description: '',
}

function loadCloudinaryWidget() {
  if (window.cloudinary?.createUploadWidget) {
    return Promise.resolve(window.cloudinary)
  }

  if (!cloudinaryWidgetPromise) {
    cloudinaryWidgetPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = cloudinaryScriptUrl
      script.async = true
      script.onload = () => {
        if (window.cloudinary?.createUploadWidget) {
          resolve(window.cloudinary)
        } else {
          reject(new Error('Cloudinary 위젯을 불러오지 못했습니다.'))
        }
      }
      script.onerror = () => reject(new Error('Cloudinary 위젯을 불러오지 못했습니다.'))
      document.head.appendChild(script)
    }).catch((error) => {
      cloudinaryWidgetPromise = null
      throw error
    })
  }

  return cloudinaryWidgetPromise
}

function ProductCreatePage() {
  const navigate = useNavigate()
  const { productId } = useParams()
  const isEditing = productId !== undefined
  const { status, errorMessage } = useAdminAccess()
  const [form, setForm] = useState(initialForm)
  const [imageUrl, setImageUrl] = useState('')
  const [feedback, setFeedback] = useState({ message: '', type: '' })
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loadStatus, setLoadStatus] = useState(isEditing ? 'loading' : 'ready')
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const cloudinaryWidgetRef = useRef(null)

  useEffect(() => {
    if (!isEditing || status !== 'ready') return undefined

    const controller = new AbortController()
    async function loadProduct() {
      try {
        const response = await fetch(`/api/products/${encodeURIComponent(productId)}`, {
          signal: controller.signal,
        })
        const result = await response.json()
        if (!response.ok) {
          throw new Error(response.status === 404
            ? '상품을 찾을 수 없습니다.'
            : result.message || '상품을 불러오지 못했습니다.')
        }

        setForm({
          productId: result.productId,
          name: result.name,
          price: String(result.price),
          category: result.category,
          description: result.description || '',
        })
        setImageUrl(result.image)
        setLoadError('')
        setLoadStatus('ready')
      } catch (error) {
        if (error.name === 'AbortError') return
        setLoadError(error instanceof TypeError
          ? '서버에 연결할 수 없어 상품을 불러오지 못했습니다.'
          : error.message || '상품을 불러오지 못했습니다.')
        setLoadStatus('error')
      }
    }

    loadProduct()
    return () => controller.abort()
  }, [isEditing, productId, reloadKey, status])

  function handleChange(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
    setFeedback({ message: '', type: '' })
  }

  async function handleUploadImage() {
    const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME?.trim()
    const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET?.trim()
    if (!cloudName || !uploadPreset) {
      setFeedback({
        message: 'Cloudinary 설정이 필요합니다. client/.env 파일에 cloud name과 unsigned upload preset을 설정해 주세요.',
        type: 'error',
      })
      return
    }

    setIsUploadingImage(true)
    setFeedback({ message: '', type: '' })
    try {
      const cloudinary = await loadCloudinaryWidget()
      if (!cloudinaryWidgetRef.current) {
        cloudinaryWidgetRef.current = cloudinary.createUploadWidget(
          {
            cloudName,
            uploadPreset,
            sources: ['local', 'camera'],
            multiple: false,
            resourceType: 'image',
            maxFileSize: 5 * 1024 * 1024,
            clientAllowedFormats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
            folder: 'shoppingmall/products',
          },
          (error, result) => {
            if (error) {
              setFeedback({
                message: error.message || '이미지를 Cloudinary에 업로드하지 못했습니다.',
                type: 'error',
              })
              setIsUploadingImage(false)
              return
            }

            if (result?.event === 'success') {
              const secureUrl = result.info?.secure_url
              if (typeof secureUrl !== 'string' || !secureUrl.startsWith('https://')) {
                setFeedback({ message: 'Cloudinary 이미지 주소를 확인하지 못했습니다.', type: 'error' })
              } else {
                setImageUrl(secureUrl)
                setFeedback({ message: '이미지 업로드가 완료되었습니다.', type: 'success' })
              }
              setIsUploadingImage(false)
            } else if (result?.event === 'close') {
              setIsUploadingImage(false)
            }
          },
        )
      }

      cloudinaryWidgetRef.current.open()
    } catch (error) {
      setFeedback({
        message: error.message || 'Cloudinary 위젯을 불러오지 못했습니다.',
        type: 'error',
      })
      setIsUploadingImage(false)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!imageUrl) {
      setFeedback({ message: '상품 메인 이미지를 먼저 업로드해 주세요.', type: 'error' })
      return
    }

    const token = getAccessToken()
    if (!token) {
      navigate('/', { replace: true })
      return
    }

    setIsSubmitting(true)
    setFeedback({ message: '', type: '' })
    try {
      const response = await fetch(
        isEditing ? `/api/products/${encodeURIComponent(productId)}` : '/api/products',
        {
          method: isEditing ? 'PATCH' : 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...(isEditing ? {} : { productId: form.productId.trim() }),
            name: form.name.trim(),
            price: Number(form.price),
            category: form.category,
            description: form.description.trim(),
            image: imageUrl,
          }),
        },
      )
      const result = await response.json()

      if (response.status === 401) {
        clearAccessToken()
        navigate('/', { replace: true })
        return
      }
      if (!response.ok) {
        throw new Error(result.message || `상품을 ${isEditing ? '수정' : '등록'}하지 못했습니다.`)
      }

      if (!isEditing) {
        setForm(initialForm)
        setImageUrl('')
      }
      setFeedback({ message: `상품이 ${isEditing ? '수정' : '등록'}되었습니다.`, type: 'success' })
    } catch (error) {
      setFeedback({
        message: error instanceof TypeError
          ? '서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.'
          : error.message || `상품을 ${isEditing ? '수정' : '등록'}하지 못했습니다.`,
        type: 'error',
      })
    } finally {
      setIsSubmitting(false)
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
          <Link className="admin-return-button" to="/admin/products">관리자 대시보드로</Link>
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
        <Link className="admin-return-button" to="/admin/products">관리자 대시보드로</Link>
      </header>

      <div className="product-registration-content">
        <div className="product-registration-heading">
          <p>상품 관리</p>
          <h1>{isEditing ? '상품 수정' : '새 상품 등록'}</h1>
        </div>

        {loadStatus === 'loading' && (
          <p className="admin-status" role="status">상품 정보를 불러오는 중입니다.</p>
        )}
        {loadStatus === 'error' && (
          <section className="inventory-state inventory-state-error" role="alert">
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
            </button>{' '}
            <Link to="/admin/products/inventory">상품 목록으로</Link>
          </section>
        )}
        {loadStatus === 'ready' && (
        <form className="product-registration-form" onSubmit={handleSubmit}>
          <div className="product-form-column">
            <label className="product-form-field" htmlFor="product-id">
              <span>상품 ID</span>
              <input
                autoComplete="off"
                id="product-id"
                maxLength={100}
                name="productId"
                onChange={handleChange}
                placeholder="상품 ID를 입력하세요"
                readOnly={isEditing}
                required
                value={form.productId}
              />
              {isEditing && <span className="product-form-hint">상품 ID는 변경할 수 없습니다.</span>}
            </label>

            <label className="product-form-field" htmlFor="product-name">
              <span>상품명</span>
              <input
                id="product-name"
                maxLength={200}
                name="name"
                onChange={handleChange}
                placeholder="상품명을 입력하세요"
                required
                value={form.name}
              />
            </label>

            <label className="product-form-field" htmlFor="product-price">
              <span>판매가격</span>
              <input
                id="product-price"
                min="0"
                name="price"
                onChange={handleChange}
                placeholder="0"
                required
                step="1"
                type="number"
                value={form.price}
              />
            </label>

            <label className="product-form-field" htmlFor="product-category">
              <span>카테고리</span>
              <select
                id="product-category"
                name="category"
                onChange={handleChange}
                required
                value={form.category}
              >
                <option disabled value="">카테고리 선택</option>
                <option value="상의">상의</option>
                <option value="하의">하의</option>
                <option value="악세사리">악세사리</option>
              </select>
            </label>
          </div>

          <div className="product-form-column">
            <label className="product-form-field" htmlFor="product-description">
              <span>상품 설명 <em>(선택)</em></span>
              <textarea
                id="product-description"
                maxLength={2000}
                name="description"
                onChange={handleChange}
                placeholder="상품에 대한 자세한 설명을 입력하세요"
                rows="5"
                value={form.description}
              />
            </label>

            <div className="product-form-field">
              <span>메인 이미지</span>
              <button
                className="cloudinary-upload-button"
                disabled={isUploadingImage || isSubmitting}
                onClick={handleUploadImage}
                type="button"
              >
                {isUploadingImage ? '이미지 업로드 중...' : imageUrl ? '이미지 변경' : 'Cloudinary에서 이미지 선택'}
              </button>
              <span className="product-form-hint">
                JPG, PNG, GIF, WEBP 형식 · 최대 5MB
              </span>
              {imageUrl && (
                <img
                  alt="업로드한 상품 이미지 미리보기"
                  className="product-image-preview"
                  src={imageUrl}
                />
              )}
            </div>
          </div>

          {feedback.message && (
            <p
              className={`product-form-feedback product-form-feedback-${feedback.type}`}
              role={feedback.type === 'error' ? 'alert' : 'status'}
            >
              {feedback.message}
            </p>
          )}

          <div className="product-form-actions">
            <Link className="product-cancel-button" to={isEditing ? '/admin/products/inventory' : '/admin/products'}>취소</Link>
            <button className="primary-button" disabled={isSubmitting || isUploadingImage} type="submit">
              {isSubmitting ? (isEditing ? '수정 중...' : '등록 중...') : (isEditing ? '상품 수정' : '상품 등록')}
            </button>
          </div>
        </form>
        )}
      </div>
    </main>
  )
}

export default ProductCreatePage
