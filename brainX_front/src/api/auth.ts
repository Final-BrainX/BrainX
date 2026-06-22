import { identityApi } from './client'
import type { TokenResponse, User, ApiResponse } from '../types'

export const authApi = {
  requestEmailVerification: (email: string, purpose: 'signup' | 'passwordChange') =>
    identityApi.post<ApiResponse<{ verificationId: string; expiresAt: string }>>(
      '/v1/auth/email-verifications', { email, purpose }
    ),

  verifyEmailCode: (email: string, verificationCode: string, purpose: 'signup' | 'passwordChange') =>
    identityApi.post<ApiResponse<{ verified: boolean; email: string }>>(
      '/v1/auth/email-verifications/verify', { email, verificationCode, purpose }
    ),

  signup: (data: {
    email: string
    verificationCode: string
    password: string
    passwordConfirm: string
    consents: {
      termsRequired: boolean
      privacyRequired: boolean
      marketingOptional: boolean
      behaviorAnalyticsOptional: boolean
    }
  }) => identityApi.post<ApiResponse<TokenResponse>>('/v1/auth/signup/email', data),

  login: (email: string, password: string) =>
    identityApi.post<ApiResponse<TokenResponse>>('/v1/auth/login/local', { email, password }),

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
