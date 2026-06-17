import axios from 'axios'

const getToken = () => localStorage.getItem('accessToken')

export const ingestionApi = axios.create({
  baseURL: '/api/ingestion',
  headers: { 'Content-Type': 'application/json' },
})

ingestionApi.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

ingestionApi.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export const notionApi = {
  authorize: () =>
    ingestionApi.post<{ success: boolean; data: { authorizationUrl: string; state: string }; message: string }>(
      '/v1/imports/notion/oauth/authorize'
    ),

  callback: (code: string, state: string) =>
    ingestionApi.post<{ success: boolean; data: { integrationAccountId: string }; message: string }>(
      '/v1/imports/notion/oauth/callback',
      { code, state }
    ),

  getPages: (integrationAccountId: string) =>
    ingestionApi.get<{
      success: boolean
      data: {
        pages: { id: string; title: string; lastEditedTime: string; icon: string | null }[]
      }
      message: string
    }>(`/v1/imports/notion/pages`, { params: { integrationAccountId } }),

  createJob: (data: { integrationAccountId: string; sourceId: string; mode?: string; targetFolderId?: string }) =>
    ingestionApi.post<{ success: boolean; data: { importJobId: string; status: string }; message: string }>(
      '/v1/imports/notion/jobs',
      data
    ),
}

export const obsidianApi = {
  createJob: (data: { uploadedZipAssetId: string; targetFolderId?: string }) =>
    ingestionApi.post<{ success: boolean; data: { importJobId: string; status: string }; message: string }>(
      '/v1/imports/obsidian/jobs',
      data
    ),
}

export const importJobApi = {
  getStatus: (importJobId: string) =>
    ingestionApi.get<{
      success: boolean
      data: {
        importJobId: string
        status: string
        createdNotes: { noteId: string; title: string }[]
        failedFiles: { fileName: string; reason: string }[]
        conflicts: unknown[]
      }
      message: string
    }>(`/v1/imports/${importJobId}`),
}

export const exportApi = {
  create: (data: { noteId: string; format: string; clientType?: string }) =>
    ingestionApi.post<{ success: boolean; data: { exportJobId: string; status: string }; message: string }>(
      '/v1/exports',
      data
    ),

  getStatus: (exportJobId: string) =>
    ingestionApi.get<{
      success: boolean
      data: {
        exportJobId: string
        status: string
        downloadUrl: string | null
        error?: string
      }
      message: string
    }>(`/v1/exports/${exportJobId}`),
}
