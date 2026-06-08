// ===== Auth / Identity =====
export interface User {
  userId: string
  email: string
  profile: { nickname: string | null; profileImageUrl: string | null }
  security: { twoFactorEnabled: boolean; emailVerified: boolean; linkedProviders: string[] }
  consents: {
    termsRequired: boolean
    privacyRequired: boolean
    marketingOptional: boolean
    behaviorAnalyticsOptional: boolean
  } | null
}

export interface TokenResponse {
  userId: string
  accessToken: string
  refreshToken: string
  requires2fa: boolean
  next?: string
}

// ===== Workspace =====
export interface Note {
  noteId: string
  title: string
  status: 'ACTIVE' | 'TRASHED' | 'DELETED'
  version: number
  folderId: string | null
  tags: string[]
  isPublic: boolean
  createdAt: string
  updatedAt: string
}

export interface NoteDetail {
  note: Note
  content: string
  version: number
}

export interface Folder {
  folderId: string
  name: string
  parentFolderId: string | null
  createdAt: string
  updatedAt: string
}

export interface Tag {
  tagId: string
  name: string
  color: string
}

export interface RecentActivity {
  noteId: string
  noteTitle: string
  viewedAt: string
}

export interface NoteLink {
  linkId: string
  targetNoteId: string
  targetTitle: string
}

export interface Backlink {
  noteId: string
  title: string
  createdAt: string
}

export interface ShareLink {
  shareId: string
  url: string
  permission: 'read' | 'edit'
  expiresAt: string | null
  revoked: boolean
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface GraphNode {
  id: string
  label: string
  type: string
  createdAt: string
  updatedAt: string
}

export interface GraphEdge {
  id: string
  source: string
  target: string
}

export interface WorkspaceSync {
  cursor: string
  notes: Note[]
  folders: Folder[]
  tags: Tag[]
  links: NoteLink[]
  favorites: { enabled: boolean }[]
  recentActivities: RecentActivity[]
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: { code: string; message: string }
}

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'conflict'
