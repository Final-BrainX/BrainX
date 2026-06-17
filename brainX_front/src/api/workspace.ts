import { workspaceApi } from './client'
import type {
  ApiResponse, WorkspaceSync, Note, NoteDetail, Folder,
  Tag, RecentActivity, Backlink, NoteLink, ShareLink, GraphData
} from '../types'

export const noteApi = {
  sync: (cursor?: string) =>
    workspaceApi.get<ApiResponse<WorkspaceSync>>('/v1/workspace/sync', { params: { cursor } }),

  create: (data: { title: string; markdown?: string; folderId?: string; tags?: string[] }) =>
    workspaceApi.post<ApiResponse<Note>>('/v1/notes', data),

  get: (noteId: string) =>
    workspaceApi.get<ApiResponse<NoteDetail>>(`/v1/notes/${noteId}`),

  saveContent: (noteId: string, data: { baseVersion: number; markdown: string; clientSavedAt?: string }) =>
    workspaceApi.put<ApiResponse<{ version: number; savedAt: string; conflict?: boolean }>>(
      `/v1/notes/${noteId}/content`, data
    ),

  updateMetadata: (noteId: string, data: { title?: string; folderId?: string; tags?: string[] }) =>
    workspaceApi.patch<ApiResponse<Note>>(`/v1/notes/${noteId}/metadata`, data),

  delete: (noteId: string, mode: 'trash' | 'permanent') =>
    workspaceApi.delete<ApiResponse<{ deletedAt: string; purgeAt?: string }>>(`/v1/notes/${noteId}`, {
      data: { mode }
    }),

  recordView: (noteId: string) =>
    workspaceApi.post<ApiResponse<{ ok: boolean }>>(`/v1/notes/${noteId}/views`, { viewedAt: new Date().toISOString() }),

  getRecentActivities: (limit = 20) =>
    workspaceApi.get<ApiResponse<RecentActivity[]>>('/v1/recent-activities', { params: { limit } }),

  updateTags: (noteId: string, tagNames: string[]) =>
    workspaceApi.put<ApiResponse<Tag[]>>(`/v1/notes/${noteId}/tags`, { tagNames }),

  suggestTags: (q: string) =>
    workspaceApi.get<ApiResponse<Tag[]>>('/v1/tags/suggestions', { params: { q } }),

  setFavorite: (targetType: string, targetId: string, enabled: boolean) =>
    workspaceApi.put<ApiResponse<{ enabled: boolean }>>(`/v1/favorites/${targetType}/${targetId}`, { enabled }),

  getBacklinks: (noteId: string) =>
    workspaceApi.get<ApiResponse<Backlink[]>>(`/v1/notes/${noteId}/backlinks`),

  getLinks: (noteId: string) =>
    workspaceApi.get<ApiResponse<NoteLink[]>>(`/v1/notes/${noteId}/links`),

  createLink: (noteId: string, data: { targetNoteId?: string; targetTitle?: string; createIfMissing?: boolean }) =>
    workspaceApi.post<ApiResponse<NoteLink>>(`/v1/notes/${noteId}/links`, data),

  deleteLink: (noteId: string, linkId: string) =>
    workspaceApi.delete<ApiResponse<{ ok: boolean }>>(`/v1/notes/${noteId}/links/${linkId}`),

  getGraph: () =>
    workspaceApi.get<ApiResponse<GraphData>>('/v1/graph'),
}

export const folderApi = {
  getAll: () =>
    workspaceApi.get<ApiResponse<Folder[]>>('/v1/folders'),

  create: (data: { name: string; parentFolderId?: string }) =>
    workspaceApi.post<ApiResponse<Folder>>('/v1/folders', data),

  update: (folderId: string, data: { name?: string; parentFolderId?: string }) =>
    workspaceApi.patch<ApiResponse<Folder>>(`/v1/folders/${folderId}`, data),

  delete: (folderId: string, data: { childNoteAction: 'move' | 'trash'; targetFolderId?: string }) =>
    workspaceApi.delete<ApiResponse<{ ok: boolean }>>(`/v1/folders/${folderId}`, { data }),
}

export const shareLinkApi = {
  create: (data: { noteId: string; permission: 'read' | 'edit'; expiresAt?: string }) =>
    workspaceApi.post<ApiResponse<ShareLink>>('/v1/share-links', data),

  update: (shareId: string, data: { expiresAt?: string; revoked?: boolean }) =>
    workspaceApi.patch<ApiResponse<ShareLink>>(`/v1/share-links/${shareId}`, data),
}
