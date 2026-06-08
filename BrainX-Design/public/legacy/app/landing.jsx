// ============ Landing hero constellation (decorative, lightweight) ============
function HeroConstellation() {
  const ref = useRef(null);
  const raf = useRef(0);
  useEffect(() => {
    const svg = ref.current; if (!svg) return;
    const W = 560, H = 460;
    const groups = ['59 130 246','139 92 246','34 211 238','52 211 153'];
    const N = 22;
    const nodes = Array.from({ length: N }, (_, i) => ({
      x: Math.random()*W, y: Math.random()*H,
      vx: (Math.random()-.5)*.18, vy: (Math.random()-.5)*.18,
      r: 3 + Math.random()*6, c: groups[i % groups.length],
      hub: i < 4,
    }));
    nodes.forEach(n => { if (n.hub) n.r = 9 + Math.random()*4; });
    const edges = [];
    for (let i=0;i<N;i++) for (let j=i+1;j<N;j++) {
      if (Math.random() < 0.10 || (nodes[i].hub && Math.random()<0.3)) edges.push([i,j]);
    }
    const NS = 'http://www.w3.org/2000/svg';
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const gE = document.createElementNS(NS,'g'), gN = document.createElementNS(NS,'g');
    svg.appendChild(gE); svg.appendChild(gN);
    const lineEls = edges.map(() => { const l = document.createElementNS(NS,'line'); l.setAttribute('stroke','rgb(148 163 184 / 0.16)'); l.setAttribute('stroke-width','1'); gE.appendChild(l); return l; });
    const nodeEls = nodes.map(n => {
      const g = document.createElementNS(NS,'g');
      const halo = document.createElementNS(NS,'circle');
      halo.setAttribute('r', n.r*2.4); halo.setAttribute('fill', `rgb(${n.c} / 0.10)`);
      const c = document.createElementNS(NS,'circle');
      c.setAttribute('r', n.r); c.setAttribute('fill', `rgb(${n.c})`);
      c.setAttribute('opacity', n.hub ? '1' : '0.85');
      if (n.hub) c.setAttribute('stroke','rgb(255 255 255 / 0.5)'), c.setAttribute('stroke-width','1.2');
      g.appendChild(halo); g.appendChild(c); gN.appendChild(g);
      return g;
    });
    let t = 0;
    const tick = () => {
      t += 0.016;
      nodes.forEach(n => {
        n.x += n.vx; n.y += n.vy;
        if (n.x < 20 || n.x > W-20) n.vx *= -1;
        if (n.y < 20 || n.y > H-20) n.vy *= -1;
      });
      nodeEls.forEach((g,i) => g.setAttribute('transform', `translate(${nodes[i].x},${nodes[i].y + Math.sin(t+i)*1.5})`));
      edges.forEach(([a,b],k) => {
        const l = lineEls[k];
        l.setAttribute('x1', nodes[a].x); l.setAttribute('y1', nodes[a].y);
        l.setAttribute('x2', nodes[b].x); l.setAttribute('y2', nodes[b].y);
      });
      raf.current = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf.current);
  }, []);
  return <svg ref={ref} viewBox="0 0 560 460" className="w-full h-full" preserveAspectRatio="xMidYMid slice"></svg>;
}

const FEATURES = [
  { icon: 'sparkle', c: '59 130 246', title: 'AI 자동 정리', desc: '노트를 저장하면 AI가 주제를 파악해 태그·요약·폴더를 자동으로 구성합니다.' },
  { icon: 'chat',    c: '139 92 246', title: 'RAG 기반 내 노트 챗봇', desc: '내 자료를 근거로 답하고, 모든 답변에 출처 노트 링크를 함께 제시합니다.' },
  { icon: 'graph',   c: '34 211 238', title: '지식 마인드맵', desc: '노트는 노드, 연결은 엣지로. 흩어진 생각이 살아있는 그래프로 이어집니다.' },
  { icon: 'import',  c: '52 211 153', title: 'Notion·Obsidian 가져오기', desc: '기존 자료를 그대로 옮겨오고, AI가 관계를 새로 연결해 드립니다.' },
];

function FeatureCard({ f, i }) {
  return (
    <Card hover className="p-6 fade-up" >
      <div className="w-12 h-12 rounded-2xl grid place-items-center mb-4" style={{ background:`rgb(${f.c} / 0.14)`, color:`rgb(${f.c})` }}>
        <Icon name={f.icon} size={24} />
      </div>
      <h3 className="text-[17px] font-semibold text-txt mb-2">{f.title}</h3>
      <p className="text-[14px] text-txt2 leading-relaxed">{f.desc}</p>
    </Card>
  );
}

function Landing({ theme, setTheme }) {
  const { PRICING } = BX_DATA;
  const [yr, setYr] = useState(true);
  return (
    <div data-route className="h-full overflow-y-auto scroll relative">
      {/* nav */}
      <header className="sticky top-0 z-40 h-16 flex items-center px-6 md:px-10 border-b border-line/40 bg-bg/60 backdrop-blur-xl">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary via-accent to-cyan grid place-items-center shadow-glow"><Icon name="brain" size={20} className="text-white" /></div>
          <span className="font-display text-[20px] font-bold tracking-tight">BrainX</span>
        </div>
        <nav className="hidden md:flex items-center gap-1 ml-10 text-sm text-txt2">
          {['기능','마인드맵','요금제'].map(x => <a key={x} href="#" className="px-3 h-9 grid place-items-center rounded-lg whitespace-nowrap hover:text-txt hover:bg-surface2/50">{x}</a>)}
        </nav>
        <div className="flex-1"></div>
        <div className="flex items-center gap-2">
          <ThemeToggle theme={theme} setTheme={setTheme} />
          <Btn variant="ghost" size="sm" onClick={() => navigate('/login')} className="hidden sm:inline-flex">로그인</Btn>
          <Btn variant="primary" size="sm" onClick={() => navigate('/home')}>무료로 시작</Btn>
        </div>
      </header>

      {/* hero */}
      <section className="relative px-6 md:px-10 pt-16 md:pt-24 pb-20 max-w-[1180px] mx-auto grid md:grid-cols-2 gap-12 items-center">
        <div className="relative z-10">
          <Badge color="139 92 246" dot className="mb-6">AI 기반 개인 지식 관리 · BrainX</Badge>
          <h1 className="text-[40px] md:text-[54px] leading-[1.08] font-bold tracking-tight mb-5">
            내 지식의 우주를 탐험하는<br/><span className="gradient-text">AI 두뇌, BrainX</span>
          </h1>
          <p className="text-[17px] text-txt2 leading-relaxed mb-8 max-w-md">
            노트, 메모, 자료를 저장하면 AI가 정리하고 연결하며, 필요한 순간 답을 찾아줍니다. 적기만 하세요 — 연결과 정리는 AI가 합니다.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Btn variant="primary" size="lg" icon="bolt" onClick={() => navigate('/home')}>무료로 시작하기</Btn>
            <Btn variant="outline" size="lg" icon="eye" onClick={() => navigate('/graph')}>데모 보기</Btn>
          </div>
          <div className="flex items-center gap-6 mt-9 text-[13px] text-txt3">
            <span className="flex items-center gap-1.5"><Icon name="check" size={15} className="text-cyan"/> 신용카드 불필요</span>
            <span className="flex items-center gap-1.5"><Icon name="check" size={15} className="text-cyan"/> 1분 만에 시작</span>
          </div>
        </div>
        {/* live graph card */}
        <div className="relative">
          <div className="absolute inset-0 grid-bg opacity-60"></div>
          <Card className="relative p-2 overflow-hidden aspect-[5/4]" glow>
            <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-cyan animate-pulse"></span>
              <span className="text-[12px] text-txt2 font-medium">실시간 지식 그래프 · 13 노트 연결됨</span>
            </div>
            <HeroConstellation />
            <div className="absolute bottom-4 left-4 right-4 z-10 flex items-center justify-between">
              <div className="flex gap-1.5">
                {BX_DATA.CLUSTERS.slice(0,4).map(c => (
                  <Badge key={c.id} color={c.color} dot className="!h-6 backdrop-blur-md">{c.label}</Badge>
                ))}
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* features */}
      <section className="px-6 md:px-10 py-16 max-w-[1180px] mx-auto">
        <div className="text-center mb-12">
          <Badge className="mb-4">핵심 기능</Badge>
          <h2 className="text-[32px] md:text-[40px] font-bold tracking-tight">저장 그 이상, <span className="gradient-text">생각을 연결</span>합니다</h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {FEATURES.map((f,i) => <FeatureCard key={i} f={f} i={i} />)}
        </div>
      </section>

      {/* problem */}
      <section className="px-6 md:px-10 py-16 max-w-[1180px] mx-auto">
        <div className="grid lg:grid-cols-3 gap-5">
          {[
            { tag:'AI 도구의 한계', c:'244 114 182', t:'질문엔 답하지만, 내 자료를 관리하진 못합니다', d:'ChatGPT·Claude는 똑똑하지만 어제 내가 쓴 메모를 기억하지 못합니다.' },
            { tag:'노트 도구의 한계', c:'234 179 8', t:'저장은 잘하지만, 연결과 검색이 약합니다', d:'Notion·Obsidian은 잘 쌓이지만, 흩어진 지식을 AI가 이어주진 않습니다.' },
            { tag:'BrainX의 해답', c:'34 211 238', t:'저장 + AI 정리 + 자동 연결 + RAG 대화', d:'쌓는 순간 정리되고, 연결되고, 언제든 근거 있는 답으로 돌아옵니다.', hl:true },
          ].map((x,i) => (
            <Card key={i} glow={x.hl} className={`p-7 ${x.hl ? 'border-cyan/40' : ''}`}>
              <Badge color={x.c} dot className="mb-4">{x.tag}</Badge>
              <h3 className="text-[19px] font-semibold text-txt mb-3 leading-snug">{x.t}</h3>
              <p className="text-[14px] text-txt2 leading-relaxed">{x.d}</p>
              {x.hl && <Btn variant="outline" size="sm" icon="arrowL" className="mt-5 [&_svg]:rotate-180" onClick={()=>navigate('/home')}>지금 경험하기</Btn>}
            </Card>
          ))}
        </div>
      </section>

      {/* pricing */}
      <section className="px-6 md:px-10 py-16 max-w-[1180px] mx-auto">
        <div className="text-center mb-10">
          <Badge className="mb-4">요금제</Badge>
          <h2 className="text-[32px] md:text-[40px] font-bold tracking-tight mb-6">생각의 크기에 맞춰</h2>
          <div className="inline-flex items-center gap-3 p-1 rounded-xl glass">
            <button onClick={()=>setYr(false)} className={`h-9 px-4 rounded-lg text-sm font-medium ${!yr?'bg-surface2 text-txt':'text-txt2'}`}>월간</button>
            <button onClick={()=>setYr(true)} className={`h-9 px-4 rounded-lg text-sm font-medium flex items-center gap-2 ${yr?'bg-surface2 text-txt':'text-txt2'}`}>연간 <span className="text-[11px] text-cyan">-20%</span></button>
          </div>
        </div>
        <div className="grid md:grid-cols-3 gap-5 max-w-4xl mx-auto">
          {PRICING.map(p => (
            <Card key={p.id} glow={p.best} className={`p-7 relative ${p.best ? 'border-primary/50' : ''}`}>
              {p.best && <Badge color="59 130 246" className="absolute -top-3 left-1/2 -translate-x-1/2">가장 인기</Badge>}
              <div className="text-[15px] font-semibold text-txt2 mb-1">{p.name}</div>
              <div className="flex items-end gap-1 mb-1">
                <span className="text-[34px] font-bold tracking-tight">₩{((yr?p.yr:p.price)).toLocaleString()}</span>
                <span className="text-txt3 text-sm mb-1.5">/월</span>
              </div>
              <p className="text-[13px] text-txt3 mb-5">{p.tag}</p>
              <Btn variant={p.best ? 'primary' : 'soft'} className="w-full mb-5" onClick={()=>navigate('/billing')}>{p.cta}</Btn>
              <ul className="space-y-2.5">
                {p.feats.map((f,i)=>(<li key={i} className="flex items-start gap-2.5 text-[13.5px] text-txt2"><Icon name="check" size={16} className="text-cyan mt-0.5 shrink-0"/>{f}</li>))}
              </ul>
            </Card>
          ))}
        </div>
      </section>

      {/* cta */}
      <section className="px-6 md:px-10 py-16 max-w-[1180px] mx-auto">
        <Card glow className="relative overflow-hidden p-12 text-center border-primary/40">
          <div className="absolute inset-0 grid-bg opacity-40"></div>
          <div className="relative">
            <h2 className="text-[30px] md:text-[38px] font-bold tracking-tight mb-4">머릿속 우주를 정리할 시간</h2>
            <p className="text-txt2 mb-7 max-w-md mx-auto">지금 첫 노트를 쓰면, BrainX가 나머지를 연결합니다.</p>
            <Btn variant="primary" size="lg" icon="bolt" onClick={()=>navigate('/home')}>무료로 시작하기</Btn>
          </div>
        </Card>
      </section>

      {/* footer */}
      <footer className="px-6 md:px-10 py-10 border-t border-line/40 max-w-[1180px] mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-txt3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-accent grid place-items-center"><Icon name="brain" size={16} className="text-white"/></div>
            <span className="font-display font-bold text-txt">BrainX</span>
            <span className="ml-2">© 2026 BrainX 개발팀</span>
          </div>
          <div className="flex items-center gap-5">
            {['이용약관','개인정보','문의하기'].map(x=><a key={x} href={x==='문의하기'?'#/support':'#'} className="hover:text-txt">{x}</a>)}
          </div>
        </div>
      </footer>
    </div>
  );
}

Object.assign(window, { Landing, HeroConstellation });
