function ChatWindow({ push }) {
  const { CHAT_SESSIONS, MODELS, NOTES } = BX_DATA;
  const [sessions] = useState(CHAT_SESSIONS);
  const [active, setActive] = useState('new');
  const [model, setModel] = useState(MODELS[0]);
  const [modelOpen, setModelOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef(null);

  useEffect(()=>{ if(scrollRef.current) scrollRef.current.scrollTop=scrollRef.current.scrollHeight; }, [msgs]);

  const suggestions = ['Transformer 어텐션을 한 문단으로 설명해줘','내 RAG 노트 기준으로 검색 품질 높이는 법','이번 주에 새로 연결된 노트는?'];

  const ask = (q) => {
    if (!q.trim() || streaming) return;
    setMsgs(m=>[...m, { role:'user', text:q }]);
    setInput(''); setStreaming(true);
    const sources = [noteById('n2'), noteById('n1'), noteById('n12')];
    const answer = `검색 품질을 높이는 핵심은 세 가지예요.\n\n1. **청킹 전략** — 너무 큰 청크는 노이즈를, 너무 작은 청크는 맥락 손실을 부릅니다. 의미 단위로 나누세요.\n2. **재순위화(Re-ranking)** — 1차 벡터 검색 결과를 cross-encoder로 다시 정렬하면 정확도가 크게 오릅니다.\n3. **출처 강제** — 프롬프트에 "근거 노트를 인용하라"를 넣으면 환각이 줄어듭니다.\n\n이 내용은 아래 노트들을 근거로 정리했어요.`;
    setMsgs(m=>[...m, { role:'ai', text:'', streaming:true, sources, model:model.name }]);
    let i=0; const iv=setInterval(()=>{
      i+=3; setMsgs(m=>{ const c=[...m]; c[c.length-1]={ ...c[c.length-1], text:answer.slice(0,i), streaming:i<answer.length }; return c; });
      if(i>=answer.length){ clearInterval(iv); setStreaming(false); }
    }, 16);
  };

  const renderText = (t) => t.split('\n').map((line,i)=>{
    if(!line.trim()) return <div key={i} className="h-2"></div>;
    const html = line.replace(/\*\*(.+?)\*\*/g,'<b class="text-txt font-semibold">$1</b>');
    return <p key={i} className="text-[14.5px] leading-[1.75] text-txt2" dangerouslySetInnerHTML={{__html:html}}></p>;
  });

  return (
    <div data-route data-screen-label="AI 챗봇" className="flex h-full">
      {/* sessions */}
      <div className="w-60 shrink-0 border-r border-line/50 bg-bg2/30 flex flex-col">
        <div className="p-3">
          <Btn variant="primary" size="md" icon="plus" className="w-full" onClick={()=>{ setActive('new'); setMsgs([]); }}>새 대화</Btn>
        </div>
        <div className="flex-1 overflow-y-auto scroll px-2">
          <div className="px-2 py-1.5 text-[11px] text-txt3 font-semibold">최근 대화</div>
          {sessions.map(s=>(
            <button key={s.id} onClick={()=>setActive(s.id)}
              className={`w-full text-left p-2.5 rounded-xl mb-1 ${active===s.id?'bg-surface2/80':'hover:bg-surface2/50'}`}>
              <div className="text-[13px] font-medium text-txt truncate">{s.title}</div>
              <div className="text-[11px] text-txt3 truncate mt-0.5">{s.preview}</div>
              <div className="text-[10.5px] text-txt3 mt-1">{s.when}</div>
            </button>
          ))}
        </div>
      </div>

      {/* chat area */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* header w/ model picker */}
        <div className="h-14 px-5 border-b border-line/50 flex items-center gap-3">
          <div className="flex items-center gap-2 text-[14px] font-semibold"><Icon name="chat" size={17} className="text-primary"/> 내 노트 기반 AI 챗</div>
          <div className="flex-1"></div>
          <div className="relative">
            <button onClick={()=>setModelOpen(o=>!o)} className="h-9 px-3 rounded-xl border border-line/60 bg-surface/60 flex items-center gap-2 text-[13px] hover:border-primary/50">
              <span className="w-2 h-2 rounded-full bg-cyan"></span>{model.name}<Icon name="chevD" size={14} className="text-txt3"/>
            </button>
            {modelOpen && (
              <div className="absolute right-0 top-11 w-52 glass rounded-xl p-1.5 z-50 fade-up shadow-soft" onMouseLeave={()=>setModelOpen(false)}>
                {MODELS.map(m=>(
                  <button key={m.id} onClick={()=>{setModel(m);setModelOpen(false);}} className={`w-full flex items-center justify-between px-3 h-10 rounded-lg text-left ${m.id===model.id?'bg-surface2/70':'hover:bg-surface2/50'}`}>
                    <div><div className="text-[13px] font-medium text-txt">{m.name}</div><div className="text-[11px] text-txt3">{m.sub}</div></div>
                    {m.id===model.id && <Icon name="check" size={15} className="text-primary"/>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto scroll">
          {msgs.length===0 ? (
            <div className="h-full flex flex-col items-center justify-center px-6 text-center max-w-lg mx-auto">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent grid place-items-center shadow-glow mb-5"><Icon name="brain" size={30} className="text-white"/></div>
              <h2 className="text-[22px] font-bold tracking-tight mb-2">내 노트를 기반으로 질문해보세요</h2>
              <p className="text-txt2 mb-7 text-[14px]">BrainX는 당신이 쌓은 13개의 노트를 근거로 답하고, 항상 출처를 함께 보여줍니다.</p>
              <div className="grid sm:grid-cols-1 gap-2 w-full">
                {suggestions.map((s,i)=>(
                  <button key={i} onClick={()=>ask(s)} className="group flex items-center gap-3 p-3.5 rounded-xl card hover:border-primary/45 text-left transition-colors">
                    <Icon name="sparkle" size={16} className="text-accent shrink-0"/>
                    <span className="text-[13.5px] text-txt2 group-hover:text-txt flex-1">{s}</span>
                    <Icon name="arrowL" size={15} className="text-txt3 rotate-180"/>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto px-5 py-6 space-y-6">
              {msgs.map((m,i)=>(
                <div key={i} className={`flex gap-3 ${m.role==='user'?'flex-row-reverse':''}`}>
                  {m.role==='ai'
                    ? <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-accent grid place-items-center shrink-0"><Icon name="brain" size={17} className="text-white"/></div>
                    : <Avatar name="연우" size={32}/>}
                  <div className={`min-w-0 ${m.role==='user'?'items-end':''} flex flex-col`}>
                    <div className={`rounded-2xl px-4 py-3 ${m.role==='user'?'bg-primary text-white':'card'}`}>
                      {m.role==='user'
                        ? <p className="text-[14.5px] leading-relaxed">{m.text}</p>
                        : <div><span className={m.streaming?'stream-caret':''}>{renderText(m.text)}</span></div>}
                    </div>
                    {/* sources */}
                    {m.role==='ai' && m.sources && !m.streaming && (
                      <div className="mt-2.5 w-full">
                        <div className="text-[11px] font-semibold text-txt3 mb-1.5 flex items-center gap-1.5"><Icon name="link" size={12}/> 근거 노트 {m.sources.length}</div>
                        <div className="flex flex-wrap gap-2">
                          {m.sources.map((s,j)=>(
                            <button key={j} onClick={()=>navigate(`/notes/${s.id}`)} className="flex items-center gap-2 px-3 h-9 rounded-xl card hover:border-primary/45 transition-colors">
                              <span className="w-2 h-2 rounded-full" style={{background:`rgb(${clusterById(s.cluster).color})`}}></span>
                              <span className="text-[12.5px] text-txt2 max-w-[160px] truncate">{s.title}</span>
                              <span className="text-[10px] text-txt3 font-mono">[{j+1}]</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* input */}
        <div className="p-4 border-t border-line/50">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-end gap-2 p-2 rounded-2xl card focus-within:border-primary/50 transition-colors">
              <textarea value={input} onChange={e=>setInput(e.target.value)} rows={1}
                onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); ask(input); } }}
                placeholder="내 노트에게 질문하기…  (Shift+Enter 줄바꿈)"
                className="flex-1 bg-transparent outline-none resize-none text-[14.5px] text-txt placeholder:text-txt3 px-2 py-2 max-h-32" />
              <button onClick={()=>ask(input)} disabled={!input.trim()||streaming}
                className="h-10 w-10 grid place-items-center rounded-xl bg-primary text-white disabled:opacity-40 shrink-0 hover:brightness-110"><Icon name="send" size={17}/></button>
            </div>
            <p className="text-center text-[11px] text-txt3 mt-2">BrainX는 당신의 노트만 근거로 답합니다 · {model.name}</p>
          </div>
        </div>
      </div>

      {/* reference panel */}
      <div className="w-72 shrink-0 border-l border-line/50 bg-bg2/30 hidden lg:flex flex-col">
        <div className="p-4 border-b border-line/50 text-[13px] font-semibold text-txt2 flex items-center gap-2"><Icon name="doc" size={15}/> 참조·유사 노트</div>
        <div className="flex-1 overflow-y-auto scroll p-3 space-y-2.5">
          <div className="text-[11px] text-txt3 px-1">이 대화와 관련도 높은 노트</div>
          {[{n:noteById('n2'),r:96},{n:noteById('n3'),r:84},{n:noteById('n12'),r:79},{n:noteById('n1'),r:71}].map(({n,r},i)=>(
            <button key={i} onClick={()=>navigate(`/notes/${n.id}`)} className="w-full text-left p-3 rounded-xl card hover:border-primary/45 transition-colors">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-2 h-2 rounded-full" style={{background:`rgb(${clusterById(n.cluster).color})`}}></span>
                <span className="text-[13px] font-medium text-txt truncate flex-1">{n.title}</span>
              </div>
              <p className="text-[11.5px] text-txt3 line-clamp-2 mb-2">{n.summary}</p>
              <RelevanceBar value={r}/>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ChatWindow });
