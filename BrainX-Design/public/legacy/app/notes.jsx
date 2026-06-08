// ============ Notes editor: real localStorage-backed store ============
// API-swappable persistence layer. Replace load/save with real fetch later.
const NOTES_KEY = 'brainx_notes_v1';

const SAMPLE_MD = {
  n1: `## 핵심 직관
Self-attention은 문장 안의 모든 토큰이 서로를 **직접** 바라보게 한다. 거리가 멀어도 관련 있으면 강하게 연결된다.

## Query · Key · Value
- **Query**: "나는 무엇을 찾고 있나"
- **Key**: "나는 무엇을 가지고 있나"
- **Value**: 실제로 전달되는 정보
세 행렬의 학습된 사상이 어텐션의 전부다. [[RAG 파이프라인 설계 노트]]와 함께 보면 좋다.

## 멀티헤드
여러 개의 어텐션을 병렬로 두어, 서로 다른 표현 부분공간을 동시에 학습한다.

## 포지셔널 인코딩
어텐션 자체는 순서를 모른다. 그래서 위치 정보를 더해 순서를 주입한다.`,
};

// seed editor notes from the shared mock data, preserving cluster/links/etc.
function seedNotes() {
  const now = new Date().toISOString();
  return BX_DATA.NOTES.map(n => ({
    id: n.id,
    title: n.title,
    markdown: SAMPLE_MD[n.id] || `## ${n.title}\n\n${n.summary}`,
    folderId: n.cluster,
    cluster: n.cluster,
    summary: n.summary,
    tags: n.tags || [],
    links: n.links || [],
    backlinks: [],
    updated: n.updated,
    words: n.words,
    isFavorite: !!n.fav,
    createdAt: now,
    updatedAt: now,
    version: 1,
  }));
}

function loadNotes() {
  try {
    const saved = localStorage.getItem(NOTES_KEY);
    if (saved) { const arr = JSON.parse(saved); if (Array.isArray(arr) && arr.length) return arr; }
  } catch (e) { /* ignore */ }
  return seedNotes();
}
function saveNotes(notes) { localStorage.setItem(NOTES_KEY, JSON.stringify(notes)); }

function uid() { return (crypto && crypto.randomUUID) ? crypto.randomUUID() : 'n-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7); }

function generateUntitledName(notes) {
  const base = '새 노트';
  const titles = notes.map(n => n.title);
  if (!titles.includes(base)) return base;
  let i = 1; while (titles.includes(`${base} ${i}`)) i++;
  return `${base} ${i}`;
}

function makeNote(notes, folderId) {
  const now = new Date().toISOString();
  return {
    id: uid(), title: generateUntitledName(notes), markdown: '',
    folderId: folderId || 'proj', cluster: folderId || 'proj',
    summary: '', tags: [], links: [], backlinks: [],
    updated: '방금', words: 0, isFavorite: false,
    createdAt: now, updatedAt: now, version: 1,
  };
}

// markdown helpers
function parseHeadings(md) {
  return md.split('\n').map(l => {
    const m = l.match(/^(#{1,3})\s+(.+)/);
    return m ? { level: m[1].length, text: m[2].trim() } : null;
  }).filter(Boolean);
}
function parseWikiLinks(md) {
  const out = []; const re = /\[\[([^\]]+)\]\]/g; let m;
  while ((m = re.exec(md))) out.push(m[1].trim());
  return out;
}
function countWords(md) { return md.trim() ? md.trim().split(/\s+/).length : 0; }
function downloadText(filename, text, mime) {
  const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// shared store hook
function useNotesStore() {
  const [notes, setNotes] = useState(loadNotes);
  const firstRun = useRef(true);
  const [saveStatus, setSaveStatus] = useState('saved');
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    setSaveStatus('saving');
    const t = setTimeout(() => {
      try { saveNotes(notes); setSaveStatus('saved'); }
      catch (e) { setSaveStatus('error'); }
    }, 900);
    return () => clearTimeout(t);
  }, [notes]);

  const createNote = useCallback((folderId) => {
    const note = makeNote(loadNotesRef(notes), folderId);
    setNotes(prev => [note, ...prev]);
    return note;
  }, [notes]);
  const updateNote = useCallback((id, patch) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, ...patch, updatedAt: new Date().toISOString() } : n));
  }, []);
  const deleteNote = useCallback((id) => setNotes(prev => prev.filter(n => n.id !== id)), []);
  return { notes, setNotes, saveStatus, setSaveStatus, createNote, updateNote, deleteNote };
}
function loadNotesRef(notes) { return notes; }

// ============ Upload modal ============
function UploadModal({ open, onClose, onPick }) {
  if (!open) return null;
  const opts = [
    { k: 'md', icon: 'rewrite', title: '마크다운으로 변환', desc: 'PDF · TXT · MD 파일의 내용을 BrainX 노트로 변환합니다.' },
    { k: 'raw', icon: 'doc', title: '원본 파일로 유지', desc: '파일을 첨부파일로 그대로 보관합니다.' },
  ];
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center p-6" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"></div>
      <Card glow className="relative w-full max-w-md p-6 fade-up" >
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-[18px] font-bold tracking-tight">파일을 어떻게 처리할까요?</h2>
          <button onClick={onClose} className="text-txt3 hover:text-txt"><Icon name="x" size={18} /></button>
        </div>
        <p className="text-[13px] text-txt2 mb-5">업로드한 파일의 처리 방식을 선택하세요.</p>
        <div className="space-y-2.5">
          {opts.map(o => (
            <button key={o.k} onClick={() => onPick(o.k)}
              className="w-full flex items-start gap-3.5 p-4 rounded-xl card hover:border-primary/45 text-left transition-colors">
              <div className="w-10 h-10 rounded-xl grid place-items-center bg-primary/14 text-primary shrink-0"><Icon name={o.icon} size={19} /></div>
              <div>
                <div className="text-[14px] font-semibold text-txt mb-0.5">{o.title}</div>
                <div className="text-[12.5px] text-txt2 leading-relaxed">{o.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ============ Editor ============
function Editor({ noteId, push }) {
  const store = useNotesStore();
  const { notes, saveStatus, createNote, updateNote, deleteNote } = store;
  const [query, setQuery] = useState('');
  const [aiPop, setAiPop] = useState(null);
  const [slash, setSlash] = useState(null);
  const [upload, setUpload] = useState(false);
  const [aiPanel, setAiPanel] = useState([{ role: 'ai', text: '이 노트에 대해 무엇이든 물어보세요. 관련 노트도 함께 찾아드려요.' }]);
  const [aiInput, setAiInput] = useState('');
  const taRef = useRef(null);
  const titleRef = useRef(null);
  const createdFor = useRef(null);

  // resolve selected note
  const selected = notes.find(n => n.id === noteId) || (noteId !== 'new' ? null : null);

  // handle "/notes/new" → create a fresh note once, then route to it
  useEffect(() => {
    if (noteId === 'new' && createdFor.current !== 'new') {
      createdFor.current = 'new';
      const note = createNote();
      navigate(`/notes/${note.id}`);
      setTimeout(() => titleRef.current && titleRef.current.focus(), 60);
    }
    if (noteId !== 'new') createdFor.current = null;
  }, [noteId]);

  const handleCreateNote = (folderId) => {
    const note = createNote(folderId);
    navigate(`/notes/${note.id}`);
    setTimeout(() => titleRef.current && titleRef.current.focus(), 60);
    push('새 노트를 만들었어요', 'ok');
  };

  // derived panels
  const toc = useMemo(() => selected ? parseHeadings(selected.markdown) : [], [selected]);
  const wikiLinks = useMemo(() => {
    if (!selected) return [];
    const titles = parseWikiLinks(selected.markdown);
    return titles.map(t => ({ title: t, note: notes.find(n => n.title === t) }));
  }, [selected, notes]);
  const backlinks = useMemo(() => {
    if (!selected) return [];
    return notes.filter(n => n.id !== selected.id && parseWikiLinks(n.markdown).includes(selected.title));
  }, [selected, notes]);

  const filtered = query.trim()
    ? notes.filter(n => n.title.toLowerCase().includes(query.toLowerCase()) || n.markdown.toLowerCase().includes(query.toLowerCase()))
    : notes;

  // text selection AI popup
  const onSelectText = () => {
    const ta = taRef.current; if (!ta) return;
    const sel = ta.value.substring(ta.selectionStart, ta.selectionEnd);
    if (sel.trim().length > 1) {
      const rect = ta.getBoundingClientRect();
      setAiPop({ text: sel, x: rect.left + rect.width / 2, y: rect.top + 70 });
    } else setAiPop(null);
  };
  const onBodyKey = (e) => {
    if (e.key === '/') { const ta = e.target; setTimeout(() => { const r = ta.getBoundingClientRect(); setSlash({ x: r.left + 44, y: r.top + 130 }); }, 0); }
    else if (slash && e.key === 'Escape') setSlash(null);
  };
  const slashCmds = [
    { icon: 'summarize', label: '제목 1', ins: '# ' }, { icon: 'summarize', label: '제목 2', ins: '## ' },
    { icon: 'notes', label: '체크리스트', ins: '- [ ] ' }, { icon: 'doc', label: '인용', ins: '> ' },
    { icon: 'bolt', label: '코드 블록', ins: '```\n\n```' }, { icon: 'sparkle', label: 'AI 이어쓰기', ai: true },
  ];
  const aiActions = [
    { icon: 'summarize', label: '요약' }, { icon: 'rewrite', label: '다시 쓰기' },
    { icon: 'bolt', label: '이어쓰기' }, { icon: 'translate', label: '번역' }, { icon: 'check', label: '맞춤법' },
  ];

  const sendAi = () => {
    if (!aiInput.trim()) return;
    const q = aiInput; setAiPanel(p => [...p, { role: 'user', text: q }]); setAiInput('');
    setAiPanel(p => [...p, { role: 'ai', text: '', streaming: true }]);
    const ans = '이 노트의 내용과 「RAG 파이프라인」 노트의 검색 단계가 연결돼요. 두 노트를 함께 보면 "검색 품질이 어텐션 가중치처럼 관련도를 결정한다"는 패턴이 보입니다.';
    let i = 0; const iv = setInterval(() => {
      i += 2; setAiPanel(p => { const c = [...p]; c[c.length - 1] = { role: 'ai', text: ans.slice(0, i), streaming: i < ans.length }; return c; });
      if (i >= ans.length) clearInterval(iv);
    }, 18);
  };

  const onUpload = (kind) => {
    setUpload(false);
    if (kind === 'md') {
      const note = createNote(selected ? selected.folderId : 'proj');
      updateNote(note.id, { title: '가져온 문서', markdown: '## 가져온 문서\n\n업로드한 파일이 마크다운으로 변환되었습니다. (mock)' });
      navigate(`/notes/${note.id}`);
      push('파일을 마크다운 노트로 변환했어요', 'ok');
    } else { push('원본 파일을 첨부로 보관했어요', 'ok'); }
  };

  const doExport = (fmt) => {
    if (!selected) return;
    const safe = (selected.title || '무제').replace(/[\\/:*?"<>|]/g, '_');
    if (fmt === 'md') { downloadText(`${safe}.md`, `# ${selected.title}\n\n${selected.markdown}`, 'text/markdown'); push('MD 파일을 내보냈어요', 'ok'); }
    else if (fmt === 'txt') { downloadText(`${safe}.txt`, `${selected.title}\n\n${selected.markdown.replace(/[#*>`\-\[\]]/g, '')}`); push('TXT 파일을 내보냈어요', 'ok'); }
    else if (fmt === 'pdf') { push('PDF 내보내기 준비 중입니다'); }
    else if (fmt === 'share') { const url = `https://brainx.app/share/${selected.id}`; if (navigator.clipboard) navigator.clipboard.writeText(url); push('공유 링크를 복사했어요 · 30일 유효', 'ok'); }
  };

  const saveLabel = {
    saving: { t: '저장 중…', c: 'text-txt3', i: 'refresh', spin: true },
    saved: { t: '저장됨', c: 'text-cyan', i: 'check' },
    error: { t: '저장 실패', c: 'text-pink-400', i: 'x' },
  }[saveStatus];

  // ---- empty state (no notes at all) ----
  if (notes.length === 0) {
    return (
      <div data-route data-screen-label="노트 에디터" className="h-full grid place-items-center">
        <EmptyState icon="notes" title="아직 노트가 없습니다"
          desc="새 노트를 만들어 지식 기록을 시작해보세요."
          action={<Btn variant="primary" size="lg" icon="plus" onClick={() => handleCreateNote()}>새 노트 만들기</Btn>} />
      </div>
    );
  }

  // ---- note not found (and not creating) → gentle fallback ----
  const cur = selected || notes[0];

  return (
    <div data-route data-screen-label="노트 에디터" className="flex h-full">
      {/* folder / note list */}
      <div className="hidden md:flex w-60 shrink-0 border-r border-line/50 bg-bg2/30 flex-col">
        <div className="p-3 border-b border-line/50 space-y-2">
          <Btn variant="primary" size="sm" icon="plus" className="w-full" onClick={() => handleCreateNote()}>새 노트</Btn>
          <div className="flex items-center h-9 px-2.5 gap-2 rounded-lg bg-surface2/50 border border-line/50 focus-within:border-primary/50">
            <Icon name="search" size={15} className="text-txt3" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="노트 검색"
              className="flex-1 bg-transparent outline-none text-[13px] text-txt placeholder:text-txt3" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto scroll p-2">
          {query.trim() ? (
            filtered.length ? filtered.map(n => <NoteRow key={n.id} n={n} active={n.id === cur.id} />) :
              <p className="text-[12px] text-txt3 px-3 py-6 text-center">검색 결과가 없어요</p>
          ) : (
            BX_DATA.CLUSTERS.map(c => {
              const ns = notes.filter(n => (n.folderId || n.cluster) === c.id);
              if (!ns.length) return null;
              return (
                <div key={c.id} className="mb-1">
                  <div className="flex items-center gap-2 px-2 h-8 text-[12px] text-txt3"><Icon name="folder" size={14} /><span className="flex-1">{c.label}</span><span className="font-mono">{ns.length}</span></div>
                  {ns.map(n => <NoteRow key={n.id} n={n} c={c} active={n.id === cur.id} indent />)}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* editor */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-5 py-2.5 border-b border-line/50 flex items-center gap-3">
          <div className={`flex items-center gap-1.5 text-[12px] ${saveLabel.c}`}>
            <Icon name={saveLabel.i} size={14} className={saveLabel.spin ? 'animate-spin' : ''} /> {saveLabel.t}
          </div>
          <div className="flex-1"></div>
          <button onClick={() => setUpload(true)} className="h-8 px-2.5 rounded-lg text-[12px] text-txt2 hover:text-txt hover:bg-surface2/60 flex items-center gap-1.5"><Icon name="upload" size={14} /> 업로드</button>
          {[['pdf', 'PDF'], ['txt', 'TXT'], ['md', 'MD']].map(([k, l]) => (
            <button key={k} onClick={() => doExport(k)} className="h-8 px-2.5 rounded-lg text-[12px] text-txt2 hover:text-txt hover:bg-surface2/60">{l}</button>
          ))}
          <Btn variant="soft" size="sm" icon="globe" onClick={() => doExport('share')}>공유 링크</Btn>
        </div>

        <div className="flex-1 overflow-y-auto scroll">
          <div className="max-w-2xl mx-auto px-8 py-10">
            <input ref={titleRef} value={cur.title} onChange={e => updateNote(cur.id, { title: e.target.value })}
              placeholder="제목 없는 노트"
              className="w-full bg-transparent outline-none text-[32px] font-bold tracking-tight placeholder:text-txt3/50 mb-3" />
            <div className="flex items-center gap-2 mb-6 text-[12px] text-txt3">
              <Badge color={clusterById(cur.folderId || cur.cluster) ? clusterById(cur.folderId || cur.cluster).color : '139 92 246'} dot className="!h-6">{clusterById(cur.folderId || cur.cluster) ? clusterById(cur.folderId || cur.cluster).label : '노트'}</Badge>
              <span>·</span><span>{cur.updated || '방금'} 수정</span><span>·</span><span>{countWords(cur.markdown)} 단어</span>
            </div>
            <textarea ref={taRef} value={cur.markdown} onChange={e => updateNote(cur.id, { markdown: e.target.value })}
              onSelect={onSelectText} onKeyDown={onBodyKey} onMouseUp={onSelectText}
              placeholder="여기에 입력하세요.  ‘/’ 를 눌러 명령어를, [[ ]] 로 다른 노트를 연결하세요."
              className="w-full bg-transparent outline-none resize-none text-[15px] leading-[1.85] text-txt2 min-h-[52vh] font-sans placeholder:text-txt3/60"
              style={{ whiteSpace: 'pre-wrap' }} />
          </div>
        </div>
      </div>

      {/* right panel */}
      <div className="hidden lg:flex w-72 shrink-0 border-l border-line/50 bg-bg2/30 flex-col">
        <div className="p-4 overflow-y-auto scroll flex-1 space-y-5">
          <div>
            <div className="text-[11px] font-semibold text-txt3 mb-2 flex items-center gap-1.5"><Icon name="summarize" size={13} /> 목차</div>
            <div className="space-y-0.5">
              {toc.length ? toc.map((h, i) => (
                <div key={i} style={{ paddingLeft: (h.level - 1) * 12 + 8 }}
                  className="text-[12.5px] text-txt2 hover:text-primary cursor-pointer h-7 flex items-center rounded-lg hover:bg-surface2/50 truncate pr-2">{h.text}</div>
              )) : <p className="text-[12px] text-txt3 px-2"># 으로 제목을 추가하면 목차가 생겨요</p>}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold text-txt3 mb-2 flex items-center gap-1.5"><Icon name="link" size={13} /> 연결 · 백링크</div>
            <div className="space-y-1.5">
              {wikiLinks.map((w, i) => (
                <button key={'w' + i} onClick={() => w.note && navigate(`/notes/${w.note.id}`)}
                  className="w-full text-left p-2.5 rounded-lg bg-surface2/40 hover:bg-surface2/70 transition-colors flex items-center gap-2">
                  <Icon name="link" size={13} className="text-cyan shrink-0" />
                  <span className="text-[12.5px] font-medium text-txt truncate flex-1">{w.title}</span>
                  {!w.note && <span className="text-[10px] text-txt3">새로 만들기</span>}
                </button>
              ))}
              {backlinks.map(b => (
                <button key={b.id} onClick={() => navigate(`/notes/${b.id}`)} className="w-full text-left p-2.5 rounded-lg bg-surface2/40 hover:bg-surface2/70 transition-colors">
                  <div className="text-[12.5px] font-medium text-txt truncate flex items-center gap-1.5"><Icon name="arrowL" size={12} className="text-txt3" />{b.title}</div>
                </button>
              ))}
              {!wikiLinks.length && !backlinks.length && <p className="text-[12px] text-txt3 px-2">[[노트명]] 으로 다른 노트를 연결해보세요</p>}
            </div>
          </div>
          <div className="rounded-xl bg-accent/[0.07] border border-accent/20 p-3">
            <div className="text-[11px] font-semibold text-accent mb-2 flex items-center gap-1.5"><Icon name="sparkle" size={13} /> AI 연결 제안</div>
            <p className="text-[12.5px] text-txt2 leading-relaxed mb-2.5">이 노트는 <b className="text-txt">「벡터 데이터베이스 비교」</b>와 강하게 연관돼요.</p>
            <Btn variant="soft" size="sm" icon="link" className="w-full" onClick={() => push('새 연결을 추가했어요', 'ok')}>연결 추가</Btn>
          </div>
        </div>
        <div className="border-t border-line/50 flex flex-col" style={{ height: '40%' }}>
          <div className="px-4 py-2.5 text-[11px] font-semibold text-txt3 flex items-center gap-1.5"><Icon name="chat" size={13} /> 인라인 AI</div>
          <div className="flex-1 overflow-y-auto scroll px-3 space-y-2.5">
            {aiPanel.map((m, i) => (
              <div key={i} className={`text-[12.5px] leading-relaxed p-2.5 rounded-xl ${m.role === 'user' ? 'bg-primary/15 text-txt ml-6' : 'bg-surface2/50 text-txt2 mr-2'}`}>
                <span className={m.streaming ? 'stream-caret' : ''}>{m.text}</span>
              </div>
            ))}
          </div>
          <div className="p-3 flex items-center gap-2">
            <input value={aiInput} onChange={e => setAiInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendAi()}
              placeholder="이 노트에 질문…" className="flex-1 h-9 px-3 rounded-lg bg-surface2/60 border border-line/50 outline-none text-[12.5px] text-txt placeholder:text-txt3 focus:border-primary/50" />
            <button onClick={sendAi} className="h-9 w-9 grid place-items-center rounded-lg bg-primary text-white shrink-0"><Icon name="send" size={15} /></button>
          </div>
        </div>
      </div>

      {/* selection AI popup */}
      {aiPop && (
        <div className="fixed z-50 -translate-x-1/2 fade-up" style={{ left: aiPop.x, top: aiPop.y }} onMouseLeave={() => setAiPop(null)}>
          <div className="glass rounded-xl p-1.5 flex items-center gap-0.5 shadow-soft">
            {aiActions.map(a => (
              <button key={a.label} onClick={() => { push(`AI ${a.label} 실행 중…`); setAiPop(null); }}
                className="h-9 px-2.5 rounded-lg flex items-center gap-1.5 text-[12.5px] text-txt2 hover:text-txt hover:bg-surface2/60">
                <Icon name={a.icon} size={14} className="text-accent" /> {a.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* slash menu */}
      {slash && (
        <div className="fixed z-50 fade-up" style={{ left: slash.x, top: slash.y }} onMouseLeave={() => setSlash(null)}>
          <div className="glass rounded-xl p-1.5 w-48 shadow-soft">
            <div className="px-2 py-1 text-[10.5px] text-txt3 uppercase tracking-wide">블록</div>
            {slashCmds.map(c => (
              <button key={c.label} onClick={() => { updateNote(cur.id, { markdown: cur.markdown + '\n' + (c.ai ? 'AI가 이어서 작성 중…' : c.ins) }); setSlash(null); if (c.ai) push('AI 이어쓰기 생성 중…'); }}
                className="w-full flex items-center gap-2.5 px-2 h-9 rounded-lg text-[13px] text-txt2 hover:text-txt hover:bg-surface2/60 text-left">
                <Icon name={c.icon} size={15} className={c.ai ? 'text-accent' : 'text-txt3'} /> {c.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <UploadModal open={upload} onClose={() => setUpload(false)} onPick={onUpload} />
    </div>
  );
}

// note row in the list
function NoteRow({ n, c, active, indent }) {
  const cl = clusterById(n.folderId || n.cluster) || { color: '139 92 246' };
  return (
    <button onClick={() => navigate(`/notes/${n.id}`)}
      className={`group w-full flex items-center gap-2 ${indent ? 'pl-7' : 'pl-2.5'} pr-2 h-8 rounded-lg text-left text-[13px] transition-colors ${active ? 'bg-surface2/80 text-txt' : 'text-txt2 hover:bg-surface2/50'}`}>
      {active && <span className="absolute left-0 w-0.5 h-4 rounded-r bg-gradient-to-b from-primary to-accent" style={{ marginLeft: -2 }}></span>}
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: `rgb(${cl.color})` }}></span>
      <span className="truncate flex-1">{n.title || '제목 없음'}</span>
      {n.isFavorite && <Icon name="star" size={12} className="text-yellow-400 shrink-0" fill="currentColor" strokeWidth={0} />}
    </button>
  );
}

Object.assign(window, { Editor, SAMPLE_MD, useNotesStore, generateUntitledName, NoteRow, UploadModal });
