function NoteCard({ note, onOpen, compact }) {
  const cl = clusterById(note.cluster);
  return (
    <Card hover onClick={() => onOpen(note)} className={`group p-4 ${compact ? '' : ''}`}>
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background:`rgb(${cl.color})` }}></span>
          <span className="text-[11.5px] text-txt3 truncate">{cl.label}</span>
        </div>
        {note.fav && <Icon name="star" size={15} className="text-yellow-400 shrink-0" fill="currentColor" strokeWidth={0} />}
      </div>
      <h3 className="text-[15px] font-semibold text-txt leading-snug mb-2 line-clamp-2 group-hover:text-primary transition-colors">{note.title}</h3>
      {!compact && <p className="text-[13px] text-txt2 leading-relaxed line-clamp-2 mb-3">{note.summary}</p>}
      <div className="flex items-center justify-between text-[11.5px] text-txt3">
        <span className="flex items-center gap-1"><Icon name="clock" size={13}/> {note.updated}</span>
        <span className="flex items-center gap-1"><Icon name="link" size={13}/> {note.links.length}개 연결</span>
      </div>
    </Card>
  );
}

function SectionHead({ icon, title, sub, action, color }) {
  return (
    <div className="flex items-end justify-between mb-4">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl grid place-items-center" style={{ background:`rgb(${color||'59 130 246'} / 0.14)`, color:`rgb(${color||'59 130 246'})` }}><Icon name={icon} size={17}/></div>
        <div>
          <h2 className="text-[16px] font-semibold text-txt leading-tight">{title}</h2>
          {sub && <p className="text-[12px] text-txt3">{sub}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

function Home({ semantic, push }) {
  const { NOTES } = BX_DATA;
  const favs = NOTES.filter(n => n.fav);
  const recent = NOTES.slice(0, 6);
  const open = (n) => navigate(`/notes/${n.id}`);
  // semantic results mock
  const sem = [
    { n: noteById('n4'), rel: 94 }, { n: noteById('n1'), rel: 88 }, { n: noteById('n12'), rel: 81 },
  ];
  // AI suggested connections
  const suggest = [
    { a: noteById('n2'), b: noteById('n9'), why: 'RAG 검색 UX가 시맨틱 검색 스케치와 직접 맞닿아 있어요' },
    { a: noteById('n5'), b: noteById('n12'), why: '의사결정 편향과 프롬프트 제약 설계가 개념적으로 연결됩니다' },
  ];

  return (
    <div data-route className="max-w-[1180px] mx-auto px-6 md:px-8 py-7">
      {/* greeting */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-7">
        <div>
          <p className="text-[13px] text-txt3 mb-1">2026년 6월 8일 일요일 · 오전</p>
          <h1 className="text-[26px] font-bold tracking-tight">좋은 아침이에요, 연우님 🌿</h1>
          <p className="text-txt2 mt-1.5 text-[14px]">오늘 <b className="text-txt">3개</b>의 노트가 새로 연결되었고, AI가 <b className="text-accent">2개의 인사이트</b>를 발견했어요.</p>
        </div>
        <div className="flex gap-2">
          <Btn variant="soft" icon="chat" onClick={()=>navigate('/chat')}>AI에게 묻기</Btn>
          <Btn variant="primary" icon="plus" onClick={()=>navigate('/notes/new')}>새 노트</Btn>
        </div>
      </div>

      {/* stat strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {[
          { icon:'doc', label:'전체 노트', v:'13', c:'59 130 246' },
          { icon:'link', label:'AI 연결', v:'38', c:'139 92 246' },
          { icon:'fire', label:'작성 스트릭', v:'12일', c:'244 114 182' },
          { icon:'bolt', label:'이번 달 토큰', v:'12.8K', c:'34 211 238' },
        ].map((s,i)=>(
          <Card key={i} className="p-4 flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl grid place-items-center shrink-0" style={{ background:`rgb(${s.c} / 0.14)`, color:`rgb(${s.c})` }}><Icon name={s.icon} size={20}/></div>
            <div>
              <div className="text-[22px] font-bold tracking-tight leading-none">{s.v}</div>
              <div className="text-[12px] text-txt3 mt-1 whitespace-nowrap">{s.label}</div>
            </div>
          </Card>
        ))}
      </div>

      {/* semantic results banner (only when semantic on) */}
      {semantic && (
        <Card glow className="p-5 mb-8 border-accent/40 fade-up">
          <SectionHead icon="sparkle" color="139 92 246" title="의미 기반 검색 결과" sub="키워드가 아닌 뜻으로 찾은 노트예요" />
          <div className="space-y-2.5">
            {sem.map(({n,rel},i)=>(
              <button key={i} onClick={()=>open(n)} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-surface2/50 transition-colors text-left">
                <span className="w-2 h-2 rounded-full" style={{background:`rgb(${clusterById(n.cluster).color})`}}></span>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-medium text-txt truncate">{n.title}</div>
                  <div className="text-[12px] text-txt3 truncate">{n.summary}</div>
                </div>
                <RelevanceBar value={rel} />
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* favorites */}
      <div className="mb-8">
        <SectionHead icon="star" color="234 179 8" title="즐겨찾기" sub={`${favs.length}개의 노트`}
          action={<Btn variant="ghost" size="sm" onClick={()=>navigate('/notes/n1')}>전체 보기 <Icon name="chevR" size={14}/></Btn>} />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {favs.map(n => <NoteCard key={n.id} note={n} onOpen={open} />)}
        </div>
      </div>

      {/* AI suggested connections */}
      <div className="mb-8">
        <SectionHead icon="link" color="139 92 246" title="AI 추천 연결" sub="이 노트들을 이어보는 건 어때요?" />
        <div className="grid md:grid-cols-2 gap-4">
          {suggest.map((s,i)=>(
            <Card key={i} className="p-5 relative overflow-hidden group" hover>
              <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full blur-2xl opacity-40 bg-accent"></div>
              <div className="relative flex items-center gap-3 mb-3">
                <div className="flex-1 px-3 py-2 rounded-lg bg-surface2/60 text-[13px] font-medium text-txt truncate">{s.a.title}</div>
                <div className="w-8 h-8 rounded-full grid place-items-center bg-accent/15 text-accent shrink-0 group-hover:scale-110 transition-transform"><Icon name="link" size={15}/></div>
                <div className="flex-1 px-3 py-2 rounded-lg bg-surface2/60 text-[13px] font-medium text-txt truncate">{s.b.title}</div>
              </div>
              <p className="relative text-[13px] text-txt2 leading-relaxed mb-3.5"><span className="text-accent font-medium">왜? </span>{s.why}</p>
              <div className="relative flex gap-2">
                <Btn variant="soft" size="sm" icon="check" onClick={()=>push('두 노트를 연결했어요','ok')}>연결하기</Btn>
                <Btn variant="ghost" size="sm" onClick={()=>push('추천을 숨겼어요')}>나중에</Btn>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* recent */}
      <div className="mb-4">
        <SectionHead icon="clock" color="34 211 238" title="최근 열람" sub="이어서 작업하기"
          action={<Btn variant="ghost" size="sm" onClick={()=>navigate('/graph')}>그래프로 보기 <Icon name="graph" size={14}/></Btn>} />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {recent.map(n => <NoteCard key={n.id} note={n} onOpen={open} />)}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Home, NoteCard, SectionHead });
