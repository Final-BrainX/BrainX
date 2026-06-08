// ============ hash router ============
function useHashRoute() {
  const [route, setRoute] = useState(() => window.location.hash.slice(1) || '/');
  useEffect(() => {
    const on = () => setRoute(window.location.hash.slice(1) || '/');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
function navigate(path) {
  window.location.hash = path;
  const main = document.querySelector('[data-scroll-main]');
  if (main) main.scrollTop = 0;
}

const NAV = [
  { id: 'home',   label: '홈',        icon: 'home',     path: '/home' },
  { id: 'notes',  label: '노트',      icon: 'notes',    path: '/notes/n1' },
  { id: 'graph',  label: '마인드맵',   icon: 'graph',    path: '/graph' },
  { id: 'chat',   label: 'AI 챗',     icon: 'chat',     path: '/chat' },
  { id: 'import', label: '가져오기',   icon: 'import',   path: '/import' },
  { id: 'dash',   label: '대시보드',   icon: 'dash',     path: '/mypage' },
];
const NAV2 = [
  { id: 'bill',     label: '플랜·결제', icon: 'bill',     path: '/billing' },
  { id: 'settings', label: '설정',     icon: 'settings', path: '/settings' },
];

function Sidebar({ route, collapsed, setCollapsed }) {
  const active = (p) => route === p || (p !== '/home' && route.startsWith(p.split('/').slice(0,2).join('/'))) || (p.startsWith('/notes') && route.startsWith('/notes'));
  const Item = ({ item }) => {
    const on = active(item.path);
    return (
      <button onClick={() => navigate(item.path)}
        className={`group relative w-full flex items-center gap-3 h-11 rounded-xl px-3 transition-all duration-200
          ${on ? 'text-txt bg-surface2/80' : 'text-txt2 hover:text-txt hover:bg-surface2/50'}`}>
        {on && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full bg-gradient-to-b from-primary to-accent"></span>}
        <Icon name={item.icon} size={19} className={on ? 'text-primary' : ''} />
        {!collapsed && <span className="text-[14px] font-medium whitespace-nowrap">{item.label}</span>}
        {collapsed && (
          <span className="absolute left-full ml-3 px-2 py-1 rounded-lg bg-surface2 text-txt text-xs border border-line/60 opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 shadow-soft">{item.label}</span>
        )}
      </button>
    );
  };
  return (
    <aside className={`relative z-20 shrink-0 flex flex-col h-full border-r border-line/50 bg-bg2/40 backdrop-blur-xl transition-all duration-300 ${collapsed ? 'w-[68px]' : 'w-[236px]'}`}>
      <div className="h-16 flex items-center gap-2.5 px-4 shrink-0">
        <button onClick={() => navigate('/')} className="flex items-center gap-2.5 group">
          <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-primary via-accent to-cyan grid place-items-center shadow-glow shrink-0">
            <Icon name="brain" size={20} className="text-white" strokeWidth={1.6} />
          </div>
          {!collapsed && <span className="font-display text-[19px] font-bold tracking-tight text-txt">BrainX</span>}
        </button>
      </div>

      <div className="px-3 mb-2">
        <Btn variant="primary" size={collapsed ? 'sm' : 'md'} icon="plus" onClick={() => navigate('/notes/new')}
          className={`w-full ${collapsed ? 'px-0' : ''}`}>{!collapsed && '새 노트'}</Btn>
      </div>

      <nav className="flex-1 px-3 space-y-1 overflow-y-auto scroll">
        {NAV.map(i => <Item key={i.id} item={i} />)}
        <div className="h-px bg-line/50 my-3 mx-1"></div>
        {NAV2.map(i => <Item key={i.id} item={i} />)}
      </nav>

      {/* storage / plan card */}
      {!collapsed ? (
        <div className="m-3 p-3.5 rounded-2xl glass">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] font-semibold text-txt">Free 플랜</span>
            <Badge color="139 92 246" className="!h-5">Pro 추천</Badge>
          </div>
          <div className="h-1.5 rounded-full bg-surface2 overflow-hidden mb-1.5">
            <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent" style={{ width: '64%' }}></div>
          </div>
          <p className="text-[11px] text-txt3">토큰 12.8K / 20K · 이번 달</p>
          <Btn variant="soft" size="sm" className="w-full mt-3" onClick={() => navigate('/billing')}>업그레이드</Btn>
        </div>
      ) : (
        <button onClick={() => navigate('/billing')} className="m-3 h-10 rounded-xl glass grid place-items-center text-accent" title="업그레이드"><Icon name="bolt" size={18} /></button>
      )}

      <button onClick={() => setCollapsed(c => !c)}
        className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-surface2 border border-line grid place-items-center text-txt2 hover:text-txt z-30 shadow-soft">
        <Icon name="chevR" size={14} className={`transition-transform ${collapsed ? '' : 'rotate-180'}`} />
      </button>
    </aside>
  );
}

function SearchBar({ semantic, setSemantic, onSearch }) {
  const [v, setV] = useState('');
  const [filter, setFilter] = useState('최신순');
  const [openF, setOpenF] = useState(false);
  const filters = ['최신순','오래된순','제목 기준','내용 기준','기간 검색'];
  return (
    <div className="relative flex-1 max-w-xl">
      <div className={`group flex items-center h-11 rounded-2xl px-3.5 gap-2.5 transition-all duration-200 border
        ${semantic ? 'border-accent/50 bg-accent/[0.06] shadow-glowv' : 'border-line/60 bg-surface/60 hover:border-line'}`}>
        <Icon name="search" size={18} className={semantic ? 'text-accent' : 'text-txt3'} />
        <input value={v} onChange={e => setV(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onSearch && onSearch(v)}
          placeholder={semantic ? '의미로 검색… "어텐션이 왜 작동하는지"' : '노트·메모·자료 검색'}
          className="flex-1 bg-transparent outline-none text-sm text-txt placeholder:text-txt3" />
        {/* semantic toggle */}
        <button onClick={() => setSemantic(!semantic)}
          className={`flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[12px] font-medium whitespace-nowrap transition-all border
            ${semantic ? 'bg-accent text-white border-accent' : 'bg-surface2/60 text-txt2 border-line/60 hover:text-txt'}`}>
          <Icon name="sparkle" size={13} /> 의미
        </button>
        <div className="relative">
          <button onClick={() => setOpenF(o => !o)} className="flex items-center gap-1 h-7 px-2 rounded-lg text-[12px] whitespace-nowrap text-txt2 hover:text-txt hover:bg-surface2/60">
            <Icon name="filter" size={13} /> {filter} <Icon name="chevD" size={12} />
          </button>
          {openF && (
            <div className="absolute right-0 top-9 w-40 z-50 glass rounded-xl p-1.5 fade-up shadow-soft" onMouseLeave={() => setOpenF(false)}>
              {filters.map(f => (
                <button key={f} onClick={() => { setFilter(f); setOpenF(false); }}
                  className={`w-full text-left px-3 h-9 rounded-lg text-[13px] flex items-center justify-between ${f===filter ? 'text-primary bg-surface2/60' : 'text-txt2 hover:text-txt hover:bg-surface2/50'}`}>
                  {f} {f===filter && <Icon name="check" size={14} />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Topbar({ theme, setTheme, semantic, setSemantic, push }) {
  return (
    <header className="h-16 shrink-0 flex items-center gap-3 px-5 border-b border-line/50 bg-bg2/30 backdrop-blur-xl relative z-10">
      <SearchBar semantic={semantic} setSemantic={setSemantic} onSearch={(q) => q && push(`"${q}" 검색 완료 · 8개 결과`, 'ok')} />
      <div className="flex-1"></div>
      <ThemeToggle theme={theme} setTheme={setTheme} />
      <button onClick={() => push('새 알림은 없습니다', 'info')} className="relative h-9 w-9 grid place-items-center rounded-xl border border-line/60 text-txt2 hover:text-txt hover:bg-surface2/60 transition-colors">
        <Icon name="bell" size={17} />
        <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-accent"></span>
      </button>
      <div className="w-px h-6 bg-line/60 mx-1"></div>
      <button onClick={() => navigate('/mypage')} className="flex items-center gap-2.5 pl-1 pr-2.5 h-10 rounded-xl hover:bg-surface2/60 transition-colors">
        <Avatar name="연우" size={32} />
        <div className="text-left leading-tight hidden sm:block">
          <div className="text-[13px] font-semibold text-txt">김연우</div>
          <div className="text-[11px] text-txt3">Free 플랜</div>
        </div>
      </button>
    </header>
  );
}

function AppShell({ route, theme, setTheme, semantic, setSemantic, push, children }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="flex h-full w-full">
      <Sidebar route={route} collapsed={collapsed} setCollapsed={setCollapsed} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar theme={theme} setTheme={setTheme} semantic={semantic} setSemantic={setSemantic} push={push} />
        <main data-scroll-main className="flex-1 overflow-y-auto scroll relative">
          {children}
        </main>
      </div>
    </div>
  );
}

Object.assign(window, { useHashRoute, navigate, Sidebar, Topbar, SearchBar, AppShell, NAV });
