function App() {
  const route = useHashRoute();
  const [theme, setTheme] = useTheme();
  const [semantic, setSemantic] = useState(false);
  const [toasts, push] = useToasts();
  const [notionCallbackProcessing, setNotionCallbackProcessing] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error');
    if (!code && !state && !error) return;

    window.history.replaceState({}, '', window.location.pathname);

    if (error) {
      sessionStorage.setItem('notionCallbackError', 'Notion 연동이 거부되었습니다.');
      navigate('/import');
      return;
    }

    if (code && state) {
      setNotionCallbackProcessing(true);
      window.ingestionApi.notion.callback(code, state)
        .then(data => {
          sessionStorage.setItem('notionIntegrationId', data.data.integrationAccountId);
        })
        .catch(() => {
          sessionStorage.setItem('notionCallbackError', 'Notion 연동에 실패했습니다.');
        })
        .finally(() => {
          setNotionCallbackProcessing(false);
          navigate('/import');
        });
    }
  }, []);

  // route parsing
  const seg = route.split('/').filter(Boolean); // e.g. ['notes','n1']
  const top = '/' + (seg[0] || '');

  // pages that render WITHOUT the app shell
  const bare = {
    '/': () => <Landing theme={theme} setTheme={setTheme} />,
    '/login': () => <Login theme={theme} setTheme={setTheme} push={push} />,
    '/signup': () => <Signup theme={theme} setTheme={setTheme} push={push} />,
    '/onboarding': () => <Onboarding theme={theme} setTheme={setTheme} push={push} />,
    '/share': () => <ShareNote theme={theme} setTheme={setTheme} />,
  };

  let content;
  if (bare[route] || (top === '/share')) {
    content = (bare[route] || bare['/share'])();
  } else {
    // inside app shell
    let inner;
    switch (top) {
      case '/home':     inner = <Home semantic={semantic} push={push} />; break;
      case '/notes':    inner = <Editor noteId={seg[1] || 'n1'} push={push} />; break;
      case '/graph':    inner = <Graph push={push} />; break;
      case '/chat':     inner = <ChatWindow push={push} />; break;
      case '/import':   inner = <Import push={push} />; break;
      case '/mypage':   inner = <MyPage push={push} />; break;
      case '/billing':  inner = <Billing push={push} />; break;
      case '/settings': inner = <Settings push={push} />; break;
      case '/support':  inner = <Support push={push} />; break;
      case '/admin':    inner = <Admin push={push} />; break;
      default:          inner = <Home semantic={semantic} push={push} />;
    }
    content = (
      <AppShell route={route} theme={theme} setTheme={setTheme} semantic={semantic} setSemantic={setSemantic} push={push}>
        {inner}
      </AppShell>
    );
  }

  if (notionCallbackProcessing) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-bg text-txt">
        <div className="text-center space-y-4">
          <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-[14px] text-txt2">Notion 연동 처리 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-bg text-txt">
      <div className="aurora"><b></b><b></b><b></b></div>
      <div className="relative z-10 h-full" key={top}>{content}</div>
      <Toasts toasts={toasts} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
