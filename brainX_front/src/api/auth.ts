import { identityApi } from './client'
import type { TokenResponse, User, ApiResponse } from '../types'

export const authApi = {
  requestEmailVerification: (email: string, purpose: 'signup' | 'passwordChange') =>
    identityApi.post<ApiResponse<{ verificationId: string; expiresAt: string }>>(
      '/v1/auth/email-verifications', { email, purpose }
    ),

  signup: (data: {
    email: string
    code: string
    password: string
    consents: {
      termsRequired: boolean
      privacyRequired: boolean
      marketingOptional: boolean
      behaviorAnalyticsOptional: boolean
    }
  }) => identityApi.post<ApiResponse<TokenResponse>>('/v1/auth/email-signups', data),

  login: (email: string, password: string) =>
    identityApi.post<ApiResponse<TokenResponse>>('/v1/auth/login', { email, password }),

  logout: () =>
    identityApi.post<ApiResponse<{ ok: boolean }>>('/v1/auth/logout'),

  getMe: () =>
    identityApi.get<ApiResponse<User>>('/v1/users/me'),

  updateProfile: (data: { nickname?: string }) =>
    identityApi.patch<ApiResponse<User>>('/v1/users/me/profile', data),

  changePassword: (currentPassword: string, newPassword: string) =>
    identityApi.patch<ApiResponse<{ ok: boolean }>>('/v1/users/me/password', { currentPassword, newPassword }),

  updateConsents: (consents: {
    termsRequired: boolean
    privacyRequired: boolean
    marketingOptional: boolean
    behaviorAnalyticsOptional: boolean
  }) => identityApi.put<ApiResponse<{ ok: boolean }>>('/v1/users/me/consents', consents),

  requestDeletion: () =>
    identityApi.post<ApiResponse<{ deletionScheduledAt: string }>>('/v1/users/me/deletion-request'),

  cancelDeletion: () =>
    identityApi.delete<ApiResponse<{ ok: boolean }>>('/v1/users/me/deletion-request'),
}
