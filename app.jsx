const { useState, useCallback, useEffect, useRef } = React;
const { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, AreaChart, Area } = window.Recharts || {};

const fmt = n => Number(n).toLocaleString("en-US");
const kfmt = n => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "") + "k" : "" + n;
const reduce = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const COLORS = ["#2f6bff","#ff6a2b","#12b981","#e11d8f","#a855f7","#eab308","#06b6d4","#8b5cf6","#84cc16","#ef4444"];
const HEAT = ["#e7ebf7","#c3d2fb","#8ba9f7","#5580f0","#2f6bff"];
function relTime(iso) {
  const d = Math.floor((Date.now() - new Date(iso)) / 86400000);
  if (d < 1) return "today"; if (d < 2) return "yesterday"; if (d < 30) return d + "d ago";
  if (d < 365) return Math.floor(d / 30) + "mo ago"; return Math.floor(d / 365) + "y ago";
}

// ---- pure aggregation (unit-checked via ?selftest) --------------------------
function aggregateLanguages(repos) { const m = {}; for (const r of repos) if (r.language) m[r.language] = (m[r.language] || 0) + 1; return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value); }
function topRepos(repos, n = 7) { return [...repos].sort((a, b) => b.stargazers_count - a.stargazers_count).slice(0, n); }
function recentRepos(repos, n = 6) { return [...repos].filter(r => !r.fork).sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at)).slice(0, n); }
function reposPerYear(repos) { const m = {}; for (const r of repos) { const y = new Date(r.created_at).getFullYear(); m[y] = (m[y] || 0) + 1; } return Object.keys(m).sort().map(y => ({ year: "'" + String(y).slice(2), count: m[y] })); }
function activityByDay(events) { const m = {}; for (const e of events) { if (e.type !== "PushEvent") continue; const d = e.created_at.slice(0, 10); m[d] = (m[d] || 0) + ((e.payload && e.payload.commits) ? e.payload.commits.length : 1); } return m; }
function lastDays(n) { const out = [], d = new Date(); for (let i = n - 1; i >= 0; i--) { const x = new Date(d); x.setDate(d.getDate() - i); out.push(x.toISOString().slice(0, 10)); } return out; }
function heatColor(c) { return c === 0 ? HEAT[0] : c < 3 ? HEAT[1] : c < 6 ? HEAT[2] : c < 10 ? HEAT[3] : HEAT[4]; }
function recordFollowers(user, count) { const key = "ghdash_followers_" + user.toLowerCase(); const hist = JSON.parse(localStorage.getItem(key) || "{}"); hist[new Date().toISOString().slice(0, 10)] = count; localStorage.setItem(key, JSON.stringify(hist)); return Object.entries(hist).sort().map(([date, followers]) => ({ date, followers })); }

async function gh(path, token, signal) {
  const headers = { Accept: "application/vnd.github+json" }; if (token) headers.Authorization = "Bearer " + token;
  const res = await fetch("https://api.github.com" + path, { headers, signal });
  const remaining = res.headers.get("X-RateLimit-Remaining"), reset = res.headers.get("X-RateLimit-Reset");
  if (!res.ok) {
    if (res.status === 404) throw { title: "User not found", detail: "No GitHub account with that username." };
    if ((res.status === 403 || res.status === 429) && remaining === "0")
      throw { title: "Rate limit reached", detail: `Resets at ${new Date(+reset * 1000).toLocaleTimeString()}. Add a token for 5,000 requests/hour.` };
    if (res.status === 429 || res.status === 403) throw { title: "Slow down", detail: "GitHub is rate-limiting these requests. Wait a moment and try again." };
    if (res.status === 401) throw { title: "Invalid token", detail: "The token was rejected. Remove it or paste a valid one." };
    if (res.status >= 500) throw { title: "GitHub is having trouble", detail: `GitHub returned ${res.status}. Try again in a moment.` };
    throw { title: "GitHub API error", detail: `Request failed with status ${res.status}.` };
  }
  return { data: await res.json(), remaining, limit: res.headers.get("X-RateLimit-Limit") };
}
// Accept pasted profile URLs, leading @, and trailing paths; return the bare login.
function sanitizeUser(raw) {
  return (raw || "").trim().replace(/^@+/, "").replace(/^(https?:\/\/)?(www\.)?github\.com\//i, "").replace(/[/?#].*$/, "").trim();
}

function useCountUp(value, ms = 950) {
  const [v, setV] = useState(reduce() ? value : 0);
  useEffect(() => { if (reduce()) { setV(value); return; } let raf, start;
    const step = t => { if (!start) start = t; const p = Math.min(1, (t - start) / ms); setV(Math.round((1 - Math.pow(2, -10 * p)) * value)); if (p < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf); }, [value]);
  return v;
}

const tip = { contentStyle: { background: "#fff", border: "2px solid #10182b", borderRadius: 10, boxShadow: "4px 4px 0 rgba(16,24,43,.85)", fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "#10182b" }, itemStyle: { color: "#10182b" }, labelStyle: { color: "#515c74", fontWeight: 600 } };
const I = ({ d }) => <svg className="i" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={d} /></svg>;
const IC = { pin: "M12 21s-7-6-7-11a7 7 0 1114 0c0 5-7 11-7 11z M12 10a1.5 1.5 0 100-3 1.5 1.5 0 000 3z", bag: "M4 7h16v13H4z M9 7V5a3 3 0 016 0v2", link: "M10 14a4 4 0 006 0l2-2a4 4 0 10-6-6l-1 1 M14 10a4 4 0 00-6 0l-2 2a4 4 0 106 6l1-1", cal: "M4 5h16v16H4z M8 3v4 M16 3v4 M4 10h16", gist: "M9 4H5v16h14V9l-5-5H9z M14 4v5h5", star: "M12 3l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 18l-5.9 3 1.2-6.5L2.5 9.9 9.1 9z" };

function Stat({ n, l, cls }) { const v = useCountUp(n); return <div className={"stat " + (cls || "")}><div className="n tnum">{fmt(v)}</div><div className="l">{l}</div></div>; }
function Panel({ title, tag, note, cls, extra, children }) { return <div className={"panel " + (cls || "")}><h2>{title}{tag && <span className="tag">{tag}</span>}{extra}</h2>{note && <p className="note">{note}</p>}{children}</div>; }

function LanguagePanel({ data, repoCount, colorOf }) {
  if (!data.length) return <Panel title="Languages" cls="span5"><div className="empty-c">No language data.</div></Panel>;
  const total = data.reduce((s, d) => s + d.value, 0), top = data.slice(0, 5), rest = data.slice(5).reduce((s, d) => s + d.value, 0);
  const legend = rest > 0 ? [...top, { name: "others", value: rest, _o: true }] : top;
  return (
    <Panel title="Languages" tag="mix" cls="span5" note={`Across ${repoCount > 100 ? "100 recent" : "all"} public repos`}>
      <div className="donut-row">
        <div className="donut">
          <ResponsiveContainer width="100%" height="100%"><PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={56} outerRadius={84} paddingAngle={2} cornerRadius={4} stroke="#10182b" strokeWidth={2}>
              {data.map(d => <Cell key={d.name} fill={colorOf(d.name)} />)}
            </Pie><Tooltip {...tip} /></PieChart></ResponsiveContainer>
          <div className="c"><div className="b tnum">{data.length}</div><div className="s">langs</div></div>
        </div>
        <div className="legend">{legend.map(d => (
          <div className="row" key={d.name}><span className="sw" style={{ background: d._o ? "#9aa4bb" : colorOf(d.name) }} /><span className="nm">{d.name}</span><span className="ct tnum">{Math.round(d.value / total * 100)}%</span></div>
        ))}</div>
      </div>
    </Panel>
  );
}
function TopReposPanel({ data }) {
  if (!data.length) return <Panel title="Top Repositories" cls="span7"><div className="empty-c">No public repositories yet.</div></Panel>;
  const rows = data.map(r => ({ name: r.name, stars: r.stargazers_count }));
  return (
    <Panel title="Top Repositories" tag="stars" cls="span7" note="Most-starred public repos">
      <ResponsiveContainer width="100%" height={Math.max(190, rows.length * 34)}>
        <BarChart data={rows} layout="vertical" margin={{ left: 4, right: 16 }} barCategoryGap={7}>
          <CartesianGrid horizontal={false} stroke="var(--line)" />
          <XAxis type="number" stroke="var(--muted)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={kfmt} fontFamily="JetBrains Mono" />
          <YAxis type="category" dataKey="name" width={104} stroke="var(--ink)" fontSize={12.5} fontWeight={600} tickLine={false} axisLine={false} />
          <Tooltip {...tip} cursor={{ fill: "rgba(47,107,255,.07)" }} formatter={v => [fmt(v), "stars"]} />
          <Bar dataKey="stars" fill="var(--primary)" radius={[0, 6, 6, 0]} />
        </BarChart></ResponsiveContainer>
    </Panel>
  );
}
function ActivityPanel({ counts }) {
  const days = lastDays(105), total = days.reduce((s, d) => s + (counts[d] || 0), 0);
  return (
    <Panel title="Recent Activity" tag="~90d" cls="span7" note="Public push events (REST has no full contribution graph)">
      {total === 0 ? <div className="empty-c">No public push activity in the last 90 days.</div> : (<>
        <div style={{ marginBottom: 12 }}><span className="big-num tnum">{fmt(total)}</span> <span className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>commits pushed</span></div>
        <div className="hm">{days.map(d => <i key={d} title={`${d}: ${counts[d] || 0} commits`} style={{ background: heatColor(counts[d] || 0) }} />)}</div>
        <div className="lg">less {HEAT.map((c, i) => <i key={i} style={{ background: c }} />)} more</div>
      </>)}
    </Panel>
  );
}
function FollowerPanel({ trend, current }) {
  return (
    <Panel title="Follower Trend" tag="live" cls="span5" note="GitHub keeps no history — built from each visit">
      {trend.length > 1 ? (
        <ResponsiveContainer width="100%" height={190}><AreaChart data={trend} margin={{ left: -10, right: 8, top: 6 }}>
          <defs><linearGradient id="fg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity={.4} /><stop offset="100%" stopColor="var(--primary)" stopOpacity={0} /></linearGradient></defs>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey="date" stroke="var(--muted)" fontSize={10.5} tickLine={false} axisLine={false} fontFamily="JetBrains Mono" />
          <YAxis stroke="var(--muted)" fontSize={10.5} width={42} tickLine={false} axisLine={false} tickFormatter={kfmt} fontFamily="JetBrains Mono" />
          <Tooltip {...tip} /><Area type="monotone" dataKey="followers" stroke="var(--primary)" strokeWidth={2.5} fill="url(#fg)" dot={{ r: 3, fill: "var(--primary)", stroke: "#fff", strokeWidth: 1.5 }} />
        </AreaChart></ResponsiveContainer>
      ) : <div className="empty-c">First snapshot saved:<br /><b className="tnum">{fmt(current)}</b><br />revisit over days to grow the line.</div>}
    </Panel>
  );
}
function TimelinePanel({ data }) {
  if (!data.length) return <Panel title="Repos Created" cls="span5"><div className="empty-c">No repositories yet.</div></Panel>;
  return (
    <Panel title="Repos Created" tag="/yr" cls="span5" note="New public repositories per year">
      <ResponsiveContainer width="100%" height={190}><BarChart data={data} margin={{ left: -18, right: 6, top: 6 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke="var(--line)" />
        <XAxis dataKey="year" stroke="var(--muted)" fontSize={11} tickLine={false} axisLine={false} fontFamily="JetBrains Mono" />
        <YAxis stroke="var(--muted)" fontSize={10.5} width={34} tickLine={false} axisLine={false} allowDecimals={false} fontFamily="JetBrains Mono" />
        <Tooltip {...tip} cursor={{ fill: "rgba(255,106,43,.09)" }} formatter={v => [v, "repos"]} />
        <Bar dataKey="count" fill="var(--pop)" radius={[6, 6, 0, 0]} />
      </BarChart></ResponsiveContainer>
    </Panel>
  );
}
function RecentReposPanel({ data, colorOf }) {
  if (!data.length) return <Panel title="Recently Pushed" cls="span7"><div className="empty-c">No source repositories to show.</div></Panel>;
  return (
    <Panel title="Recently Pushed" tag="log" cls="span7" note="Latest source repositories by push date">
      <div className="repolist">{data.map(r => (
        <a className="repo-row" key={r.id} href={r.html_url} target="_blank" rel="noreferrer">
          <span className="rr-name">{r.name}</span>
          <span className="rr-meta">{r.language && <><span className="dot" style={{ background: colorOf(r.language) }} />{r.language}</>}<span style={{ opacity: .5 }}>·</span>{relTime(r.pushed_at)}</span>
          <span className="rr-stars">★ {kfmt(r.stargazers_count)}</span>
        </a>
      ))}</div>
    </Panel>
  );
}
function FeaturedRepo({ repo, colorOf }) {
  if (!repo) return null;
  return (
    <div className="panel featured span12">
      <div style={{ flex: "1 1 320px", minWidth: 0 }}>
        <div className="ft-top"><span className="tag" style={{ color: "var(--pop-text)", borderColor: "var(--pop)" }}>★ top repo</span><span className="mono" style={{ fontSize: 11.5, color: "var(--muted)" }}>updated {relTime(repo.pushed_at)}</span></div>
        <a className="ft-name" href={repo.html_url} target="_blank" rel="noreferrer">{repo.name}</a>
        <p className="ft-desc">{repo.description || "No description provided."}</p>
        {repo.language && <div className="ft-lang"><span className="dot" style={{ background: colorOf(repo.language) }} />{repo.language}</div>}
      </div>
      <div className="ft-r">
        <div className="ft-metric"><b className="tnum">{kfmt(repo.stargazers_count)}</b><span>stars</span></div>
        <div className="ft-metric"><b className="tnum">{kfmt(repo.forks_count)}</b><span>forks</span></div>
        <div className="ft-metric"><b className="tnum">{kfmt(repo.open_issues_count)}</b><span>issues</span></div>
      </div>
    </div>
  );
}
function Skeleton() {
  return (<div className="enter">
    <div className="score"><div className="skel" style={{ width: 96, height: 96, borderRadius: 20 }} /><div style={{ flex: 1 }}><div className="skel" style={{ width: 240, height: 34, marginBottom: 10 }} /><div className="skel" style={{ width: 180, height: 16 }} /></div></div>
    <div className="skel" style={{ height: 108, margin: "0 0 30px" }} /><div className="skel" style={{ height: 120, marginBottom: 18 }} />
    <div className="bento"><div className="skel span5" style={{ height: 240 }} /><div className="skel span7" style={{ height: 240 }} /><div className="skel span7" style={{ height: 210 }} /><div className="skel span5" style={{ height: 210 }} /></div>
  </div>);
}

const EXAMPLES = ["torvalds", "sindresorhus", "gaearon", "yyx990803", "antfu"];
const MARQUEE = ["torvalds", "gaearon", "sindresorhus", "yyx990803", "antfu", "tj", "kentcdodds", "addyosmani", "paulirish", "shadcn"];

function App() {
  const deepLink = sanitizeUser(new URLSearchParams(location.search).get("user") || "");
  const [user, setUser] = useState(deepLink);            // prefill from a shared ?user= link
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(!!deepLink);    // no hero flash before the fetch starts
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [rate, setRate] = useState(null);
  const [lastQuery, setLastQuery] = useState("");
  const reqId = useRef(0);
  const ctrlRef = useRef(null);

  const run = useCallback(async (name) => {
    const u = sanitizeUser(name != null ? name : user);
    if (!u) return;
    setUser(u); setLastQuery(u);
    if (ctrlRef.current) ctrlRef.current.abort();          // cancel any in-flight request
    const ctrl = new AbortController(); ctrlRef.current = ctrl;
    const myId = ++reqId.current;                          // latest-wins guard for races
    const timer = setTimeout(() => ctrl.abort(), 15000);   // hung-request timeout
    setLoading(true); setError(null); setData(null);
    try {
      const profile = (await gh(`/users/${encodeURIComponent(u)}`, token, ctrl.signal)).data;
      const reposR = await gh(`/users/${encodeURIComponent(u)}/repos?per_page=100&sort=updated`, token, ctrl.signal);
      const events = await gh(`/users/${encodeURIComponent(u)}/events/public?per_page=100`, token, ctrl.signal);
      if (myId !== reqId.current) return;                  // a newer query superseded this one
      const repos = reposR.data;
      setRate({ remaining: +events.remaining, limit: +events.limit });
      const langs = aggregateLanguages(repos);
      const heat = activityByDay(events.data);
      const totalStars = repos.reduce((s, r) => s + r.stargazers_count, 0);
      const created = new Date(profile.created_at);
      const ageYrs = (Date.now() - created) / (365.25 * 86400000);
      setData({
        profile, languages: langs, top: topRepos(repos), recent: recentRepos(repos),
        perYear: reposPerYear(repos), heat, totalStars, totalForks: repos.reduce((s, r) => s + r.forks_count, 0),
        followerTrend: recordFollowers(u, profile.followers), featured: topRepos(repos, 1)[0] || null,
        meta: {
          age: ageYrs >= 1 ? ageYrs.toFixed(1) + " yrs" : Math.round(ageYrs * 12) + " mo",
          joinYear: created.getFullYear(),
          avgStars: repos.length ? Math.round(totalStars / repos.length) : 0,
          activeDays: Object.keys(heat).length,
          bestDay: Math.max(0, ...Object.values(heat)),
        },
      });
      const q = "?user=" + encodeURIComponent(u);   // shareable / bookmarkable URL
      if (location.search !== q) window.history.pushState({ user: u }, "", q);
    } catch (err) {
      if (myId !== reqId.current) return;                  // superseded — drop its error too
      if (ctrl.signal.aborted) setError({ title: "Request timed out", detail: "GitHub took too long to respond. Check your connection and try again." });
      else if (typeof navigator !== "undefined" && !navigator.onLine) setError({ title: "You're offline", detail: "No internet connection detected. Reconnect and try again." });
      else if (err && err.title) setError(err);
      else setError({ title: "Couldn't reach GitHub", detail: "A network error occurred. Check your connection and try again." });
    } finally {
      clearTimeout(timer);
      if (myId === reqId.current) setLoading(false);
    }
  }, [user, token]);

  // Deep-link support: load ?user= on mount and react to back/forward navigation.
  useEffect(() => {
    const fromUrl = () => { const q = new URLSearchParams(location.search).get("user"); if (q) run(q); };
    fromUrl();
    window.addEventListener("popstate", fromUrl);
    return () => window.removeEventListener("popstate", fromUrl);
  }, []); // ponytail: mount + back/forward. Deep-links carry no token (correct for shared links).

  const p = data && data.profile;
  const low = rate && rate.remaining <= 10;
  const colorOf = (name) => { const arr = data ? data.languages : []; const idx = arr.findIndex(l => l.name === name); return COLORS[(idx < 0 ? Math.abs(hashStr(name)) : idx) % COLORS.length]; };

  return (
    <>
      <header className="bar"><div className="bar-in">
        <div className="logo"><span className="m">P</span> PROFILER</div>
        <form onSubmit={e => { e.preventDefault(); run(); }}>
          <div className="field"><span className="at">@</span><input id="user" aria-label="GitHub username" placeholder="username" maxLength="200" value={user} onChange={e => setUser(e.target.value)} autoComplete="off" spellCheck="false" /></div>
          <div className="field" style={{ flex: "0 1 180px" }}><input type="password" aria-label="GitHub token (optional) — raises the limit from 60 to 5,000 requests/hour" title="Optional. Raises the API limit from 60 to 5,000 requests/hour. Create one at github.com/settings/tokens — no scopes needed for public data." placeholder="token (optional)" value={token} onChange={e => setToken(e.target.value)} autoComplete="off" /></div>
          <button className="go" disabled={loading}>{loading ? "…" : "Analyze"}</button>
        </form>
        {rate && <span className={"pill" + (low ? " low" : "")}><span className="d" />{rate.remaining}/{rate.limit}</span>}
      </div></header>

      <main>
        <div className="aura a" /><div className="aura b" />
        {loading && <div role="status" aria-label="Loading profile"><Skeleton /></div>}
        {!loading && error && <div className="err enter" role="alert"><div className="x" aria-hidden="true">!</div><div><div className="t">{error.title}</div><div className="d">{error.detail}</div>{lastQuery && <button type="button" className="retry" onClick={() => run(lastQuery)}>Try again</button>}</div></div>}

        {!loading && !error && !p && (
          <div className="hero enter">
            <div className="kick">// live github profile analytics</div>
            <h1>See any dev as a <span className="u">scoreboard</span>.</h1>
            <p>Languages, star power, shipping cadence, and follower momentum — pulled straight from the GitHub API and read at a glance.</p>
            <p className="try">Try one</p>
            <div className="chips">{EXAMPLES.map(n => <button type="button" className="chip" key={n} onClick={() => run(n)}>{n}</button>)}</div>
            <p className="hero-note">Runs on the public GitHub API (60 requests/hr). Hitting the wall? <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer">Create a free token</a> — no scopes needed — and paste it above for 5,000/hr.</p>
            <div className="marquee" aria-hidden="true"><div className="track">{[0, 1].map(k => <React.Fragment key={k}>{MARQUEE.map(n => <span key={n + k}><b>{n}</b> <span className="star">★</span></span>)}</React.Fragment>)}</div></div>
          </div>
        )}

        {!loading && p && (
          <div className="enter">
            <section className="score">
              <div className="av"><span className="ring" aria-hidden="true" /><img src={p.avatar_url} alt={(p.name || p.login) + " — GitHub avatar"} width="96" height="96" /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h1 className="nm">{p.name || p.login}</h1>
                <div className="hd">@{p.login} · <a href={p.html_url} target="_blank" rel="noreferrer">{p.html_url.replace("https://github.com/", "github/")}</a></div>
                {p.bio && <div className="bio" dir="auto">{p.bio}</div>}
                <div className="meta">
                  {p.location && <span className="mchip"><I d={IC.pin} />{p.location}</span>}
                  {p.company && <span className="mchip"><I d={IC.bag} />{p.company}</span>}
                  {p.blog && <span className="mchip"><I d={IC.link} /><a href={p.blog.startsWith("http") ? p.blog : "https://" + p.blog} target="_blank" rel="noreferrer">{p.blog.replace(/^https?:\/\//, "")}</a></span>}
                  <span className="mchip"><I d={IC.cal} />joined {data.meta.joinYear}</span>
                  {p.public_gists > 0 && <span className="mchip"><I d={IC.gist} />{p.public_gists} gists</span>}
                </div>
              </div>
            </section>

            <section className="stats">
              <Stat n={p.public_repos} l="Repos" />
              <Stat n={p.followers} l="Followers" cls="hl" />
              <Stat n={p.following} l="Following" />
              <Stat n={data.totalStars} l="Stars" cls="pop" />
              <Stat n={data.totalForks} l="Forks" />
            </section>
            <section className="substats">
              <span className="sub"><b>{data.meta.age}</b><span>on github</span></span>
              <span className="sub"><b className="tnum">{fmt(data.meta.avgStars)}</b><span>avg ★ / repo</span></span>
              <span className="sub"><b className="tnum">{data.meta.activeDays}</b><span>active days (90d)</span></span>
              <span className="sub"><b className="tnum">{data.meta.bestDay}</b><span>best day commits</span></span>
              <span className="sub"><b className="tnum">{fmt(p.following ? Math.round(p.followers / p.following * 10) / 10 : p.followers)}</b><span>follower ratio</span></span>
            </section>

            <FeaturedRepo repo={data.featured} colorOf={colorOf} />

            <section className="bento stagger">
              <LanguagePanel data={data.languages} repoCount={p.public_repos} colorOf={colorOf} />
              <TopReposPanel data={data.top} />
              <ActivityPanel counts={data.heat} />
              <FollowerPanel trend={data.followerTrend} current={p.followers} />
              <TimelinePanel data={data.perYear} />
              <RecentReposPanel data={data.recent} colorOf={colorOf} />
            </section>
          </div>
        )}
      </main>
      {p && !loading && <footer><span>PROFILER · live data from the GitHub REST API</span><span>{rate ? `${rate.remaining}/${rate.limit} requests left this hour` : ""}</span></footer>}
    </>
  );
}
function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i) | 0; return h; }

// ---- one runnable self-check (index.html?selftest -> console) ----------------
function runSelfTest() {
  const repos = [
    { id: 1, language: "JavaScript", stargazers_count: 5, forks_count: 1, created_at: "2021-02-01T00:00:00Z", pushed_at: "2024-05-03T00:00:00Z", fork: false },
    { id: 2, language: "JavaScript", stargazers_count: 2, forks_count: 0, created_at: "2021-06-01T00:00:00Z", pushed_at: "2024-05-01T00:00:00Z", fork: false },
    { id: 3, language: "Python", stargazers_count: 9, forks_count: 3, created_at: "2023-01-01T00:00:00Z", pushed_at: "2024-06-01T00:00:00Z", fork: false },
    { id: 4, language: null, stargazers_count: 0, forks_count: 0, created_at: "2023-03-01T00:00:00Z", pushed_at: "2020-01-01T00:00:00Z", fork: true },
  ];
  const langs = aggregateLanguages(repos);
  console.assert(langs[0].name === "JavaScript" && langs[0].value === 2 && langs.length === 2, "lang aggregate");
  console.assert(topRepos(repos, 2)[0].stargazers_count === 9, "top by stars");
  console.assert(recentRepos(repos)[0].id === 3 && recentRepos(repos).every(r => !r.fork), "recent sorted, forks excluded");
  const py = reposPerYear(repos); console.assert(py[0].year === "'21" && py[0].count === 2, "per-year grouped");
  const heat = activityByDay([{ type: "PushEvent", created_at: "2024-05-01T10:00:00Z", payload: { commits: [1, 2, 3] } }, { type: "PushEvent", created_at: "2024-05-01T12:00:00Z", payload: { commits: [1] } }, { type: "WatchEvent", created_at: "2024-05-01T12:00:00Z" }]);
  console.assert(heat["2024-05-01"] === 4, "push counted, non-push ignored");
  console.assert(heatColor(0) === HEAT[0] && heatColor(12) === HEAT[4], "heat buckets");
  console.assert(kfmt(238612) === "239k" && kfmt(950) === "950", "kfmt");
  console.log("%cself-test passed", "color:#12b981;font-weight:700");
}
if (location.search.includes("selftest")) runSelfTest();

if (!window.React || !window.ReactDOM || !window.Recharts) {
  document.getElementById("root").innerHTML = '<main><div class="err"><div class="x">!</div><div><div class="t">Failed to load a required library</div><div class="d">React or Recharts was blocked (CDN / ad-blocker). Check your connection and reload.</div></div></div></main>';
} else { ReactDOM.createRoot(document.getElementById("root")).render(<App />); }
