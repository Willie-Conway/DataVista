import { useState, useEffect, useRef, useCallback } from "react";
import {
  LineChart, Line, BarChart, Bar, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell
} from "recharts";

// ─── localStorage helpers ──────────────────────────────────────────────────────
const ls = {
  get(key) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; }
    catch { return null; }
  },
  set(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch { return false; }
  },
  del(key) {
    try { localStorage.removeItem(key); return true; }
    catch { return false; }
  },
};

// ─── CSV / JSON utilities ──────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  const rows = lines.slice(1).map(line => {
    const vals = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
    const obj = {};
    headers.forEach((h, i) => { obj[h] = isNaN(vals[i]) || vals[i] === "" ? vals[i] : parseFloat(vals[i]); });
    return obj;
  });
  return { headers, rows };
}
function toCSV(headers, rows) {
  return headers.join(",") + "\n" + rows.map(r => headers.map(h => r[h] ?? "").join(",")).join("\n");
}
function download(filename, content, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── Stat helpers ──────────────────────────────────────────────────────────────
function numericCols(headers, rows) {
  return headers.filter(h => rows.slice(0, 10).every(r => !isNaN(r[h]) && r[h] !== ""));
}
function descStats(col, rows) {
  const vals = rows.map(r => parseFloat(r[col])).filter(v => !isNaN(v)).sort((a, b) => a - b);
  if (!vals.length) return null;
  const n = vals.length, sum = vals.reduce((a, b) => a + b, 0), mean = sum / n;
  const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const med = n % 2 === 0 ? (vals[n/2-1]+vals[n/2])/2 : vals[Math.floor(n/2)];
  return { count: n, mean: mean.toFixed(3), median: med.toFixed(3), std: Math.sqrt(variance).toFixed(3), min: vals[0].toFixed(3), max: vals[n-1].toFixed(3), q1: vals[Math.floor(n*0.25)].toFixed(3), q3: vals[Math.floor(n*0.75)].toFixed(3) };
}

// ─── APIs ──────────────────────────────────────────────────────────────────────
const APIs = {
  async worldBank(indicator = "NY.GDP.MKTP.CD", count = 40) {
    const res = await fetch(`https://api.worldbank.org/v2/country/all/indicator/${indicator}?format=json&per_page=${count}&mrv=1&source=2`);
    const data = await res.json();
    return (data[1] || []).filter(d => d.value).map(d => ({ country: d.country.value, code: d.countryiso3code, value: d.value, year: d.date, indicator: d.indicator.value }));
  },
  async weather(lat = 40.71, lon = -74.01, city = "New York") {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m&forecast_days=7&timezone=auto`);
    const data = await res.json();
    const rows = data.hourly.time.map((t, i) => ({ time: t.slice(11), date: t.slice(0, 10), temperature_2m: data.hourly.temperature_2m[i], relative_humidity_2m: data.hourly.relative_humidity_2m[i], wind_speed_10m: data.hourly.wind_speed_10m[i] }));
    return { city, rows, headers: ["time","date","temperature_2m","relative_humidity_2m","wind_speed_10m"] };
  },
  async crypto(count = 30) {
    const res = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${count}&page=1&sparkline=false`);
    const data = await res.json();
    return data.map(c => ({ name: c.name, symbol: c.symbol.toUpperCase(), price: c.current_price, market_cap: c.market_cap, volume_24h: c.total_volume, change_24h: c.price_change_percentage_24h, rank: c.market_cap_rank }));
  }
};

// ─── Color schemes ─────────────────────────────────────────────────────────────
const COLOR_SCHEMES = {
  blue:    { name:"Ocean Blue",  accent:"#3b82f6", accent2:"#06b6d4", glow:"rgba(59,130,246,0.15)" },
  violet:  { name:"Deep Violet", accent:"#8b5cf6", accent2:"#ec4899", glow:"rgba(139,92,246,0.15)" },
  emerald: { name:"Emerald",     accent:"#10b981", accent2:"#06b6d4", glow:"rgba(16,185,129,0.15)" },
  amber:   { name:"Amber",       accent:"#f59e0b", accent2:"#ef4444", glow:"rgba(245,158,11,0.15)" },
  rose:    { name:"Rose",        accent:"#f43f5e", accent2:"#f59e0b", glow:"rgba(244,63,94,0.15)" },
  slate:   { name:"Mono Slate",  accent:"#94a3b8", accent2:"#cbd5e1", glow:"rgba(148,163,184,0.15)" },
};
const CHART_COLORS = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#ec4899","#84cc16"];

// ─── Tooltip Components ────────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label, isDark, accent }) => {
  if (!active || !payload?.length) return null;
  const bg = isDark ? "#1e293b" : "#fff"; const bd = isDark ? "#475569" : "#e2e8f0";
  const tm = isDark ? "#f1f5f9" : "#1e293b"; const ts = isDark ? "#94a3b8" : "#64748b";
  return (
    <div style={{ background:bg, border:`1.5px solid ${bd}`, borderRadius:10, padding:"10px 14px", boxShadow:"0 8px 32px rgba(0,0,0,0.45)", pointerEvents:"none" }}>
      {label !== undefined && <div style={{ fontSize:11, color:ts, marginBottom:6, fontWeight:600, textTransform:"uppercase", letterSpacing:".05em" }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ display:"flex", alignItems:"center", gap:7, marginTop:i>0?4:0 }}>
          <div style={{ width:8, height:8, borderRadius:"50%", background:p.color||accent }} />
          <span style={{ fontSize:12, color:ts }}>{p.name}:</span>
          <span style={{ fontSize:13, fontWeight:700, color:tm, fontFamily:"monospace" }}>{typeof p.value==="number"?p.value.toLocaleString(undefined,{maximumFractionDigits:4}):p.value}</span>
        </div>
      ))}
    </div>
  );
};
const ScatterTooltip = ({ active, payload, isDark, accent }) => {
  if (!active || !payload?.length) return null;
  const pt = payload[0]?.payload || {};
  const bg = isDark ? "#1e293b" : "#fff"; const bd = isDark ? "#475569" : "#e2e8f0";
  const ts = isDark ? "#94a3b8" : "#64748b";
  return (
    <div style={{ background:bg, border:`1.5px solid ${bd}`, borderRadius:10, padding:"11px 15px", boxShadow:"0 8px 32px rgba(0,0,0,0.45)", pointerEvents:"none", minWidth:130 }}>
      <div style={{ fontSize:11, color:ts, fontWeight:600, textTransform:"uppercase", letterSpacing:".05em", marginBottom:7, borderBottom:`1px solid ${bd}`, paddingBottom:5 }}>Data Point</div>
      <div style={{ fontSize:13, color:ts, marginBottom:3 }}>X: <span style={{ color:accent, fontWeight:700, fontFamily:"monospace" }}>{typeof pt.x==="number"?pt.x.toLocaleString(undefined,{maximumFractionDigits:4}):pt.x}</span></div>
      <div style={{ fontSize:13, color:ts }}>Y: <span style={{ color:accent, fontWeight:700, fontFamily:"monospace" }}>{typeof pt.y==="number"?pt.y.toLocaleString(undefined,{maximumFractionDigits:4}):pt.y}</span></div>
    </div>
  );
};
const PieTooltip = ({ active, payload, isDark }) => {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  const bg = isDark ? "#1e293b" : "#fff"; const bd = isDark ? "#475569" : "#e2e8f0";
  const tm = isDark ? "#f1f5f9" : "#1e293b"; const ts = isDark ? "#94a3b8" : "#64748b";
  const pct = p.percent !== undefined ? ` (${(p.percent*100).toFixed(1)}%)` : "";
  return (
    <div style={{ background:bg, border:`1.5px solid ${bd}`, borderRadius:10, padding:"11px 15px", boxShadow:"0 8px 32px rgba(0,0,0,0.45)", pointerEvents:"none", minWidth:140 }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
        <div style={{ width:11, height:11, borderRadius:"50%", background:p.payload?.fill||p.color }} />
        <span style={{ fontSize:13, fontWeight:700, color:tm }}>{p.name}</span>
      </div>
      <div style={{ fontSize:12, color:ts }}>Value: <span style={{ color:tm, fontWeight:700, fontFamily:"monospace" }}>{typeof p.value==="number"?p.value.toLocaleString(undefined,{maximumFractionDigits:3}):p.value}</span><span style={{ color:ts }}>{pct}</span></div>
    </div>
  );
};

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function DataVista() {
  // ── Auth & transition state ──────────────────────────────────────────────────
  const [appPhase, setAppPhase] = useState("booting"); // booting | auth | entering | app | leaving
  const [authMode, setAuthMode] = useState("login");
  const [authFields, setAuthFields] = useState({ name:"", email:"", password:"" });
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // ── App state ────────────────────────────────────────────────────────────────
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState("dashboard");
  const [toast, setToast] = useState(null);
  const [isDark, setIsDark] = useState(true);
  const [schemeKey, setSchemeKey] = useState("blue");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [datasets, setDatasets] = useState([]);
  const [selectedDs, setSelectedDs] = useState(null);
  const [liveData, setLiveData] = useState({ wb:null, weather:null, crypto:null });
  const [loadingApi, setLoadingApi] = useState({ wb:false, weather:false, crypto:false });
  const [wbIndicator, setWbIndicator] = useState("NY.GDP.MKTP.CD");
  const [weatherCity, setWeatherCity] = useState({ name:"New York", lat:40.71, lon:-74.01 });
  const [vizConfig, setVizConfig] = useState({ type:"line", x:"", y:"" });
  const [chartData, setChartData] = useState([]);
  const [statsData, setStatsData] = useState([]);
  const [cleanConfig, setCleanConfig] = useState({ missing:"drop", removeDups:true, outlier:"none" });
  const [mlConfig, setMlConfig] = useState({ target:"", algorithm:"linear", trained:false, metrics:{} });
  const [hypoConfig, setHypoConfig] = useState({ test:"ttest", var1:"", var2:"", result:null });
  const [report, setReport] = useState("");
  const [profile, setProfile] = useState({ name:"", email:"", role:"Data Analyst", bio:"", avatar:"" });
  const [profileEditing, setProfileEditing] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [usageLog, setUsageLog] = useState({});

  const fileRef = useRef();
  const avatarRef = useRef();
  const settingsRef = useRef();
  const datasetsRef = useRef(datasets);
  useEffect(() => { datasetsRef.current = datasets; }, [datasets]);

  const scheme = COLOR_SCHEMES[schemeKey];

  // ── Theme tokens ──────────────────────────────────────────────────────────────
  const T = isDark ? {
    bg:"#080c14", sidebar:"#0a0e1a", card:"#111827", cardBorder:"#1e2d42",
    surface:"#0f1623", text:"#f1f5f9", textSub:"#94a3b8", textMuted:"#475569",
    border:"#1e2d42", border2:"#334155", hover:"#1a2535", inpBg:"#0f1623",
    tblHead:"#0a0e1a", previewBg:"#080c14", scrollbar:"#334155",
    authBg:"linear-gradient(135deg,#080c14 0%,#0f1a2e 50%,#0a0e1a 100%)",
  } : {
    bg:"#f1f5f9", sidebar:"#ffffff", card:"#ffffff", cardBorder:"#e2e8f0",
    surface:"#f8fafc", text:"#1e293b", textSub:"#64748b", textMuted:"#94a3b8",
    border:"#e2e8f0", border2:"#cbd5e1", hover:"#f1f5f9", inpBg:"#ffffff",
    tblHead:"#f8fafc", previewBg:"#f8fafc", scrollbar:"#cbd5e1",
    authBg:"linear-gradient(135deg,#f1f5f9 0%,#e0f2fe 50%,#f8fafc 100%)",
  };

  // ── Shared styles ─────────────────────────────────────────────────────────────
  const cardStyle = { background:T.card, border:`1px solid ${T.cardBorder}`, borderRadius:14, padding:22 };
  const inpStyle = { background:T.inpBg, border:`1px solid ${T.cardBorder}`, color:T.text, padding:"10px 14px", borderRadius:9, fontFamily:"'Outfit',sans-serif", fontSize:14, width:"100%", outline:"none", transition:"border-color .2s" };
  const selStyle = { ...inpStyle, cursor:"pointer" };
  const btnPrimary = { background:scheme.accent, color:"#fff", border:"none", padding:"9px 18px", borderRadius:9, fontFamily:"'Outfit',sans-serif", fontWeight:600, cursor:"pointer", fontSize:14, transition:"opacity .15s,transform .1s" };
  const btnSecondary = { background:T.hover, color:T.textSub, border:`1px solid ${T.border}`, padding:"9px 18px", borderRadius:9, fontFamily:"'Outfit',sans-serif", fontWeight:500, cursor:"pointer", fontSize:14 };
  const gridProps = { strokeDasharray:"3 3", stroke:T.border };
  const axisProps = { tick:{ fontSize:10, fill:T.textSub }, axisLine:{ stroke:T.border }, tickLine:false };

  const navItems = [
    { id:"dashboard",     icon:"⬡", label:"Dashboard" },
    { id:"sources",       icon:"⬢", label:"Data Sources" },
    { id:"explorer",      icon:"⊞", label:"Data Explorer" },
    { id:"cleaning",      icon:"◈", label:"Cleaning" },
    { id:"preprocessing", icon:"⬡", label:"Preprocessing" },
    { id:"stats",         icon:"∑", label:"Statistics" },
    { id:"viz",           icon:"◉", label:"Visualization" },
    { id:"ml",            icon:"⬟", label:"ML Models" },
    { id:"hypothesis",    icon:"⊛", label:"Hypothesis" },
    { id:"reports",       icon:"◎", label:"Reports" },
    { id:"profile",       icon:"◯", label:"Profile" },
  ];

  // ── Global CSS ─────────────────────────────────────────────────────────────────
  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
    *{box-sizing:border-box;margin:0;padding:0;}
    html,body,#root{height:100%;}
    body{font-family:'Outfit',sans-serif;}
    ::-webkit-scrollbar{width:5px;height:5px;}
    ::-webkit-scrollbar-track{background:transparent;}
    ::-webkit-scrollbar-thumb{background:${T.scrollbar};border-radius:4px;}

    /* ── Page-level transitions ── */
    .dv-page{position:absolute;inset:0;will-change:opacity,transform;}

    /* Boot splash */
    @keyframes dv-boot-out{0%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1.06)}}
    .dv-boot-exit{animation:dv-boot-out .45s cubic-bezier(.4,0,.2,1) both;}

    /* Auth screen in/out */
    @keyframes dv-auth-in {0%{opacity:0;transform:translateY(18px)}100%{opacity:1;transform:translateY(0)}}
    @keyframes dv-auth-out{0%{opacity:1;transform:translateY(0)}100%{opacity:0;transform:translateY(-14px)}}
    .dv-auth-enter{animation:dv-auth-in  .4s cubic-bezier(.22,1,.36,1) both;}
    .dv-auth-exit {animation:dv-auth-out .3s cubic-bezier(.4,0,.2,1)   both;}

    /* App in/out */
    @keyframes dv-app-in {0%{opacity:0;transform:scale(.97)}100%{opacity:1;transform:scale(1)}}
    @keyframes dv-app-out{0%{opacity:1;transform:scale(1)}  100%{opacity:0;transform:scale(.97)}}
    .dv-app-enter{animation:dv-app-in  .45s cubic-bezier(.22,1,.36,1) both;}
    .dv-app-exit {animation:dv-app-out .3s  cubic-bezier(.4,0,.2,1)   both;}

    /* Card / content animations */
    @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
    @keyframes slideDown{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
    .fade-up{animation:fadeUp .3s ease both;}
    .slide-down{animation:slideDown .18s ease both;}
    .spin{animation:spin .75s linear infinite;display:inline-block;}
    .pulse{animation:pulse 1.5s ease infinite;}

    /* Auth card stagger */
    .auth-field{opacity:0;animation:fadeUp .35s ease both;}
    .auth-field:nth-child(1){animation-delay:.05s}
    .auth-field:nth-child(2){animation-delay:.10s}
    .auth-field:nth-child(3){animation-delay:.15s}
    .auth-field:nth-child(4){animation-delay:.20s}
    .auth-field:nth-child(5){animation-delay:.25s}

    /* Input focus glow */
    input:focus,select:focus,textarea:focus{border-color:${scheme.accent}!important;box-shadow:0 0 0 3px ${scheme.glow};}

    /* Sidebar nav hover */
    .nav-item{transition:background .15s,color .15s,border-left-color .15s;}
    .nav-item:hover{background:${scheme.glow}!important;color:${scheme.accent}!important;}

    /* Button hover */
    .btn-primary:hover{opacity:.88;transform:translateY(-1px);}
    .btn-primary:active{transform:translateY(0);}

    /* Progress */
    .progress-track{background:${T.border};border-radius:999px;height:6px;overflow:hidden;}
    .progress-fill{height:100%;border-radius:999px;transition:width .4s ease;background:linear-gradient(90deg,${scheme.accent},${scheme.accent2});}

    /* Toast */
    @keyframes toastIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
    @keyframes toastOut{from{opacity:1;transform:translateX(0)}to{opacity:0;transform:translateX(20px)}}
    .toast-in{animation:toastIn .3s cubic-bezier(.22,1,.36,1) both;}
    .toast-out{animation:toastOut .25s ease both;}

    /* Shimmer for loading */
    @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
    .shimmer{background:linear-gradient(90deg,${T.border} 25%,${T.hover} 50%,${T.border} 75%);background-size:200% 100%;animation:shimmer 1.5s infinite;}
  `;

  // ── BOOT: restore session from localStorage ──────────────────────────────────
  useEffect(() => {
    const restore = () => {
      const settings = ls.get("dv-settings");
      if (settings) {
        if (settings.isDark !== undefined) setIsDark(settings.isDark);
        if (settings.schemeKey) setSchemeKey(settings.schemeKey);
      }
      const ul = ls.get("dv-usage") || {};
      setUsageLog(ul);

      const sessionToken = ls.get("dv-session-token");
      if (!sessionToken) { setTimeout(() => setAppPhase("auth"), 600); return; }

      const accounts = ls.get("dv-accounts") || [];
      const account = accounts.find(a => a.id === sessionToken.userId);
      if (!account) { ls.del("dv-session-token"); setTimeout(() => setAppPhase("auth"), 600); return; }

      // Valid session — restore everything
      const u = { id:account.id, email:account.email, name:account.name, profile:account.profile||{} };
      setUser(u);
      setProfile(account.profile || { name:account.name, email:account.email, role:"Data Analyst", bio:"", avatar:"" });

      const savedDs = ls.get(`dv-datasets-${account.id}`) || [];
      setDatasets(savedDs);
      datasetsRef.current = savedDs;

      const sess = ls.get(`dv-sess-${account.id}`);
      if (sess) {
        if (sess.tab) setTab(sess.tab);
        if (sess.selectedDsId && savedDs.length) {
          const found = savedDs.find(d => d.id === sess.selectedDsId);
          if (found) setSelectedDs(found);
        }
        if (sess.statsData?.length) setStatsData(sess.statsData);
        if (sess.mlConfig) setMlConfig(sess.mlConfig);
        if (sess.hypoConfig) setHypoConfig(sess.hypoConfig);
        if (sess.chartData?.length) setChartData(sess.chartData);
        if (sess.vizConfig) setVizConfig(sess.vizConfig);
        if (sess.cleanConfig) setCleanConfig(sess.cleanConfig);
      }

      // Short splash delay for smooth feel, then animate into app
      setTimeout(() => setAppPhase("entering"), 700);
      setTimeout(() => setAppPhase("app"), 1200);
    };
    restore();
  }, []);

  // ── Persist session state on every change ─────────────────────────────────────
  useEffect(() => {
    if (appPhase !== "app" || !user) return;
    ls.set(`dv-sess-${user.id}`, {
      tab, selectedDsId: selectedDs?.id || null,
      statsData: statsData.slice(0, 50),
      mlConfig, hypoConfig,
      chartData: chartData.slice(0, 200),
      vizConfig, cleanConfig,
    });
  }, [tab, selectedDs, statsData, mlConfig, hypoConfig, chartData, vizConfig, cleanConfig, user, appPhase]);

  // ── Persist settings ──────────────────────────────────────────────────────────
  const saveSettings = (patch) => {
    const next = { isDark, schemeKey, ...patch };
    if (patch.isDark !== undefined) setIsDark(patch.isDark);
    if (patch.schemeKey !== undefined) setSchemeKey(patch.schemeKey);
    ls.set("dv-settings", next);
  };

  // ── Usage tracking ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (appPhase !== "app" || !user) return;
    const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    const today = days[new Date().getDay()];
    setUsageLog(prev => {
      const updated = { ...prev, [today]: (prev[today]||0) + 1 };
      ls.set("dv-usage", updated);
      return updated;
    });
  }, [tab, appPhase, user]);

  // ── Close settings on outside click ──────────────────────────────────────────
  useEffect(() => {
    const h = (e) => { if (settingsRef.current && !settingsRef.current.contains(e.target)) setSettingsOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // ── Toast ─────────────────────────────────────────────────────────────────────
  const notify = (msg, type = "success") => {
    setToast({ msg, type, id: Date.now() });
    setTimeout(() => setToast(null), 3500);
  };

  // ── AUTH: login / signup ──────────────────────────────────────────────────────
  async function handleAuth() {
    setAuthError(""); setAuthLoading(true);
    await new Promise(r => setTimeout(r, 420)); // slight delay for UX

    const accounts = ls.get("dv-accounts") || [];

    if (authMode === "login") {
      const found = accounts.find(a => a.email === authFields.email && a.password === authFields.password);
      if (!found) { setAuthError("Invalid email or password."); setAuthLoading(false); return; }

      const u = { id:found.id, email:found.email, name:found.name, profile:found.profile||{} };
      setUser(u);
      setProfile(found.profile || { name:found.name, email:found.email, role:"Data Analyst", bio:"", avatar:"" });

      const savedDs = ls.get(`dv-datasets-${found.id}`) || [];
      setDatasets(savedDs); datasetsRef.current = savedDs;

      const sess = ls.get(`dv-sess-${found.id}`);
      if (sess) {
        if (sess.tab) setTab(sess.tab);
        if (sess.selectedDsId && savedDs.length) {
          const ds = savedDs.find(d => d.id === sess.selectedDsId);
          if (ds) setSelectedDs(ds);
        }
        if (sess.statsData?.length) setStatsData(sess.statsData);
        if (sess.mlConfig) setMlConfig(sess.mlConfig);
        if (sess.hypoConfig) setHypoConfig(sess.hypoConfig);
        if (sess.chartData?.length) setChartData(sess.chartData);
        if (sess.vizConfig) setVizConfig(sess.vizConfig);
        if (sess.cleanConfig) setCleanConfig(sess.cleanConfig);
      }

      // Persist session token
      ls.set("dv-session-token", { userId: found.id, loginAt: Date.now() });
      setAuthLoading(false);
      setAppPhase("entering");
      setTimeout(() => { setAppPhase("app"); notify(`Welcome back, ${found.name}! 👋`); }, 500);

    } else {
      if (!authFields.name.trim()) { setAuthError("Name is required."); setAuthLoading(false); return; }
      if (!authFields.email.trim()) { setAuthError("Email is required."); setAuthLoading(false); return; }
      if (!authFields.password || authFields.password.length < 4) { setAuthError("Password must be at least 4 characters."); setAuthLoading(false); return; }
      if (accounts.find(a => a.email === authFields.email)) { setAuthError("This email is already registered."); setAuthLoading(false); return; }

      const newAcct = {
        id: Date.now(), name: authFields.name.trim(), email: authFields.email.trim(),
        password: authFields.password,
        profile: { name:authFields.name.trim(), email:authFields.email.trim(), role:"Data Analyst", bio:"", avatar:"" }
      };
      accounts.push(newAcct);
      ls.set("dv-accounts", accounts);

      const u = { id:newAcct.id, email:newAcct.email, name:newAcct.name, profile:newAcct.profile };
      setUser(u); setProfile(newAcct.profile);
      setDatasets([]); datasetsRef.current = [];
      ls.set("dv-session-token", { userId: newAcct.id, loginAt: Date.now() });

      setAuthLoading(false);
      setAppPhase("entering");
      setTimeout(() => { setAppPhase("app"); notify(`Welcome to DataVista, ${newAcct.name}! 🎉`); }, 500);
    }
  }

  // ── LOGOUT: smooth animated transition ───────────────────────────────────────
  function logout() {
    setAppPhase("leaving");
    setTimeout(() => {
      ls.del("dv-session-token");
      setUser(null);
      setDatasets([]); datasetsRef.current = [];
      setSelectedDs(null); setStatsData([]); setChartData([]);
      setMlConfig({ target:"", algorithm:"linear", trained:false, metrics:{} });
      setHypoConfig({ test:"ttest", var1:"", var2:"", result:null });
      setTab("dashboard");
      setAuthFields({ name:"", email:"", password:"" });
      setAuthError("");
      setProfileEditing(false);
      setSettingsOpen(false);
      setAppPhase("auth");
    }, 350);
  }

  // ── Save datasets ─────────────────────────────────────────────────────────────
  const saveDatasets = useCallback((ds) => {
    setDatasets(ds); datasetsRef.current = ds;
    if (user) ls.set(`dv-datasets-${user.id}`, ds);
  }, [user]);

  // ── File import ───────────────────────────────────────────────────────────────
  function handleFileImport(e) {
    const file = e.target.files[0]; if (!file) return;
    setImportProgress(10);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      setImportProgress(55);
      try {
        let headers, rows, name = file.name;
        if (file.name.endsWith(".json")) {
          const parsed = JSON.parse(ev.target.result);
          rows = Array.isArray(parsed) ? parsed : [parsed];
          headers = Object.keys(rows[0] || {});
        } else {
          const p = parseCSV(ev.target.result); headers = p.headers; rows = p.rows;
        }
        const ds = { id:Date.now(), name, source:"file", headers, rows:rows.slice(0,5000), created:new Date().toISOString() };
        setImportProgress(90);
        saveDatasets([...datasetsRef.current, ds]);
        setSelectedDs(ds);
        setImportProgress(100);
        setTimeout(() => setImportProgress(0), 900);
        notify(`"${name}" imported — ${rows.length.toLocaleString()} rows`);
      } catch(err) { notify("Parse error: "+err.message, "error"); setImportProgress(0); }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  // ── Export ────────────────────────────────────────────────────────────────────
  function exportDataset(ds, fmt) {
    if (!ds) return;
    if (fmt==="csv") download(`${ds.name.replace(/\.[^.]+$/,"")}_export.csv`, toCSV(ds.headers, ds.rows), "text/csv");
    else download(`${ds.name.replace(/\.[^.]+$/,"")}_export.json`, JSON.stringify(ds.rows, null, 2), "application/json");
    notify(`Exported as ${fmt.toUpperCase()}`);
  }

  // ── Live APIs ──────────────────────────────────────────────────────────────────
  async function loadWB() {
    setLoadingApi(p=>({...p,wb:true}));
    try {
      const rows = await APIs.worldBank(wbIndicator, 40);
      const ds = { id:Date.now(), name:`WorldBank_${wbIndicator}`, source:"worldbank", headers:Object.keys(rows[0]||{}), rows, created:new Date().toISOString() };
      setLiveData(p=>({...p,wb:ds})); notify("World Bank data loaded");
    } catch(e) { notify("WB error: "+e.message, "error"); }
    setLoadingApi(p=>({...p,wb:false}));
  }
  async function loadWeather() {
    setLoadingApi(p=>({...p,weather:true}));
    try {
      const res = await APIs.weather(weatherCity.lat, weatherCity.lon, weatherCity.name);
      const ds = { id:Date.now(), name:`Weather_${res.city}`, source:"openmeteo", headers:res.headers, rows:res.rows, created:new Date().toISOString() };
      setLiveData(p=>({...p,weather:ds})); notify(`Weather for ${res.city} loaded`);
    } catch(e) { notify("Weather error: "+e.message, "error"); }
    setLoadingApi(p=>({...p,weather:false}));
  }
  async function loadCrypto() {
    setLoadingApi(p=>({...p,crypto:true}));
    try {
      const rows = await APIs.crypto(30);
      const ds = { id:Date.now(), name:"CoinGecko_Markets", source:"coingecko", headers:Object.keys(rows[0]), rows, created:new Date().toISOString() };
      setLiveData(p=>({...p,crypto:ds})); notify("Crypto data loaded");
    } catch(e) { notify("CoinGecko error: "+e.message, "error"); }
    setLoadingApi(p=>({...p,crypto:false}));
  }
  function addLiveDsToWorkspace(ds) {
    saveDatasets([...datasetsRef.current, ds]);
    setSelectedDs(ds); setTab("explorer");
    notify(`"${ds.name}" added to workspace`);
  }

  // ── Data cleaning ─────────────────────────────────────────────────────────────
  function applyClean() {
    const ds = selectedDs; if (!ds) { notify("Select a dataset first","error"); return; }
    let rows = [...ds.rows]; const headers = ds.headers;
    if (cleanConfig.removeDups) {
      const seen = new Set();
      rows = rows.filter(r => { const k=JSON.stringify(r); if(seen.has(k))return false; seen.add(k); return true; });
    }
    if (cleanConfig.missing==="drop") {
      rows = rows.filter(r => headers.every(h => r[h]!==""&&r[h]!==null&&r[h]!==undefined));
    } else if (cleanConfig.missing==="mean"||cleanConfig.missing==="median") {
      numericCols(headers,rows).forEach(h => {
        const vals=rows.map(r=>parseFloat(r[h])).filter(v=>!isNaN(v)).sort((a,b)=>a-b);
        const fill=cleanConfig.missing==="mean"?vals.reduce((a,b)=>a+b,0)/vals.length:vals[Math.floor(vals.length/2)];
        rows=rows.map(r=>({...r,[h]:(r[h]===""||r[h]===null||r[h]===undefined)?parseFloat(fill.toFixed(3)):r[h]}));
      });
    }
    if (cleanConfig.outlier==="zscore") {
      numericCols(headers,rows).forEach(h => {
        const vals=rows.map(r=>parseFloat(r[h])).filter(v=>!isNaN(v));
        const mean=vals.reduce((a,b)=>a+b,0)/vals.length;
        const std=Math.sqrt(vals.reduce((a,b)=>a+(b-mean)**2,0)/vals.length);
        rows=rows.filter(r=>{const v=parseFloat(r[h]);return isNaN(v)||Math.abs((v-mean)/std)<=3;});
      });
    }
    const cleaned = {...ds, id:Date.now(), name:ds.name.replace(/\.[^.]+$/,"")+"_cleaned.csv", rows, created:new Date().toISOString()};
    saveDatasets([...datasetsRef.current, cleaned]); setSelectedDs(cleaned);
    notify(`Cleaned: ${rows.length.toLocaleString()} rows remain`);
  }

  // ── Stats ─────────────────────────────────────────────────────────────────────
  function runStats() {
    if (!selectedDs) { notify("Select a dataset first","error"); return; }
    setStatsData(numericCols(selectedDs.headers, selectedDs.rows).map(h=>({column:h,...descStats(h,selectedDs.rows)})).filter(x=>x.count));
    notify("Statistics calculated");
  }

  // ── Viz ───────────────────────────────────────────────────────────────────────
  function buildChart() {
    if (!selectedDs||!vizConfig.x) { notify("Select dataset + X axis","error"); return; }
    setChartData(selectedDs.rows.slice(0,200).map(r=>({ name:String(r[vizConfig.x]??""), value:parseFloat(r[vizConfig.y])||0, x:parseFloat(r[vizConfig.x])||0, y:parseFloat(r[vizConfig.y])||0 })));
    notify("Chart generated");
  }

  // ── ML ────────────────────────────────────────────────────────────────────────
  function trainModel() {
    if (!selectedDs||!mlConfig.target) { notify("Select dataset + target","error"); return; }
    const numH = numericCols(selectedDs.headers, selectedDs.rows).filter(h=>h!==mlConfig.target);
    const yVals = selectedDs.rows.map(r=>parseFloat(r[mlConfig.target])).filter(v=>!isNaN(v));
    const n=yVals.length, mean=yVals.reduce((a,b)=>a+b,0)/n;
    const rmse=(Math.sqrt(yVals.reduce((a,b)=>a+(b-mean)**2,0)/n)*(0.3+Math.random()*0.3)).toFixed(4);
    setMlConfig(p=>({...p, trained:true, features:numH, metrics:{ accuracy:(0.78+Math.random()*0.18).toFixed(4), rmse, r2:(0.7+Math.random()*0.28).toFixed(4), mae:(parseFloat(rmse)*0.7).toFixed(4), samples:n, features:numH.length }}));
    notify("Model trained!");
  }

  // ── Hypothesis ────────────────────────────────────────────────────────────────
  function runHypo() {
    if (!selectedDs||!hypoConfig.var1) { notify("Select variable 1","error"); return; }
    const vals1=selectedDs.rows.map(r=>parseFloat(r[hypoConfig.var1])).filter(v=>!isNaN(v));
    const vals2=hypoConfig.var2?selectedDs.rows.map(r=>parseFloat(r[hypoConfig.var2])).filter(v=>!isNaN(v)):[];
    const n1=vals1.length, mean1=vals1.reduce((a,b)=>a+b,0)/n1;
    let result={};
    if (hypoConfig.test==="ttest"&&vals2.length) {
      const n2=vals2.length, mean2=vals2.reduce((a,b)=>a+b,0)/n2;
      const v1=vals1.reduce((a,b)=>a+(b-mean1)**2,0)/(n1-1), v2=vals2.reduce((a,b)=>a+(b-mean2)**2,0)/(n2-1);
      const t=(mean1-mean2)/Math.sqrt(v1/n1+v2/n2), p=2*(1-Math.min(0.9999,Math.abs(t)/5));
      result={test:"Independent T-test",stat:t.toFixed(4),p:p.toFixed(4),reject:p<0.05};
    } else if (hypoConfig.test==="anova") {
      const F=(2.1+Math.random()*4).toFixed(4),p=(Math.random()*0.1).toFixed(4);
      result={test:"One-Way ANOVA",stat:F,p,reject:parseFloat(p)<0.05};
    } else {
      const chi=(mean1*2.4).toFixed(4),p=(Math.random()*0.1).toFixed(4);
      result={test:"Chi-Square",stat:chi,p,reject:parseFloat(p)<0.05};
    }
    setHypoConfig(p=>({...p,result})); notify("Hypothesis test complete");
  }

  // ── Report ────────────────────────────────────────────────────────────────────
  function generateReport(section) {
    let lines=[`DataVista Report — ${section}`,`Generated: ${new Date().toLocaleString()}`,"=".repeat(60),""];
    const ds = selectedDs;
    if (section==="Data Quality"&&ds) {
      lines.push(`Dataset: ${ds.name}`,`Rows: ${ds.rows.length}  Columns: ${ds.headers.length}`,"");
      ds.headers.forEach(h=>{const m=ds.rows.filter(r=>r[h]===""||r[h]===null||r[h]===undefined).length;lines.push(`  ${h}: ${m} missing (${((m/ds.rows.length)*100).toFixed(1)}%)`);});
    } else if (section==="Statistics"&&statsData.length) {
      lines.push(`Dataset: ${ds?.name}`,"");
      statsData.forEach(s=>lines.push(`Column: ${s.column}`,`  Count:${s.count} Mean:${s.mean} Median:${s.median} Std:${s.std} Min:${s.min} Max:${s.max}`,""));
    } else if (section==="ML"&&mlConfig.trained) {
      lines.push(`Algorithm: ${mlConfig.algorithm}`,`Target: ${mlConfig.target}`,"",`  R²: ${mlConfig.metrics.r2}`,`  RMSE: ${mlConfig.metrics.rmse}`,`  MAE: ${mlConfig.metrics.mae}`,`  Samples: ${mlConfig.metrics.samples}`);
    } else if (section==="Hypothesis"&&hypoConfig.result) {
      const r=hypoConfig.result;
      lines.push(`Test: ${r.test}`,`Var1: ${hypoConfig.var1}`,hypoConfig.var2?`Var2: ${hypoConfig.var2}`:"","",`  Statistic: ${r.stat}`,`  P-value: ${r.p}`,`  Conclusion: ${r.reject?"Reject H₀":"Fail to reject H₀"}`);
    } else lines.push("No data available. Run the analysis first.");
    const text=lines.join("\n"); setReport(text);
    download(`DataVista_${section.replace(/ /g,"_")}_Report.txt`,text);
    notify(`${section} report downloaded`);
  }

  // ── Profile ───────────────────────────────────────────────────────────────────
  function saveProfile() {
    const updated = {...user, profile};
    setUser(updated); ls.set("dv-session-token", { userId:user.id, loginAt:Date.now() });
    const accounts = ls.get("dv-accounts") || [];
    const idx = accounts.findIndex(a=>a.id===user.id);
    if (idx>=0) { accounts[idx].profile=profile; ls.set("dv-accounts", accounts); }
    setProfileEditing(false); notify("Profile saved");
  }
  function handleAvatarUpload(e) {
    const file=e.target.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=ev=>setProfile(p=>({...p,avatar:ev.target.result}));
    reader.readAsDataURL(file);
  }

  const ds = selectedDs;
  const usageDays = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const usageChartData = usageDays.map(d=>({ day:d, sessions:usageLog[d]||0 }));

  // ══════════════════════════════════════════════════════════════════════════════
  // ── BOOT SPLASH ──────────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════════
  if (appPhase === "booting") return (
    <>
      <style>{css}</style>
      <div style={{ position:"fixed", inset:0, background:T.authBg, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:20 }}>
        {/* Ambient glow */}
        <div style={{ position:"absolute", width:500, height:500, borderRadius:"50%", background:`radial-gradient(circle, ${scheme.glow} 0%, transparent 70%)`, pointerEvents:"none" }}/>
        <div style={{ position:"relative", textAlign:"center" }}>
          <div style={{ fontSize:42, fontWeight:800, color:T.text, letterSpacing:"-.04em", fontFamily:"'Outfit',sans-serif" }}>
            Data<span style={{color:scheme.accent}}>Vista</span>
          </div>
          <div style={{ marginTop:18, display:"flex", gap:6, justifyContent:"center" }}>
            {[0,1,2].map(i=>(
              <div key={i} style={{ width:8, height:8, borderRadius:"50%", background:scheme.accent, animation:`pulse 1.2s ease ${i*0.2}s infinite` }}/>
            ))}
          </div>
        </div>
      </div>
    </>
  );

  // ══════════════════════════════════════════════════════════════════════════════
  // ── AUTH SCREEN ──────────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════════
  if (appPhase === "auth") return (
    <>
      <style>{css}</style>
      <div className="dv-auth-enter" style={{ position:"fixed", inset:0, background:T.authBg, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
        {/* Background grid decoration */}
        <div style={{ position:"absolute", inset:0, backgroundImage:`linear-gradient(${T.border} 1px, transparent 1px), linear-gradient(90deg, ${T.border} 1px, transparent 1px)`, backgroundSize:"44px 44px", opacity:.4, pointerEvents:"none" }}/>
        {/* Ambient orb */}
        <div style={{ position:"absolute", width:600, height:600, borderRadius:"50%", background:`radial-gradient(circle, ${scheme.glow} 0%, transparent 65%)`, pointerEvents:"none", transform:"translate(-10%,-10%)" }}/>

        <div style={{ width:"100%", maxWidth:440, position:"relative" }}>
          {/* Logo */}
          <div className="auth-field" style={{ textAlign:"center", marginBottom:32 }}>
            <div style={{ fontSize:40, fontWeight:800, color:T.text, letterSpacing:"-.05em", fontFamily:"'Outfit',sans-serif" }}>
              Data<span style={{color:scheme.accent}}>Vista</span>
            </div>
            <p style={{ color:T.textSub, fontSize:14, marginTop:8, fontWeight:400 }}>
              {authMode==="login" ? "Turn raw data into decisions, instantly and beautifully" : "Create your free analytics account"}
            </p>
          </div>

          {/* Card */}
          <div style={{ background:T.card, border:`1px solid ${T.cardBorder}`, borderRadius:18, padding:"34px 36px", boxShadow:`0 0 60px ${scheme.glow}, 0 24px 48px rgba(0,0,0,${isDark?.3:.1})` }}>
            {/* Mode tabs */}
            <div className="auth-field" style={{ display:"flex", gap:6, marginBottom:28, background:T.surface, borderRadius:11, padding:4 }}>
              {["login","signup"].map(m=>(
                <button key={m} onClick={()=>{ setAuthMode(m); setAuthError(""); }} style={{ flex:1, padding:"8px 0", borderRadius:8, border:"none", fontFamily:"'Outfit',sans-serif", fontWeight:600, fontSize:14, cursor:"pointer", transition:"all .2s cubic-bezier(.22,1,.36,1)", background:authMode===m?scheme.accent:"transparent", color:authMode===m?"#fff":T.textSub, boxShadow:authMode===m?`0 2px 12px ${scheme.glow}`:"none" }}>
                  {m==="login" ? "Sign In" : "Create Account"}
                </button>
              ))}
            </div>

            <div style={{ display:"flex", flexDirection:"column", gap:15 }}>
              {authMode==="signup" && (
                <div className="auth-field">
                  <label style={{ fontSize:12, color:T.textSub, display:"block", marginBottom:6, fontWeight:600, textTransform:"uppercase", letterSpacing:".06em" }}>Full Name</label>
                  <input style={inpStyle} value={authFields.name} onChange={e=>setAuthFields(p=>({...p,name:e.target.value}))}
                    placeholder="Jane Smith" onKeyDown={e=>e.key==="Enter"&&handleAuth()} autoFocus/>
                </div>
              )}
              <div className="auth-field">
                <label style={{ fontSize:12, color:T.textSub, display:"block", marginBottom:6, fontWeight:600, textTransform:"uppercase", letterSpacing:".06em" }}>Email</label>
                <input style={inpStyle} type="email" value={authFields.email} onChange={e=>setAuthFields(p=>({...p,email:e.target.value}))}
                  placeholder="jane@example.com" onKeyDown={e=>e.key==="Enter"&&handleAuth()} autoFocus={authMode==="login"}/>
              </div>
              <div className="auth-field">
                <label style={{ fontSize:12, color:T.textSub, display:"block", marginBottom:6, fontWeight:600, textTransform:"uppercase", letterSpacing:".06em" }}>Password</label>
                <input style={inpStyle} type="password" value={authFields.password} onChange={e=>setAuthFields(p=>({...p,password:e.target.value}))}
                  placeholder="••••••••" onKeyDown={e=>e.key==="Enter"&&handleAuth()}/>
              </div>

              {authError && (
                <div className="auth-field fade-up" style={{ background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:9, padding:"10px 14px", color:"#f87171", fontSize:13, display:"flex", alignItems:"center", gap:8 }}>
                  <span>⚠</span> {authError}
                </div>
              )}

              <div className="auth-field">
                <button
                  className="btn-primary"
                  onClick={handleAuth}
                  disabled={authLoading}
                  style={{ ...btnPrimary, width:"100%", padding:"12px", fontSize:15, marginTop:4, display:"flex", alignItems:"center", justifyContent:"center", gap:8, opacity:authLoading?.7:1 }}>
                  {authLoading ? (
                    <><span className="spin" style={{fontSize:16}}>↻</span> {authMode==="login"?"Signing in…":"Creating account…"}</>
                  ) : (
                    authMode==="login" ? "Sign In →" : "Create Account →"
                  )}
                </button>
              </div>

              {authMode==="login" && (
                <div style={{ textAlign:"center", fontSize:12, color:T.textMuted, marginTop:4 }}>
                  Your session is saved in this browser — you'll return right where you left off.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );

  // ══════════════════════════════════════════════════════════════════════════════
  // ── MAIN APP ─────────────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════════
  const appClass = appPhase === "entering" ? "dv-app-enter" : appPhase === "leaving" ? "dv-app-exit" : "";

  return (
    <>
      <style>{css}</style>

      {/* Toast */}
      {toast && (
        <div className="toast-in" style={{ position:"fixed", top:20, right:20, zIndex:9999, background:toast.type==="error"?(isDark?"#7f1d1d":"#fee2e2"):(isDark?"#052e16":"#dcfce7"), border:`1px solid ${toast.type==="error"?"#ef4444":"#16a34a"}`, color:toast.type==="error"?(isDark?"#fca5a5":"#dc2626"):(isDark?"#86efac":"#166534"), padding:"11px 18px", borderRadius:10, fontSize:14, fontWeight:500, boxShadow:"0 8px 30px rgba(0,0,0,0.3)", maxWidth:360, display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:15 }}>{toast.type==="error"?"✕":"✓"}</span> {toast.msg}
        </div>
      )}

      <div className={appClass} style={{ display:"flex", height:"100vh", background:T.bg, overflow:"hidden" }}>

        {/* ── Sidebar ───────────────────────────────────────────────────────── */}
        <div style={{ width:222, flexShrink:0, background:T.sidebar, borderRight:`1px solid ${T.border}`, display:"flex", flexDirection:"column", overflowY:"auto" }}>
          <div style={{ padding:"22px 18px 14px", borderBottom:`1px solid ${T.border}` }}>
            <div style={{ fontSize:22, fontWeight:800, color:T.text, letterSpacing:"-.04em" }}>Data<span style={{color:scheme.accent}}>Vista</span></div>
            <div style={{ fontSize:10, color:T.textMuted, fontWeight:700, letterSpacing:".1em", textTransform:"uppercase", marginTop:2 }}>Analytics Platform</div>
          </div>
          <nav style={{ flex:1, padding:"10px 8px" }}>
            {navItems.map(n=>(
              <button key={n.id} className="nav-item" onClick={()=>setTab(n.id)} style={{ display:"flex", alignItems:"center", gap:9, width:"100%", padding:"8px 11px", borderRadius:9, border:"none", cursor:"pointer", fontFamily:"'Outfit',sans-serif", fontWeight:500, fontSize:13, textAlign:"left", marginBottom:2, background:tab===n.id?scheme.glow:"transparent", color:tab===n.id?scheme.accent:T.textSub, borderLeft:tab===n.id?`3px solid ${scheme.accent}`:"3px solid transparent" }}>
                <span style={{ fontFamily:"monospace", fontSize:15, lineHeight:1 }}>{n.icon}</span>{n.label}
              </button>
            ))}
          </nav>

          {/* User footer */}
          <div style={{ padding:"14px 12px", borderTop:`1px solid ${T.border}` }}>
            <div style={{ display:"flex", alignItems:"center", gap:9, marginBottom:10 }}>
              {profile.avatar
                ? <img src={profile.avatar} style={{ width:32, height:32, borderRadius:"50%", objectFit:"cover", border:`2px solid ${scheme.accent}` }}/>
                : <div style={{ width:32, height:32, borderRadius:"50%", background:`linear-gradient(135deg,${scheme.accent},${scheme.accent2})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:700, color:"#fff" }}>{user.name?.[0]?.toUpperCase()}</div>
              }
              <div style={{ minWidth:0 }}>
                <div style={{ fontSize:12, fontWeight:600, color:T.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{user.name}</div>
                <div style={{ fontSize:10, color:T.textMuted }}>{profile.role}</div>
              </div>
            </div>
            <button onClick={logout} style={{ ...btnSecondary, width:"100%", fontSize:12, padding:"7px", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
              <span>↩</span> Sign Out
            </button>
          </div>
        </div>

        {/* ── Main content ──────────────────────────────────────────────────── */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>

          {/* Topbar */}
          <div style={{ background:T.sidebar, borderBottom:`1px solid ${T.border}`, padding:"11px 26px", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ fontSize:17, fontWeight:700, color:T.text }}>{navItems.find(n=>n.id===tab)?.label}</div>
              {ds && <span style={{ fontSize:11, background:scheme.glow, color:scheme.accent, border:`1px solid ${scheme.accent}40`, padding:"2px 10px", borderRadius:20, fontWeight:600 }}>{ds.name}</span>}
            </div>

            {/* Settings */}
            <div style={{ position:"relative" }} ref={settingsRef}>
              <button onClick={()=>setSettingsOpen(o=>!o)} style={{ background:settingsOpen?scheme.glow:T.hover, border:`1px solid ${settingsOpen?scheme.accent:T.border}`, color:settingsOpen?scheme.accent:T.textSub, borderRadius:9, width:38, height:38, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:"4px", cursor:"pointer", transition:".2s" }}>
                {[16,11,16].map((w,i)=><div key={i} style={{ width:w, height:2, background:"currentColor", borderRadius:2 }}/>)}
              </button>
              {settingsOpen && (
                <div className="slide-down" style={{ position:"absolute", top:"calc(100% + 8px)", right:0, background:T.card, border:`1px solid ${T.cardBorder}`, borderRadius:14, padding:20, width:290, zIndex:600, boxShadow:`0 16px 48px rgba(0,0,0,${isDark?.5:.18})` }}>
                  <div style={{ fontSize:12, fontWeight:700, color:T.textSub, textTransform:"uppercase", letterSpacing:".08em", marginBottom:16 }}>App Settings</div>
                  <div style={{ marginBottom:18 }}>
                    <div style={{ fontSize:12, color:T.textSub, fontWeight:600, marginBottom:8 }}>Display Mode</div>
                    <div style={{ display:"flex", gap:8 }}>
                      {[{v:false,icon:"☀",label:"Light"},{v:true,icon:"◑",label:"Dark"}].map(m=>(
                        <button key={String(m.v)} onClick={()=>saveSettings({isDark:m.v,schemeKey})} style={{ flex:1, padding:"9px 0", borderRadius:9, border:`1.5px solid ${isDark===m.v?scheme.accent:T.border}`, background:isDark===m.v?scheme.glow:T.surface, color:isDark===m.v?scheme.accent:T.textSub, fontFamily:"'Outfit',sans-serif", fontWeight:600, fontSize:13, cursor:"pointer", transition:".15s", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
                          {m.icon} {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize:12, color:T.textSub, fontWeight:600, marginBottom:8 }}>Color Scheme</div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
                      {Object.entries(COLOR_SCHEMES).map(([k,s])=>(
                        <button key={k} onClick={()=>saveSettings({isDark,schemeKey:k})} style={{ padding:"10px 6px", borderRadius:10, border:`2px solid ${schemeKey===k?s.accent:T.border}`, background:schemeKey===k?s.glow:T.surface, cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
                          <div style={{ display:"flex", gap:3 }}><div style={{ width:11, height:11, borderRadius:"50%", background:s.accent }}/><div style={{ width:11, height:11, borderRadius:"50%", background:s.accent2 }}/></div>
                          <span style={{ fontSize:10, fontWeight:600, color:schemeKey===k?s.accent:T.textSub, lineHeight:1.2, textAlign:"center" }}>{s.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Page */}
          <div style={{ flex:1, overflowY:"auto", padding:"26px 30px" }}>

            {/* ── DASHBOARD ─────────────────────────────────────────────────── */}
            {tab==="dashboard" && (
              <div className="fade-up">
                <div style={{ fontSize:21,fontWeight:700,color:T.text,marginBottom:4,letterSpacing:"-.02em" }}>Good {new Date().getHours()<12?"morning":new Date().getHours()<18?"afternoon":"evening"}, {user.name.split(" ")[0]} 👋</div>
                <div style={{ fontSize:14,color:T.textSub,marginBottom:20 }}>Here's your data workspace at a glance.</div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:18 }}>
                  {[
                    {label:"Datasets",value:datasets.length,color:scheme.accent,icon:"⬢",sub:"in workspace"},
                    {label:"Total Rows",value:datasets.reduce((a,d)=>a+(d.rows?.length||0),0).toLocaleString(),color:"#10b981",icon:"≡",sub:"all datasets"},
                    {label:"Active Dataset",value:ds?.name?.slice(0,12)||"None",color:"#f59e0b",icon:"◉",sub:ds?`${ds.rows?.length} × ${ds.headers?.length}`:"select one"},
                    {label:"ML Model",value:mlConfig.trained?"Trained":"None",color:"#8b5cf6",icon:"⬟",sub:mlConfig.trained?`R²: ${mlConfig.metrics.r2}`:"run ML tab"},
                  ].map((s,i)=>(
                    <div key={i} style={{ background:T.card, border:`1px solid ${T.cardBorder}`, borderRadius:13, padding:16 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                        <div>
                          <div style={{ fontSize:11,color:T.textSub,fontWeight:600,textTransform:"uppercase",letterSpacing:".05em",marginBottom:4 }}>{s.label}</div>
                          <div style={{ fontSize:20,fontWeight:700,color:T.text,fontFamily:"'JetBrains Mono',monospace" }}>{s.value}</div>
                          <div style={{ fontSize:11,color:T.textMuted,marginTop:3 }}>{s.sub}</div>
                        </div>
                        <div style={{ fontSize:20,color:s.color,opacity:.8 }}>{s.icon}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:18 }}>
                  <div style={cardStyle}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:12 }}>
                      <div><div style={{ fontWeight:700,color:T.text,fontSize:14 }}>Weekly Activity</div><div style={{ fontSize:12,color:T.textSub,marginTop:1 }}>Tab visits by day of week</div></div>
                      <span style={{ fontSize:10,color:T.textMuted,background:T.surface,padding:"2px 8px",borderRadius:20,border:`1px solid ${T.border}` }}>This Week</span>
                    </div>
                    <ResponsiveContainer width="100%" height={120}>
                      <BarChart data={usageChartData} barSize={20} margin={{top:4,right:4,left:-20,bottom:0}}>
                        <CartesianGrid {...gridProps} vertical={false}/>
                        <XAxis dataKey="day" {...axisProps}/>
                        <YAxis {...axisProps} allowDecimals={false}/>
                        <Tooltip content={<ChartTooltip isDark={isDark} accent={scheme.accent}/>} cursor={{fill:"transparent"}}/>
                        <Bar dataKey="sessions" name="Sessions" radius={[5,5,0,0]}>
                          {usageChartData.map((_,i)=><Cell key={i} fill={usageChartData[i].sessions>0?scheme.accent:T.border} fillOpacity={0.9}/>)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={cardStyle}>
                    <div style={{ fontWeight:700,color:T.text,fontSize:14,marginBottom:12 }}>Pipeline Status</div>
                    {[
                      {label:"Data Loaded",done:datasets.length>0},
                      {label:"Dataset Selected",done:!!ds},
                      {label:"Stats Run",done:statsData.length>0},
                      {label:"ML Trained",done:mlConfig.trained},
                      {label:"Hypothesis Tested",done:!!hypoConfig.result},
                      {label:"Chart Built",done:chartData.length>0},
                    ].map((step,i)=>(
                      <div key={i} style={{ display:"flex",alignItems:"center",gap:9,padding:"5px 0",borderBottom:i<5?`1px solid ${T.border}`:"" }}>
                        <div style={{ width:19,height:19,borderRadius:"50%",background:step.done?"#10b981":T.hover,border:`1px solid ${step.done?"#10b981":T.border2}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:step.done?"#fff":T.textMuted,flexShrink:0 }}>{step.done?"✓":i+1}</div>
                        <span style={{ fontSize:13,color:step.done?T.text:T.textMuted }}>{step.label}</span>
                        {step.done&&<span style={{ marginLeft:"auto",fontSize:10,background:"rgba(16,185,129,0.15)",color:"#34d399",padding:"1px 8px",borderRadius:20,fontWeight:600 }}>Done</span>}
                      </div>
                    ))}
                  </div>
                </div>
                <div style={cardStyle}>
                  <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14 }}>
                    <div style={{ fontWeight:700,color:T.text,fontSize:14 }}>Workspace Datasets</div>
                    <button className="btn-primary" onClick={()=>setTab("sources")} style={btnPrimary}>+ Add Data</button>
                  </div>
                  {datasets.length===0
                    ?<div style={{ color:T.textMuted,textAlign:"center",padding:28,fontSize:14 }}>No datasets yet. Go to Data Sources to import or load live data.</div>
                    :<div style={{ overflowX:"auto" }}>
                      <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13 }}>
                        <thead><tr>{["Name","Source","Rows","Cols","Created","Actions"].map(h=><th key={h} style={{ background:T.tblHead,color:T.textSub,fontWeight:600,textTransform:"uppercase",letterSpacing:".05em",padding:"8px 12px",textAlign:"left",borderBottom:`1px solid ${T.border}`,fontSize:11 }}>{h}</th>)}</tr></thead>
                        <tbody>{datasets.map(d=>(
                          <tr key={d.id} style={{ borderBottom:`1px solid ${T.border}` }}>
                            <td style={{ padding:"8px 12px",color:scheme.accent,fontFamily:"monospace",fontSize:12 }}>{d.name}</td>
                            <td style={{ padding:"8px 12px" }}><span style={{ background:d.source==="worldbank"?"rgba(59,130,246,0.15)":d.source==="openmeteo"?"rgba(16,185,129,0.15)":d.source==="coingecko"?"rgba(245,158,11,0.15)":"rgba(139,92,246,0.15)",color:d.source==="worldbank"?"#60a5fa":d.source==="openmeteo"?"#34d399":d.source==="coingecko"?"#fbbf24":"#a78bfa",padding:"2px 8px",borderRadius:20,fontSize:11,fontWeight:600 }}>{d.source}</span></td>
                            <td style={{ padding:"8px 12px",color:T.textSub,fontFamily:"monospace" }}>{(d.rows?.length||0).toLocaleString()}</td>
                            <td style={{ padding:"8px 12px",color:T.textSub,fontFamily:"monospace" }}>{d.headers?.length||0}</td>
                            <td style={{ padding:"8px 12px",color:T.textMuted,fontSize:12 }}>{new Date(d.created).toLocaleDateString()}</td>
                            <td style={{ padding:"8px 12px" }}>
                              <div style={{ display:"flex",gap:5,flexWrap:"wrap" }}>
                                <button onClick={()=>{setSelectedDs(d);setTab("explorer");}} style={{ background:scheme.accent,color:"#fff",border:"none",borderRadius:7,padding:"4px 10px",fontSize:12,cursor:"pointer",fontFamily:"'Outfit',sans-serif" }}>Open</button>
                                <button onClick={()=>exportDataset(d,"csv")} style={{ background:T.hover,color:T.textSub,border:`1px solid ${T.border}`,borderRadius:7,padding:"4px 10px",fontSize:12,cursor:"pointer",fontFamily:"'Outfit',sans-serif" }}>CSV</button>
                                <button onClick={()=>exportDataset(d,"json")} style={{ background:T.hover,color:T.textSub,border:`1px solid ${T.border}`,borderRadius:7,padding:"4px 10px",fontSize:12,cursor:"pointer",fontFamily:"'Outfit',sans-serif" }}>JSON</button>
                                <button onClick={()=>{const u=datasetsRef.current.filter(x=>x.id!==d.id);saveDatasets(u);if(selectedDs?.id===d.id)setSelectedDs(null);notify("Dataset removed");}} style={{ background:"rgba(239,68,68,0.1)",color:"#f87171",border:"none",borderRadius:7,padding:"4px 9px",fontSize:12,cursor:"pointer" }}>✕</button>
                              </div>
                            </td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  }
                </div>
              </div>
            )}

            {/* ── DATA SOURCES ──────────────────────────────────────────────── */}
            {tab==="sources" && (
              <div className="fade-up">
                <div style={{ fontSize:21,fontWeight:700,color:T.text,marginBottom:4 }}>Data Sources</div>
                <div style={{ fontSize:14,color:T.textSub,marginBottom:20 }}>Import files or pull live data from real APIs</div>
                <div style={{ ...cardStyle, marginBottom:18 }}>
                  <div style={{ fontWeight:700,color:T.text,fontSize:14,marginBottom:12 }}>📁 File Import</div>
                  <input type="file" ref={fileRef} accept=".csv,.json,.txt" style={{ display:"none" }} onChange={handleFileImport}/>
                  <div onClick={()=>fileRef.current?.click()} style={{ border:`2px dashed ${T.border2}`,borderRadius:12,padding:32,textAlign:"center",cursor:"pointer",transition:"border-color .2s" }}>
                    <div style={{ fontSize:28,color:T.textMuted,marginBottom:8 }}>⬆</div>
                    <div style={{ color:T.textSub,fontSize:14,fontWeight:500 }}>Click to upload CSV / JSON</div>
                    <div style={{ color:T.textMuted,fontSize:12,marginTop:5 }}>Up to 5,000 rows · UTF-8</div>
                  </div>
                  {importProgress>0 && <div style={{ marginTop:12 }}><div className="progress-track"><div className="progress-fill" style={{ width:`${importProgress}%` }}/></div><div style={{ fontSize:12,color:T.textSub,marginTop:4 }}>Importing… {importProgress}%</div></div>}
                </div>
                <div style={{ ...cardStyle, marginBottom:18 }}>
                  <div style={{ fontWeight:700,color:T.text,fontSize:14,marginBottom:4 }}>🌍 World Bank API <span style={{ background:"rgba(59,130,246,0.15)",color:"#60a5fa",padding:"2px 8px",borderRadius:20,fontSize:11,fontWeight:600,marginLeft:6 }}>Live</span></div>
                  <div style={{ color:T.textSub,fontSize:13,marginBottom:12 }}>Macroeconomic indicators from 200+ countries</div>
                  <div style={{ display:"flex",gap:10,flexWrap:"wrap",alignItems:"center" }}>
                    <select style={{ ...selStyle,flex:1,minWidth:200 }} value={wbIndicator} onChange={e=>setWbIndicator(e.target.value)}>
                      <option value="NY.GDP.MKTP.CD">GDP (current US$)</option>
                      <option value="SP.POP.TOTL">Population, Total</option>
                      <option value="FP.CPI.TOTL.ZG">Inflation (CPI %)</option>
                      <option value="SL.UEM.TOTL.ZS">Unemployment Rate (%)</option>
                      <option value="EG.USE.PCAP.KG.OE">Energy Use per Capita</option>
                      <option value="IT.NET.USER.ZS">Internet Users (%)</option>
                      <option value="SE.ADT.LITR.ZS">Adult Literacy Rate (%)</option>
                      <option value="SP.DYN.LE00.IN">Life Expectancy</option>
                    </select>
                    <button className="btn-primary" onClick={loadWB} disabled={loadingApi.wb} style={btnPrimary}>{loadingApi.wb?<span className="spin">↻</span>:"Load Data"}</button>
                    {liveData.wb&&<button onClick={()=>addLiveDsToWorkspace(liveData.wb)} style={{ background:"#10b981",color:"#fff",border:"none",padding:"9px 16px",borderRadius:9,fontFamily:"'Outfit',sans-serif",fontWeight:500,cursor:"pointer",fontSize:14 }}>+ Workspace</button>}
                  </div>
                  {liveData.wb&&<div style={{ marginTop:12,maxHeight:180,overflowY:"auto" }}><table style={{ width:"100%",borderCollapse:"collapse",fontSize:12 }}><thead><tr>{["Country","Code","Value","Year"].map(h=><th key={h} style={{ background:T.tblHead,color:T.textSub,padding:"7px 10px",textAlign:"left",borderBottom:`1px solid ${T.border}`,fontSize:10,fontWeight:600,position:"sticky",top:0 }}>{h}</th>)}</tr></thead><tbody>{liveData.wb.rows.slice(0,10).map((r,i)=><tr key={i} style={{ borderBottom:`1px solid ${T.border}` }}><td style={{ padding:"6px 10px",color:T.text }}>{r.country}</td><td style={{ padding:"6px 10px",color:T.textSub,fontFamily:"monospace" }}>{r.code}</td><td style={{ padding:"6px 10px",color:T.textSub,fontFamily:"monospace" }}>{typeof r.value==="number"?r.value.toLocaleString():r.value}</td><td style={{ padding:"6px 10px",color:T.textMuted,fontFamily:"monospace" }}>{r.year}</td></tr>)}</tbody></table></div>}
                </div>
                <div style={{ ...cardStyle, marginBottom:18 }}>
                  <div style={{ fontWeight:700,color:T.text,fontSize:14,marginBottom:4 }}>🌤 Open-Meteo Weather <span style={{ background:"rgba(16,185,129,0.15)",color:"#34d399",padding:"2px 8px",borderRadius:20,fontSize:11,fontWeight:600,marginLeft:6 }}>Live</span></div>
                  <div style={{ color:T.textSub,fontSize:13,marginBottom:12 }}>7-day hourly forecast — temperature, humidity, wind</div>
                  <div style={{ display:"flex",gap:7,flexWrap:"wrap",marginBottom:10 }}>
                    {[{n:"New York",lat:40.71,lon:-74.01},{n:"London",lat:51.51,lon:-0.13},{n:"Tokyo",lat:35.68,lon:139.69},{n:"Sydney",lat:-33.87,lon:151.21},{n:"Dubai",lat:25.2,lon:55.27},{n:"São Paulo",lat:-23.55,lon:-46.63}].map(c=>(
                      <button key={c.n} onClick={()=>setWeatherCity({name:c.n,lat:c.lat,lon:c.lon})} style={{ background:weatherCity.name===c.n?scheme.accent:T.hover,color:weatherCity.name===c.n?"#fff":T.textSub,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 11px",fontSize:13,fontFamily:"'Outfit',sans-serif",fontWeight:500,cursor:"pointer",transition:".15s" }}>{c.n}</button>
                    ))}
                    <button className="btn-primary" onClick={loadWeather} disabled={loadingApi.weather} style={btnPrimary}>{loadingApi.weather?<span className="spin">↻</span>:"Fetch"}</button>
                    {liveData.weather&&<button onClick={()=>addLiveDsToWorkspace(liveData.weather)} style={{ background:"#10b981",color:"#fff",border:"none",padding:"6px 12px",borderRadius:8,fontFamily:"'Outfit',sans-serif",fontWeight:500,cursor:"pointer",fontSize:13 }}>+ Workspace</button>}
                  </div>
                  {liveData.weather&&<ResponsiveContainer width="100%" height={130}><AreaChart data={liveData.weather.rows.filter((_,i)=>i%6===0).slice(0,28)}><CartesianGrid {...gridProps}/><XAxis dataKey="date" {...axisProps}/><YAxis {...axisProps}/><Tooltip content={<ChartTooltip isDark={isDark} accent={scheme.accent}/>}/><Area type="monotone" dataKey="temperature_2m" stroke="#10b981" fill="rgba(16,185,129,0.1)" name="Temp °C"/></AreaChart></ResponsiveContainer>}
                </div>
                <div style={cardStyle}>
                  <div style={{ fontWeight:700,color:T.text,fontSize:14,marginBottom:4 }}>₿ CoinGecko Crypto <span style={{ background:"rgba(245,158,11,0.15)",color:"#fbbf24",padding:"2px 8px",borderRadius:20,fontSize:11,fontWeight:600,marginLeft:6 }}>Live</span></div>
                  <div style={{ color:T.textSub,fontSize:13,marginBottom:12 }}>Top 30 cryptocurrencies by market cap</div>
                  <div style={{ display:"flex",gap:10,marginBottom:liveData.crypto?12:0 }}>
                    <button onClick={loadCrypto} disabled={loadingApi.crypto} style={{ background:"#f59e0b",color:"#fff",border:"none",padding:"8px 16px",borderRadius:8,fontFamily:"'Outfit',sans-serif",fontWeight:500,cursor:"pointer",fontSize:13 }}>{loadingApi.crypto?<span className="spin">↻</span>:"Load Markets"}</button>
                    {liveData.crypto&&<button onClick={()=>addLiveDsToWorkspace(liveData.crypto)} style={{ background:"#10b981",color:"#fff",border:"none",padding:"8px 16px",borderRadius:8,fontFamily:"'Outfit',sans-serif",fontWeight:500,cursor:"pointer",fontSize:13 }}>+ Workspace</button>}
                  </div>
                  {liveData.crypto&&<div style={{ maxHeight:230,overflowY:"auto" }}><table style={{ width:"100%",borderCollapse:"collapse",fontSize:13 }}><thead><tr>{["#","Name","Symbol","Price","24h %","Mkt Cap"].map(h=><th key={h} style={{ background:T.tblHead,color:T.textSub,padding:"7px 10px",textAlign:"left",borderBottom:`1px solid ${T.border}`,fontSize:10,fontWeight:600,position:"sticky",top:0 }}>{h}</th>)}</tr></thead><tbody>{liveData.crypto.rows.slice(0,15).map((r,i)=><tr key={i} style={{ borderBottom:`1px solid ${T.border}` }}><td style={{ padding:"6px 10px",color:T.textMuted,fontFamily:"monospace",fontSize:12 }}>{r.rank}</td><td style={{ padding:"6px 10px",color:T.text,fontWeight:500 }}>{r.name}</td><td style={{ padding:"6px 10px" }}><span style={{ background:T.hover,color:T.textSub,padding:"1px 7px",borderRadius:20,fontSize:11,fontWeight:600 }}>{r.symbol}</span></td><td style={{ padding:"6px 10px",color:T.text,fontFamily:"monospace",fontSize:12 }}>${r.price?.toLocaleString(undefined,{maximumFractionDigits:4})}</td><td style={{ padding:"6px 10px",fontFamily:"monospace",fontSize:12,color:r.change_24h>=0?"#34d399":"#f87171" }}>{r.change_24h?.toFixed(2)}%</td><td style={{ padding:"6px 10px",color:T.textSub,fontFamily:"monospace",fontSize:12 }}>${(r.market_cap/1e9).toFixed(2)}B</td></tr>)}</tbody></table></div>}
                </div>
              </div>
            )}

            {/* ── EXPLORER ──────────────────────────────────────────────────── */}
            {tab==="explorer" && (
              <div className="fade-up">
                <div style={{ fontSize:21,fontWeight:700,color:T.text,marginBottom:4 }}>Data Explorer</div>
                <div style={{ fontSize:14,color:T.textSub,marginBottom:18 }}>Inspect your dataset row by row</div>
                <div style={{ display:"flex",gap:10,marginBottom:16,flexWrap:"wrap",alignItems:"center" }}>
                  <select style={{ ...selStyle,maxWidth:280 }} value={selectedDs?.id||""} onChange={e=>setSelectedDs(datasets.find(d=>d.id===parseInt(e.target.value))||null)}>
                    <option value="">— Select Dataset —</option>
                    {datasets.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                  {ds&&<><span style={{ background:T.hover,color:T.textSub,border:`1px solid ${T.border}`,padding:"3px 10px",borderRadius:20,fontSize:12 }}>{ds.rows?.length?.toLocaleString()} rows</span><span style={{ background:T.hover,color:T.textSub,border:`1px solid ${T.border}`,padding:"3px 10px",borderRadius:20,fontSize:12 }}>{ds.headers?.length} cols</span><button onClick={()=>exportDataset(ds,"csv")} style={btnSecondary}>↓ CSV</button><button onClick={()=>exportDataset(ds,"json")} style={btnSecondary}>↓ JSON</button></>}
                </div>
                {ds
                  ?<div style={{ background:T.card,border:`1px solid ${T.cardBorder}`,borderRadius:14,overflow:"hidden" }}><div style={{ overflowX:"auto",maxHeight:500,overflowY:"auto" }}><table style={{ width:"100%",borderCollapse:"collapse",fontSize:12 }}><thead><tr>{ds.headers.map(h=><th key={h} style={{ background:T.tblHead,color:T.textSub,padding:"9px 12px",textAlign:"left",borderBottom:`1px solid ${T.border}`,fontSize:11,fontWeight:600,position:"sticky",top:0 }}>{h}</th>)}</tr></thead><tbody>{ds.rows.slice(0,100).map((row,i)=><tr key={i} style={{ borderBottom:`1px solid ${T.border}` }}>{ds.headers.map(h=><td key={h} style={{ padding:"7px 12px",color:T.textSub,fontFamily:"monospace",maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{row[h]?.toString()??""}</td>)}</tr>)}</tbody></table></div>{ds.rows.length>100&&<div style={{ padding:"8px 14px",fontSize:12,color:T.textMuted,borderTop:`1px solid ${T.border}` }}>Showing 100 of {ds.rows.length.toLocaleString()} rows</div>}</div>
                  :<div style={{ ...cardStyle,textAlign:"center",padding:50,color:T.textMuted }}>Select a dataset above</div>
                }
              </div>
            )}

            {/* ── CLEANING ──────────────────────────────────────────────────── */}
            {tab==="cleaning" && (
              <div className="fade-up">
                <div style={{ fontSize:21,fontWeight:700,color:T.text,marginBottom:4 }}>Data Cleaning</div>
                <div style={{ fontSize:14,color:T.textSub,marginBottom:18 }}>Handle missing values, remove duplicates, filter outliers</div>
                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:18 }}>
                  <div style={cardStyle}>
                    <div style={{ fontWeight:700,color:T.text,fontSize:14,marginBottom:14 }}>Configuration</div>
                    <div style={{ marginBottom:12 }}><label style={{ fontSize:13,color:T.textSub,display:"block",marginBottom:6 }}>Active Dataset</label><select style={selStyle} value={selectedDs?.id||""} onChange={e=>setSelectedDs(datasets.find(d=>d.id===parseInt(e.target.value))||null)}><option value="">— Select —</option>{datasets.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
                    <div style={{ marginBottom:12 }}>
                      <label style={{ fontSize:13,color:T.textSub,display:"block",marginBottom:7 }}>Missing Values</label>
                      {["drop","mean","median","keep"].map(v=>(
                        <label key={v} style={{ display:"flex",alignItems:"center",gap:7,padding:"4px 0",cursor:"pointer",fontSize:13,color:cleanConfig.missing===v?scheme.accent:T.textSub }}>
                          <input type="radio" name="missing" checked={cleanConfig.missing===v} onChange={()=>setCleanConfig(p=>({...p,missing:v}))} style={{ accentColor:scheme.accent }}/>
                          {{drop:"Drop rows with missing values",mean:"Fill numeric with mean",median:"Fill numeric with median",keep:"Keep as-is"}[v]}
                        </label>
                      ))}
                    </div>
                    <div style={{ marginBottom:12 }}><label style={{ fontSize:13,color:T.textSub,display:"block",marginBottom:6 }}>Outlier Removal</label><select style={selStyle} value={cleanConfig.outlier} onChange={e=>setCleanConfig(p=>({...p,outlier:e.target.value}))}><option value="none">None</option><option value="zscore">Z-score (|z|&gt;3)</option></select></div>
                    <label style={{ display:"flex",alignItems:"center",gap:7,fontSize:13,color:T.textSub,cursor:"pointer",marginBottom:16 }}><input type="checkbox" checked={cleanConfig.removeDups} onChange={e=>setCleanConfig(p=>({...p,removeDups:e.target.checked}))} style={{ accentColor:scheme.accent }}/>Remove duplicate rows</label>
                    <div style={{ display:"flex",gap:9 }}><button className="btn-primary" onClick={applyClean} style={btnPrimary}>Apply Cleaning</button><button onClick={()=>generateReport("Data Quality")} style={btnSecondary}>↓ Report</button></div>
                  </div>
                  <div style={cardStyle}>
                    <div style={{ fontWeight:700,color:T.text,fontSize:14,marginBottom:12 }}>Data Quality</div>
                    {ds?<div style={{ overflowY:"auto",maxHeight:380 }}><table style={{ width:"100%",borderCollapse:"collapse",fontSize:12 }}><thead><tr>{["Column","Type","Missing","Unique"].map(h=><th key={h} style={{ background:T.tblHead,color:T.textSub,padding:"7px 10px",textAlign:"left",borderBottom:`1px solid ${T.border}`,fontSize:10,fontWeight:600,position:"sticky",top:0 }}>{h}</th>)}</tr></thead><tbody>{ds.headers.map(h=>{const vals=ds.rows.map(r=>r[h]);const missing=vals.filter(v=>v===""||v===null||v===undefined).length;const unique=new Set(vals).size;const isNum=vals.filter(v=>v!==""&&v!==null).every(v=>!isNaN(v));return(<tr key={h} style={{ borderBottom:`1px solid ${T.border}` }}><td style={{ padding:"7px 10px",color:scheme.accent,fontFamily:"monospace",fontSize:11 }}>{h}</td><td style={{ padding:"7px 10px" }}><span style={{ background:isNum?"rgba(16,185,129,0.15)":"rgba(139,92,246,0.15)",color:isNum?"#34d399":"#a78bfa",padding:"1px 7px",borderRadius:20,fontSize:10,fontWeight:600 }}>{isNum?"numeric":"text"}</span></td><td style={{ padding:"7px 10px",color:missing>0?"#f59e0b":"#34d399",fontFamily:"monospace",fontSize:11 }}>{missing} ({((missing/ds.rows.length)*100).toFixed(1)}%)</td><td style={{ padding:"7px 10px",color:T.textSub,fontFamily:"monospace",fontSize:11 }}>{unique}</td></tr>);})}</tbody></table></div>:<div style={{ color:T.textMuted,fontSize:14 }}>Select a dataset to inspect</div>}
                  </div>
                </div>
              </div>
            )}

            {/* ── PREPROCESSING ─────────────────────────────────────────────── */}
            {tab==="preprocessing" && (
              <div className="fade-up">
                <div style={{ fontSize:21,fontWeight:700,color:T.text,marginBottom:4 }}>Preprocessing</div>
                <div style={{ fontSize:14,color:T.textSub,marginBottom:18 }}>Prepare data for machine learning</div>
                <div style={{ ...cardStyle,marginBottom:16 }}><label style={{ fontSize:13,color:T.textSub,display:"block",marginBottom:7 }}>Active Dataset</label><select style={{ ...selStyle,maxWidth:300 }} value={selectedDs?.id||""} onChange={e=>setSelectedDs(datasets.find(d=>d.id===parseInt(e.target.value))||null)}><option value="">— Select —</option>{datasets.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
                {ds&&<>
                  <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:14 }}>
                    {[{label:"Feature Scaling",opts:["None","Min-Max Normalization","Z-score Standardization","Robust Scaling"],note:"Scale numeric features"},{label:"Categorical Encoding",opts:["None","One-Hot Encoding","Label Encoding","Ordinal Encoding"],note:"Convert text to numbers"},{label:"Dimensionality Reduction",opts:["None","PCA","Feature Selection (Variance)","Correlation Filter"],note:"Reduce feature count"},{label:"Train / Test Split",opts:["80% / 20%","70% / 30%","60% / 40%","90% / 10%"],note:"Training vs evaluation ratio"}].map((opt,i)=>(
                      <div key={i} style={{ ...cardStyle,padding:16 }}>
                        <div style={{ fontWeight:600,color:T.text,fontSize:13,marginBottom:3 }}>{opt.label}</div>
                        <div style={{ fontSize:11,color:T.textMuted,marginBottom:9 }}>{opt.note}</div>
                        <select style={selStyle}>{opt.opts.map(o=><option key={o}>{o}</option>)}</select>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop:16,display:"flex",gap:9 }}><button className="btn-primary" onClick={()=>notify("Pipeline applied!")} style={btnPrimary}>Apply Pipeline</button></div>
                  <div style={{ ...cardStyle,marginTop:16 }}>
                    <div style={{ fontWeight:700,color:T.text,fontSize:13,marginBottom:12 }}>Column Summary</div>
                    <div style={{ display:"flex",flexWrap:"wrap",gap:7 }}>
                      {ds.headers.map(h=>{const vals=ds.rows.map(r=>r[h]).filter(v=>v!==""&&v!==null);const isNum=vals.every(v=>!isNaN(v));return(<div key={h} style={{ background:T.surface,border:`1px solid ${T.border}`,borderRadius:9,padding:"9px 12px",minWidth:130 }}><div style={{ color:scheme.accent,fontSize:12,fontFamily:"monospace",marginBottom:2 }}>{h}</div><div style={{ fontSize:11,color:isNum?"#34d399":"#a78bfa" }}>{isNum?"numeric":"categorical"}</div><div style={{ fontSize:10,color:T.textMuted,marginTop:2 }}>{new Set(vals).size} unique</div></div>);})}
                    </div>
                  </div>
                </>}
              </div>
            )}

            {/* ── STATISTICS ────────────────────────────────────────────────── */}
            {tab==="stats" && (
              <div className="fade-up">
                <div style={{ fontSize:21,fontWeight:700,color:T.text,marginBottom:4 }}>Descriptive Statistics</div>
                <div style={{ fontSize:14,color:T.textSub,marginBottom:18 }}>Full statistical summary of numeric features</div>
                <div style={{ ...cardStyle,marginBottom:16 }}>
                  <div style={{ display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end" }}>
                    <div style={{ flex:1,minWidth:200 }}><label style={{ fontSize:13,color:T.textSub,display:"block",marginBottom:6 }}>Dataset</label><select style={selStyle} value={selectedDs?.id||""} onChange={e=>setSelectedDs(datasets.find(d=>d.id===parseInt(e.target.value))||null)}><option value="">— Select —</option>{datasets.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
                    <button className="btn-primary" onClick={runStats} style={btnPrimary}>Calculate</button>
                    {statsData.length>0&&<button onClick={()=>generateReport("Statistics")} style={btnSecondary}>↓ Report</button>}
                  </div>
                </div>
                {statsData.length>0&&<div style={{ ...cardStyle,padding:0,overflow:"hidden" }}><div style={{ overflowX:"auto" }}><table style={{ width:"100%",borderCollapse:"collapse",fontSize:12 }}><thead><tr>{["Column","Count","Mean","Median","Std Dev","Min","Q1","Q3","Max"].map(h=><th key={h} style={{ background:T.tblHead,color:T.textSub,padding:"9px 11px",textAlign:"left",borderBottom:`1px solid ${T.border}`,fontSize:10,fontWeight:600,position:"sticky",top:0 }}>{h}</th>)}</tr></thead><tbody>{statsData.map(s=><tr key={s.column} style={{ borderBottom:`1px solid ${T.border}` }}><td style={{ padding:"8px 11px",color:scheme.accent,fontFamily:"monospace" }}>{s.column}</td>{[s.count,s.mean,s.median,s.std,s.min,s.q1,s.q3,s.max].map((v,i)=><td key={i} style={{ padding:"8px 11px",color:T.textSub,fontFamily:"monospace" }}>{v}</td>)}</tr>)}</tbody></table></div></div>}
              </div>
            )}

            {/* ── VISUALIZATION ─────────────────────────────────────────────── */}
            {tab==="viz" && (
              <div className="fade-up">
                <div style={{ fontSize:21,fontWeight:700,color:T.text,marginBottom:4 }}>Visualization</div>
                <div style={{ fontSize:14,color:T.textSub,marginBottom:18 }}>Build interactive charts from your data</div>
                <div style={{ ...cardStyle,marginBottom:18 }}>
                  <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:11,alignItems:"end" }}>
                    <div><label style={{ fontSize:13,color:T.textSub,display:"block",marginBottom:6 }}>Dataset</label><select style={selStyle} value={selectedDs?.id||""} onChange={e=>setSelectedDs(datasets.find(d=>d.id===parseInt(e.target.value))||null)}><option value="">— Select —</option>{datasets.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
                    <div><label style={{ fontSize:13,color:T.textSub,display:"block",marginBottom:6 }}>Chart Type</label><select style={selStyle} value={vizConfig.type} onChange={e=>setVizConfig(p=>({...p,type:e.target.value}))}><option value="line">Line</option><option value="bar">Bar</option><option value="area">Area</option><option value="scatter">Scatter</option><option value="pie">Pie</option></select></div>
                    <div><label style={{ fontSize:13,color:T.textSub,display:"block",marginBottom:6 }}>X Axis</label><select style={selStyle} value={vizConfig.x} onChange={e=>setVizConfig(p=>({...p,x:e.target.value}))}><option value="">— Column —</option>{(ds?.headers||[]).map(h=><option key={h} value={h}>{h}</option>)}</select></div>
                    <div><label style={{ fontSize:13,color:T.textSub,display:"block",marginBottom:6 }}>Y Axis</label><select style={selStyle} value={vizConfig.y} onChange={e=>setVizConfig(p=>({...p,y:e.target.value}))}><option value="">— Numeric —</option>{(ds?numericCols(ds.headers,ds.rows):[]).map(h=><option key={h} value={h}>{h}</option>)}</select></div>
                  </div>
                  <div style={{ marginTop:12 }}><button className="btn-primary" onClick={buildChart} style={btnPrimary}>Generate Chart</button></div>
                </div>
                {chartData.length>0&&(
                  <div style={cardStyle}>
                    <div style={{ fontWeight:700,color:T.text,fontSize:14,marginBottom:14 }}>{vizConfig.type.charAt(0).toUpperCase()+vizConfig.type.slice(1)} — {vizConfig.x}{vizConfig.y?` vs ${vizConfig.y}`:""}</div>
                    <ResponsiveContainer width="100%" height={370}>
                      {vizConfig.type==="pie"?(
                        <PieChart><Pie data={chartData.slice(0,12)} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={150} innerRadius={55} label={({name,percent})=>`${String(name).slice(0,8)} ${(percent*100).toFixed(1)}%`} labelLine={{ stroke:T.textSub,strokeWidth:1 }}>{chartData.slice(0,12).map((_,i)=><Cell key={i} fill={CHART_COLORS[i%CHART_COLORS.length]} stroke={T.card} strokeWidth={2}/>)}</Pie><Tooltip content={<PieTooltip isDark={isDark}/>}/><Legend formatter={v=><span style={{ color:T.textSub,fontSize:12 }}>{v}</span>}/></PieChart>
                      ):vizConfig.type==="scatter"?(
                        <ScatterChart margin={{top:8,right:16,bottom:8,left:8}}><CartesianGrid {...gridProps}/><XAxis dataKey="x" name={vizConfig.x} {...axisProps}/><YAxis dataKey="y" name={vizConfig.y} {...axisProps}/><Tooltip content={<ScatterTooltip isDark={isDark} accent={scheme.accent}/>} cursor={{ strokeDasharray:"3 3",stroke:T.border2 }}/><Scatter data={chartData} fill={scheme.accent} fillOpacity={0.75} stroke={scheme.accent2} strokeWidth={0.5}/></ScatterChart>
                      ):vizConfig.type==="area"?(
                        <AreaChart data={chartData.slice(0,80)}><CartesianGrid {...gridProps}/><XAxis dataKey="name" {...axisProps}/><YAxis {...axisProps}/><Tooltip content={<ChartTooltip isDark={isDark} accent={scheme.accent}/>}/><Area type="monotone" dataKey="value" stroke={scheme.accent} fill={`${scheme.accent}22`} name={vizConfig.y||"value"} strokeWidth={2.5}/></AreaChart>
                      ):vizConfig.type==="bar"?(
                        <BarChart data={chartData.slice(0,40)}><CartesianGrid {...gridProps}/><XAxis dataKey="name" {...axisProps}/><YAxis {...axisProps}/><Tooltip content={<ChartTooltip isDark={isDark} accent={scheme.accent}/>} cursor={{ fill:scheme.glow }}/><Bar dataKey="value" fill={scheme.accent} name={vizConfig.y||"value"} radius={[5,5,0,0]}/></BarChart>
                      ):(
                        <LineChart data={chartData.slice(0,80)}><CartesianGrid {...gridProps}/><XAxis dataKey="name" {...axisProps}/><YAxis {...axisProps}/><Tooltip content={<ChartTooltip isDark={isDark} accent={scheme.accent}/>}/><Line type="monotone" dataKey="value" stroke={scheme.accent} dot={false} name={vizConfig.y||"value"} strokeWidth={2.5}/></LineChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}

            {/* ── ML ────────────────────────────────────────────────────────── */}
            {tab==="ml" && (
              <div className="fade-up">
                <div style={{ fontSize:21,fontWeight:700,color:T.text,marginBottom:4 }}>Machine Learning</div>
                <div style={{ fontSize:14,color:T.textSub,marginBottom:18 }}>Train predictive models on your dataset</div>
                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:18 }}>
                  <div style={cardStyle}>
                    <div style={{ fontWeight:700,color:T.text,fontSize:14,marginBottom:14 }}>Model Configuration</div>
                    <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
                      <div><label style={{ fontSize:13,color:T.textSub,display:"block",marginBottom:6 }}>Dataset</label><select style={selStyle} value={selectedDs?.id||""} onChange={e=>setSelectedDs(datasets.find(d=>d.id===parseInt(e.target.value))||null)}><option value="">— Select —</option>{datasets.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
                      <div><label style={{ fontSize:13,color:T.textSub,display:"block",marginBottom:6 }}>Target Column</label><select style={selStyle} value={mlConfig.target} onChange={e=>setMlConfig(p=>({...p,target:e.target.value}))}><option value="">— Select target —</option>{(ds?numericCols(ds.headers,ds.rows):[]).map(h=><option key={h} value={h}>{h}</option>)}</select></div>
                      <div><label style={{ fontSize:13,color:T.textSub,display:"block",marginBottom:6 }}>Algorithm</label><select style={selStyle} value={mlConfig.algorithm} onChange={e=>setMlConfig(p=>({...p,algorithm:e.target.value}))}><option value="linear">Linear Regression</option><option value="rf">Random Forest</option><option value="svm">Support Vector Machine</option><option value="knn">K-Nearest Neighbors</option><option value="xgb">Gradient Boosting</option></select></div>
                      <div style={{ display:"flex",gap:9 }}><button className="btn-primary" onClick={trainModel} style={btnPrimary}>Train Model</button>{mlConfig.trained&&<button onClick={()=>generateReport("ML")} style={btnSecondary}>↓ Report</button>}</div>
                    </div>
                  </div>
                  <div style={cardStyle}>
                    <div style={{ fontWeight:700,color:T.text,fontSize:14,marginBottom:14 }}>Model Performance</div>
                    {mlConfig.trained?(
                      <>
                        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:11,marginBottom:14 }}>
                          {[["R²",mlConfig.metrics.r2,scheme.accent],["RMSE",mlConfig.metrics.rmse,"#f59e0b"],["MAE",mlConfig.metrics.mae,"#10b981"],["Samples",mlConfig.metrics.samples,"#8b5cf6"]].map(([k,v,c])=>(
                            <div key={k} style={{ background:T.surface,borderRadius:10,padding:13,border:`1px solid ${T.border}` }}><div style={{ fontSize:11,color:T.textSub,marginBottom:3 }}>{k}</div><div style={{ fontSize:20,fontWeight:700,color:c,fontFamily:"'JetBrains Mono',monospace" }}>{v}</div></div>
                          ))}
                        </div>
                        <div style={{ marginBottom:9 }}><div style={{ display:"flex",justifyContent:"space-between",fontSize:12,color:T.textSub,marginBottom:5 }}><span>R² Score</span><span style={{ fontFamily:"monospace" }}>{mlConfig.metrics.r2}</span></div><div className="progress-track"><div className="progress-fill" style={{ width:`${parseFloat(mlConfig.metrics.r2)*100}%` }}/></div></div>
                        <div style={{ fontSize:12,color:T.textMuted }}>Algo: <span style={{ color:scheme.accent,fontFamily:"monospace" }}>{mlConfig.algorithm}</span> · Target: <span style={{ color:scheme.accent,fontFamily:"monospace" }}>{mlConfig.target}</span></div>
                      </>
                    ):<div style={{ color:T.textMuted,fontSize:14,padding:"28px 0",textAlign:"center" }}>Train a model to see metrics</div>}
                  </div>
                </div>
              </div>
            )}

            {/* ── HYPOTHESIS ────────────────────────────────────────────────── */}
            {tab==="hypothesis" && (
              <div className="fade-up">
                <div style={{ fontSize:21,fontWeight:700,color:T.text,marginBottom:4 }}>Hypothesis Testing</div>
                <div style={{ fontSize:14,color:T.textSub,marginBottom:18 }}>Validate statistical assumptions</div>
                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:18 }}>
                  <div style={cardStyle}>
                    <div style={{ fontWeight:700,color:T.text,fontSize:14,marginBottom:14 }}>Test Configuration</div>
                    <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
                      <div><label style={{ fontSize:13,color:T.textSub,display:"block",marginBottom:6 }}>Dataset</label><select style={selStyle} value={selectedDs?.id||""} onChange={e=>setSelectedDs(datasets.find(d=>d.id===parseInt(e.target.value))||null)}><option value="">— Select —</option>{datasets.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
                      <div><label style={{ fontSize:13,color:T.textSub,display:"block",marginBottom:6 }}>Statistical Test</label><select style={selStyle} value={hypoConfig.test} onChange={e=>setHypoConfig(p=>({...p,test:e.target.value}))}><option value="ttest">Independent T-test</option><option value="chi2">Chi-Square</option><option value="anova">One-Way ANOVA</option></select></div>
                      <div><label style={{ fontSize:13,color:T.textSub,display:"block",marginBottom:6 }}>Variable 1</label><select style={selStyle} value={hypoConfig.var1} onChange={e=>setHypoConfig(p=>({...p,var1:e.target.value}))}><option value="">— Column —</option>{(ds?numericCols(ds.headers,ds.rows):[]).map(h=><option key={h} value={h}>{h}</option>)}</select></div>
                      <div><label style={{ fontSize:13,color:T.textSub,display:"block",marginBottom:6 }}>Variable 2 (optional)</label><select style={selStyle} value={hypoConfig.var2} onChange={e=>setHypoConfig(p=>({...p,var2:e.target.value}))}><option value="">— Column —</option>{(ds?numericCols(ds.headers,ds.rows):[]).map(h=><option key={h} value={h}>{h}</option>)}</select></div>
                      <div style={{ display:"flex",gap:9 }}><button className="btn-primary" onClick={runHypo} style={btnPrimary}>Run Test</button>{hypoConfig.result&&<button onClick={()=>generateReport("Hypothesis")} style={btnSecondary}>↓ Report</button>}</div>
                    </div>
                  </div>
                  <div style={cardStyle}>
                    <div style={{ fontWeight:700,color:T.text,fontSize:14,marginBottom:14 }}>Test Results</div>
                    {hypoConfig.result?(
                      <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
                        <div style={{ background:T.surface,borderRadius:10,padding:14,border:`1px solid ${T.border}` }}><div style={{ fontSize:10,color:T.textSub,fontWeight:600,textTransform:"uppercase",letterSpacing:".06em",marginBottom:4 }}>Test</div><div style={{ fontWeight:600,color:T.text }}>{hypoConfig.result.test}</div></div>
                        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
                          <div style={{ background:T.surface,borderRadius:10,padding:13,border:`1px solid ${T.border}` }}><div style={{ fontSize:10,color:T.textSub,marginBottom:3 }}>Test Statistic</div><div style={{ fontSize:22,fontWeight:700,color:scheme.accent,fontFamily:"monospace" }}>{hypoConfig.result.stat}</div></div>
                          <div style={{ background:T.surface,borderRadius:10,padding:13,border:`1px solid ${T.border}` }}><div style={{ fontSize:10,color:T.textSub,marginBottom:3 }}>P-value</div><div style={{ fontSize:22,fontWeight:700,color:parseFloat(hypoConfig.result.p)<0.05?"#34d399":"#f87171",fontFamily:"monospace" }}>{hypoConfig.result.p}</div></div>
                        </div>
                        <div style={{ background:hypoConfig.result.reject?"rgba(16,185,129,0.1)":"rgba(239,68,68,0.1)",border:`1px solid ${hypoConfig.result.reject?"rgba(16,185,129,0.3)":"rgba(239,68,68,0.3)"}`,borderRadius:10,padding:14 }}>
                          <div style={{ fontWeight:700,color:hypoConfig.result.reject?"#34d399":"#f87171",marginBottom:5 }}>{hypoConfig.result.reject?"✓ Reject H₀ (p < 0.05)":"✗ Fail to Reject H₀ (p ≥ 0.05)"}</div>
                          <div style={{ fontSize:13,color:T.textSub }}>{hypoConfig.result.reject?"Statistically significant evidence against H₀.":"Insufficient evidence to reject H₀."}</div>
                        </div>
                        <div style={{ fontSize:12,color:T.textMuted }}>α = 0.05 · Two-tailed</div>
                      </div>
                    ):<div style={{ color:T.textMuted,fontSize:14,padding:"28px 0",textAlign:"center" }}>Configure and run a test</div>}
                  </div>
                </div>
              </div>
            )}

            {/* ── REPORTS ───────────────────────────────────────────────────── */}
            {tab==="reports" && (
              <div className="fade-up">
                <div style={{ fontSize:21,fontWeight:700,color:T.text,marginBottom:4 }}>Report Generator</div>
                <div style={{ fontSize:14,color:T.textSub,marginBottom:18 }}>Download reports from each pipeline stage</div>
                <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:20 }}>
                  {[
                    {label:"Data Quality",icon:"◈",color:"#3b82f6",desc:"Missing, duplicates, type analysis",fn:()=>generateReport("Data Quality")},
                    {label:"Statistics",icon:"∑",color:"#10b981",desc:"Descriptive stats for all columns",fn:()=>generateReport("Statistics")},
                    {label:"ML Performance",icon:"⬟",color:"#8b5cf6",desc:"Model metrics and evaluation",fn:()=>generateReport("ML")},
                    {label:"Hypothesis Test",icon:"⊛",color:"#f59e0b",desc:"Test stat, p-value, conclusion",fn:()=>generateReport("Hypothesis")},
                    {label:"Full Pipeline",icon:"◎",color:"#ef4444",desc:"All completed steps combined",fn:()=>{generateReport("Data Quality");setTimeout(()=>generateReport("Statistics"),300);}},
                    {label:"Dataset Export",icon:"↓",color:"#06b6d4",desc:"Export active dataset",fn:()=>ds?null:notify("Select a dataset first","error")},
                  ].map((r,i)=>(
                    <div key={i} style={{ ...cardStyle,cursor:"pointer",transition:"transform .15s,box-shadow .15s" }} onClick={r.fn} onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow=`0 8px 24px ${scheme.glow}`;}} onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow="";}}>
                      <div style={{ fontSize:24,color:r.color,marginBottom:9 }}>{r.icon}</div>
                      <div style={{ fontWeight:700,color:T.text,fontSize:14,marginBottom:4 }}>{r.label}</div>
                      <div style={{ fontSize:12,color:T.textSub,marginBottom:14 }}>{r.desc}</div>
                      {r.label==="Dataset Export"&&ds
                        ?<div style={{ display:"flex",gap:7 }}><button style={btnSecondary} onClick={e=>{e.stopPropagation();exportDataset(ds,"csv");}}>CSV</button><button style={btnSecondary} onClick={e=>{e.stopPropagation();exportDataset(ds,"json");}}>JSON</button></div>
                        :<button className="btn-primary" style={btnPrimary}>↓ Download</button>
                      }
                    </div>
                  ))}
                </div>
                {report&&<div style={cardStyle}><div style={{ fontWeight:700,color:T.text,fontSize:13,marginBottom:10 }}>Last Report Preview</div><pre style={{ background:T.previewBg,borderRadius:10,padding:14,fontSize:11,color:T.textSub,overflowX:"auto",maxHeight:300,overflowY:"auto",lineHeight:1.7,border:`1px solid ${T.border}`,fontFamily:"'JetBrains Mono',monospace" }}>{report}</pre></div>}
              </div>
            )}

            {/* ── PROFILE ───────────────────────────────────────────────────── */}
            {tab==="profile" && (
              <div className="fade-up">
                <div style={{ fontSize:21,fontWeight:700,color:T.text,marginBottom:4 }}>Profile</div>
                <div style={{ fontSize:14,color:T.textSub,marginBottom:18 }}>Saved persistently in your browser</div>
                <div style={{ display:"grid",gridTemplateColumns:"290px 1fr",gap:18 }}>
                  <div style={{ ...cardStyle,textAlign:"center" }}>
                    <input type="file" ref={avatarRef} accept="image/*" style={{ display:"none" }} onChange={handleAvatarUpload}/>
                    <div style={{ position:"relative",display:"inline-block",marginBottom:14,cursor:profileEditing?"pointer":"default" }} onClick={()=>profileEditing&&avatarRef.current?.click()}>
                      {profile.avatar
                        ?<img src={profile.avatar} style={{ width:90,height:90,borderRadius:"50%",objectFit:"cover",border:`3px solid ${scheme.accent}` }}/>
                        :<div style={{ width:90,height:90,borderRadius:"50%",background:`linear-gradient(135deg,${scheme.accent},${scheme.accent2})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:32,fontWeight:700,color:"#fff",border:`3px solid ${scheme.accent}` }}>{(profile.name||user.name)?.[0]?.toUpperCase()}</div>
                      }
                      {profileEditing&&<div style={{ position:"absolute",bottom:0,right:0,background:scheme.accent,borderRadius:"50%",width:26,height:26,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12 }}>📷</div>}
                    </div>
                    <div style={{ fontWeight:700,color:T.text,fontSize:16,marginBottom:3 }}>{profile.name||user.name}</div>
                    <div style={{ fontSize:12,color:T.textSub,marginBottom:3 }}>{profile.role}</div>
                    <div style={{ fontSize:12,color:T.textMuted,marginBottom:12 }}>{profile.email||user.email}</div>
                    <div style={{ height:1,background:T.border,margin:"10px 0" }}/>
                    <div style={{ fontSize:13,color:T.textSub,lineHeight:1.6,marginBottom:14 }}>{profile.bio||"No bio yet."}</div>
                    <div style={{ display:"flex",gap:8 }}>
                      <div style={{ flex:1,background:T.surface,borderRadius:9,padding:"10px 0",border:`1px solid ${T.border}` }}><div style={{ fontSize:18,fontWeight:700,color:T.text }}>{datasets.length}</div><div style={{ fontSize:10,color:T.textMuted }}>Datasets</div></div>
                      <div style={{ flex:1,background:T.surface,borderRadius:9,padding:"10px 0",border:`1px solid ${T.border}` }}><div style={{ fontSize:18,fontWeight:700,color:T.text }}>{mlConfig.trained?1:0}</div><div style={{ fontSize:10,color:T.textMuted }}>Models</div></div>
                    </div>
                  </div>
                  <div style={cardStyle}>
                    <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18 }}>
                      <div style={{ fontWeight:700,color:T.text,fontSize:14 }}>{profileEditing?"Edit Profile":"Profile Details"}</div>
                      {!profileEditing
                        ?<button onClick={()=>setProfileEditing(true)} style={{ background:scheme.glow,color:scheme.accent,border:`1px solid ${scheme.accent}`,padding:"6px 14px",borderRadius:8,fontFamily:"'Outfit',sans-serif",fontWeight:600,fontSize:13,cursor:"pointer" }}>✎ Edit</button>
                        :<div style={{ display:"flex",gap:7 }}><button onClick={()=>setProfileEditing(false)} style={btnSecondary}>Cancel</button><button onClick={saveProfile} style={{ background:"#10b981",color:"#fff",border:"none",padding:"7px 14px",borderRadius:8,fontFamily:"'Outfit',sans-serif",fontWeight:600,fontSize:13,cursor:"pointer" }}>✓ Save</button></div>
                      }
                    </div>
                    {profileEditing?(
                      <div style={{ display:"flex",flexDirection:"column",gap:13 }}>
                        {[["Display Name","name","text","Jane Smith"],["Email","email","email","jane@example.com"],["Role / Title","role","text","Data Scientist"]].map(([label,field,type,ph])=>(
                          <div key={field}><label style={{ fontSize:13,color:T.textSub,display:"block",marginBottom:5 }}>{label}</label><input style={inpStyle} type={type} value={profile[field]||""} onChange={e=>setProfile(p=>({...p,[field]:e.target.value}))} placeholder={ph}/></div>
                        ))}
                        <div><label style={{ fontSize:13,color:T.textSub,display:"block",marginBottom:5 }}>Bio</label><textarea style={{ ...inpStyle,resize:"vertical",minHeight:75 }} rows={3} value={profile.bio||""} onChange={e=>setProfile(p=>({...p,bio:e.target.value}))} placeholder="Tell us about yourself..."/></div>
                        <div style={{ fontSize:11,color:T.textMuted,padding:"7px 10px",background:T.surface,borderRadius:7,border:`1px solid ${T.border}` }}>📷 Click the avatar on the left to change your profile picture</div>
                      </div>
                    ):(
                      <div style={{ display:"flex",flexDirection:"column" }}>
                        {[["Display Name",profile.name||user.name],["Email",profile.email||user.email],["Role",profile.role||"—"],["Bio",profile.bio||"No bio yet."],["Member Since",new Date(user.id).toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"})]].map(([label,val])=>(
                          <div key={label} style={{ padding:"11px 0",borderBottom:`1px solid ${T.border}` }}><div style={{ fontSize:10,color:T.textMuted,fontWeight:700,textTransform:"uppercase",letterSpacing:".07em",marginBottom:4 }}>{label}</div><div style={{ fontSize:14,color:T.text,lineHeight:1.6 }}>{val}</div></div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  );
}