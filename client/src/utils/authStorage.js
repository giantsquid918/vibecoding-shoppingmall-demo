const accessTokenKey = 'token'
const previousAccessTokenKey = 'shoppingmallToken'
const legacyLoginKey = 'shoppingmallLoggedIn'

export function getAccessToken() {
  return sessionStorage.getItem(accessTokenKey)
    || localStorage.getItem(accessTokenKey)
    || sessionStorage.getItem(previousAccessTokenKey)
    || localStorage.getItem(previousAccessTokenKey)
}

export function storeAccessToken(token, rememberMe) {
  clearAccessToken()
  const storage = rememberMe ? localStorage : sessionStorage
  storage.setItem(accessTokenKey, token)
}

export function clearAccessToken() {
  sessionStorage.removeItem(accessTokenKey)
  localStorage.removeItem(accessTokenKey)
  sessionStorage.removeItem(previousAccessTokenKey)
  localStorage.removeItem(previousAccessTokenKey)
  sessionStorage.removeItem(legacyLoginKey)
}
