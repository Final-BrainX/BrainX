// ============ Force-directed interactive graph ============
// Pre-settle a force layout synchronously so the graph is visible immediately
// (the live rAF loop is throttled when the tab/iframe is backgrounded).
function settleLayout(NOTES, EDGES, CLUSTERS, iters) {
  const pos = {}; const cIndex = {}; CLUSTERS.forEach((c,i)=>cIndex[c.id]=i);
  NOTES.forEach((n) => {
    const ci = cIndex[n.cluster]; const ca = (ci / CLUSTERS.length) * Math.PI*2; const R = 190;
    pos[n.id] = { x: Math.cos(ca)*R + (Math.random()-.5)*90, y: Math.sin(ca)*R + (Math.random()-.5)*90, vx:0, vy:0, fx:null, fy:null };
  });
  for (let t=0;t<(iters||260);t++) {
    for (let i=0;i<NOTES.length;i++) for (let j=i+1;j<NOTES.length;j++) {
      const a=pos[NOTES[i].id], b=pos[NOTES[j].id];
      let dx=a.x-b.x, dy=a.y-b.y; let d2=dx*dx+dy*dy+0.01; let d=Math.sqrt(d2);
      const rep=2600/d2; a.vx+=dx/d*rep; a.vy+=dy/d*rep; b.vx-=dx/d*rep; b.vy-=dy/d*rep;
    }
    EDGES.forEach(e=>{ const a=pos[e.source], b=pos[e.target]; if(!a||!b) return;
      let dx=b.x-a.x, dy=b.y-a.y; let d=Math.sqrt(dx*dx+dy*dy)+0.01; const k=0.012*(d-(e.bridge?240:130));
      a.vx+=dx/d*k; a.vy+=dy/d*k; b.vx-=dx/d*k; b.vy-=dy/d*k; });
    NOTES.forEach(n=>{ const p=pos[n.id]; p.vx+=-p.x*0.0016; p.vy+=-p.y*0.0016; p.vx*=0.86; p.vy*=0.86; p.x+=p.vx; p.y+=p.vy; });
  }
  return pos;
}

function GraphCanvas({ data, onSelect, selectedId, controls, clusterOn, timeFilter, push }) {
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const gRef = useRef(null);
  const tipRef = useRef(null);
  const { NOTES, EDGES, CLUSTERS } = data;
  const ageRank = { '오늘':0,'2시간 전':0,'4시간 전':0,'어제':1,'1일 전':1,'2일 전':2,'3일 전':3,'4일 전':4,'5일 전':5,'6일 전':6,'1주 전':7 };

  const seedRef = useRef(null);
  if (!seedRef.current) seedRef.current = settleLayout(NOTES, EDGES, CLUSTERS);
  const sim = useRef({ pos: seedRef.current, nodeEls: {}, edgeEls: [], view: { x: 0, y: 0, k: 1 }, size: { w: 900, h: 560 }, hovered: null, drag: null, raf: 0 });
  const [size, setSize] = useState({ w: 900, h: 560 });
  const [hovered, setHovered] = useState(null);

  // resize
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      const r = wrapRef.current.getBoundingClientRect();
      sim.current.size = { w: r.width, h: r.height };
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  // initial imperative paint (effects aren't rAF-throttled when backgrounded)
  useEffect(() => {
    const s = sim.current; const { view } = s;
    if (gRef.current) gRef.current.setAttribute('transform', `translate(${size.w/2+view.x},${size.h/2+view.y}) scale(${view.k})`);
    s.edgeEls.forEach(({el,e})=>{ const a=s.pos[e.source], b=s.pos[e.target]; if(!a||!b||!el) return; el.setAttribute('x1',a.x); el.setAttribute('y1',a.y); el.setAttribute('x2',b.x); el.setAttribute('y2',b.y); });
    NOTES.forEach(n=>{ const el=s.nodeEls[n.id]; const p=s.pos[n.id]; if(el&&p) el.setAttribute('transform',`translate(${p.x},${p.y})`); });
  }, [size]);

  // simulation loop
  useEffect(() => {
    const s = sim.current;
    const clusterCentroid = () => {
      const c = {}; const cnt = {};
      NOTES.forEach(n => { const p = s.pos[n.id]; c[n.cluster]=c[n.cluster]||{x:0,y:0}; c[n.cluster].x+=p.x; c[n.cluster].y+=p.y; cnt[n.cluster]=(cnt[n.cluster]||0)+1; });
      Object.keys(c).forEach(k => { c[k].x/=cnt[k]; c[k].y/=cnt[k]; });
      return c;
    };
    const step = () => {
      const pos = s.pos;
      // repulsion
      for (let i=0;i<NOTES.length;i++) for (let j=i+1;j<NOTES.length;j++) {
        const a=pos[NOTES[i].id], b=pos[NOTES[j].id];
        let dx=a.x-b.x, dy=a.y-b.y; let d2=dx*dx+dy*dy+0.01; let d=Math.sqrt(d2);
        const rep = 2600/d2; const fx=dx/d*rep, fy=dy/d*rep;
        a.vx+=fx; a.vy+=fy; b.vx-=fx; b.vy-=fy;
      }
      // springs
      EDGES.forEach(e=>{
        const a=pos[e.source], b=pos[e.target]; if(!a||!b) return;
        let dx=b.x-a.x, dy=b.y-a.y; let d=Math.sqrt(dx*dx+dy*dy)+0.01;
        const target = e.bridge ? 240 : 130; const k=0.012*(d-target);
        const fx=dx/d*k, fy=dy/d*k;
        a.vx+=fx; a.vy+=fy; b.vx-=fx; b.vy-=fy;
      });
      // gravity to center + optional cluster gravity
      const cen = clusterOn ? clusterCentroid() : null;
      NOTES.forEach(n=>{
        const p=pos[n.id];
        p.vx += -p.x*0.0016; p.vy += -p.y*0.0016;
        if (clusterOn && cen[n.cluster]) {
          p.vx += (cen[n.cluster].x - p.x)*0.02;
          p.vy += (cen[n.cluster].y - p.y)*0.02;
        }
        if (p.fx!=null){ p.x=p.fx; p.y=p.fy; p.vx=0; p.vy=0; }
        else { p.vx*=0.86; p.vy*=0.86; p.x+=p.vx; p.y+=p.vy; }
      });
      // paint
      const { view } = s;
      if (gRef.current) gRef.current.setAttribute('transform', `translate(${s.size.w/2+view.x},${s.size.h/2+view.y}) scale(${view.k})`);
      s.edgeEls.forEach(({el, e})=>{
        const a=pos[e.source], b=pos[e.target]; if(!a||!b) return;
        el.setAttribute('x1',a.x); el.setAttribute('y1',a.y); el.setAttribute('x2',b.x); el.setAttribute('y2',b.y);
      });
      NOTES.forEach(n=>{ const el=s.nodeEls[n.id]; if(el){ const p=pos[n.id]; el.setAttribute('transform',`translate(${p.x},${p.y})`); } });
      // tooltip follow
      if (s.hovered && tipRef.current) {
        const p=pos[s.hovered]; const sx=s.size.w/2+view.x+p.x*view.k; const sy=s.size.h/2+view.y+p.y*view.k;
        tipRef.current.style.transform=`translate(${sx}px,${sy}px)`;
      }
      s.raf=requestAnimationFrame(step);
    };
    s.raf=requestAnimationFrame(step);
    return ()=>cancelAnimationFrame(s.raf);
  }, [clusterOn]);

  // expose control handlers
  useEffect(() => {
    if (!controls) return;
    controls.current = {
      zoom: (f) => { const v=sim.current.view; v.k=Math.max(0.35,Math.min(2.4,v.k*f)); },
      fit: () => { const v=sim.current.view; v.x=0; v.y=0; v.k=1; },
      reheat: () => { NOTES.forEach(n=>{ const p=sim.current.pos[n.id]; p.vx+=(Math.random()-.5)*40; p.vy+=(Math.random()-.5)*40; }); },
      bridges: () => {
        sim.current.edgeEls.forEach(({el,e})=>{ if(e.bridge){ el.classList.add('bridge-on'); setTimeout(()=>el.classList.remove('bridge-on'),2600); } });
        push && push('징검다리 개념 3개를 발견했어요 ✨','ok');
      },
    };
  }, [controls]);

  // pointer interactions
  const toGraph = (clientX, clientY) => {
    const r = svgRef.current.getBoundingClientRect(); const v=sim.current.view;
    return { x: (clientX-r.left - r.width/2 - v.x)/v.k, y: (clientY-r.top - r.height/2 - v.y)/v.k };
  };
  const onWheel = (e) => {
    e.preventDefault(); const v=sim.current.view;
    const r=svgRef.current.getBoundingClientRect();
    const mx=e.clientX-r.left-r.width/2, my=e.clientY-r.top-r.height/2;
    const gx=(mx-v.x)/v.k, gy=(my-v.y)/v.k;
    const nk=Math.max(0.35,Math.min(2.4, v.k*(e.deltaY<0?1.12:0.89)));
    v.x=mx-gx*nk; v.y=my-gy*nk; v.k=nk;
  };
  const bgDrag = useRef(null);
  const onDown = (e) => {
    if (e.target.closest('[data-node]')) return;
    bgDrag.current={ x:e.clientX, y:e.clientY, vx:sim.current.view.x, vy:sim.current.view.y };
  };
  const onMove = (e) => {
    const s=sim.current;
    if (s.drag) { const g=toGraph(e.clientX,e.clientY); const p=s.pos[s.drag]; p.fx=g.x; p.fy=g.y; }
    else if (bgDrag.current) { const d=bgDrag.current; s.view.x=d.vx+(e.clientX-d.x); s.view.y=d.vy+(e.clientY-d.y); }
  };
  const onUp = () => { const s=sim.current; if(s.drag){ const p=s.pos[s.drag]; p.fx=null; p.fy=null; s.drag=null; } bgDrag.current=null; };

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden select-none"
      onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}>
      <div className="absolute inset-0 grid-bg opacity-50 pointer-events-none"></div>
      <svg ref={svgRef} className="w-full h-full cursor-grab active:cursor-grabbing" onWheel={onWheel} onPointerDown={onDown}>
        <defs>
          <radialGradient id="nodeGlow"><stop offset="0%" stopColor="white" stopOpacity="0.25"/><stop offset="100%" stopColor="white" stopOpacity="0"/></radialGradient>
        </defs>
        <g ref={gRef} transform={`translate(${size.w/2},${size.h/2}) scale(1)`}>
          {/* edges */}
          <g>
            {EDGES.map((e,i)=>{ const a=sim.current.pos[e.source], b=sim.current.pos[e.target]; return (
              <line key={i} ref={el=>{ if(el) sim.current.edgeEls[i]={el,e}; }}
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={e.bridge ? 'rgb(34 211 238 / 0.35)' : 'rgb(148 163 184 / 0.2)'}
                strokeWidth={e.bridge?1.6:1} strokeDasharray={e.bridge?'5 5':'none'} className="bx-edge" />
            ); })}
          </g>
          {/* nodes */}
          <g>
            {NOTES.map(n=>{
              const cl=clusterById(n.cluster); const r=10+Math.min(14,n.words/180);
              const dim = timeFilter!=='전체' && (ageRank[n.updated]||0) > (timeFilter==='최근 1일'?1:timeFilter==='최근 1주'?7:99);
              const sel = selectedId===n.id;
              return (
                <g key={n.id} data-node ref={el=>{ if(el) sim.current.nodeEls[n.id]=el; }}
                  transform={`translate(${sim.current.pos[n.id].x},${sim.current.pos[n.id].y})`}
                  className="cursor-pointer" style={{ opacity: dim?0.18:1, transition:'opacity .3s' }}
                  onPointerDown={(ev)=>{ ev.stopPropagation(); sim.current.drag=n.id; }}
                  onClick={()=>onSelect(n)}
                  onPointerEnter={()=>{ sim.current.hovered=n.id; setHovered(n); }}
                  onPointerLeave={()=>{ sim.current.hovered=null; setHovered(null); }}>
                  <circle r={r*2.2} fill={`rgb(${cl.color} / 0.10)`} />
                  {sel && <circle r={r+7} fill="none" stroke={`rgb(${cl.color})`} strokeWidth="1.5" strokeDasharray="3 3" className="bx-spin" />}
                  <circle r={r} fill={`rgb(${cl.color})`} stroke="rgb(255 255 255 / 0.55)" strokeWidth={sel?2:1}
                    style={{ filter: sel?`drop-shadow(0 0 10px rgb(${cl.color}))`:'none' }} />
                  <text textAnchor="middle" y={r+15} fontSize="11" fill="rgb(var(--txt2))" className="pointer-events-none font-medium" style={{ paintOrder:'stroke', stroke:'rgb(var(--bg))', strokeWidth:3 }}>{n.title.length>12?n.title.slice(0,11)+'…':n.title}</text>
                </g>
              );
            })}
          </g>
        </g>
      </svg>

      {/* hover tooltip */}
      <div ref={tipRef} className="absolute top-0 left-0 pointer-events-none z-30" style={{ willChange:'transform' }}>
        {hovered && (
          <div className="fade-up -translate-x-1/2 -translate-y-[calc(100%+22px)] w-60 glass rounded-xl p-3 shadow-soft">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="w-2 h-2 rounded-full" style={{background:`rgb(${clusterById(hovered.cluster).color})`}}></span>
              <span className="text-[11px] text-txt3">{clusterById(hovered.cluster).label} · AI 요약</span>
            </div>
            <div className="text-[13px] font-semibold text-txt mb-1 leading-snug">{hovered.title}</div>
            <p className="text-[11.5px] text-txt2 leading-relaxed line-clamp-3">{hovered.summary}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Graph({ push }) {
  const data = BX_DATA;
  const [selected, setSelected] = useState(null);
  const [clusterOn, setClusterOn] = useState(false);
  const [timeFilter, setTimeFilter] = useState('전체');
  const [hiddenClusters, setHidden] = useState({});
  const controls = useRef(null);
  const sel = selected ? data.NOTES.find(n=>n.id===selected) : null;

  const Ctrl = ({ icon, label, onClick, active }) => (
    <button onClick={onClick} title={label}
      className={`h-9 w-9 grid place-items-center rounded-lg transition-colors ${active?'bg-primary text-white':'text-txt2 hover:text-txt hover:bg-surface2/60'}`}>
      <Icon name={icon} size={17}/>
    </button>
  );

  return (
    <div data-route data-screen-label="그래프" className="relative h-full">
      {/* canvas */}
      <GraphCanvas data={data} controls={controls} clusterOn={clusterOn} timeFilter={timeFilter}
        selectedId={selected} onSelect={n=>setSelected(n.id)} push={push} />

      {/* top controls */}
      <div className="absolute top-5 left-5 right-5 flex items-start justify-between gap-3 z-20 pointer-events-none">
        <div className="pointer-events-auto">
          <div className="glass rounded-2xl px-4 py-3 mb-3 max-w-xs">
            <h1 className="text-[17px] font-bold tracking-tight flex items-center gap-2"><Icon name="graph" size={18} className="text-primary"/> 지식 마인드맵</h1>
            <p className="text-[12px] text-txt2 mt-1">13개 노트 · 19개 연결 · 5개 클러스터. 노드를 끌어 옮기고, 스크롤로 확대해 보세요.</p>
          </div>
          {/* clusters legend */}
          <div className="glass rounded-2xl p-2.5 space-y-0.5 w-52">
            <div className="px-1.5 pb-1.5 text-[11px] font-semibold text-txt3 flex items-center gap-1.5"><Icon name="cluster" size={13}/> AI 클러스터</div>
            {data.CLUSTERS.map(c=>(
              <button key={c.id} onClick={()=>setHidden(h=>({...h,[c.id]:!h[c.id]}))}
                className="w-full flex items-center gap-2.5 px-1.5 h-8 rounded-lg hover:bg-surface2/50 text-left">
                <span className="w-2.5 h-2.5 rounded-full" style={{background:`rgb(${c.color})`, opacity:hiddenClusters[c.id]?0.3:1}}></span>
                <span className={`text-[12.5px] flex-1 ${hiddenClusters[c.id]?'text-txt3 line-through':'text-txt2'}`}>{c.label}</span>
                <span className="text-[11px] text-txt3 font-mono">{data.NOTES.filter(n=>n.cluster===c.id).length}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-end gap-3 pointer-events-auto">
          <div className="glass rounded-xl p-1.5 flex items-center gap-0.5">
            <Ctrl icon="zoomin" label="확대" onClick={()=>controls.current?.zoom(1.2)} />
            <Ctrl icon="zoomout" label="축소" onClick={()=>controls.current?.zoom(0.83)} />
            <Ctrl icon="fit" label="전체 보기" onClick={()=>controls.current?.fit()} />
            <div className="w-px h-6 bg-line/60 mx-1"></div>
            <Ctrl icon="cluster" label="클러스터링" active={clusterOn} onClick={()=>setClusterOn(c=>!c)} />
            <Ctrl icon="refresh" label="재배치" onClick={()=>controls.current?.reheat()} />
          </div>
          {/* time filter */}
          <div className="glass rounded-xl p-1 flex items-center gap-0.5">
            {['전체','최근 1일','최근 1주'].map(t=>(
              <button key={t} onClick={()=>setTimeFilter(t)}
                className={`h-8 px-3 rounded-lg text-[12px] font-medium ${timeFilter===t?'bg-surface2 text-txt':'text-txt2 hover:text-txt'}`}>{t}</button>
            ))}
          </div>
          <Btn variant="accent" size="sm" icon="sparkle" onClick={()=>controls.current?.bridges()}>징검다리 개념 추천</Btn>
        </div>
      </div>

      {/* node preview panel */}
      {sel && (
        <div className="absolute top-5 right-5 bottom-5 w-80 z-30 fade-up">
          <Card className="h-full flex flex-col overflow-hidden">
            <div className="p-4 border-b border-line/50 flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-3 h-3 rounded-full shrink-0" style={{background:`rgb(${clusterById(sel.cluster).color})`}}></span>
                <span className="text-[12px] text-txt3 truncate">{clusterById(sel.cluster).label}</span>
              </div>
              <button onClick={()=>setSelected(null)} className="text-txt3 hover:text-txt"><Icon name="x" size={16}/></button>
            </div>
            <div className="p-4 overflow-y-auto scroll flex-1">
              <h2 className="text-[18px] font-bold leading-snug mb-2">{sel.title}</h2>
              <div className="flex flex-wrap gap-1.5 mb-4">{sel.tags.map(t=><Badge key={t} className="!h-5 !text-[10.5px]">#{t}</Badge>)}</div>
              <div className="rounded-xl bg-accent/[0.08] border border-accent/20 p-3 mb-4">
                <div className="text-[11px] font-semibold text-accent flex items-center gap-1.5 mb-1.5"><Icon name="sparkle" size={13}/> AI 3줄 요약</div>
                <p className="text-[13px] text-txt2 leading-relaxed">{sel.summary}</p>
              </div>
              <div className="text-[11px] font-semibold text-txt3 mb-2">연결된 노트 {sel.links.length}</div>
              <div className="space-y-1.5 mb-4">
                {sel.links.map(id=>{ const ln=noteById(id); return (
                  <button key={id} onClick={()=>setSelected(id)} className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-surface2/50 text-left">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{background:`rgb(${clusterById(ln.cluster).color})`}}></span>
                    <span className="text-[12.5px] text-txt2 truncate flex-1">{ln.title}</span>
                    <Icon name="chevR" size={13} className="text-txt3"/>
                  </button>
                ); })}
              </div>
            </div>
            <div className="p-4 border-t border-line/50 flex gap-2">
              <Btn variant="primary" size="sm" icon="doc" className="flex-1" onClick={()=>navigate(`/notes/${sel.id}`)}>노트 열기</Btn>
              <Btn variant="soft" size="sm" icon="chat" onClick={()=>navigate('/chat')}>AI에게</Btn>
            </div>
          </Card>
        </div>
      )}

      <style>{`
        .bx-spin{ animation: bxspin 8s linear infinite; transform-origin:center; }
        @keyframes bxspin{ to{ transform: rotate(360deg);} }
        .bx-edge.bridge-on{ stroke: rgb(34 211 238) !important; stroke-width:2.4 !important; animation: dash 1s linear infinite; filter: drop-shadow(0 0 6px rgb(34 211 238)); }
        @keyframes dash{ to{ stroke-dashoffset:-20; } }
      `}</style>
    </div>
  );
}

Object.assign(window, { Graph, GraphCanvas });
