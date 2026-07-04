"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { cx } from "@/lib/utils";

import { useBrainX } from "@/components/brainx-provider";

import { Icon } from "@/components/brainx-ui";

import {
  clearNotionIntegration,
  getImportJobStatus,
  importNotionPage,
  listNotionPages,
  NOTION_OAUTH_MESSAGE_TYPE,
  readNotionIntegration,
  startNotionOAuth,
  uploadAndImportFile,
  type NotionIntegration,
  type NotionPage
} from "@/lib/ingestion-api";

type ImportedNote = {
  id: string;
  title: string;
};

const FILE_TYPES = [
  { id: "csv", label: "CSV", desc: "스프레드시트에서 구조화된 데이터 가져오기", icon: "csv" as const, accept: ".csv" },
  { id: "pdf", label: "PDF", desc: "PDF 문서에서 콘텐츠 추출하기", icon: "pdf" as const, accept: ".pdf" },
  { id: "text", label: "Text & Markdown", desc: "일반 텍스트 및 형식 있는 메모 가져오기", icon: "doc" as const, accept: ".txt,.md" },
  { id: "html", label: "HTML", desc: "웹 페이지 및 구조화된 콘텐츠 가져오기", icon: "html" as const, accept: ".html,.htm" },
  { id: "word", label: "Word", desc: "Word 문서를 BrainX로 가져오기", icon: "doc" as const, accept: ".docx" },
  { id: "pptx", label: "PowerPoint", desc: "PPT 슬라이드를 BrainX로 가져오기", icon: "doc" as const, accept: ".pptx" }
] as const;

export function ImportScreen() {
  const { pushToast } = useBrainX();
  const router = useRouter();
  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);

  const [notionIntegration, setNotionIntegration] = useState<NotionIntegration | null>(() => readNotionIntegration());
  const [notionPages, setNotionPages] = useState<NotionPage[]>([]);
  const [notionConnecting, setNotionConnecting] = useState(false);
  const [notionLoadingPages, setNotionLoadingPages] = useState(false);
  const [notionImportingId, setNotionImportingId] = useState<string | null>(null);
  const [importedNotionNotes, setImportedNotionNotes] = useState<ImportedNote[]>([]);
  // 페이지가 많은 Notion 워크스페이스나 반복 가져오기로 목록이 길어지면 화면이 너무 늘어나서
  // 접고 펼 수 있게 한다 — 기본은 펼친 상태, 사용자가 직접 접게 둔다.
  const [notionPagesCollapsed, setNotionPagesCollapsed] = useState(false);
  const [importedNotesCollapsed, setImportedNotesCollapsed] = useState(false);

  useEffect(() => {
    if (!notionIntegration) return;
    void loadNotionPages(notionIntegration.integrationAccountId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handleOAuthMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== NOTION_OAUTH_MESSAGE_TYPE) return;

      if (!event.data.success) {
        pushToast("Notion 연결에 실패했습니다.", "err");
        return;
      }

      const integration = readNotionIntegration();
      setNotionIntegration(integration);
      pushToast("Notion 워크스페이스에 연결됐어요", "ok");
      if (integration) void loadNotionPages(integration.integrationAccountId);
    }

    window.addEventListener("message", handleOAuthMessage);
    return () => window.removeEventListener("message", handleOAuthMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!importing) return;

    const interval = window.setInterval(() => {
      setProgress((current) => Math.min(current + (current < 40 ? 16 : current < 80 ? 10 : 6), 100));
    }, 150);

    return () => window.clearInterval(interval);
  }, [importing]);

  useEffect(() => {
    if (progress !== 100) return;
    setImporting(false);
  }, [progress]);

  const startRealImport = async (file: File) => {
    if (importing) return;
    setProgress(4);
    setImporting(true);
    try {
      const job = await uploadAndImportFile(file);
      setProgress(100);

      if (!job || job.status === "FAILED") {
        pushToast(`${file.name} 가져오기에 실패했습니다.`, "err");
        return;
      }

      const noteIds = job.createdNotes.map((item) => item.noteId).filter((id): id is string => !!id);
      pushToast(`${file.name} 가져오기를 완료했어요`, "ok");

      if (noteIds.length > 0) {
        setImportedNotionNotes((current) => [
          ...noteIds.map((noteId) => ({ id: noteId, title: file.name })),
          ...current
        ]);
        window.dispatchEvent(new CustomEvent("brainx:notes-refresh", { detail: { noteId: noteIds[0] } }));
        router.push(`/notes/${noteIds[0]}`);
      }
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "가져오기에 실패했습니다.", "err");
    } finally {
      setImporting(false);
      setProgress(0);
    }
  };

  const startImport = (file: File) => {
    void startRealImport(file);
  };

  const handleFiles = (files: FileList | null) => {
    if (!files || !files.length) return;
    startImport(files[0]);
  };

  const openFilePicker = (accept = ".zip,.csv,.pdf,.txt,.md,.html,.docx,.epub,.pptx") => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = (event) => handleFiles((event.target as HTMLInputElement).files);
    input.click();
  };

  const loadNotionPages = async (integrationAccountId: string) => {
    setNotionLoadingPages(true);
    try {
      const pages = await listNotionPages(integrationAccountId);
      setNotionPages(pages);
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Notion 페이지 목록을 가져오지 못했습니다.", "err");
    } finally {
      setNotionLoadingPages(false);
    }
  };

  const connectNotion = async () => {
    if (notionConnecting) return;
    setNotionConnecting(true);
    try {
      const { authorizationUrl } = await startNotionOAuth();
      const popup = window.open(
        authorizationUrl,
        "brainx-notion-oauth",
        "width=480,height=720,noopener=no,noreferrer=no"
      );
      if (!popup) {
        pushToast("팝업이 차단되었습니다. 팝업 차단을 해제한 뒤 다시 시도해 주세요.", "err");
      }
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Notion 연결에 실패했습니다.", "err");
    } finally {
      setNotionConnecting(false);
    }
  };

  const disconnectNotion = () => {
    clearNotionIntegration();
    setNotionIntegration(null);
    setNotionPages([]);
  };

  const importNotion = async (page: NotionPage) => {
    if (!notionIntegration || notionImportingId) return;
    setNotionImportingId(page.id);
    try {
      const result = await importNotionPage(notionIntegration.integrationAccountId, page.id);
      if (result.status === "FAILED") {
        pushToast(`${page.title} 가져오기에 실패했습니다.`, "err");
        return;
      }
      pushToast(`${page.title} 가져오기를 완료했어요`, "ok");

      try {
        const jobStatus = await getImportJobStatus(result.importJobId);
        const noteIds = jobStatus.createdNotes.map((item) => item.noteId).filter((id): id is string => !!id);
        if (noteIds.length > 0) {
          const childCount = noteIds.length - 1;
          const displayTitle = childCount > 0
            ? `${page.title} (하위 노트 ${childCount}개 포함)`
            : page.title;
          setImportedNotionNotes((current) => [{ id: noteIds[0], title: displayTitle }, ...current]);
          pushToast(
            childCount > 0
              ? `${page.title} 및 하위 노트 ${childCount}개를 가져왔어요`
              : `${page.title}을(를) 가져왔어요`,
            "ok"
          );
          window.dispatchEvent(
            new CustomEvent("brainx:notes-refresh", { detail: { noteId: noteIds[0] } })
          );
          router.push(`/notes/${noteIds[0]}`);
        }
      } catch (error) {
        pushToast(error instanceof Error ? error.message : "가져온 노트를 확인하지 못했습니다.", "err");
      }
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Notion 가져오기에 실패했습니다.", "err");
    } finally {
      setNotionImportingId(null);
    }
  };

  return (
    <div data-route className="mx-auto max-w-[900px]">
      <div className="mb-6">
        <h1 className="text-[26px] font-bold tracking-tight text-txt">가져오기</h1>
        <p className="mt-1.5 text-[14px] text-txt3">다른 앱과 파일에서 BrainX로 데이터를 가져오세요.</p>
      </div>

      <div className="mb-9">
            <h2 className="mb-1 text-[15px] font-semibold text-txt">콘텐츠 가져오기</h2>
            <p className="mb-3.5 text-[13px] text-txt3">ZIP 파일을 가져오면 내부의 각 파일이 자체 페이지로 변환됩니다.</p>
            <div
              onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(event) => { event.preventDefault(); setDragOver(false); handleFiles(event.dataTransfer.files); }}
              onClick={() => openFilePicker()}
              className={cx(
                "cursor-pointer rounded-xl border-2 border-dashed px-6 py-12 text-center transition-all",
                dragOver ? "border-primary/60 bg-primary/5" : "border-line/60 bg-surface2/30 hover:border-primary/35"
              )}
            >
              <Icon name="upload" size={28} className="mx-auto mb-3.5 text-txt3" />
              <p className="mb-1.5 text-[15px] font-semibold text-txt">BrainX로 콘텐츠 가져오기</p>
              <p className="mb-1 text-[13px] text-txt3">
                ZIP, CSV, PDF, 텍스트, Markdown, HTML을 드래그 &amp; 드롭 또는 파일을 선택하세요.
              </p>
              <p className="text-[12px] text-txt3/70">ZIP 파일은 최대 5GB까지 가능합니다.</p>
            </div>
          </div>

          <div className="mb-9">
            <h2 className="mb-1 text-[15px] font-semibold text-txt">Notion 가져오기</h2>
            <p className="mb-3.5 text-[13px] text-txt3">Notion 워크스페이스를 연결하면 페이지를 골라서 BrainX 노트로 가져올 수 있습니다.</p>

            {!notionIntegration ? (
              <div className="flex items-center justify-between gap-4 rounded-xl border border-line/60 bg-surface2/30 p-4">
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#191919] text-[14px] font-bold text-white">N</span>
                  <div>
                    <div className="text-[14px] font-semibold text-txt">Notion 워크스페이스 연결</div>
                    <div className="text-[12px] text-txt3">OAuth로 안전하게 연결하고 가져올 페이지를 선택하세요.</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={connectNotion}
                  disabled={notionConnecting}
                  className="shrink-0 rounded-lg bg-txt px-3.5 py-2 text-[13px] font-semibold text-bg transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {notionConnecting ? "연결 중…" : "연결하기"}
                </button>
              </div>
            ) : (
              <div className="rounded-xl border border-line/60 bg-surface2/30 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#191919] text-[14px] font-bold text-white">N</span>
                    <div>
                      <div className="text-[14px] font-semibold text-txt">Notion 워크스페이스 연결됨</div>
                      <div className="text-[12px] text-txt3">가져올 페이지를 선택하세요.</div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => loadNotionPages(notionIntegration.integrationAccountId)}
                      disabled={notionLoadingPages}
                      className="grid h-8 w-8 place-items-center rounded-lg text-txt3 transition-colors hover:bg-surface2 hover:text-txt disabled:cursor-not-allowed disabled:opacity-50"
                      title="새로고침"
                    >
                      <Icon name="refresh" size={15} className={notionLoadingPages ? "animate-spin" : undefined} />
                    </button>
                    <button
                      type="button"
                      onClick={disconnectNotion}
                      className="rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-txt3 transition-colors hover:bg-surface2 hover:text-txt"
                    >
                      연결 해제
                    </button>
                  </div>
                </div>

                {notionLoadingPages ? (
                  <p className="px-1 py-3 text-[13px] text-txt3">페이지 목록을 불러오는 중…</p>
                ) : notionPages.length === 0 ? (
                  <p className="px-1 py-3 text-[13px] text-txt3">가져올 수 있는 페이지가 없습니다.</p>
                ) : (
                  <div>
                    <button
                      type="button"
                      onClick={() => setNotionPagesCollapsed((current) => !current)}
                      className="mb-1.5 flex w-full items-center justify-between text-[12px] font-semibold text-txt3 hover:text-txt2"
                    >
                      <span>페이지 목록 · {notionPages.length}개</span>
                      <Icon name={notionPagesCollapsed ? "chevR" : "chevD"} size={14} />
                    </button>
                    {!notionPagesCollapsed && (
                      <div className="space-y-1.5">
                        {notionPages.map((page) => (
                          <div key={page.id} className="flex items-center gap-3 rounded-lg border border-line/40 bg-surface/40 px-3 py-2">
                            <span className="w-5 shrink-0 text-center text-[15px]">{page.icon ?? "📄"}</span>
                            <span className="min-w-0 flex-1 truncate text-[13.5px] text-txt">{page.title}</span>
                            <button
                              type="button"
                              onClick={() => importNotion(page)}
                              disabled={notionImportingId !== null}
                              className="shrink-0 rounded-md border border-line/60 px-2.5 py-1 text-[12px] font-medium text-txt2 transition-colors hover:border-primary/35 hover:text-txt disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {notionImportingId === page.id ? "가져오는 중…" : "가져오기"}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {importedNotionNotes.length > 0 && (
                  <div className="mt-3 border-t border-line/40 pt-3">
                    <button
                      type="button"
                      onClick={() => setImportedNotesCollapsed((current) => !current)}
                      className="mb-1.5 flex w-full items-center justify-between text-[12px] font-semibold text-txt3 hover:text-txt2"
                    >
                      <span>가져온 노트 · {importedNotionNotes.length}개</span>
                      <Icon name={importedNotesCollapsed ? "chevR" : "chevD"} size={14} />
                    </button>
                    {!importedNotesCollapsed && (
                      <div className="space-y-1.5">
                        {importedNotionNotes.map((note) => (
                          <button
                            key={note.id}
                            type="button"
                            onClick={() => router.push(`/notes/${note.id}`)}
                            className="flex w-full items-center gap-2 rounded-lg bg-surface/40 px-3 py-1.5 text-left transition-colors hover:bg-surface/70"
                          >
                            <Icon name="check" size={14} className="shrink-0 text-cyan" />
                            <span className="min-w-0 flex-1 truncate text-[13px] text-txt2">{note.title}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <h2 className="mb-1 text-[15px] font-semibold text-txt">파일 기반 가져오기</h2>
            <p className="mb-3.5 text-[13px] text-txt3">DOCX, CSV, PDF, 텍스트, Markdown, HTML, EPUB 파일을 가져와 페이지로 변환합니다.</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {FILE_TYPES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openFilePicker(item.accept)}
                  disabled={importing}
                  className="rounded-xl border border-line/60 bg-surface2/30 p-3.5 text-left transition-colors hover:border-primary/35 hover:bg-surface2/60 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <div className="mb-1.5 flex items-center gap-2">
                    <Icon name={item.icon} size={16} className="text-txt2" />
                    <span className="text-[14px] font-semibold text-txt">{item.label}</span>
                  </div>
                  <p className="text-[12px] leading-relaxed text-txt3">{item.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {importing && (
            <div className="mt-6 rounded-xl border border-line/60 bg-surface2/30 p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[13px] text-txt2">가져오는 중입니다…</span>
                <span className="font-mono text-[13px] text-txt2">{progress}%</span>
              </div>
              <div className="h-2 rounded-full bg-surface2">
                <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
    </div>
  );
}
