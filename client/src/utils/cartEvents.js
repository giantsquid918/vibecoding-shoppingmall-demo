export function notifyCartUpdated() {
  window.dispatchEvent(new Event('cart-updated'))
}
