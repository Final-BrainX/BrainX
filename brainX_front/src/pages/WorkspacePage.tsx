import { useEffect } from 'react'
import Sidebar from '../components/layout/Sidebar'
import NoteEditor from '../components/workspace/NoteEditor'
import { useWorkspaceStore } from '../store/workspaceStore'
import { Loader2 } from 'lucide-react'

export default function WorkspacePage() {
  const { syncWorkspace, isLoading, notes } = useWorkspaceStore()

  useEffect(() => {
    syncWorkspace()
  }, [syncWorkspace])

  return (
    <div className="flex h-screen bg-surface overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex overflow-hidden relative">
        {isLoading && notes.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />
              <p className="text-sm text-slate-400">지식 우주를 불러오는 중...</p>
            </div>
          </div>
        ) : (
          <NoteEditor />
        )}
      </main>
    </div>
  )
}
