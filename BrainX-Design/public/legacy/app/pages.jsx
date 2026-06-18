// ============ Auth shell ============
function AuthShell({ children, theme, setTheme }) {
  return (
    <div data-route className="relative h-full grid lg:grid-cols-2 overflow-hidden">
      {/* left brand panel */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden border-r border-line/40">
        <div className="absolute inset-0 grid-bg opacity-50"></div>
        <div className="absolute inset-0"><HeroConstellation/></div>
        <button onClick={()=>navigate('/')} className="relative flex items-center gap-2.5 z-10 w-fit">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary via-accent to-cyan grid place-items-center shadow-glow"><Icon name="brain" size={20} className="text-white"/></div>
          <span className="font-display text-[20px] font-bold">BrainX</span>
        </button>
        <div className="relative z-10">
          <h2 className="text-[30px] font-bold leading-tight tracking-tight mb-3">내 지식의 우주를<br/>탐험하는 AI 두뇌</h2>
          <p className="text-txt2 max-w-sm leading-relaxed">적기만 하세요. 연결과 정리는 AI가 합니다. 흩어진 노트가 하나의 살아있는 그래프가 됩니다.</p>
        </div>
        <div className="relative z-10 text-[12px] text-txt3">© 2026 BrainX 개발팀</div>
      </div>
      {/* right form */}
      <div className="relative flex items-center justify-center p-6 overflow-y-auto scroll">
        <div className="absolute top-5 right-5"><ThemeToggle theme={theme} setTheme={setTheme}/></div>
        <div className="w-full max-w-sm py-10">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, type='text', placeholder, value, onChange, right }) {
  return (
    <label className="block mb-4">
      <div className="text-[12.5px] font-medium text-txt2 mb-1.5 flex items-center justify-between">{label}{right}</div>
      <input type={type} placeholder={placeholder} value={value} onChange={onChange}
        className="w-full h-11 px-3.5 rounded-xl bg-surface/60 border border-line/60 outline-none text-[14px] text-txt placeholder:text-txt3 focus:border-primary/60 focus:bg-surface transition-colors" />
    </label>
  );
}

function SocialBtns({ push }) {
  const arr=[{k:'Google',c:'#fff',t:'#1f2937'},{k:'카카오',c:'#FEE500',t:'#191600'},{k:'Apple',c:'#111',t:'#fff'}];
  return (
    <div className="grid grid-cols-3 gap-2">
      {arr.map(a=>(
        <button key={a.k} onClick={()=>push(`${a.k} 로그인 연결 중…`)} style={{background:a.c,color:a.t}}
          className="h-11 rounded-xl text-[13px] font-semibold border border-line/30 hover:brightness-95 transition">{a.k}</button>
      ))}
    </div>
  );
}

function Login({ theme, setTheme, push }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) { push('이메일과 비밀번호를 입력하세요.', 'err'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/identity/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { push(data.message || '로그인에 실패했습니다.', 'err'); return; }
      localStorage.setItem('accessToken', data.data.accessToken);
      localStorage.setItem('refreshToken', data.data.refreshToken);
      push('로그인 성공!', 'ok');
      navigate('/home');
    } catch {
      push('서버 연결에 실패했습니다.', 'err');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell theme={theme} setTheme={setTheme}>
      <h1 className="text-[26px] font-bold tracking-tight mb-1.5">다시 오신 걸 환영해요</h1>
      <p className="text-txt2 text-[14px] mb-7">BrainX 계정으로 로그인하세요.</p>
      <Field label="이메일" type="email" placeholder="you@brainx.app" value={email} onChange={e => setEmail(e.target.value)} />
      <Field label="비밀번호" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} right={<a href="#" className="text-[12px] text-primary font-normal">비밀번호 찾기</a>} />
      <Btn variant="primary" size="lg" className="w-full mt-2" disabled={loading} onClick={handleLogin}>
        {loading ? '로그인 중...' : '로그인'}
      </Btn>
      <div className="flex items-center gap-3 my-6 text-[12px] text-txt3"><div className="flex-1 h-px bg-line/60"></div>또는<div className="flex-1 h-px bg-line/60"></div></div>
      <SocialBtns push={push}/>
      <p className="text-center text-[13px] text-txt2 mt-7">계정이 없으신가요? <button onClick={()=>navigate('/signup')} className="text-primary font-medium">회원가입</button></p>
    </AuthShell>
  );
}

function Signup({ theme, setTheme, push }) {
  const [agree,setAgree]=useState({tos:false,priv:false,mkt:false,beh:false});
  const terms=[{k:'tos',t:'[필수] 서비스 이용약관'},{k:'priv',t:'[필수] 개인정보 처리방침'},{k:'mkt',t:'[선택] 마케팅 정보 수신'},{k:'beh',t:'[선택] 행동 데이터 분석 동의'}];
  const ok=agree.tos&&agree.priv;
  return (
    <AuthShell theme={theme} setTheme={setTheme}>
      <h1 className="text-[26px] font-bold tracking-tight mb-1.5">두뇌를 깨우는 1분</h1>
      <p className="text-txt2 text-[14px] mb-7">무료로 BrainX를 시작하세요.</p>
      <Field label="이메일" type="email" placeholder="you@brainx.app" />
      <div className="flex gap-2 mb-4 items-end">
        <div className="flex-1"><Field label="인증 코드" placeholder="6자리 숫자" /></div>
        <Btn variant="soft" className="mb-4" onClick={()=>push('인증 코드를 전송했어요','ok')}>코드 전송</Btn>
      </div>
      <Field label="비밀번호" type="password" placeholder="8자 이상" />
      <Field label="비밀번호 확인" type="password" placeholder="다시 입력" />
      <div className="space-y-1 my-4 p-3 rounded-xl bg-surface2/40">
        {terms.map(t=>(
          <button key={t.k} onClick={()=>setAgree(a=>({...a,[t.k]:!a[t.k]}))} className="w-full flex items-center gap-2.5 h-8 text-left">
            <span className={`w-5 h-5 rounded-md grid place-items-center border ${agree[t.k]?'bg-primary border-primary text-white':'border-line'}`}>{agree[t.k]&&<Icon name="check" size={13}/>}</span>
            <span className="text-[13px] text-txt2">{t.t}</span>
          </button>
        ))}
      </div>
      <Btn variant="primary" size="lg" className="w-full" disabled={!ok} onClick={()=>navigate('/onboarding')}>가입하고 시작하기</Btn>
      <p className="text-center text-[13px] text-txt2 mt-6">이미 계정이 있으신가요? <button onClick={()=>navigate('/login')} className="text-primary font-medium">로그인</button></p>
    </AuthShell>
  );
}

function Onboarding({ theme, setTheme, push }) {
  const [step,setStep]=useState(0);
  const [nick,setNick]=useState('');
  const [picks,setPicks]=useState([]);
  const toggle=(x)=>setPicks(p=>p.includes(x)?p.filter(i=>i!==x):[...p,x]);
  return (
    <div data-route className="relative h-full flex items-center justify-center p-6 overflow-y-auto scroll">
      <div className="absolute inset-0 grid-bg opacity-40 pointer-events-none"></div>
      <div className="absolute top-5 right-5"><ThemeToggle theme={theme} setTheme={setTheme}/></div>
      <Card glow className="relative w-full max-w-lg p-8">
        <div className="flex items-center gap-2 mb-7">
          {[0,1,2].map(i=>(<div key={i} className={`h-1.5 rounded-full flex-1 transition-colors ${i<=step?'bg-primary':'bg-surface2'}`}></div>))}
        </div>
        {step===0 && (<>
          <h1 className="text-[24px] font-bold tracking-tight mb-1.5">어떻게 불러드릴까요?</h1>
          <p className="text-txt2 text-[14px] mb-6">프로필은 나중에 언제든 바꿀 수 있어요.</p>
          <div className="flex items-center gap-4 mb-5">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent grid place-items-center text-white text-2xl font-bold shrink-0">{nick[0]||'?'}</div>
            <Btn variant="soft" icon="upload" onClick={()=>push('이미지를 업로드했어요','ok')}>이미지 업로드</Btn>
          </div>
          <Field label="닉네임" placeholder="예: 연우" value={nick} onChange={e=>setNick(e.target.value)} />
          <Btn variant="primary" size="lg" className="w-full mt-2" onClick={()=>setStep(1)}>다음</Btn>
        </>)}
        {step===1 && (<>
          <h1 className="text-[24px] font-bold tracking-tight mb-1.5">관심 분야를 알려주세요</h1>
          <p className="text-txt2 text-[14px] mb-6">AI가 노트를 더 똑똑하게 연결하고 추천해요.</p>
          <div className="flex flex-wrap gap-2 mb-6">
            {BX_DATA.INTERESTS.map(x=>(
              <button key={x} onClick={()=>toggle(x)} className={`h-9 px-4 rounded-full text-[13.5px] font-medium border transition-all ${picks.includes(x)?'bg-primary text-white border-primary':'border-line text-txt2 hover:border-primary/50'}`}>{x}</button>
            ))}
          </div>
          <div className="flex gap-2">
            <Btn variant="soft" onClick={()=>setStep(0)}>이전</Btn>
            <Btn variant="primary" size="lg" className="flex-1" onClick={()=>setStep(2)}>다음 ({picks.length})</Btn>
          </div>
        </>)}
        {step===2 && (<>
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-accent grid place-items-center mb-5 shadow-glow"><Icon name="sparkle" size={26} className="text-white"/></div>
          <h1 className="text-[24px] font-bold tracking-tight mb-1.5">AI 개인화 준비 완료</h1>
          <p className="text-txt2 text-[14px] mb-6 leading-relaxed">이제 노트를 쓰면 BrainX가 자동으로 정리·연결하고, 필요할 때 근거 있는 답을 찾아드릴게요. 첫 노트를 함께 시작해요.</p>
          <div className="rounded-xl bg-surface2/40 p-4 mb-6 space-y-2.5">
            {['관심 분야 기반 자동 태깅','노트 간 AI 연결 추천','내 자료 기반 RAG 챗봇'].map((t,i)=>(<div key={i} className="flex items-center gap-2.5 text-[13.5px] text-txt2"><Icon name="check" size={16} className="text-cyan"/>{t}</div>))}
          </div>
          <Btn variant="primary" size="lg" className="w-full" icon="bolt" onClick={()=>navigate('/home')}>BrainX 시작하기</Btn>
        </>)}
      </Card>
    </div>
  );
}

function Import({ push }) {
  const [tab, setTab] = useState('notion');

  // Notion state
  const [notionIntegrationId, setNotionIntegrationId] = useState(
    () => sessionStorage.getItem('notionIntegrationId') || ''
  );
  const [notionPages, setNotionPages] = useState([]);
  const [notionPagesLoading, setNotionPagesLoading] = useState(false);
  const [notionSourceId, setNotionSourceId] = useState('');
  const [notionSourceTitle, setNotionSourceTitle] = useState('');
  const [notionResult, setNotionResult] = useState(null);
  const [notionLoading, setNotionLoading] = useState(false);

  // Obsidian state
  const fileInputRef = useRef(null);
  const [obsidianAssetId, setObsidianAssetId] = useState('');
  const [obsidianResult, setObsidianResult] = useState(null);
  const [obsidianLoading, setObsidianLoading] = useState(false);

  useEffect(() => {
    const err = sessionStorage.getItem('notionCallbackError');
    if (err) { push(err, 'err'); sessionStorage.removeItem('notionCallbackError'); }
  }, []);

  useEffect(() => {
    if (notionIntegrationId) fetchNotionPages();
  }, [notionIntegrationId]);

  const fetchNotionPages = async () => {
    setNotionPagesLoading(true);
    setNotionPages([]);
    setNotionSourceId('');
    setNotionSourceTitle('');
    try {
      const res = await window.ingestionApi.notion.getPages(notionIntegrationId);
      setNotionPages(res.data.pages);
      if (res.data.pages.length === 0) push('가져올 수 있는 Notion 페이지가 없습니다.', 'info');
    } catch {
      push('Notion 페이지 목록을 불러오지 못했습니다.', 'err');
    } finally {
      setNotionPagesLoading(false);
    }
  };

  const handleNotionAuthorize = async () => {
    setNotionLoading(true);
    try {
      const res = await window.ingestionApi.notion.authorize();
      window.top.location.href = res.data.authorizationUrl;
    } catch {
      push('Notion 연결 URL 생성에 실패했습니다.', 'err');
      setNotionLoading(false);
    }
  };

  const pollImportStatus = async (jobId, setResult) => {
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 1500));
      try {
        const res = await window.ingestionApi.importJob.getStatus(jobId);
        const d = res.data;
        const status = d.status.toLowerCase();
        setResult({ jobId: d.importJobId, status, createdNotes: d.createdNotes || [], failedFiles: d.failedFiles || [] });
        if (status === 'completed' || status === 'failed') {
          push(status === 'completed' ? '가져오기 완료!' : '가져오기 실패', status === 'completed' ? 'ok' : 'err');
          return;
        }
      } catch { break; }
    }
  };

  const handleNotionImport = async () => {
    if (!notionIntegrationId) { push('먼저 Notion 계정을 연동하세요.', 'err'); return; }
    if (!notionSourceId) { push('가져올 페이지를 선택하세요.', 'err'); return; }
    setNotionLoading(true);
    try {
      const res = await window.ingestionApi.notion.createJob({ integrationAccountId: notionIntegrationId, sourceId: notionSourceId });
      push('가져오기 요청이 완료되었습니다.', 'ok');
      await pollImportStatus(res.data.importJobId, setNotionResult);
    } catch {
      push('Notion 가져오기 요청에 실패했습니다.', 'err');
    } finally {
      setNotionLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.zip')) { push('.zip 파일만 업로드 가능합니다.', 'err'); return; }
    setObsidianAssetId('ast_' + file.name.replace(/[^a-zA-Z0-9]/g, '_'));
    push('파일 선택됨: ' + file.name, 'ok');
  };

  const handleObsidianImport = async () => {
    if (!obsidianAssetId) { push('zip 파일을 먼저 선택하세요.', 'err'); return; }
    setObsidianLoading(true);
    try {
      const res = await window.ingestionApi.obsidian.createJob({ uploadedZipAssetId: obsidianAssetId });
      push('Obsidian 가져오기 요청이 완료되었습니다.', 'ok');
      await pollImportStatus(res.data.importJobId, setObsidianResult);
    } catch {
      push('Obsidian 가져오기 요청에 실패했습니다.', 'err');
    } finally {
      setObsidianLoading(false);
    }
  };

  return (
    <div data-route className="max-w-[760px] mx-auto px-6 md:px-8 py-8">
      <h1 className="text-[24px] font-bold tracking-tight mb-1.5">가져오기</h1>
      <p className="text-txt2 text-[14px] mb-6">기존 자료를 옮겨오면 BrainX가 관계를 새로 연결해 드려요.</p>

      {/* Tab bar */}
      <div className="flex gap-1.5 mb-6 p-1.5 rounded-2xl bg-surface2/40 border border-line/40 w-fit">
        {[{k:'notion',l:'Notion',i:'import'},{k:'obsidian',l:'Obsidian',i:'folder'}].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`flex items-center gap-2 h-9 px-4 rounded-xl text-[13.5px] font-medium transition-all ${tab===t.k ? 'bg-primary text-white shadow-glow' : 'text-txt2 hover:text-txt'}`}>
            <Icon name={t.i} size={15} />{t.l}
          </button>
        ))}
      </div>

      {/* ── Notion Tab ── */}
      {tab === 'notion' && (
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="text-[15px] font-semibold mb-3 flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary/14 text-primary grid place-items-center text-[12px] font-bold">1</div>
              Notion 계정 연동
            </h2>
            {notionIntegrationId ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[13px] text-emerald-400 bg-emerald-500/10 rounded-xl px-3 py-2.5 border border-emerald-500/20">
                  <Icon name="check" size={15} /> 연동 완료
                </div>
                <button onClick={() => { setNotionIntegrationId(''); setNotionPages([]); setNotionSourceId(''); setNotionSourceTitle(''); sessionStorage.removeItem('notionIntegrationId'); }}
                  className="text-[12px] text-txt3 hover:text-txt2">다른 계정으로 연동</button>
              </div>
            ) : (
              <div className="space-y-2.5">
                <Btn variant="primary" icon="link" onClick={handleNotionAuthorize} disabled={notionLoading} className="w-full">
                  {notionLoading ? '이동 중...' : 'Notion 계정 연동하기'}
                </Btn>
                <p className="text-[12px] text-txt3 text-center">
                  다른 계정으로 연동하려면{' '}
                  <a href="https://www.notion.so/logout" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Notion에서 로그아웃</a>
                  {' '}후 진행하세요.
                </p>
              </div>
            )}
          </Card>

          {notionIntegrationId && (
            <Card className="p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[15px] font-semibold flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-primary/14 text-primary grid place-items-center text-[12px] font-bold">2</div>
                  가져올 페이지 선택
                </h2>
                <button onClick={fetchNotionPages} disabled={notionPagesLoading}
                  className="text-[12px] text-primary hover:text-primary/80 disabled:opacity-40 flex items-center gap-1">
                  <Icon name="refresh" size={13} /> 새로고침
                </button>
              </div>
              {notionPagesLoading ? (
                <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 rounded-xl shimmer" />)}</div>
              ) : notionPages.length === 0 ? (
                <p className="text-[13px] text-txt3 text-center py-6">가져올 수 있는 페이지가 없습니다.</p>
              ) : (
                <ul className="space-y-1.5 max-h-72 overflow-y-auto scroll pr-1">
                  {notionPages.map(page => (
                    <li key={page.id}>
                      <button onClick={() => { setNotionSourceId(page.id); setNotionSourceTitle(page.title); }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-[13.5px] transition-all border ${
                          notionSourceId === page.id
                            ? 'bg-primary/10 border-primary/40 text-txt'
                            : 'border-transparent bg-surface2/40 hover:bg-surface2/70 text-txt2'
                        }`}>
                        <span className="w-5 text-center shrink-0">{page.icon || '📄'}</span>
                        <span className="flex-1 truncate">{page.title}</span>
                        {notionSourceId === page.id && <Icon name="check" size={15} className="text-primary shrink-0" />}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {notionSourceId && (
                <div className="mt-2 text-[12px] text-primary bg-primary/10 rounded-lg px-3 py-2 border border-primary/20">
                  선택됨: <span className="font-medium">{notionSourceTitle}</span>
                </div>
              )}
            </Card>
          )}

          {notionIntegrationId && (
            <Btn variant="primary" icon="import" onClick={handleNotionImport}
              disabled={notionLoading || !notionSourceId} className="w-full h-12 text-[15px]">
              {notionLoading ? '가져오는 중...' : '가져오기 시작'}
            </Btn>
          )}

          {notionResult && <ImportResultPanel result={notionResult} />}
        </div>
      )}

      {/* ── Obsidian Tab ── */}
      {tab === 'obsidian' && (
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="text-[15px] font-semibold mb-4">Obsidian Vault 가져오기</h2>
            <input type="file" accept=".zip" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
            <button onClick={() => fileInputRef.current?.click()}
              className="w-full py-8 rounded-2xl border-2 border-dashed border-line/60 hover:border-primary/50 text-txt3 hover:text-primary transition-colors text-[13.5px] flex flex-col items-center gap-2">
              <Icon name="upload" size={24} />
              {obsidianAssetId ? obsidianAssetId : 'Obsidian Vault .zip 파일을 선택하세요'}
            </button>
            <Btn variant="primary" icon="import" onClick={handleObsidianImport}
              disabled={obsidianLoading || !obsidianAssetId} className="w-full mt-4">
              {obsidianLoading ? '가져오는 중...' : '가져오기 시작'}
            </Btn>
          </Card>
          {obsidianResult && <ImportResultPanel result={obsidianResult} />}
        </div>
      )}
    </div>
  );
}

function ImportResultPanel({ result }) {
  const done = result.status === 'completed';
  const failed = result.status === 'failed';
  const pending = !done && !failed;
  return (
    <Card className={`p-5 ${failed ? 'border-pink-500/30' : done ? 'border-emerald-500/30' : ''}`}>
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-[15px] font-semibold">가져오기 결과</h3>
        {pending && <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />}
      </div>
      <div className={`flex items-center gap-2 text-[12.5px] px-3 py-2.5 rounded-xl mb-3 border ${
        done ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
        : failed ? 'text-pink-400 bg-pink-500/10 border-pink-500/20'
        : 'text-txt2 bg-surface2/40 border-line/40'
      }`}>
        <Icon name={done ? 'check' : failed ? 'x' : 'clock'} size={14} />
        상태: {result.status.toUpperCase()}
      </div>
      {done && (
        <Btn variant="primary" icon="notes" onClick={() => navigate('/notes/n1')} className="w-full mb-3">
          노트 보러 가기 →
        </Btn>
      )}
      {result.createdNotes?.length > 0 && (
        <div className="mb-3">
          <p className="text-[12px] text-txt3 mb-1.5">생성된 노트 ({result.createdNotes.length})</p>
          <ul className="space-y-1">
            {result.createdNotes.map(n => (
              <li key={n.noteId} className="text-[12px] text-emerald-300 bg-emerald-900/20 rounded-lg px-2.5 py-1.5">
                {n.title} <span className="text-txt3">({n.noteId})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {result.failedFiles?.length > 0 && (
        <div>
          <p className="text-[12px] text-txt3 mb-1.5">실패한 파일 ({result.failedFiles.length})</p>
          <ul className="space-y-1">
            {result.failedFiles.map((f, i) => (
              <li key={i} className="text-[12px] text-pink-300 bg-pink-900/20 rounded-lg px-2.5 py-1.5">
                {f.fileName} — {f.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function MyPage({ push }) {
  const top5=[noteById('n1'),noteById('n2'),noteById('n8'),noteById('n5'),noteById('n12')];
  const [period,setPeriod]=useState('주별');
  const bars=[40,55,38,72,60,88,76,52,64,90,70,82];
  return (
    <div data-route className="max-w-[1180px] mx-auto px-6 md:px-8 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-7">
        <div className="flex items-center gap-4">
          <Avatar name="연우" size={64} ring/>
          <div>
            <h1 className="text-[24px] font-bold tracking-tight">김연우</h1>
            <p className="text-txt2 text-[14px]">you@brainx.app · Free 플랜 · 가입 142일째</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Btn variant="soft" icon="settings" onClick={()=>navigate('/settings')}>설정</Btn>
          <Btn variant="accent" icon="bolt" onClick={()=>navigate('/billing')}>Pro 업그레이드</Btn>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-7">
        {[{i:'doc',l:'총 노트',v:'13',c:'59 130 246'},{i:'graph',l:'그래프 노드',v:'13',c:'139 92 246'},{i:'fire',l:'작성 스트릭',v:'12일',c:'244 114 182'},{i:'bolt',l:'토큰 사용',v:'12.8K',c:'34 211 238'}].map((s,i)=>(
          <Card key={i} className="p-5"><div className="w-10 h-10 rounded-xl grid place-items-center mb-3" style={{background:`rgb(${s.c} / 0.14)`,color:`rgb(${s.c})`}}><Icon name={s.i} size={19}/></div><div className="text-[26px] font-bold tracking-tight leading-none">{s.v}</div><div className="text-[12px] text-txt3 mt-1.5">{s.l}</div></Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* growth chart */}
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5"><div className="w-8 h-8 rounded-xl bg-primary/14 text-primary grid place-items-center"><Icon name="dash" size={17}/></div><h2 className="text-[15px] font-semibold">지식 성장 그래프</h2></div>
            <div className="flex gap-1 p-1 rounded-lg bg-surface2/60">{['일별','주별','월별'].map(p=>(<button key={p} onClick={()=>setPeriod(p)} className={`h-7 px-2.5 rounded-md text-[12px] ${period===p?'bg-surface text-txt':'text-txt3'}`}>{p}</button>))}</div>
          </div>
          <div className="flex items-end gap-2 h-44">
            {bars.map((h,i)=>(<div key={i} className="flex-1 rounded-t-md bg-gradient-to-t from-primary/40 to-accent/80 hover:from-primary hover:to-accent transition-all" style={{height:`${h}%`}}></div>))}
          </div>
          <div className="flex justify-between mt-2 text-[10.5px] text-txt3">{['1월','','3월','','5월','','7월','','9월','','11월',''].map((m,i)=>(<span key={i} className="flex-1 text-center">{m}</span>))}</div>
        </Card>
        {/* AI insight */}
        <Card glow className="p-5 border-accent/30">
          <div className="flex items-center gap-2 mb-3"><Icon name="sparkle" size={17} className="text-accent"/><h2 className="text-[15px] font-semibold">AI 인사이트 리포트</h2></div>
          <p className="text-[13.5px] text-txt2 leading-relaxed mb-4">이번 주 <b className="text-txt">머신러닝</b> 클러스터가 가장 빠르게 성장했어요. 다만 <b className="text-txt">독서 기록</b>이 5일째 비어 있어요. 두 영역을 잇는 <b className="text-accent">「프롬프트 엔지니어링 패턴」</b> 노트를 다시 보면 좋겠어요.</p>
          <div className="rounded-xl bg-surface2/40 p-3 mb-4">
            <div className="text-[11px] text-txt3 mb-1">학습 공백 감지</div>
            <div className="text-[13px] text-txt">강화학습 · 평가 지표 영역의 노트가 부족해요</div>
          </div>
          <Btn variant="soft" size="sm" icon="chat" className="w-full" onClick={()=>navigate('/chat')}>AI와 회고하기</Btn>
        </Card>
      </div>

      {/* top connected */}
      <Card className="p-5 mt-4">
        <h2 className="text-[15px] font-semibold mb-4 flex items-center gap-2.5"><div className="w-8 h-8 rounded-xl bg-accent/14 text-accent grid place-items-center"><Icon name="link" size={17}/></div>가장 많이 연결된 노트 TOP 5</h2>
        <div className="space-y-1.5">
          {top5.map((n,i)=>(
            <button key={n.id} onClick={()=>navigate(`/notes/${n.id}`)} className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-surface2/50 text-left">
              <span className="w-6 text-center text-[13px] font-bold text-txt3 font-mono">{i+1}</span>
              <span className="w-2 h-2 rounded-full" style={{background:`rgb(${clusterById(n.cluster).color})`}}></span>
              <span className="text-[14px] text-txt flex-1 truncate">{n.title}</span>
              <Badge className="!h-6">{n.links.length+3} 연결</Badge>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Billing({ push }) {
  const { PRICING } = BX_DATA;
  const [yr,setYr]=useState(true);
  return (
    <div data-route className="max-w-[1080px] mx-auto px-6 md:px-8 py-8">
      <div className="text-center mb-8">
        <h1 className="text-[26px] font-bold tracking-tight mb-2">플랜 · 결제</h1>
        <p className="text-txt2 text-[14px] mb-5">현재 <b className="text-txt">Free 플랜</b>을 사용 중이에요.</p>
        <div className="inline-flex items-center gap-2 p-1 rounded-xl glass">
          <button onClick={()=>setYr(false)} className={`h-9 px-4 rounded-lg text-sm font-medium ${!yr?'bg-surface2 text-txt':'text-txt2'}`}>월간</button>
          <button onClick={()=>setYr(true)} className={`h-9 px-4 rounded-lg text-sm font-medium flex items-center gap-2 ${yr?'bg-surface2 text-txt':'text-txt2'}`}>연간 <span className="text-[11px] text-cyan">-20%</span></button>
        </div>
      </div>
      <div className="grid md:grid-cols-3 gap-4 mb-8">
        {PRICING.map(p=>(
          <Card key={p.id} glow={p.best} className={`p-6 relative ${p.best?'border-primary/50':''} ${p.id==='free'?'opacity-90':''}`}>
            {p.best && <Badge color="59 130 246" className="absolute -top-3 left-1/2 -translate-x-1/2">가장 인기</Badge>}
            <div className="text-[15px] font-semibold text-txt2 mb-1">{p.name}</div>
            <div className="flex items-end gap-1 mb-1"><span className="text-[32px] font-bold tracking-tight">₩{(yr?p.yr:p.price).toLocaleString()}</span><span className="text-txt3 text-sm mb-1.5">/월</span></div>
            <p className="text-[13px] text-txt3 mb-5">{p.tag}</p>
            <Btn variant={p.id==='free'?'soft':p.best?'primary':'soft'} className="w-full mb-5" disabled={p.id==='free'} onClick={()=>push(`${p.name} 결제를 진행해요`,'ok')}>{p.id==='free'?'현재 플랜':p.cta}</Btn>
            <ul className="space-y-2.5">{p.feats.map((f,i)=>(<li key={i} className="flex items-start gap-2.5 text-[13px] text-txt2"><Icon name="check" size={16} className="text-cyan mt-0.5 shrink-0"/>{f}</li>))}</ul>
          </Card>
        ))}
      </div>
      <Card className="p-5">
        <h2 className="text-[15px] font-semibold mb-4 flex items-center gap-2"><Icon name="bill" size={17} className="text-primary"/> 결제 수단</h2>
        <div className="flex items-center gap-4">
          <div className="w-12 h-8 rounded-md bg-gradient-to-br from-primary to-accent"></div>
          <div className="flex-1"><div className="text-[13px] text-txt">등록된 카드가 없어요</div><div className="text-[12px] text-txt3">Pro 시작 시 결제 수단을 추가하세요</div></div>
          <Btn variant="soft" size="sm" icon="plus" onClick={()=>push('카드 등록 창을 열었어요')}>카드 등록</Btn>
        </div>
      </Card>
    </div>
  );
}

function SettingsSection({ icon, title, children }) {
  return (
    <Card className="p-5 mb-4">
      <h2 className="text-[15px] font-semibold mb-4 flex items-center gap-2.5"><div className="w-8 h-8 rounded-xl bg-primary/14 text-primary grid place-items-center"><Icon name={icon} size={16}/></div>{title}</h2>
      {children}
    </Card>
  );
}

function Settings({ push }) {
  const [tone,setTone]=useState('해요체');
  const tones=['음슴체','다나까','해요체','합쇼체','구어체'];
  const [twofa,set2fa]=useState(true);
  return (
    <div data-route className="max-w-[840px] mx-auto px-6 md:px-8 py-8">
      <h1 className="text-[24px] font-bold tracking-tight mb-7">설정</h1>
      <SettingsSection icon="user" title="계정 정보">
        <Field label="이메일" value="you@brainx.app" onChange={()=>{}} right={<button onClick={()=>push('이메일 변경 메일을 보냈어요')} className="text-[12px] text-primary font-normal">변경</button>} />
        <div className="flex gap-2"><Btn variant="soft" size="sm" onClick={()=>push('비밀번호 변경 창')}>비밀번호 변경</Btn></div>
      </SettingsSection>
      <SettingsSection icon="link" title="소셜 계정 연결">
        {[{k:'Google',on:true},{k:'카카오',on:false},{k:'Apple',on:false}].map(s=>(
          <div key={s.k} className="flex items-center justify-between py-2.5 border-b border-line/40 last:border-0">
            <span className="text-[14px] text-txt">{s.k}</span>
            <Btn variant={s.on?'soft':'outline'} size="sm" onClick={()=>push(`${s.k} ${s.on?'연결 해제':'연결'}`)}>{s.on?'연결됨':'연결하기'}</Btn>
          </div>
        ))}
      </SettingsSection>
      <SettingsSection icon="shield" title="보안 · 2FA">
        <div className="flex items-center justify-between"><div><div className="text-[14px] text-txt">이메일 OTP 2단계 인증</div><div className="text-[12px] text-txt3">로그인 시 이메일로 코드를 보냅니다</div></div><Toggle on={twofa} onChange={set2fa}/></div>
      </SettingsSection>
      <SettingsSection icon="bolt" title="AI 모델 API 키">
        <Field label="OpenAI API Key" type="password" placeholder="sk-..." />
        <Field label="Anthropic API Key" type="password" placeholder="sk-ant-..." />
        <Btn variant="soft" size="sm" icon="check" onClick={()=>push('API 키를 저장했어요','ok')}>저장</Btn>
      </SettingsSection>
      <SettingsSection icon="chat" title="AI 문체 설정">
        <p className="text-[13px] text-txt2 mb-3">AI가 답하거나 요약할 때 사용할 말투예요.</p>
        <div className="flex flex-wrap gap-2">
          {tones.map(t=>(<button key={t} onClick={()=>setTone(t)} className={`h-9 px-4 rounded-full text-[13.5px] font-medium border ${tone===t?'bg-primary text-white border-primary':'border-line text-txt2 hover:border-primary/50'}`}>{t}</button>))}
        </div>
      </SettingsSection>
      <Card className="p-5 border-pink-500/30">
        <h2 className="text-[15px] font-semibold mb-2 text-pink-400 flex items-center gap-2"><Icon name="trash" size={16}/> 위험 구역</h2>
        <p className="text-[13px] text-txt2 mb-4">탈퇴 시 모든 노트와 그래프가 영구 삭제됩니다.</p>
        <Btn variant="outline" size="sm" className="!border-pink-500/40 !text-pink-400" onClick={()=>push('정말 탈퇴하시겠어요?','err')}>회원 탈퇴</Btn>
      </Card>
    </div>
  );
}

function Support({ push }) {
  const [type,setType]=useState('기능 문의');
  return (
    <div data-route className="max-w-[760px] mx-auto px-6 md:px-8 py-8">
      <h1 className="text-[24px] font-bold tracking-tight mb-1.5">문의하기</h1>
      <p className="text-txt2 text-[14px] mb-7">무엇을 도와드릴까요? 보통 24시간 내에 답변드려요.</p>
      <Card className="p-6 mb-6">
        <div className="mb-4"><div className="text-[12.5px] font-medium text-txt2 mb-1.5">문의 유형</div>
          <div className="flex flex-wrap gap-2">{['기능 문의','버그 신고','결제·환불','기타'].map(t=>(<button key={t} onClick={()=>setType(t)} className={`h-9 px-4 rounded-full text-[13px] border ${type===t?'bg-primary text-white border-primary':'border-line text-txt2'}`}>{t}</button>))}</div>
        </div>
        <Field label="제목" placeholder="문의 제목을 입력하세요" />
        <label className="block mb-4"><div className="text-[12.5px] font-medium text-txt2 mb-1.5">내용</div>
          <textarea rows={5} placeholder="자세한 내용을 적어주세요" className="w-full p-3.5 rounded-xl bg-surface/60 border border-line/60 outline-none text-[14px] text-txt placeholder:text-txt3 focus:border-primary/60 resize-none"></textarea>
        </label>
        <div className="flex items-center justify-between">
          <Btn variant="soft" size="sm" icon="upload" onClick={()=>push('첨부파일을 추가했어요')}>파일 첨부</Btn>
          <Btn variant="primary" icon="send" onClick={()=>push('문의를 접수했어요','ok')}>제출하기</Btn>
        </div>
      </Card>
      <h2 className="text-[15px] font-semibold mb-3">내 문의 내역</h2>
      <div className="space-y-2">
        {[{t:'그래프가 가끔 느려요',s:'답변 완료',d:'2일 전'},{t:'Pro 연간 결제 영수증',s:'처리 중',d:'5일 전'}].map((q,i)=>(
          <Card key={i} className="p-4 flex items-center gap-3"><Icon name="doc" size={17} className="text-txt3"/><span className="text-[14px] text-txt flex-1 truncate">{q.t}</span><Badge color={q.s==='답변 완료'?'52 211 153':'234 179 8'} dot className="!h-6">{q.s}</Badge><span className="text-[12px] text-txt3">{q.d}</span></Card>
        ))}
      </div>
    </div>
  );
}

function ShareNote({ theme, setTheme }) {
  const n=noteById('n1'); const md=SAMPLE_MD.n1;
  return (
    <div data-route className="h-full overflow-y-auto scroll">
      <header className="h-16 px-6 flex items-center border-b border-line/40 bg-bg/60 backdrop-blur-xl sticky top-0 z-10">
        <button onClick={()=>navigate('/')} className="flex items-center gap-2.5"><div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent grid place-items-center"><Icon name="brain" size={17} className="text-white"/></div><span className="font-display font-bold">BrainX</span></button>
        <div className="flex-1"></div>
        <Badge color="234 179 8" dot className="mr-3">읽기 전용 · 23일 후 만료</Badge>
        <ThemeToggle theme={theme} setTheme={setTheme}/>
      </header>
      <article className="max-w-2xl mx-auto px-6 py-12">
        <Badge color={clusterById(n.cluster).color} dot className="mb-4">{clusterById(n.cluster).label}</Badge>
        <h1 className="text-[34px] font-bold tracking-tight mb-4">{md.title}</h1>
        <div className="flex items-center gap-3 mb-8 pb-8 border-b border-line/40"><Avatar name="연우" size={36}/><div><div className="text-[14px] font-medium text-txt">김연우</div><div className="text-[12px] text-txt3">2026년 6월 6일 작성 · 공개 노트</div></div></div>
        <div className="prose-bx space-y-4">
          {md.body.split('\n').map((l,i)=>{
            if(l.startsWith('## ')) return <h2 key={i} className="text-[20px] font-bold mt-7 mb-2">{l.replace('## ','')}</h2>;
            if(l.startsWith('- ')) return <li key={i} className="text-[15px] text-txt2 leading-relaxed ml-5 list-disc" dangerouslySetInnerHTML={{__html:l.replace('- ','').replace(/\*\*(.+?)\*\*/g,'<b class=\"text-txt\">$1</b>')}}></li>;
            if(!l.trim()) return null;
            return <p key={i} className="text-[15px] text-txt2 leading-[1.8]" dangerouslySetInnerHTML={{__html:l.replace(/\*\*(.+?)\*\*/g,'<b class=\"text-txt\">$1</b>')}}></p>;
          })}
        </div>
        <div className="flex gap-2 mt-10 pt-8 border-t border-line/40">
          <Btn variant="primary" icon="bolt" onClick={()=>navigate('/home')}>BrainX로 열기</Btn>
          <Btn variant="soft" icon="copy" onClick={()=>navigator.clipboard&&navigator.clipboard.writeText(location.href)}>링크 복사</Btn>
        </div>
      </article>
    </div>
  );
}

function Admin({ push }) {
  const rows=[{u:'김연우',p:'Free',tok:'12.8K',st:'활성'},{u:'박도윤',p:'Pro',tok:'89.2K',st:'활성'},{u:'이서아',p:'Team',tok:'241K',st:'활성'},{u:'최민준',p:'Free',tok:'3.1K',st:'휴면'}];
  const bars=[60,72,55,80,68,90,77];
  return (
    <div data-route className="max-w-[1180px] mx-auto px-6 md:px-8 py-8">
      <h1 className="text-[24px] font-bold tracking-tight mb-1.5">관리자 대시보드</h1>
      <p className="text-txt2 text-[14px] mb-7">사용자 · 토큰 · 결제 현황을 한눈에.</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[{l:'총 사용자',v:'2,481',c:'59 130 246'},{l:'Pro 전환율',v:'14.2%',c:'139 92 246'},{l:'월 토큰 사용',v:'38.4M',c:'34 211 238'},{l:'월 매출',v:'₩9.2M',c:'52 211 153'}].map((s,i)=>(
          <Card key={i} className="p-5"><div className="text-[12px] text-txt3 mb-2">{s.l}</div><div className="text-[24px] font-bold tracking-tight" style={{color:`rgb(${s.c})`}}>{s.v}</div></Card>
        ))}
      </div>
      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <Card className="p-5 lg:col-span-2">
          <h2 className="text-[15px] font-semibold mb-5">일별 토큰 사용량</h2>
          <div className="flex items-end gap-3 h-40">{bars.map((h,i)=>(<div key={i} className="flex-1 rounded-t-md bg-gradient-to-t from-primary/40 to-cyan/80" style={{height:`${h}%`}}></div>))}</div>
          <div className="flex justify-between mt-2 text-[11px] text-txt3">{['월','화','수','목','금','토','일'].map(d=>(<span key={d} className="flex-1 text-center">{d}</span>))}</div>
        </Card>
        <Card className="p-5">
          <h2 className="text-[15px] font-semibold mb-4">모델별 비용</h2>
          {[{m:'Claude',v:72,c:'139 92 246'},{m:'GPT-4o',v:54,c:'59 130 246'},{m:'Gemini',v:31,c:'34 211 238'}].map(x=>(
            <div key={x.m} className="mb-3"><div className="flex justify-between text-[12.5px] mb-1"><span className="text-txt2">{x.m}</span><span className="text-txt3 font-mono">₩{x.v}만</span></div><div className="h-2 rounded-full bg-surface2 overflow-hidden"><div className="h-full rounded-full" style={{width:`${x.v}%`,background:`rgb(${x.c})`}}></div></div></div>
          ))}
        </Card>
      </div>
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4"><h2 className="text-[15px] font-semibold">사용자 관리</h2><Btn variant="soft" size="sm" icon="filter">필터</Btn></div>
        <div className="overflow-x-auto"><table className="w-full text-[13.5px]">
          <thead><tr className="text-txt3 text-[12px] text-left border-b border-line/40">{['사용자','플랜','토큰','상태',''].map(h=>(<th key={h} className="py-2 font-medium">{h}</th>))}</tr></thead>
          <tbody>{rows.map((r,i)=>(
            <tr key={i} className="border-b border-line/30 last:border-0">
              <td className="py-3 flex items-center gap-2.5"><Avatar name={r.u} size={28}/><span className="text-txt">{r.u}</span></td>
              <td><Badge className="!h-6">{r.p}</Badge></td>
              <td className="text-txt2 font-mono">{r.tok}</td>
              <td><Badge color={r.st==='활성'?'52 211 153':'148 163 184'} dot className="!h-6">{r.st}</Badge></td>
              <td className="text-right"><button onClick={()=>push(`${r.u} 상세 보기`)} className="text-txt3 hover:text-txt"><Icon name="chevR" size={16}/></button></td>
            </tr>
          ))}</tbody>
        </table></div>
      </Card>
    </div>
  );
}

Object.assign(window, { AuthShell, Login, Signup, Onboarding, Import, ImportResultPanel, MyPage, Billing, Settings, Support, ShareNote, Admin, SettingsSection });
