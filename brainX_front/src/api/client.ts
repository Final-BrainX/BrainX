import axios from 'axios'

const getToken = () => localStorage.getItem('accessToken')

// Identity Service 클라이언트
export const identityApi = axios.create({
  baseURL: '/api/identity',
  headers: { 'Content-Type': 'application/json' },
})

// Workspace Service 클라이언트
export const workspaceApi = axios.create({
  baseURL: '/api/workspace',
  headers: { 'Content-Type': 'application/json' },
})

// 공통 요청 인터셉터 (JWT 삽입)
const authInterceptor = (config: any) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
}

identityApi.interceptors.request.use(authInterceptor)
workspaceApi.interceptors.request.use(authInterceptor)

// 공통 응답 인터셉터 (401 → 로그인 페이지)
// 로그인/회원가입 자체 요청은 제외 (잘못된 비밀번호도 401이므로 리다이렉트 하면 안 됨)
const AUTH_PATHS = ['/v1/auth/login', '/v1/auth/signup', '/v1/auth/token/refresh']

const responseInterceptor = (error: any) => {
  const url: string = error.config?.url ?? ''
  const is401 = error.response?.status === 401
  const isAuthEndpoint = AUTH_PATHS.some(p => url.includes(p))

  if (is401 && !isAuthEndpoint) {
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    window.location.href = '/login'
  }
  return Promise.reject(error)
}

identityApi.interceptors.response.use(res => res, responseInterceptor)
workspaceApi.interceptors.response.use(res => res, responseInterceptor)
