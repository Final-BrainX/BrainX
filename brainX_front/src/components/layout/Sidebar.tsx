import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Brain, Search, FileText, FolderOpen, Star, Clock, Network,
  Settings, LogOut, Plus, ChevronRight, ChevronDown, Folder, Loader2, Hash
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '../../store/authStore'
import { useWorkspaceStore } from '../../store/workspaceStore'

export default function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuthStore()
  const { notes, folders, recentActivities, searchQuery, setSearchQuery, selectNote, createNote, activeNoteId } = useWorkspaceStore()
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [isCreating, setIsCreating] = useState(false)

  const handleLogout = async () => {
    await logout()
    navigate('/login')
    toast.success('로그아웃 되었습니다')
  }

  const handleCreateNote = async () => {
    setIsCreating(true)
    try {
      const note = await createNote('새 노트')
      await selectNote(note.noteId)
      navigate('/')
    } catch {
      toast.error('노트 생성 실패')
    } finally {
      setIsCreating(false)
    }
  }

  const filteredNotes = searchQuery
    ? notes.filter(n => n.title.toLowerCase().includes(searchQuery.toLowerCase()) && n.status === 'ACTIVE')
    : notes.filter(n => n.status === 'ACTIVE').slice(0, 50)

  const toggleFolder = (id: string) =>
    setExpandedFolders(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const rootFolders = folders.filter(f => !f.parentFolderId)

  return (
    <aside className="w-64 flex-shrink-0 flex flex-col border-r border-surface-border bg-surface h-full">
      {/* 로고 */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-surface-border">
        <div className="w-8 h-8 bg-brand-500/20 rounded-lg flex items-center justify-center border border-brand-500/30">
          <Brain className="w-4 h-4 text-brand-400" />
        </div>
        <div>
          <span className="font-bold text-white font-display text-sm">BrainX</span>
          <p className="text-xs text-slate-500">{user?.profile?.nickname || user?.email?.split('@')[0] || '탐험가'}</p>
        </div>
      </div>

      {/* 검색 */}
      <div className="px-3 py-3 border-b border-surface-border">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="노트 검색..."
            className="w-full bg-surface-hover border border-transparent text-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-xs placeholder-slate-500 outline-none focus:border-brand-500/50 transition-colors"
          />
        </div>
      </div>

      {/* 새 노트 버튼 */}
      <div className="px-3 py-2">
        <button onClick={handleCreateNote} disabled={isCreating} className="btn-primary w-full justify-center text-xs py-1.5">
          {isCreating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          새 노트
        </button>
      </div>

      {/* 네비게이션 */}
      <nav className="px-2 py-1 space-y-0.5 border-b border-surface-border">
        <button onClick={() => navigate('/')} className={`sidebar-item w-full text-left ${location.pathname === '/' ? 'active' : ''}`}>
          <FileText className="w-4 h-4" /> 모든 노트
        </button>
        <button onClick={() => navigate('/graph')} className={`sidebar-item w-full text-left ${location.pathname === '/graph' ? 'active' : ''}`}>
          <Network className="w-4 h-4" /> 지식 그래프
        </button>
      </nav>

      {/* 폴더 트리 */}
      <div className="px-2 py-2 border-b border-surface-border">
        <p className="text-xs font-medium text-slate-500 px-2 mb-1 uppercase tracking-wider">폴더</p>
        {rootFolders.length === 0 ? (
          <p className="text-xs text-slate-600 px-2 py-1">폴더가 없습니다</p>
        ) : (
          rootFolders.map(folder => (
            <div key={folder.folderId}>
              <button
                onClick={() => toggleFolder(folder.folderId)}
                className="sidebar-item w-full text-left"
              >
                {expandedFolders.has(folder.folderId)
                  ? <ChevronDown className="w-3 h-3 text-slate-500" />
                  : <ChevronRight className="w-3 h-3 text-slate-500" />}
                <Folder className="w-3.5 h-3.5 text-brand-400" />
                <span className="truncate text-xs">{folder.name}</span>
              </button>
              {expandedFolders.has(folder.folderId) && (
                <div className="ml-4">
                  {notes.filter(n => n.folderId === folder.folderId && n.status === 'ACTIVE').map(note => (
                    <button
                      key={note.noteId}
                      onClick={() => { selectNote(note.noteId); navigate('/') }}
                      className={`sidebar-item w-full text-left text-xs ${activeNoteId === note.noteId ? 'active' : ''}`}
                    >
                      <FileText className="w-3 h-3" />
                      <span className="truncate">{note.title}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* 최근 노트 */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        <p className="text-xs font-medium text-slate-500 px-2 mb-1 uppercase tracking-wider flex items-center gap-1">
          {searchQuery ? <><Search className="w-3 h-3" /> 검색 결과</> : <><Clock className="w-3 h-3" /> 최근 노트</>}
        </p>
        {filteredNotes.length === 0 ? (
          <p className="text-xs text-slate-600 px-2 py-1">
            {searchQuery ? '검색 결과가 없습니다' : '노트가 없습니다'}
          </p>
        ) : (
          filteredNotes.map(note => (
            <button
              key={note.noteId}
              onClick={() => { selectNote(note.noteId); navigate('/') }}
              className={`sidebar-item w-full text-left group ${activeNoteId === note.noteId ? 'active' : ''}`}
            >
              <FileText className="w-3.5 h-3.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="truncate text-xs">{note.title}</p>
                {note.tags.length > 0 && (
                  <p className="flex gap-1 mt-0.5">
                    {note.tags.slice(0, 2).map(tag => (
                      <span key={tag} className="text-[10px] text-brand-400 flex items-center gap-0.5">
                        <Hash className="w-2 h-2" />{tag}
                      </span>
                    ))}
                  </p>
                )}
              </div>
            </button>
          ))
        )}
      </div>

      {/* 하단 */}
      <div className="border-t border-surface-border px-2 py-2 space-y-0.5">
        <button onClick={() => navigate('/settings')} className="sidebar-item w-full text-left">
          <Settings className="w-4 h-4" /> 설정
        </button>
        <button onClick={handleLogout} className="sidebar-item w-full text-left hover:text-red-400">
          <LogOut className="w-4 h-4" /> 로그아웃
        </button>
      </div>
    </aside>
  )
}
