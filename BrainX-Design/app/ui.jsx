const { useState, useEffect, useRef, useCallback, useMemo } = React;

// ============ Icon set (simple stroke icons) ============
const ICONS = {
  home: 'M3 11.5 12 4l9 7.5M5 10v10h5v-6h4v6h5V10',
  notes: 'M5 3h9l5 5v13H5zM14 3v5h5M8 13h8M8 17h6',
  graph: 'M12 5a2.2 2.2 0 1 0 0 .01M6 18a2 2 0 1 0 0 .01M18 17a2 2 0 1 0 0 .01M12 7.2v6m0 0L7.4 16.4M12 13.2l4.4 3',
  chat: 'M4 5h16v11H8l-4 3z',
  import: 'M12 3v10m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
  dash: 'M4 13h7V4H4zM13 9h7V4h-7zM13 20h7v-9h-7zM4 20h7v-5H4z',
  bill: 'M3 7h18v10H3zM3 11h18M7 15h3',
  settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H1a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 2.6 7a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H7a1.6 1.6 0 0 0 1-1.5V1a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V7a1.6 1.6 0 0 0 1.5 1H23a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  sparkle: 'M12 3l1.8 4.6L18.4 9.4 13.8 11.2 12 16l-1.8-4.8L5.6 9.4l4.6-1.8zM19 14l.8 2 2 .8-2 .8L19 20l-.8-2-2-.8 2-.8z',
  bell: 'M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 21a2 2 0 0 0 4 0',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  link: 'M9 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5M15 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5',
  doc: 'M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h4',
  folder: 'M3 6h6l2 2h10v11H3z',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12l5 5 9-11',
  x: 'M6 6l12 12M18 6 6 18',
  chevR: 'M9 6l6 6-6 6',
  chevD: 'M6 9l6 6 6-6',
  sun: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  send: 'M4 12 20 4l-7 16-2-7z',
  zoomin: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4M11 8v6M8 11h6',
  zoomout: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4M8 11h6',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  cluster: 'M7 7a2 2 0 1 0 0 .01M17 7a2 2 0 1 0 0 .01M12 17a2 2 0 1 0 0 .01M8.5 8.5 11 15M15.5 8.5 13 15M9 7h6',
  clock: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v4l3 2',
  star: 'M12 3l2.7 5.5 6 .9-4.3 4.2 1 6-5.4-2.8L6.6 19.6l1-6L3.3 9.4l6-.9z',
  filter: 'M3 5h18l-7 8v6l-4 2v-8z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  upload: 'M12 16V4m0 0 5 5m-5-5L7 9M4 20h16',
  pdf: 'M6 3h8l4 4v14H6zM14 3v4h4M8 13h2v4M14 13h2M14 15h1.5',
  translate: 'M4 5h7M7 4v1c0 4-2 7-5 8M5 9c0 2 2 4 5 5M13 20l4-9 4 9M14.5 17h5',
  rewrite: 'M4 20l1-4L16 5l3 3L8 19zM14 7l3 3',
  summarize: 'M4 6h16M4 10h10M4 14h16M4 18h7',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  lock: 'M6 10V7a6 6 0 0 1 12 0v3M5 10h14v10H5zM12 14v3',
  copy: 'M9 9h10v12H9zM5 15H4V3h12v1',
  arrowL: 'M19 12H5m0 0 6-6m-6 6 6 6',
  brain: 'M9 3a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 1 5 3 3 0 0 0 5 1V3zM15 3a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-1 5 3 3 0 0 1-5 1V3z',
  fire: 'M12 3c1 3-2 4-2 7a2 2 0 0 0 4 0c2 2 3 4 3 6a5 5 0 0 1-10 0c0-3 3-5 5-13z',
  shield: 'M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z',
  refresh: 'M4 4v5h5M20 20v-5h-5M5 13a7 7 0 0 0 12 4M19 11A7 7 0 0 0 7 7',
  trash: 'M5 7h14M9 7V4h6v3M6 7l1 13h10l1-13',
  globe: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM4 12h16M12 4c2.5 2 2.5 14 0 16M12 4c-2.5 2-2.5 14 0 16',
};

function Icon({ name, size = 18, className = '', strokeWidth = 1.7, fill = 'none' }) {
  const d = ICONS[name] || '';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      className={className} style={{ flex: '0 0 auto' }} aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

// ============ Primitives ============
function Btn({ children, variant = 'primary', size = 'md', icon, onClick, className = '', type = 'button', disabled }) {
  const sizes = { sm: 'h-8 px-3 text-[13px] gap-1.5', md: 'h-10 px-4 text-sm gap-2', lg: 'h-12 px-6 text-[15px] gap-2 rounded-2xl' };
  const variants = {
    primary: 'text-white bg-gradient-to-b from-primary to-[rgb(var(--primary))] hover:brightness-110 shadow-glow',
    accent:  'text-white bg-gradient-to-b from-accent to-[rgb(var(--accent))] hover:brightness-110 shadow-glowv',
    soft:    'text-txt bg-surface2/70 hover:bg-surface2 border border-line/60',
    ghost:   'text-txt2 hover:text-txt hover:bg-surface2/60',
    outline: 'text-txt border border-line hover:border-primary/60 hover:text-primary bg-transparent',
  };
  return (
    <button type={type} disabled={disabled} onClick={onClick}
      className={`inline-flex items-center justify-center font-medium rounded-xl whitespace-nowrap transition-all duration-200 active:scale-[.97] disabled:opacity-50 disabled:pointer-events-none ${sizes[size]} ${variants[variant]} ${className}`}>
      {icon && <Icon name={icon} size={size === 'lg' ? 19 : 16} />}
      {children}
    </button>
  );
}

function Badge({ children, color, className = '', dot }) {
  const style = color ? { background: `rgb(${color} / 0.14)`, color: `rgb(${color})`, borderColor: `rgb(${color} / 0.3)` } : {};
  return (
    <span style={style} className={`inline-flex items-center gap-1.5 px-2.5 h-6 rounded-full text-[11.5px] font-medium whitespace-nowrap border border-line/60 bg-surface2/60 text-txt2 ${className}`}>
      {dot && <span className="w-1.5 h-1.5 rounded-full" style={{ background: color ? `rgb(${color})` : 'currentColor' }}></span>}
      {children}
    </span>
  );
}

function Card({ children, className = '', glow, onClick, hover }) {
  return (
    <div onClick={onClick}
      className={`card rounded-2xl ${hover ? 'transition-all duration-300 hover:border-primary/45 hover:-translate-y-0.5 cursor-pointer' : ''} ${glow ? 'shadow-glow' : 'shadow-soft'} ${className}`}>
      {children}
    </div>
  );
}

function Avatar({ name = '연우', size = 36, ring }) {
  return (
    <div style={{ width: size, height: size }}
      className={`rounded-full grid place-items-center font-semibold text-white shrink-0 bg-gradient-to-br from-primary to-accent ${ring ? 'ring-2 ring-primary/40 ring-offset-2 ring-offset-bg' : ''}`}>
      <span style={{ fontSize: size * 0.4 }}>{name[0]}</span>
    </div>
  );
}

function Toggle({ on, onChange, size = 'md' }) {
  const w = size === 'sm' ? 38 : 46, h = size === 'sm' ? 22 : 26, k = h - 6;
  return (
    <button onClick={() => onChange(!on)} style={{ width: w, height: h }}
      className={`relative rounded-full transition-colors duration-300 ${on ? 'bg-primary' : 'bg-surface2 border border-line'}`}>
      <span style={{ width: k, height: k, transform: `translateX(${on ? w - k - 4 : 4}px)` }}
        className="absolute top-1/2 -translate-y-1/2 left-0 rounded-full bg-white shadow transition-transform duration-300"></span>
    </button>
  );
}

// theme hook
function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem('bx-theme') || 'dark');
  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('bx-theme', theme);
  }, [theme]);
  return [theme, setTheme];
}

function ThemeToggle({ theme, setTheme }) {
  return (
    <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="h-9 w-9 grid place-items-center rounded-xl border border-line/60 text-txt2 hover:text-txt hover:bg-surface2/60 transition-colors"
      title={theme === 'dark' ? '라이트 모드' : '다크 모드'}>
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17} />
    </button>
  );
}

// toast system
function useToasts() {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((msg, kind = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(t => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3200);
  }, []);
  return [toasts, push];
}

function Toasts({ toasts }) {
  const kinds = { info: 'primary', ok: 'cyan', err: '244 114 182' };
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 items-center pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className="fade-up glass rounded-xl px-4 h-11 flex items-center gap-2.5 text-sm text-txt shadow-soft">
          <Icon name={t.kind === 'ok' ? 'check' : t.kind === 'err' ? 'x' : 'sparkle'} size={15}
            className={t.kind === 'err' ? 'text-pink-400' : t.kind === 'ok' ? 'text-cyan' : 'text-primary'} />
          {t.msg}
        </div>
      ))}
    </div>
  );
}

// relevance bar (for semantic search)
function RelevanceBar({ value }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-surface2 overflow-hidden">
        <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent" style={{ width: `${value}%` }}></div>
      </div>
      <span className="text-[11px] text-txt3 font-mono tabular-nums">{value}%</span>
    </div>
  );
}

function EmptyState({ icon = 'sparkle', title, desc, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div className="w-16 h-16 rounded-2xl grid place-items-center glass mb-5 text-primary">
        <Icon name={icon} size={28} />
      </div>
      <h3 className="text-lg font-semibold text-txt mb-1.5">{title}</h3>
      <p className="text-sm text-txt2 max-w-xs mb-5 leading-relaxed">{desc}</p>
      {action}
    </div>
  );
}

Object.assign(window, {
  useState, useEffect, useRef, useCallback, useMemo,
  Icon, Btn, Badge, Card, Avatar, Toggle, useTheme, ThemeToggle,
  useToasts, Toasts, RelevanceBar, EmptyState,
});
