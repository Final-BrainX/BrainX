import { create } from 'zustand'
import type { User } from '../types'
import { authApi } from '../api/auth'

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  setUser: (user: User | null) => void
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  fetchMe: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: !!localStorage.getItem('accessToken'),
  isLoading: false,

  setUser: (user) => set({ user, isAuthenticated: !!user }),

  login: async (email, password) => {
    set({ isLoading: true })
    try {
      const res = await authApi.login(email, password)
      const { accessToken, refreshToken } = res.data.data!
      localStorage.setItem('accessToken', accessToken)
      localStorage.setItem('refreshToken', refreshToken)
      set({ isAuthenticated: true })
      const meRes = await authApi.getMe()
      set({ user: meRes.data.data ?? null })
    } finally {
      set({ isLoading: false })
    }
  },

  logout: async () => {
    try {
      await authApi.logout()
    } catch {}
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    set({ user: null, isAuthenticated: false })
  },

  fetchMe: async () => {
    if (!localStorage.getItem('accessToken')) return
    try {
      const res = await authApi.getMe()
      set({ user: res.data.data ?? null, isAuthenticated: true })
    } catch {
      set({ user: null, isAuthenticated: false })
    }
  },
}))
