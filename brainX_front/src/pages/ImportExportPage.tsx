import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { notionApi, obsidianApi, importJobApi, exportApi } from '../api/ingestion'

type Tab = 'notion' | 'obsidian' | 'export'

type JobStatus = 'idle' | 'pending' | 'processing' | 'completed' | 'failed'

interface NotionPage {
  id: string
  title: string
  lastEditedTime: string
  icon: string | null
}

interface ImportResult {
  jobId: string
  status: JobStatus
  createdNotes: { noteId: string; title: string }[]
  failedFiles: { fileName: string; reason: string }[]
}

interface ExportResult {
  jobId: string
  status: JobStatus
  downloadUrl: string | null
  error?: string
}

export default function ImportExportPage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<Tab>('notion')

  // Notion 상태
  const [notionIntegrationId, setNotionIntegrationId] = useState(
    () => sessionStorage.getItem('notionIntegrationId') || ''
  )
  const [notionPages, setNotionPages] = useState<NotionPage[]>([])
  const [notionPagesLoading, setNotionPagesLoading] = useState(false)
  const [notionSourceId, setNotionSourceId] = useState('')
  const [notionSourceTitle, setNotionSourceTitle] = useState('')
  const [notionImportResult, setNotionImportResult] = useState<ImportResult | null>(null)
  const [notionLoading, setNotionLoading] = useState(false)

  // Obsidian 상태
  const [obsidianAssetId, setObsidianAssetId] = useState('')
  const [obsidianTargetFolder, setObsidianTargetFolder] = useState('')
  const [obsidianResult, setObsidianResult] = useState<ImportResult | null>(null)
  const [obsidianLoading, setObsidianLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Export 상태
  const [exportNoteId, setExportNoteId] = useState('')
  const [exportFormat, setExportFormat] = useState<'PDF' | 'TXT' | 'MD'>('PDF')
  const [exportResult, setExportResult] = useState<ExportResult | null>(null)
  const [exportLoading, setExportLoading] = useState(false)

  // 연동 완료 시 자동으로 페이지 목록 조회
  useEffect(() => {
    if (notionIntegrationId) {
      fetchNotionPages()
    }
  }, [notionIntegrationId])

  const fetchNotionPages = async () => {
    if (!notionIntegrationId) return
    setNotionPagesLoading(true)
    setNotionPages([])
    setNotionSourceId('')
    setNotionSourceTitle('')
    try {
      const res = await notionApi.getPages(notionIntegrationId)
      setNotionPages(res.data.data.pages)
      if (res.data.data.pages.length === 0) {
        toast('가져올 수 있는 Notion 페이지가 없습니다.', { icon: 'ℹ️' })
      }
    } catch {
      toast.error('Notion 페이지 목록을 불러오지 못했습니다.')
    } finally {
      setNotionPagesLoading(false)
    }
  }

  // ── Notion OAuth ──────────────────────────────────────────────────────────

  const handleNotionAuthorize = async () => {
    setNotionLoading(true)
    try {
      const res = await notionApi.authorize()
      const { authorizationUrl } = res.data.data
      window.location.href = authorizationUrl
    } catch {
      toast.error('Notion 연결 URL 생성에 실패했습니다.')
      setNotionLoading(false)
    }
  }

  const handleNotionImport = async () => {
    if (!notionIntegrationId) { toast.error('먼저 Notion 계정을 연동하세요.'); return }
    if (!notionSourceId) { toast.error('가져올 페이지를 선택하세요.'); return }
    setNotionLoading(true)
    try {
      const res = await notionApi.createJob({
        integrationAccountId: notionIntegrationId,
        sourceId: notionSourceId,
      })
      const jobId = res.data.data.importJobId
      toast.success(res.data.message)
      await pollImportStatus(jobId, setNotionImportResult)
    } catch {
      toast.error('Notion 가져오기 요청에 실패했습니다.')
    } finally {
      setNotionLoading(false)
    }
  }

  // ── Obsidian ──────────────────────────────────────────────────────────────

  const handleObsidianFileSelect = () => fileInputRef.current?.click()

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.endsWith('.zip')) {
      toast.error('.zip 파일만 업로드 가능합니다.')
      return
    }
    setObsidianAssetId('ast_' + file.name.replace(/[^a-zA-Z0-9]/g, '_'))
    toast.success(`파일 선택됨: ${file.name}`)
  }

  const handleObsidianImport = async () => {
    if (!obsidianAssetId) { toast.error('zip 파일을 먼저 선택하세요.'); return }
    setObsidianLoading(true)
    try {
      const res = await obsidianApi.createJob({
        uploadedZipAssetId: obsidianAssetId,
        targetFolderId: obsidianTargetFolder || undefined,
      })
      const jobId = res.data.data.importJobId
      toast.success(res.data.message)
      await pollImportStatus(jobId, setObsidianResult)
    } catch {
      toast.error('Obsidian 가져오기 요청에 실패했습니다.')
    } finally {
      setObsidianLoading(false)
    }
  }

  // ── Export ────────────────────────────────────────────────────────────────

  const handleExport = async () => {
    if (!exportNoteId) { toast.error('노트 ID를 입력하세요.'); return }
    setExportLoading(true)
    setExportResult(null)
    try {
      const res = await exportApi.create({ noteId: exportNoteId, format: exportFormat })
      const jobId = res.data.data.exportJobId
      toast.success(res.data.message)
      await pollExportStatus(jobId)
    } catch {
      toast.error('내보내기 요청에 실패했습니다.')
    } finally {
      setExportLoading(false)
    }
  }

  // ── Polling helpers ───────────────────────────────────────────────────────

  const pollImportStatus = async (
    jobId: string,
    setResult: (r: ImportResult) => void
  ) => {
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 1500))
      try {
        const res = await importJobApi.getStatus(jobId)
        const d = res.data.data
        const status = d.status.toLowerCase() as JobStatus
        setResult({
          jobId: d.importJobId,
          status,
          createdNotes: d.createdNotes,
          failedFiles: d.failedFiles,
        })
        if (status === 'completed' || status === 'failed') {
          toast[status === 'completed' ? 'success' : 'error'](
            status === 'completed' ? '가져오기 완료!' : '가져오기 실패'
          )
          return
        }
      } catch {
        break
      }
    }
  }

  const pollExportStatus = async (jobId: string) => {
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 1500))
      try {
        const res = await exportApi.getStatus(jobId)
        const d = res.data.data
        const status = d.status.toLowerCase() as JobStatus
        setExportResult({ jobId: d.exportJobId, status, downloadUrl: d.downloadUrl, error: d.error })
        if (status === 'completed' || status === 'failed') {
          toast[status === 'completed' ? 'success' : 'error'](
            status === 'completed' ? '내보내기 완료!' : '내보내기 실패'
          )
          return
        }
      } catch {
        break
      }
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const tabs: { key: Tab; label: string }[] = [
    { key: 'notion', label: 'Notion 가져오기' },
    { key: 'obsidian', label: 'Obsidian 가져오기' },
    { key: 'export', label: '내보내기' },
  ]

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-slate-100 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">가져오기 / 내보내기</h1>
            <p className="text-slate-400 text-sm mt-0.5">Notion, Obsidian 가져오기와 노트 내보내기를 관리합니다.</p>
          </div>
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors"
          >
            ← 노트로 돌아가기
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 mb-6 bg-[#1a1a2e] rounded-xl p-1">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === t.key
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ─── Notion Tab ─── */}
        {activeTab === 'notion' && (
          <div className="space-y-4">
            {/* Step 1: OAuth */}
            <Section title="Step 1. Notion 계정 연동">
              {notionIntegrationId ? (
                <div className="space-y-2">
                  <StatusBadge success>연동 완료 — ID: {notionIntegrationId}</StatusBadge>
                  <button
                    onClick={() => {
                      setNotionIntegrationId('')
                      setNotionPages([])
                      setNotionSourceId('')
                      setNotionSourceTitle('')
                      sessionStorage.removeItem('notionIntegrationId')
                    }}
                    className="text-xs text-slate-500 hover:text-slate-300"
                  >
                    다른 계정으로 연동
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <button
                    onClick={handleNotionAuthorize}
                    disabled={notionLoading}
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
                  >
                    {notionLoading ? '이동 중...' : 'Notion 계정 연동하기'}
                  </button>
                  <p className="text-xs text-slate-500 text-center">
                    다른 Notion 계정으로 연동하려면 먼저{' '}
                    <a
                      href="https://www.notion.so/logout"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-400 hover:text-indigo-300 underline"
                    >
                      Notion에서 로그아웃
                    </a>
                    {' '}후 진행하세요.
                  </p>
                </div>
              )}
            </Section>

            {/* Step 2: 페이지 목록 선택 */}
            {notionIntegrationId && (
              <Section title="Step 2. 가져올 페이지 선택">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-slate-400">
                    {notionPagesLoading
                      ? '페이지 목록을 불러오는 중...'
                      : `${notionPages.length}개의 페이지`}
                  </p>
                  <button
                    onClick={fetchNotionPages}
                    disabled={notionPagesLoading}
                    className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-40"
                  >
                    새로고침
                  </button>
                </div>

                {notionPagesLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-12 bg-slate-800/50 rounded-lg animate-pulse" />
                    ))}
                  </div>
                ) : notionPages.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-6">
                    가져올 수 있는 페이지가 없습니다.
                  </p>
                ) : (
                  <ul className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                    {notionPages.map(page => (
                      <li key={page.id}>
                        <button
                          onClick={() => {
                            setNotionSourceId(page.id)
                            setNotionSourceTitle(page.title)
                          }}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm transition-colors ${
                            notionSourceId === page.id
                              ? 'bg-indigo-600/30 border border-indigo-500 text-white'
                              : 'bg-slate-800/40 hover:bg-slate-700/50 text-slate-200 border border-transparent'
                          }`}
                        >
                          <span className="text-base w-5 text-center shrink-0">
                            {page.icon || '📄'}
                          </span>
                          <span className="flex-1 truncate">{page.title}</span>
                          {notionSourceId === page.id && (
                            <span className="text-indigo-400 shrink-0">✓</span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {notionSourceId && (
                  <div className="mt-2 text-xs text-indigo-300 bg-indigo-900/20 rounded px-3 py-2">
                    선택됨: <span className="font-medium">{notionSourceTitle}</span>
                  </div>
                )}
              </Section>
            )}

            {/* Step 3: 가져오기 실행 */}
            {notionIntegrationId && (
              <button
                onClick={handleNotionImport}
                disabled={notionLoading || !notionSourceId}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl text-sm font-medium transition-colors"
              >
                {notionLoading ? '가져오는 중...' : '가져오기 시작'}
              </button>
            )}

            {notionImportResult && <ImportResultPanel result={notionImportResult} />}
          </div>
        )}

        {/* ─── Obsidian Tab ─── */}
        {activeTab === 'obsidian' && (
          <div className="space-y-4">
            <Section title="Obsidian Vault 가져오기">
              <input
                type="file"
                accept=".zip"
                ref={fileInputRef}
                className="hidden"
                onChange={handleFileChange}
              />
              <button
                onClick={handleObsidianFileSelect}
                className="w-full py-8 border-2 border-dashed border-slate-600 hover:border-indigo-500 rounded-xl text-slate-400 hover:text-indigo-300 transition-colors text-sm"
              >
                {obsidianAssetId
                  ? `선택됨: ${obsidianAssetId}`
                  : 'Obsidian Vault .zip 파일을 선택하세요'}
              </button>
              <Input
                placeholder="대상 폴더 ID (선택)"
                value={obsidianTargetFolder}
                onChange={setObsidianTargetFolder}
              />
              <button
                onClick={handleObsidianImport}
                disabled={obsidianLoading || !obsidianAssetId}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg text-sm font-medium"
              >
                {obsidianLoading ? '가져오는 중...' : '가져오기 시작'}
              </button>
            </Section>

            {obsidianResult && <ImportResultPanel result={obsidianResult} />}
          </div>
        )}

        {/* ─── Export Tab ─── */}
        {activeTab === 'export' && (
          <div className="space-y-4">
            <Section title="노트 내보내기">
              <Input
                placeholder="노트 ID"
                value={exportNoteId}
                onChange={setExportNoteId}
              />
              <div className="flex gap-2">
                {(['PDF', 'TXT', 'MD'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setExportFormat(f)}
                    className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors ${
                      exportFormat === f
                        ? 'border-indigo-500 bg-indigo-600/20 text-indigo-300'
                        : 'border-slate-600 text-slate-400 hover:border-slate-400'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <button
                onClick={handleExport}
                disabled={exportLoading || !exportNoteId}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg text-sm font-medium"
              >
                {exportLoading ? '내보내는 중...' : '내보내기 시작'}
              </button>
            </Section>

            {exportResult && (
              <div className="bg-[#1a1a2e] rounded-xl p-4 space-y-2">
                <h3 className="text-sm font-medium text-slate-300">내보내기 결과</h3>
                <StatusBadge success={exportResult.status === 'completed'}>
                  상태: {exportResult.status.toUpperCase()}
                </StatusBadge>
                {exportResult.downloadUrl && (
                  <a
                    href={exportResult.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-xs text-indigo-400 underline break-all"
                  >
                    다운로드 링크: {exportResult.downloadUrl}
                  </a>
                )}
                {exportResult.error && (
                  <p className="text-xs text-red-400">오류: {exportResult.error}</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── 공용 컴포넌트 ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#1a1a2e] rounded-xl p-4 space-y-3">
      <h2 className="text-sm font-semibold text-slate-300">{title}</h2>
      {children}
    </div>
  )
}

function Input({
  placeholder,
  value,
  onChange,
}: {
  placeholder: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <input
      type="text"
      placeholder={placeholder}
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full bg-[#0f0f1a] border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
    />
  )
}

function StatusBadge({ success, children }: { success: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`text-xs px-3 py-1.5 rounded-lg ${
        success ? 'bg-emerald-900/40 text-emerald-300' : 'bg-red-900/40 text-red-300'
      }`}
    >
      {children}
    </div>
  )
}

function ImportResultPanel({ result }: { result: ImportResult }) {
  const navigate = useNavigate()
  return (
    <div className="bg-[#1a1a2e] rounded-xl p-4 space-y-3">
      <h3 className="text-sm font-medium text-slate-300">가져오기 결과</h3>
      <StatusBadge success={result.status === 'completed'}>
        상태: {result.status.toUpperCase()}
      </StatusBadge>
      {result.status === 'completed' && (
        <button
          onClick={() => navigate('/')}
          className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-sm font-medium transition-colors"
        >
          노트 보러 가기 →
        </button>
      )}
      {result.createdNotes.length > 0 && (
        <div>
          <p className="text-xs text-slate-400 mb-1">생성된 노트 ({result.createdNotes.length})</p>
          <ul className="space-y-1">
            {result.createdNotes.map(n => (
              <li key={n.noteId} className="text-xs text-emerald-300 bg-emerald-900/20 rounded px-2 py-1">
                {n.title} <span className="text-slate-500">({n.noteId})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {result.failedFiles.length > 0 && (
        <div>
          <p className="text-xs text-slate-400 mb-1">실패한 파일 ({result.failedFiles.length})</p>
          <ul className="space-y-1">
            {result.failedFiles.map((f, i) => (
              <li key={i} className="text-xs text-red-300 bg-red-900/20 rounded px-2 py-1">
                {f.fileName} — {f.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
