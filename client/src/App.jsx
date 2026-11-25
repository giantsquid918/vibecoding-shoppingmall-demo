import { Route, Routes, useParams } from 'react-router-dom'
import AdminPage from './pages/AdminPage.jsx'
import AdminOrderManagementPage from './pages/AdminOrderManagementPage.jsx'
import AccountPage from './pages/AccountPage.jsx'
import CartPage from './pages/CartPage.jsx'
import CheckoutPage from './pages/CheckoutPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import MainPage from './pages/MainPage.jsx'
import OrderFailurePage from './pages/OrderFailurePage.jsx'
import OrderListPage from './pages/OrderListPage.jsx'
import OrderSuccessPage from './pages/OrderSuccessPage.jsx'
import ProductCreatePage from './pages/ProductCreatePage.jsx'
import ProductDetailPage from './pages/ProductDetailPage.jsx'
import ProductInventoryPage from './pages/ProductInventoryPage.jsx'
import SignupPage from './pages/SignupPage.jsx'
import './App.css'

function ProductEditPage() {
  const { productId } = useParams()
  return <ProductCreatePage key={productId} />
}

function App() {
  return (
    <Routes>
      <Route element={<MainPage />} path="/" />
      <Route element={<CartPage />} path="/cart" />
      <Route element={<CheckoutPage />} path="/checkout" />
      <Route element={<OrderListPage />} path="/orders" />
      <Route element={<AccountPage />} path="/account" />
      <Route element={<OrderFailurePage />} path="/order-failure" />
      <Route element={<OrderSuccessPage />} path="/order-success" />
      <Route element={<AdminPage />} path="/admin/products" />
      <Route element={<AdminOrderManagementPage />} path="/admin/orders" />
      <Route element={<ProductCreatePage key="create" />} path="/admin/products/register" />
      <Route element={<ProductInventoryPage />} path="/admin/products/inventory" />
      <Route element={<ProductEditPage />} path="/admin/products/:productId/edit" />
      <Route element={<ProductDetailPage />} path="/products/:productId" />
      <Route element={<LoginPage />} path="/login" />
      <Route element={<SignupPage />} path="/signup" />
      <Route element={<MainPage />} path="*" />
    </Routes>
  )
}

export default App
