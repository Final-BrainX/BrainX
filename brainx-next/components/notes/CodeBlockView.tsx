"use client";

import { useState, useRef, useEffect, useCallback, useMemo, KeyboardEvent } from "react";
import { NodeViewWrapper, NodeViewContent, type NodeViewProps } from "@tiptap/react";
import { Copy, Check, ChevronDown, Search, FileText } from "lucide-react";
import { cx } from "@/lib/utils";
import { MermaidPreview } from "./MermaidPreview";
import {
  BlockSizeToolbar,
  blockContentStyle,
  blockFrameStyle,
  blockJustify,
  blockTargetPx,
  type BlockAlign,
  type BlockWidthMode,
} from "./BlockControls";
import { ensureLanguageRegistered } from "./lowlightSetup";

const ALL_LANGS = [
  { id: "",            label: "Plain Text" },
  // 다이어그램
  { id: "mermaid",     label: "Mermaid" },
  // 웹
  { id: "javascript", label: "JavaScript" },
  { id: "typescript", label: "TypeScript" },
  { id: "html",       label: "HTML" },
  { id: "css",        label: "CSS" },
  { id: "scss",       label: "SCSS" },
  { id: "json",       label: "JSON" },
  { id: "xml",        label: "XML" },
  { id: "graphql",    label: "GraphQL" },
  // 백엔드
  { id: "java",       label: "Java" },
  { id: "python",     label: "Python" },
  { id: "go",         label: "Go" },
  { id: "rust",       label: "Rust" },
  { id: "c",          label: "C" },
  { id: "cpp",        label: "C++" },
  { id: "csharp",     label: "C#" },
  { id: "php",        label: "PHP" },
  { id: "ruby",       label: "Ruby" },
  { id: "kotlin",     label: "Kotlin" },
  { id: "swift",      label: "Swift" },
  { id: "scala",      label: "Scala" },
  { id: "dart",       label: "Dart" },
  // 데이터
  { id: "sql",        label: "SQL" },
  { id: "yaml",       label: "YAML" },
  { id: "toml",       label: "TOML" },
  // 인프라
  { id: "bash",       label: "Bash" },
  { id: "shell",      label: "Shell" },
  { id: "dockerfile", label: "Dockerfile" },
  // 기타
  { id: "markdown",   label: "Markdown" },
  { id: "latex",      label: "LaTeX" },
  { id: "r",          label: "R" },
  { id: "lua",        label: "Lua" },
];

// 언어 ID → 기본 파일 확장자 (filename이 비어있을 때 자동 삽입)
const LANG_EXT: Record<string, string> = {
  java: ".java",
  javascript: ".js",
  typescript: ".ts",
  tsx: ".tsx",
  html: ".html",
  css: ".css",
  scss: ".scss",
  python: ".py",
  sql: ".sql",
  json: ".json",
  yaml: ".yml",
  markdown: ".md",
  bash: ".sh",
  shell: ".sh",
  kotlin: ".kt",
  c: ".c",
  cpp: ".cpp",
  csharp: ".cs",
  go: ".go",
  rust: ".rs",
  php: ".php",
  ruby: ".rb",
  xml: ".xml",
  swift: ".swift",
  scala: ".scala",
  dart: ".dart",
  lua: ".lua",
  r: ".r",
  graphql: ".graphql",
};

export function CodeBlockView({ node, updateAttributes, editor, getPos }: NodeViewProps) {
  const [copied, setCopied]               = useState(false);
  const [filenameCopied, setFilenameCopied] = useState(false);
  const [open, setOpen]                   = useState(false);
  const [search, setSearch]               = useState("");
  const [focusIdx, setFocusIdx]           = useState(0);
  const [isEditingFile, setIsEditingFile] = useState(false);
  const [fileDraft, setFileDraft]         = useState("");
  // Mermaid SVG의 원본(자연) 픽셀 너비 — MermaidPreview가 측정해 보고하면 여기서 받아 비율
  // 프리셋(50/75/125/150%, 사용자 지정)을 "원본 기준"으로 계산하는 데 쓴다(BlockControls의
  // blockTargetPx 참고). 같은 값이면 setState가 무시되므로 추가 리렌더는 생기지 않는다.
  const [mermaidNaturalWidth, setMermaidNaturalWidth] = useState<number | null>(null);
  const handleMermaidNaturalWidth = useCallback((px: number) => {
    setMermaidNaturalWidth((prev) => (prev === px ? prev : px));
  }, []);

  const dropRef          = useRef<HTMLDivElement>(null);
  const searchRef        = useRef<HTMLInputElement>(null);
  const listRef          = useRef<HTMLDivElement>(null);
  const fileRef          = useRef<HTMLTextAreaElement>(null);
  const posAtStartRef    = useRef(false);  // auto-extension 삽입 시 커서를 맨 앞으로
  // 크기 툴바(BlockSizeToolbar)가 document.body에 portal로 뜨므로(Split View 좁은 패널에서
  // 글자가 세로로 깨지는 문제 방지) CSS group-hover 대신 다이어그램 영역의 실제 hover를 JS
  // 상태로 추적해 anchor로 넘긴다. "</>" 버튼은 이 블록 안에 그대로 있어 기존 CSS group-hover로
  // 충분하다(텍스트 줄바꿈 위험이 없는 아이콘 한 글자뿐).
  const mermaidPreviewRef = useRef<HTMLDivElement>(null);
  const [mermaidHovered, setMermaidHovered] = useState(false);

  const lang      = (node.attrs.language as string) || "";
  const filename  = (node.attrs.filename  as string) || "";
  const langLabel = ALL_LANGS.find((l) => l.id === lang)?.label ?? (lang || "Plain Text");

  const isMermaid    = lang === "mermaid";
  const align        = (node.attrs.align as BlockAlign) ?? "center";
  const widthMode    = (node.attrs.widthMode as BlockWidthMode) ?? "fit";
  const widthPercent = (node.attrs.widthPercent as number | null) ?? null;
  const preview      = node.attrs.preview !== false;
  // preview는 오직 명시적인 버튼 클릭으로만 바뀐다(아래 "코드 편집"/"미리보기" 버튼) — 타이핑
  // 중에 내용이 비어있는지에 따라 자동으로 바뀌게 했더니, 막 fence를 입력하고 글자를 치는
  // 순간(텍스트가 비어있지 않게 되자마자) 이 컴포넌트가 편집 영역을 display:none으로 숨겨서
  // 포커스가 그 즉시 날아가고 이후 키 입력이 전부 사라지는 버그가 있었다(Playwright로 실제
  // 재현·확인: "graph TD..."를 입력했는데 "g" 한 글자만 들어가고 나머지가 사라짐). 그래서
  // 새 블록은 항상 preview:false로 시작하고(MarkdownCodeFenceEnter/textblockTypeInputRule
  // 참고), 여기서는 그 값을 그대로 신뢰하기만 한다.
  const effectivePreview = isMermaid && preview;

  const filtered = useMemo(
    () =>
      search.trim()
        ? ALL_LANGS.filter(
            (l) =>
              l.label.toLowerCase().includes(search.toLowerCase()) ||
              l.id.toLowerCase().includes(search.toLowerCase())
          )
        : ALL_LANGS,
    [search]
  );

  // 드롭다운 열릴 때: 검색 초기화 + input 포커스
  useEffect(() => {
    if (open) {
      setSearch("");
      setFocusIdx(lang ? Math.max(ALL_LANGS.findIndex((l) => l.id === lang), 0) : 0);
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open, lang]);

  // 파일명 편집 시작: 포커스 + textarea 높이 초기화 + auto-extension 시 커서 맨 앞
  useEffect(() => {
    if (!isEditingFile) return;
    requestAnimationFrame(() => {
      const el = fileRef.current;
      if (!el) return;
      // textarea 높이 초기화 (내용에 맞게)
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
      el.focus();
      if (posAtStartRef.current) {
        el.setSelectionRange(0, 0);
        posAtStartRef.current = false;
      }
    });
  }, [isEditingFile]);

  // 외부 클릭으로 드롭다운 닫기
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!dropRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // focusIdx 변경 시 스크롤
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.children[focusIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [focusIdx]);

  function select(id: string) {
    updateAttributes({ language: id });
    setOpen(false);
    // 기본 9종(lowlightSetup.ts) 밖의 언어는 이 시점에 처음 불러온다. 등록 전까지는
    // lowlight-plugin의 기존 highlightAuto 폴백이 그대로 적용되어 화면이 깨지지 않고,
    // 등록이 끝나면 같은 노드에 동일 attrs로 setNodeMarkup을 한 번 더 적용해 — 값은 그대로지만
    // 새 transaction이 발생하므로 — lowlight-plugin이 이제 막 등록된 그래머로 다시
    // 하이라이트하도록 강제한다.
    ensureLanguageRegistered(id, () => {
      const pos = getPos();
      if (pos === undefined) return;
      const current = editor.state.doc.nodeAt(pos);
      if (current) editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, current.attrs));
    });
  }

  function onLangKeyDown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[focusIdx]) select(filtered[focusIdx].id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

  function onSearchChange(v: string) {
    setSearch(v);
    setFocusIdx(0);
  }

  function copy() {
    navigator.clipboard.writeText(node.textContent).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function copyFilename() {
    if (!filename) return;
    navigator.clipboard.writeText(filename).then(() => {
      setFilenameCopied(true);
      setTimeout(() => setFilenameCopied(false), 2000);
    });
  }

  function startEditFile() {
    if (!filename && lang && LANG_EXT[lang]) {
      // 파일명 없고 언어 설정된 경우: 확장자만 자동 삽입, 커서는 확장자 앞에
      setFileDraft(LANG_EXT[lang]);
      posAtStartRef.current = true;
    } else {
      setFileDraft(filename);
      posAtStartRef.current = false;
    }
    setIsEditingFile(true);
  }

  function commitFile() {
    const trimmed = fileDraft.trim();
    updateAttributes({ filename: trimmed || null });
    setIsEditingFile(false);
  }

  function cancelFile() {
    setIsEditingFile(false);
  }

  function onFileKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter")  { e.preventDefault(); commitFile(); }
    if (e.key === "Escape") { e.preventDefault(); cancelFile(); }
  }

  return (
    <NodeViewWrapper className="split-code-block my-3 rounded-xl overflow-visible border border-line/35">
      {/* ── Header ──────────────────────────────────────────────────── */}
      {/*
        구조: items-start로 LEFT/RIGHT를 상단 정렬.
        RIGHT는 height:38px 고정 → 언어/복사 버튼이 항상 오른쪽 상단에 고정.
        LEFT는 min-h-[38px] → textarea 1줄=38px(py-[9px]+leading-5), 2줄+=자연스럽게 아래 확장.
        이를 통해 파일명이 긴 경우 헤더 오른쪽 높이는 유지하면서 왼쪽만 보조 라인처럼 늘어난다.
      */}
      <div
        contentEditable={false}
        className="group/cb-header select-none"
        style={{
          background: "rgb(var(--surface2))",
          borderBottom: "1px solid rgb(var(--line) / 0.3)",
          borderRadius: "0.75rem 0.75rem 0 0",
        }}
      >
        <div className="flex items-start">

          {/* LEFT: 파일명 — 편집 시 textarea가 아래로 자연스럽게 확장 */}
          <div className="flex flex-1 items-center min-w-0 min-h-[38px] pl-3 pr-1">
            {isEditingFile ? (
              <textarea
                ref={fileRef}
                value={fileDraft}
                rows={1}
                onChange={(e) => {
                  setFileDraft(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = `${e.target.scrollHeight}px`;
                }}
                onBlur={commitFile}
                onKeyDown={onFileKeyDown}
                placeholder="파일명 입력..."
                className="w-full bg-transparent text-[11px] font-mono leading-5 text-txt outline-none resize-none overflow-hidden placeholder:text-txt3/60"
                style={{ paddingTop: 9, paddingBottom: 9 }}
              />
            ) : filename ? (
              /* 파일명 있음: 표시 + 클릭으로 수정 + hover 시 파일명 복사 아이콘 */
              <div className="group/fname flex min-w-0 items-center gap-0.5">
                <button
                  onMouseDown={(e) => { e.preventDefault(); startEditFile(); }}
                  title="클릭하여 파일명 수정"
                  className="flex min-w-0 items-center gap-1.5 rounded px-1.5 py-0.5 text-[11px] font-mono text-txt2 hover:bg-surface/70 hover:text-txt transition-colors"
                >
                  <FileText size={10} className="shrink-0 opacity-60" />
                  <span className="truncate">{filename}</span>
                </button>
                <button
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); copyFilename(); }}
                  title={filenameCopied ? "복사됨!" : "파일명 복사"}
                  className={cx(
                    "shrink-0 rounded p-1 transition-all",
                    filenameCopied
                      ? "text-green-400 opacity-100"
                      : "text-txt3 opacity-0 group-hover/fname:opacity-100 hover:bg-surface/70 hover:text-txt2"
                  )}
                >
                  {filenameCopied ? <Check size={10} /> : <Copy size={10} />}
                </button>
              </div>
            ) : (
              /* 파일명 없음: hover 시 "파일명 추가" 버튼 */
              <button
                onMouseDown={(e) => { e.preventDefault(); startEditFile(); }}
                title="파일명 추가"
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-mono text-txt3 opacity-0 group-hover/cb-header:opacity-100 hover:bg-surface/70 hover:text-txt2 transition-all"
              >
                <FileText size={10} className="shrink-0" />
                <span>파일명 추가</span>
              </button>
            )}
          </div>

          {/* RIGHT: 언어 선택 + 복사 — height:38px 고정, 항상 오른쪽 상단 */}
          <div className="flex items-center gap-0.5 shrink-0 pr-2" style={{ height: 38 }}>

            {/* 언어 드롭다운 */}
            <div ref={dropRef} className="relative">
              <button
                onMouseDown={(e) => { e.preventDefault(); setOpen((o) => !o); }}
                className={cx(
                  "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-mono transition-colors",
                  open
                    ? "bg-primary/15 text-primary"
                    : "text-txt2 hover:bg-surface/70 hover:text-txt"
                )}
              >
                <span>{langLabel}</span>
                <ChevronDown
                  size={9}
                  className={cx("shrink-0 transition-transform duration-150", open && "rotate-180")}
                />
              </button>

              {open && (
                <div
                  className="absolute right-0 top-full z-[200] mt-1.5 w-48 rounded-xl overflow-hidden"
                  style={{
                    background: "rgb(var(--surface))",
                    border: "1.5px solid rgb(var(--line) / 0.45)",
                    boxShadow:
                      "0 4px 6px -1px rgba(0,0,0,0.15), 0 10px 28px -4px rgba(0,0,0,0.2)",
                  }}
                >
                  {/* 검색 영역 */}
                  <div
                    className="flex items-center gap-2 px-3 py-2.5"
                    style={{
                      background: "rgb(var(--surface2))",
                      borderBottom: "1px solid rgb(var(--line) / 0.35)",
                    }}
                  >
                    <Search size={12} className="shrink-0 text-txt3" />
                    <input
                      ref={searchRef}
                      value={search}
                      onChange={(e) => onSearchChange(e.target.value)}
                      onKeyDown={onLangKeyDown}
                      placeholder="언어 검색..."
                      className="flex-1 min-w-0 bg-transparent text-[12px] text-txt outline-none placeholder:text-txt3/70"
                      style={{ fontFamily: "var(--font-mono, ui-monospace, monospace)" }}
                    />
                  </div>

                  {/* 언어 목록 */}
                  <div
                    ref={listRef}
                    className="split-code-lang-list overflow-y-auto py-1"
                    style={{ maxHeight: 240 }}
                  >
                    {filtered.length === 0 && (
                      <div className="px-4 py-3 text-[11px] text-txt3">결과 없음</div>
                    )}
                    {filtered.map((l, idx) => (
                      <button
                        key={l.id}
                        onMouseDown={(e) => { e.preventDefault(); select(l.id); }}
                        className={cx(
                          "flex w-full items-center justify-between px-4 py-[7px] text-left text-[12px] transition-colors",
                          idx === focusIdx
                            ? "bg-primary/12 text-primary"
                            : l.id === lang
                            ? "bg-primary/6 text-primary"
                            : "text-txt2 hover:bg-surface2/70 hover:text-txt"
                        )}
                        style={{ fontFamily: "var(--font-mono, ui-monospace, monospace)" }}
                      >
                        <span>{l.label}</span>
                        {l.id === lang && (
                          <Check size={10} className="shrink-0 text-primary" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 복사 버튼 (아이콘만, tooltip으로 피드백) */}
            <button
              onMouseDown={(e) => { e.preventDefault(); copy(); }}
              title={copied ? "복사됨!" : "코드 복사"}
              className={cx(
                "flex items-center rounded-md p-1.5 transition-colors",
                copied
                  ? "text-green-400"
                  : "text-txt3 hover:bg-surface/70 hover:text-txt"
              )}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
            </button>
          </div>

        </div>
      </div>

      {/* ── Mermaid 작성/미리보기 영역 ────────────────────────────────────
          코드 편집 상태: 작성칸 우상단에 "보기" 버튼이 항상 떠 있다(기존 코드블록 UX와 동일한
          톤 유지, paddingTop으로 자리 확보).
          다이어그램 보기 상태: 기본은 버튼 없이 다이어그램만 깔끔하게 보이고, 블록에 hover할
          때만 우상단에 "</>" 아이콘 버튼이 오버레이로 페이드인한다 — 레이아웃을 밀어내지
          않도록 별도 paddingTop/툴바 공간을 만들지 않는다(Obsidian 스타일, 요구사항). 오버레이가
          이 블록의 진짜 DOM 자손이어야 group-hover가 실제 마우스 호버로 정확히 동작하고, 버튼
          위로 마우스를 옮겨도 같은 그룹 안이라 hover가 끊기지 않는다.
          코드 편집 상태에는 더 이상 "보기" 토글 버튼을 두지 않는다(요청 사항) — Esc(키맵)와
          포커스 아웃(NoteEditor.tsx의 MermaidAutoPreview 확장 + blur 핸들러)만으로 다이어그램
          보기로 돌아간다. 크기 비율 툴바(BlockSizeToolbar)는 원래도 보기 상태에서만 의미가
          있어(코드 편집 중엔 보여줄 다이어그램이 없음) 그대로 유지된다 — 제거 대상이 아니다. */}
      <div className="relative">
        {effectivePreview && (
          <div
            ref={mermaidPreviewRef}
            className="group/cb-mermaid relative"
            style={{ background: "rgb(var(--surface2) / 0.25)", borderRadius: "0 0 0.75rem 0.75rem" }}
            onMouseEnter={() => setMermaidHovered(true)}
            onMouseLeave={() => setMermaidHovered(false)}
          >
            {/* "</>" 버튼을 BlockSizeToolbar와 별도의 absolute 오버레이로 두면, 크기 툴바가
                portal로 같은 우상단 좌표에 뜰 때(z-index 2000, document.body 자손) 이 로컬
                오버레이(z-10)를 덮어버려 버튼이 가려지는 문제가 있었다 — 위치 계산이 둘로
                나뉘어 있었던 게 근본 원인. `extra`로 같은 portal 한 줄에 합쳐서 항상 같은
                위치·같은 stacking context에 뜨게 했다(가려질 일이 구조적으로 없어짐). */}
            <BlockSizeToolbar
              value={{ align, widthMode, widthPercent }}
              onChange={(next) => updateAttributes(next)}
              anchorRef={mermaidPreviewRef}
              visible={mermaidHovered}
              extra={
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => updateAttributes({ preview: false })}
                  title="코드 편집"
                  aria-label="코드 편집"
                  className="grid h-6 w-7 shrink-0 place-items-center rounded font-mono text-[11px] font-semibold transition-colors hover:bg-surface2/70 hover:text-txt"
                >
                  <span aria-hidden="true">&lt;/&gt;</span>
                </button>
              }
            />
            {/* 더블클릭으로도 코드 편집 진입 가능(Obsidian류 임베드 UX) — 다이어그램 자체에는
                클릭 가능한 네이티브 인터랙션이 없어 오동작 위험이 낮다. */}
            <div
              className="flex px-4 py-4"
              style={{ justifyContent: blockJustify(align) }}
              onDoubleClick={() => updateAttributes({ preview: false })}
            >
              <div style={{ ...blockFrameStyle(widthMode, widthPercent, mermaidNaturalWidth), overflowX: "auto" }}>
                <div style={blockContentStyle(widthMode, widthPercent, mermaidNaturalWidth)}>
                  <MermaidPreview
                    code={node.textContent}
                    targetWidthPx={blockTargetPx(widthMode, widthPercent, mermaidNaturalWidth)}
                    onNaturalWidth={handleMermaidNaturalWidth}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 코드 내용(원본 소스) — NodeViewContent는 항상 DOM에 유지해야 ProseMirror가 내용을
            추적할 수 있으므로 지우지 않고 display:none으로만 감춘다. 코드 편집 상태에 더 이상
            버튼이 없어 paddingTop을 따로 늘릴 필요가 없다. */}
        <pre
          style={{
            margin: 0,
            padding: "1rem 1.25rem",
            overflowX: "auto",
            background: "rgb(var(--surface2) / 0.4)",
            lineHeight: 1.75,
            // Ctrl+Wheel pane 줌(fontScale)이 --note-fs-code로 내려오면 그 값을 쓰고, 아니면
            // 기존과 동일한 고정 12px(서식 패널의 scalePercent와는 무관, typography.ts 참고).
            fontSize: "var(--note-fs-code, 12px)",
            fontFamily: "var(--font-mono, ui-monospace, 'Cascadia Code', monospace)",
            borderRadius: "0 0 0.75rem 0.75rem",
            display: effectivePreview ? "none" : "block",
          }}
        >
          <NodeViewContent />
        </pre>
      </div>
    </NodeViewWrapper>
  );
}
