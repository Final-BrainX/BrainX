import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Eye, Edit3, Save, Clock, AlertTriangle, CheckCircle,
  Hash, X, Trash2, Link2, Columns
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import toast from 'react-hot-toast'
import { useWorkspaceStore } from '../../store/workspaceStore'
import { noteApi } from '../../api/workspace'
import type { Backlink, SaveStatus } from '../../types'

type ViewMode = 'edit' | 'preview' | 'split'

export default function NoteEditor() {
  const {
    activeNote, saveContent, setSaveStatus, saveStatus,
    updateMetadata, deleteNote, notes, selectNote
  } = useWorkspaceStore()

  const [mode, setMode] = useState<ViewMode>('split')
  const [content, setContent] = useState('')
  const [title, setTitle] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [backlinks, setBacklinks] = useState<Backlink[]>([])
  const [showLinkPanel, setShowLinkPanel] = useState(false)
  const [linkQuery, setLinkQuery] = useState('')
  const [showLinkSuggestions, setShowLinkSuggestions] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const versionRef = useRef<number>(1)

  useEffect(() => {
    if (activeNote) {
      setContent(activeNote.content || '')
      setTitle(activeNote.note.title)
      setTags(activeNote.note.tags || [])
      versionRef.current = activeNote.version
      fetchBacklinks(activeNote.note.noteId)
    }
  }, [activeNote?.note.noteId])

  const fetchBacklinks = async (noteId: string) => {
    try {
      const res = await noteApi.getBacklinks(noteId)
      if (res.data.data) setBacklinks(res.data.data)
    } catch {}
  }

  const scheduleAutoSave = useCallback((text: string) => {
    if (!activeNote) return
    setSaveStatus('unsaved')
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus('saving')
      const ok = await saveContent(activeNote.note.noteId, text, versionRef.current)
      if (ok) {
        versionRef.current += 1
        setSaveStatus('saved')
      }
    }, 1500)
  }, [activeNote, saveContent, setSaveStatus])

  // [[ ]] 백링크 감지
  const handleContentChange = (val: string) => {
    setContent(val)
    scheduleAutoSave(val)

    const textarea = textareaRef.current
    if (!textarea) return
    const pos = textarea.selectionStart
    const textBefore = val.slice(0, pos)
    const match = textBefore.match(/\[\[([^\]]{0,30})$/)
    if (match) {
      setLinkQuery(match[1])
      setShowLinkSuggestions(true)
    } else {
      setShowLinkSuggestions(false)
      setLinkQuery('')
    }
  }

  const handleSelectLink = async (targetNoteId: string, targetTitle: string) => {
    if (!activeNote || !textareaRef.current) return
    const pos = textareaRef.current.selectionStart
    const textBefore = content.slice(0, pos)
    const textAfter = content.slice(pos)
    const newText = textBefore.replace(/\[\[([^\]]*)$/, `[[${targetTitle}]]`) + textAfter
    setContent(newText)
    setShowLinkSuggestions(false)
    scheduleAutoSave(newText)

    try {
      await noteApi.createLink(activeNote.note.noteId, { targetNoteId, targetTitle })
      await fetchBacklinks(activeNote.note.noteId)
      toast.success(`"${targetTitle}"와 연결됨`)
    } catch {}
  }

  const handleTitleBlur = async () => {
    if (!activeNote || title === activeNote.note.title) return
    try { await updateMetadata(activeNote.note.noteId, { title }) } catch {}
  }

  const handleAddTag = async (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' || !tagInput.trim() || !activeNote) return
    const newTags = [...new Set([...tags, tagInput.trim()])]
    setTags(newTags)
    setTagInput('')
    try { await noteApi.updateTags(activeNote.note.noteId, newTags) } catch {}
  }

  const handleRemoveTag = async (tag: string) => {
    if (!activeNote) return
    const newTags = tags.filter(t => t !== tag)
    setTags(newTags)
    try { await noteApi.updateTags(activeNote.note.noteId, newTags) } catch {}
  }

  const handleDelete = async () => {
    if (!activeNote) return
    if (!confirm('이 노트를 휴지통으로 이동하시겠습니까?')) return
    await deleteNote(activeNote.note.noteId, 'trash')
    toast.success('노트가 휴지통으로 이동되었습니다')
  }

  const linkSuggestions = notes
    .filter(n =>
      n.status === 'ACTIVE' &&
      n.noteId !== activeNote?.note.noteId &&
      n.title.toLowerCase().includes(linkQuery.toLowerCase())
    )
    .slice(0, 6)

  if (!activeNote) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
        <div className="w-20 h-20 bg-brand-500/10 rounded-2xl flex items-center justify-center mb-4 animate-pulse-slow border border-brand-500/20">
          <Edit3 className="w-10 h-10 text-brand-400/50" />
        </div>
        <h2 className="text-lg font-semibold font-display text-slate-400 mb-2">노트를 선택하세요</h2>
        <p className="text-sm text-slate-600 max-w-xs">
          왼쪽 사이드바에서 노트를 선택하거나 새 노트를 만들어 지식 탐험을 시작하세요
        </p>
      </div>
    )
  }

  const statusIcons: Record<SaveStatus, React.ReactNode> = {
    saved:    <CheckCircle className="w-3.5 h-3.5 text-green-400" />,
    saving:   <Save className="w-3.5 h-3.5 text-blue-400 animate-pulse" />,
    unsaved:  <Clock className="w-3.5 h-3.5 text-yellow-400" />,
    conflict: <AlertTriangle className="w-3.5 h-3.5 text-red-400" />,
  }
  const statusLabels: Record<SaveStatus, string> = {
    saved: '저장됨', saving: '저장 중...', unsaved: '변경사항 있음', conflict: '충돌 발생',
  }

  const markdownContent = (
    <div className="markdown-body max-w-none px-8 py-4 overflow-y-auto h-full">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content || '*내용을 입력하세요*'}
      </ReactMarkdown>
    </div>
  )

  const editorContent = (
    <div className="relative flex-1 flex flex-col overflow-hidden">
      <textarea
        ref={textareaRef}
        value={content}
        onChange={e => handleContentChange(e.target.value)}
        className="flex-1 w-full bg-transparent text-slate-300 outline-none resize-none font-mono text-sm leading-relaxed placeholder-slate-600 px-8 py-4"
        placeholder={`마크다운으로 작성하세요...\n\n# 제목\n## 소제목\n**굵게** *기울임* \`코드\`\n\n[[ 를 입력하면 다른 노트와 연결됩니다`}
        spellCheck={false}
      />

      {/* [[ ]] 링크 자동완성 팝업 */}
      {showLinkSuggestions && linkSuggestions.length > 0 && (
        <div className="absolute left-8 bottom-4 w-64 bg-surface-card border border-surface-border rounded-xl shadow-2xl overflow-hidden z-50 animate-slide-up">
          <div className="px-3 py-2 border-b border-surface-border">
            <p className="text-xs text-slate-500 flex items-center gap-1">
              <Link2 className="w-3 h-3" /> 노트 연결 선택
            </p>
          </div>
          {linkSuggestions.map(note => (
            <button
              key={note.noteId}
              onClick={() => handleSelectLink(note.noteId, note.title)}
              className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-surface-hover hover:text-white transition-colors flex items-center gap-2"
            >
              <Edit3 className="w-3.5 h-3.5 text-brand-400 flex-shrink-0" />
              <span className="truncate">{note.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full">
      {/* 헤더 툴바 */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-surface-border bg-surface flex-shrink-0">
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          {statusIcons[saveStatus]}
          <span>{statusLabels[saveStatus]}</span>
          <span className="text-slate-600 ml-1">v{versionRef.current}</span>
        </div>

        <div className="flex items-center gap-1">
          {/* 뷰 모드 토글 */}
          <div className="flex items-center bg-surface-hover rounded-lg p-0.5 mr-2">
            {([
              { id: 'edit' as ViewMode,    icon: Edit3,   label: '편집' },
              { id: 'split' as ViewMode,   icon: Columns, label: '분할' },
              { id: 'preview' as ViewMode, icon: Eye,     label: '미리보기' },
            ]).map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => setMode(id)}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-all duration-150 ${
                  mode === id ? 'bg-brand-500 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Icon className="w-3 h-3" />
                {label}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowLinkPanel(!showLinkPanel)}
            className={`btn-ghost text-xs ${showLinkPanel ? 'text-brand-400' : ''}`}
          >
            <Link2 className="w-3.5 h-3.5" />
            백링크
            {backlinks.length > 0 && (
              <span className="bg-brand-500/30 text-brand-300 px-1 rounded text-xs">
                {backlinks.length}
              </span>
            )}
          </button>

          <button onClick={handleDelete} className="btn-ghost text-xs hover:text-red-400">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* 에디터 메인 */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* 제목 + 태그 */}
          <div className="px-8 pt-5 pb-3 flex-shrink-0">
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              onBlur={handleTitleBlur}
              className="w-full bg-transparent text-2xl font-bold font-display text-white outline-none placeholder-slate-600"
              placeholder="노트 제목..."
            />
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {tags.map(tag => (
                <span key={tag} className="inline-flex items-center gap-1 text-xs bg-brand-500/15 text-brand-300 border border-brand-500/20 rounded-full px-2 py-0.5">
                  <Hash className="w-2.5 h-2.5" />{tag}
                  <button onClick={() => handleRemoveTag(tag)} className="hover:text-red-400 transition-colors ml-0.5">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={handleAddTag}
                placeholder="태그 추가... (Enter)"
                className="text-xs bg-transparent text-slate-400 outline-none placeholder-slate-600 min-w-24"
              />
            </div>
          </div>

          <div className="h-px bg-surface-border mx-8 flex-shrink-0" />

          {/* 본문 영역 */}
          <div className="flex-1 overflow-hidden flex">
            {mode === 'edit' && (
              <div className="flex-1 flex flex-col overflow-hidden">{editorContent}</div>
            )}
            {mode === 'preview' && (
              <div className="flex-1 overflow-y-auto">{markdownContent}</div>
            )}
            {mode === 'split' && (
              <>
                <div className="flex-1 flex flex-col overflow-hidden border-r border-surface-border">
                  {editorContent}
                </div>
                <div className="flex-1 overflow-y-auto">{markdownContent}</div>
              </>
            )}
          </div>
        </div>

        {/* 백링크 사이드 패널 */}
        {showLinkPanel && (
          <div className="w-60 border-l border-surface-border bg-surface flex-shrink-0 overflow-y-auto animate-slide-up">
            <div className="p-4">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Link2 className="w-3 h-3" /> 백링크
              </h3>
              {backlinks.length === 0 ? (
                <p className="text-xs text-slate-600">이 노트를 링크한 노트가 없습니다</p>
              ) : (
                <div className="space-y-1">
                  {backlinks.map(bl => (
                    <button
                      key={bl.noteId}
                      onClick={() => selectNote(bl.noteId)}
                      className="w-full text-left text-xs text-slate-400 hover:text-white hover:bg-surface-hover rounded-lg px-2 py-1.5 transition-colors flex items-center gap-2"
                    >
                      <Edit3 className="w-3 h-3 text-brand-400 flex-shrink-0" />
                      <span className="truncate">{bl.title}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-4 p-2 bg-surface-hover rounded-lg">
                <p className="text-xs text-slate-500 leading-relaxed">
                  <span className="text-brand-400 font-mono">[[ </span>
                  를 입력하면 다른 노트와 연결할 수 있습니다
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}