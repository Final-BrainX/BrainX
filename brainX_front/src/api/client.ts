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
const responseInterceptor = (error: any) => {
  if (error.response?.status === 401) {
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    window.location.href = '/login'
  }
  return Promise.reject(error)
}

identityApi.interceptors.response.use(res => res, responseInterceptor)
workspaceApi.interceptors.response.use(res => res, responseInterceptor)
