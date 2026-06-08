import { create } from 'zustand'
import type { Note, Folder, Tag, RecentActivity, NoteDetail, SaveStatus } from '../types'
import { noteApi, folderApi } from '../api/workspace'

interface WorkspaceState {
  notes: Note[]
  folders: Folder[]
  tags: Tag[]
  recentActivities: RecentActivity[]
  activeNoteId: string | null
  activeNote: NoteDetail | null
  saveStatus: SaveStatus
  syncCursor: string | null
  isLoading: boolean
  searchQuery: string

  // Actions
  syncWorkspace: () => Promise<void>
  selectNote: (noteId: string) => Promise<void>
  createNote: (title: string, folderId?: string) => Promise<Note>
  saveContent: (noteId: string, markdown: string, version: number) => Promise<boolean>
  updateMetadata: (noteId: string, data: { title?: string; folderId?: string; tags?: string[] }) => Promise<void>
  deleteNote: (noteId: string, mode: 'trash' | 'permanent') => Promise<void>
  createFolder: (name: string, parentFolderId?: string) => Promise<void>
  deleteFolder: (folderId: string) => Promise<void>
  setSaveStatus: (status: SaveStatus) => void
  setSearchQuery: (q: string) => void
  setActiveNoteId: (id: string | null) => void
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  notes: [],
  folders: [],
  tags: [],
  recentActivities: [],
  activeNoteId: null,
  activeNote: null,
  saveStatus: 'saved',
  syncCursor: null,
  isLoading: false,
  searchQuery: '',

  syncWorkspace: async () => {
    set({ isLoading: true })
    try {
      const res = await noteApi.sync(get().syncCursor ?? undefined)
      const data = res.data.data!
      set({
        notes: data.notes,
        folders: data.folders,
        tags: data.tags,
        recentActivities: data.recentActivities,
        syncCursor: data.cursor,
      })
    } finally {
      set({ isLoading: false })
    }
  },

  selectNote: async (noteId) => {
    set({ activeNoteId: noteId, activeNote: null })
    try {
      await noteApi.recordView(noteId)
      const res = await noteApi.get(noteId)
      set({ activeNote: res.data.data! })
    } catch (e) {
      console.error('노트 로드 실패', e)
    }
  },

  createNote: async (title, folderId) => {
    const res = await noteApi.create({ title, folderId })
    const newNote = res.data.data!
    set(s => ({ notes: [newNote, ...s.notes] }))
    return newNote
  },

  saveContent: async (noteId, markdown, version) => {
    set({ saveStatus: 'saving' })
    try {
      const res = await noteApi.saveContent(noteId, {
        baseVersion: version,
        markdown,
        clientSavedAt: new Date().toISOString(),
      })
      const result = res.data.data!
      if (result.conflict) {
        set({ saveStatus: 'conflict' })
        return false
      }
      set(s => ({
        saveStatus: 'saved',
        notes: s.notes.map(n =>
          n.noteId === noteId ? { ...n, version: result.version, updatedAt: result.savedAt } : n
        ),
        activeNote: s.activeNote
          ? { ...s.activeNote, version: result.version }
          : null,
      }))
      return true
    } catch {
      set({ saveStatus: 'unsaved' })
      return false
    }
  },

  updateMetadata: async (noteId, data) => {
    const res = await noteApi.updateMetadata(noteId, data)
    const updated = res.data.data!
    set(s => ({
      notes: s.notes.map(n => n.noteId === noteId ? updated : n),
      activeNote: s.activeNote?.note.noteId === noteId
        ? { ...s.activeNote, note: updated }
        : s.activeNote,
    }))
  },

  deleteNote: async (noteId, mode) => {
    await noteApi.delete(noteId, mode)
    set(s => ({
      notes: s.notes.filter(n => n.noteId !== noteId),
      activeNoteId: s.activeNoteId === noteId ? null : s.activeNoteId,
      activeNote: s.activeNote?.note.noteId === noteId ? null : s.activeNote,
    }))
  },

  createFolder: async (name, parentFolderId) => {
    const res = await folderApi.create({ name, parentFolderId })
    set(s => ({ folders: [...s.folders, res.data.data!] }))
  },

  deleteFolder: async (folderId) => {
    await folderApi.delete(folderId, { childNoteAction: 'trash' })
    set(s => ({ folders: s.folders.filter(f => f.folderId !== folderId) }))
  },

  setSaveStatus: (status) => set({ saveStatus: status }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setActiveNoteId: (id) => set({ activeNoteId: id }),
}))
