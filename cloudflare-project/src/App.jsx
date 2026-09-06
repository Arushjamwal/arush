import React, { useState, useEffect, useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  Users, Heart, MessageCircle, Share2, Bookmark, Eye, TrendingUp,
  MousePointerClick, NotebookPen, ShoppingBag, LayoutDashboard, BookOpen,
  Plus, Trash2, ArrowUp, ArrowDown, Pencil, Upload, Sparkles, Loader2, X, PlayCircle,
  ChevronDown, ChevronUp,
} from 'lucide-react';

const KEYS = {
  growth: 'ccg-growth-entries',
  content: 'ccg-content-entries',
  handle: 'ccg-page-handle',
  brandStory: 'ccg-brand-story',
  logo: 'ccg-logo',
};

const DEFAULT_BRAND_STORY = 'Crochet keychains, plushies & patterns, handmade in Delhi and shipped pan India. Run by Reet — handmade with love.';

// Browser localStorage instead of the Claude-artifact window.storage API — this file runs as a
// normal deployed website, so it uses the platform's real local storage instead.
async function lsGet(key) {
  try {
    const resp = await fetch(`/api/data?key=${encodeURIComponent(key)}`);
    const data = await resp.json();
    return data.value ?? null;
  } catch (e) { return null; }
}
async function lsSet(key, value) {
  try {
    await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value }),
    });
  } catch (e) { /* best effort */ }
}

function buildAssistantContext(latestEntry, topContent) {
  const parts = [];
  if (latestEntry) parts.push(`Currently at ${fmt(latestEntry.followers)} followers, about ${latestEntry.engagementRate}% engagement rate, ${fmt(latestEntry.reach)} average reach.`);
  if (topContent) parts.push(`Best recent post: "${topContent.topic}" (${topContent.type}).`);
  return parts.join(' ') || null;
}

const COLORS = {
  ink: '#23262B',
  cream: '#F7F4EC',
  paper: '#FFFDF8',
  navy: '#1C2C4A',
  indigo: '#34517F',
  sky: '#7E9FC9',
  amber: '#C9922E',
  line: '#DBD4C4',
  good: '#3F7856',
  bad: '#AE4B39',
  muted: '#6B6558',
};

const FIELD_META = {
  followers: { label: 'Followers', icon: Users },
  reach: { label: 'Reach', icon: Eye },
  impressions: { label: 'Impressions', icon: TrendingUp },
  profileVisits: { label: 'Profile visits', icon: Users },
  plays: { label: 'Plays / views', icon: PlayCircle },
  likes: { label: 'Likes', icon: Heart },
  comments: { label: 'Comments', icon: MessageCircle },
  shares: { label: 'Shares', icon: Share2 },
  saves: { label: 'Saves', icon: Bookmark },
  storyViews: { label: 'Avg. story views', icon: Eye },
  replies: { label: 'Replies', icon: MessageCircle },
  posts: { label: 'Posts published', icon: NotebookPen },
  linkClicks: { label: 'Link / website clicks', icon: MousePointerClick },
  dms: { label: 'DMs / inquiries', icon: MessageCircle },
  orders: { label: 'Orders from Instagram', icon: ShoppingBag },
};

const FIELD_GROUPS = [
  {
    title: 'Audience and reach',
    caption: 'How many people are seeing the page, and whether that reach is actually turning into new followers.',
    fields: ['followers', 'reach', 'impressions', 'profileVisits'],
  },
  {
    title: 'Engagement',
    caption: 'How strongly people react to what you post. This is what tells you which content to make more of.',
    fields: ['likes', 'comments', 'shares', 'saves', 'storyViews'],
  },
  {
    title: 'Consistency',
    caption: 'Whether you are posting often enough for the algorithm and the audience to notice the page at all.',
    fields: ['posts'],
  },
  {
    title: 'Business result',
    caption: 'The reason to track everything else. Is attention turning into paying customers? Instagram will not show you these two — you know them because you own the DMs and the orders.',
    fields: ['linkClicks', 'dms', 'orders'],
  },
];

const ACCOUNT_EXTRACT_PROMPT = `You are reading a screenshot of Instagram account-level analytics or insights. Find these values if they appear anywhere in the image: followers, reach, impressions, profileVisits, likes, comments, shares, saves, storyViews, posts. Respond with ONLY a raw JSON object using exactly these keys and whole-number values, using 0 for anything not visible in the image. No words, no explanation, no markdown formatting — JSON only.`;

const CONTENT_EXTRACT_PROMPT = `You are reading a screenshot of a single Instagram post's performance or insights — it could be a Reel, Story, Carousel, or single photo. First work out which format it is. Then find these values if they appear anywhere in the image: plays (video views, Reels only), impressions, reach, likes, comments, shares, saves, replies (Stories only). Also check for any caption or product name legible anywhere in the image and put a short 3-6 word guess in "topic" (use null if nothing legible). Respond with ONLY a raw JSON object with exactly these keys: type, topic, plays, impressions, reach, likes, comments, shares, saves, replies. type must be exactly one of "Reel", "Story", "Carousel", "Single photo", or null if unclear. Use 0 for missing numbers. No words outside the JSON.`;

const emptyForm = () => {
  const f = { date: new Date().toISOString().slice(0, 10) };
  Object.keys(FIELD_META).forEach((k) => { f[k] = ''; });
  return f;
};

const todayISO = () => new Date().toISOString().slice(0, 10);

function formatDateLabel(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function fmt(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return Number(n).toLocaleString('en-IN');
}

function withDerived(e) {
  const engagementRaw = (e.likes || 0) + (e.comments || 0) + (e.shares || 0) + (e.saves || 0);
  const engagementRate = e.followers ? +(engagementRaw / e.followers * 100).toFixed(2) : 0;
  const conversion = e.dms ? +((e.orders || 0) / e.dms * 100).toFixed(1) : null;
  return { ...e, engagementRate, conversion };
}

function contentEngagementRate(e) {
  if (e.type === 'Story') {
    const base = e.reach || e.impressions || 0;
    return base ? +((e.replies || 0) / base * 100).toFixed(1) : 0;
  }
  const actions = (e.likes || 0) + (e.comments || 0) + (e.shares || 0) + (e.saves || 0);
  const base = e.plays || e.reach || 0;
  return base ? +(actions / base * 100).toFixed(1) : 0;
}

function scoreOf(e) {
  return (e.likes || 0) + (e.comments || 0) * 2 + (e.shares || 0) * 3 + (e.saves || 0) * 3 + (e.replies || 0) * 2;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function compressImage(dataUrl, maxWidth = 320, quality = 0.6) {
  return new Promise((resolve) => {
    try {
      const img = new window.Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    } catch (e) { resolve(null); }
  });
}

async function callVision(dataUrl, prompt) {
  const match = dataUrl.match(/^data:(.+);base64,(.*)$/);
  if (!match) throw new Error('Unreadable image');
  const mediaType = match[1];
  const b64 = match[2];
  // Calls our own serverless function (api/vision.js) so the Anthropic API key never reaches the browser.
  const resp = await fetch('/api/vision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mediaType, base64: b64, prompt }),
  });
  const data = await resp.json();
  if (data.error) throw new Error((data.error && data.error.message) || data.error || 'API error');
  const textBlock = (data.content || []).find((b) => b.type === 'text');
  if (!textBlock) throw new Error('No response');
  const clean = textBlock.text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

// Assigns each screenshot in a batch a date one week apart, working backward from the
// anchor date, skipping any date that already has a saved entry so nothing is overwritten.
function assignBatchDates(count, anchorDateStr, existingDates) {
  const used = new Set(existingDates);
  const dates = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(`${anchorDateStr}T00:00:00`);
    d.setDate(d.getDate() - i * 7);
    let iso = d.toISOString().slice(0, 10);
    while (used.has(iso)) {
      d.setDate(d.getDate() - 7);
      iso = d.toISOString().slice(0, 10);
    }
    used.add(iso);
    dates.push(iso);
  }
  return dates;
}

// Deterministic, rule-based "report" text — reliable, no AI guessing on the numbers side.
function growthInsight(entry, previous) {
  if (!previous) return 'First entry logged — this becomes your baseline to compare future weeks against.';
  const pct = (a, b) => (b ? Math.round((a - b) / b * 100) : null);
  const followersDelta = entry.followers - previous.followers;
  const reachPct = pct(entry.reach, previous.reach);
  const erNow = withDerived(entry).engagementRate;
  const erPrev = withDerived(previous).engagementRate;
  const erDelta = +(erNow - erPrev).toFixed(1);
  const ordersDelta = (entry.orders || 0) - (previous.orders || 0);
  const notes = [];
  if (ordersDelta !== 0) notes.push(`Orders are ${ordersDelta > 0 ? 'up' : 'down'} by ${Math.abs(ordersDelta)} since your last entry.`);
  if (reachPct !== null && Math.abs(reachPct) >= 15) notes.push(`Reach ${reachPct > 0 ? 'jumped' : 'dropped'} ${Math.abs(reachPct)}%.`);
  if (Math.abs(erDelta) >= 0.5) notes.push(`Engagement rate ${erDelta > 0 ? 'improved' : 'slipped'} by ${Math.abs(erDelta)} points.`);
  if (notes.length === 0) notes.push(`Followers ${followersDelta >= 0 ? 'up' : 'down'} by ${Math.abs(followersDelta)}, everything else holding steady.`);
  return notes.slice(0, 2).join(' ');
}

function contentInsight(entry, priorEntries) {
  const priors = (priorEntries || []).filter((e) => e.id !== entry.id);
  if (priors.length === 0) return 'First post logged — this becomes your baseline to compare future posts against.';
  const avgPlays = priors.reduce((s, e) => s + (e.plays || 0), 0) / priors.length;
  const avgER = priors.reduce((s, e) => s + contentEngagementRate(e), 0) / priors.length;
  const thisER = contentEngagementRate(entry);
  const playsPct = avgPlays ? Math.round(((entry.plays || 0) - avgPlays) / avgPlays * 100) : null;
  const erDiff = +(thisER - avgER).toFixed(1);
  const notes = [];
  if (playsPct !== null && Math.abs(playsPct) >= 20) notes.push(`Plays are ${Math.abs(playsPct)}% ${playsPct > 0 ? 'above' : 'below'} your recent average.`);
  if (Math.abs(erDiff) >= 1) notes.push(`Engagement rate is ${erDiff > 0 ? 'higher' : 'lower'} than usual (${thisER.toFixed(1)}% vs ~${avgER.toFixed(1)}%).`);
  if (notes.length === 0) notes.push('Performing in line with your recent posts.');
  return notes.slice(0, 2).join(' ');
}

// One synthesised "this week" paragraph across BOTH logs — the headline of the Overview tab.
function weeklyDigest(growthSorted, allContent) {
  const now = new Date();
  const since = new Date(now); since.setDate(since.getDate() - 6);
  const sinceISO = since.toISOString().slice(0, 10);
  const todayIso = now.toISOString().slice(0, 10);
  const inWeek = (d) => d >= sinceISO && d <= todayIso;

  const weekGrowth = growthSorted.filter((e) => inWeek(e.date));
  const weekContent = (allContent || []).filter((e) => inWeek(e.date));

  if (weekGrowth.length === 0 && weekContent.length === 0) return null;

  const parts = [];

  if (weekGrowth.length > 0) {
    const latestG = weekGrowth[weekGrowth.length - 1];
    const idxInAll = growthSorted.findIndex((e) => e.id === latestG.id);
    const priorG = idxInAll > 0 ? growthSorted[idxInAll - 1] : null;
    const followerDelta = priorG ? latestG.followers - priorG.followers : null;
    const reachPct = priorG && priorG.reach ? Math.round((latestG.reach - priorG.reach) / priorG.reach * 100) : null;
    parts.push(`Followers are at ${fmt(latestG.followers)}${followerDelta !== null ? ` (${followerDelta >= 0 ? '+' : ''}${fmt(followerDelta)} vs last entry)` : ''}, reach ${fmt(latestG.reach)}${reachPct !== null ? ` (${reachPct >= 0 ? '+' : ''}${reachPct}%)` : ''}.`);
    if (latestG.dms || latestG.orders) {
      parts.push(`${fmt(latestG.dms)} DMs came in and ${fmt(latestG.orders)} turned into an order.`);
    }
  }

  if (weekContent.length > 0) {
    const totalPlays = weekContent.reduce((s, e) => s + (e.plays || 0), 0);
    const avgER = +(weekContent.reduce((s, e) => s + contentEngagementRate(e), 0) / weekContent.length).toFixed(1);
    const best = [...weekContent].sort((a, b) => scoreOf(b) - scoreOf(a))[0];
    parts.push(`You posted ${weekContent.length} time${weekContent.length > 1 ? 's' : ''} this week, totalling ${fmt(totalPlays)} plays at ${avgER}% average engagement.${best ? ` Best performer: "${best.topic}".` : ''}`);
  } else {
    parts.push('No reels or stories logged this week yet.');
  }

  return parts.join(' ');
}

// Merges this week's growth snapshots and reel/story posts into one chronological feed,
// each carrying its screenshot (if any), a caption, and its headline stats — for the
// visual "this week's posts" gallery on the Overview tab.
function weekItems(growthSorted, allContent) {
  const now = new Date();
  const since = new Date(now); since.setDate(since.getDate() - 6);
  const sinceISO = since.toISOString().slice(0, 10);
  const todayIso = now.toISOString().slice(0, 10);
  const inWeek = (d) => d >= sinceISO && d <= todayIso;

  const gItems = growthSorted.filter((e) => inWeek(e.date)).map((e) => ({
    id: e.id,
    kind: 'growth',
    date: e.date,
    screenshot: e.screenshot,
    title: 'Weekly snapshot',
    subtitle: formatDateLabel(e.date),
    stat1: { label: 'Followers', value: fmt(e.followers) },
    stat2: { label: 'Reach', value: fmt(e.reach) },
  }));
  const cItems = (allContent || []).filter((e) => inWeek(e.date)).map((e) => ({
    id: e.id,
    kind: 'content',
    date: e.date,
    screenshot: e.screenshot,
    title: e.topic,
    subtitle: `${e.type} · ${formatDateLabel(e.date)}`,
    stat1: { label: e.plays ? 'Plays' : 'Reach', value: fmt(e.plays || e.reach) },
    stat2: { label: 'Eng. rate', value: `${contentEngagementRate(e)}%` },
  }));
  return [...gItems, ...cItems].sort((a, b) => a.date.localeCompare(b.date));
}

const LOGO_DATA_URI = 'data:image/jpeg;base64,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';

export default function CrochetCuddleGrowthStudio() {
  const [tab, setTab] = useState('overview');
  const [growthEntries, setGrowthEntries] = useState([]);
  const [contentEntries, setContentEntries] = useState([]);
  const [pageHandle, setPageHandle] = useState('@croc_hetcuddle_');
  const [editingHandle, setEditingHandle] = useState(false);
  const [brandStory, setBrandStory] = useState(DEFAULT_BRAND_STORY);
  const [editingStory, setEditingStory] = useState(false);
  const [customLogo, setCustomLogo] = useState(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [form, setForm] = useState(emptyForm());

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    let g = null, c = null, ph = null, bs = null, lg = null;
    try {
      g = await lsGet(KEYS.growth);
      c = await lsGet(KEYS.content);
      ph = await lsGet(KEYS.handle);
      bs = await lsGet(KEYS.brandStory);
      lg = await lsGet(KEYS.logo);
      setGrowthEntries(g ? JSON.parse(g) : []);
      setContentEntries(c ? JSON.parse(c) : []);
      setPageHandle(ph || '@croc_hetcuddle_');
      setBrandStory(bs || DEFAULT_BRAND_STORY);
      setCustomLogo(lg || null);
    } catch (e) {
      setLoadError(true);
    } finally {
      setLoaded(true);
    }
  }

  async function saveGrowth(next) {
    setGrowthEntries(next);
    await lsSet(KEYS.growth, JSON.stringify(next));
  }
  async function saveContent(next) {
    setContentEntries(next);
    await lsSet(KEYS.content, JSON.stringify(next));
  }
  async function saveHandle(v) {
    setPageHandle(v);
    await lsSet(KEYS.handle, v);
  }
  async function saveBrandStory(v) {
    setBrandStory(v);
    await lsSet(KEYS.brandStory, v);
  }
  async function handleLogoChange(ev) {
    const file = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    const compressed = await compressImage(dataUrl, 220, 0.85);
    setCustomLogo(compressed);
    await lsSet(KEYS.logo, compressed);
  }

  const sortedAsc = useMemo(
    () => [...growthEntries].sort((a, b) => a.date.localeCompare(b.date)).map(withDerived),
    [growthEntries],
  );
  const sortedDesc = [...sortedAsc].reverse();
  const latest = sortedAsc[sortedAsc.length - 1];
  const previous = sortedAsc[sortedAsc.length - 2];
  const chartData = sortedAsc.map((e) => ({ ...e, dateLabel: formatDateLabel(e.date) }));

  const contentRanked = useMemo(() => {
    return [...contentEntries]
      .map((e) => ({ ...e, score: scoreOf(e) }))
      .sort((a, b) => b.score - a.score);
  }, [contentEntries]);

  function delta(key) {
    if (!latest || !previous) return null;
    return latest[key] - previous[key];
  }

  function submitGrowth(formData) {
    if (!formData.date) return null;
    const entry = { id: formData.date, date: formData.date, screenshot: formData.screenshot || null };
    Object.keys(FIELD_META).forEach((k) => {
      if (k === 'plays' || k === 'replies') return; // not growth-log fields
      entry[k] = Number(formData[k]) || 0;
    });
    const idx = growthEntries.findIndex((e) => e.date === formData.date);
    const next = [...growthEntries];
    if (idx >= 0) next[idx] = entry; else next.push(entry);
    saveGrowth(next);
    setForm(emptyForm());
    return entry;
  }

  function removeGrowth(id) {
    saveGrowth(growthEntries.filter((e) => e.id !== id));
  }

  function submitContent(entryData) {
    const entry = {
      id: entryData.id || `${entryData.date}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      date: entryData.date,
      type: entryData.type || 'Reel',
      topic: entryData.topic || `Reel · ${formatDateLabel(entryData.date)}`,
      plays: Number(entryData.plays) || 0,
      impressions: Number(entryData.impressions) || 0,
      likes: Number(entryData.likes) || 0,
      comments: Number(entryData.comments) || 0,
      shares: Number(entryData.shares) || 0,
      saves: Number(entryData.saves) || 0,
      reach: Number(entryData.reach) || 0,
      replies: Number(entryData.replies) || 0,
      screenshot: entryData.screenshot || null,
    };
    saveContent([...contentEntries, entry]);
    return entry;
  }

  function removeContent(id) {
    saveContent(contentEntries.filter((e) => e.id !== id));
  }

  function resetAllHistory() {
    saveGrowth([]);
    saveContent([]);
    setConfirmingReset(false);
  }

  return (
    <div style={{ background: COLORS.cream, color: COLORS.ink, fontFamily: 'Inter, sans-serif', minHeight: '100vh' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap');
        .ccg-display { font-family: 'Fraunces', serif; }
        .ccg-num { font-variant-numeric: tabular-nums; }
        .ccg-stitch { border-bottom: 2px dashed ${COLORS.line}; }
        .ccg-tab-active { border-bottom: 3px dashed ${COLORS.indigo}; color: ${COLORS.navy}; }
        .ccg-tab { border-bottom: 3px dashed transparent; color: ${COLORS.muted}; }
        .ccg-input { background: ${COLORS.paper}; border: 1px solid ${COLORS.line}; border-radius: 6px; padding: 8px 10px; width: 100%; font-family: 'Inter', sans-serif; color: ${COLORS.ink}; }
        .ccg-input:focus { outline: 2px solid ${COLORS.indigo}; outline-offset: 1px; }
        .ccg-panel { background: ${COLORS.paper}; border: 1px solid ${COLORS.line}; border-radius: 10px; }
        .ccg-drop { background: ${COLORS.cream}; border: 2px dashed ${COLORS.amber}; border-radius: 12px; }
        .ccg-btn { background: ${COLORS.indigo}; color: ${COLORS.cream}; border-radius: 6px; padding: 9px 16px; font-weight: 600; }
        .ccg-btn:hover { background: ${COLORS.navy}; }
        .ccg-btn:disabled { opacity: 0.6; }
        .ccg-rise { animation: ccgRise .5s ease both; }
        .ccg-scrollx { -webkit-overflow-scrolling: touch; scrollbar-width: thin; }
        @media (max-width: 480px) {
          .ccg-h1 { font-size: 1.6rem !important; }
        }
        @keyframes ccgRise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      <div className="max-w-6xl mx-auto px-5 py-8">
        <div className="flex flex-col md:flex-row md:items-center gap-4 mb-3">
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <img
              src={customLogo || LOGO_DATA_URI}
              alt="Brand logo"
              style={{ width: 84, height: 84, borderRadius: '50%', border: `2px solid ${COLORS.line}`, objectFit: 'cover' }}
            />
            <label
              title="Change logo"
              style={{
                position: 'absolute', bottom: -2, right: -2, background: COLORS.indigo, borderRadius: '50%',
                width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', border: `2px solid ${COLORS.paper}`,
              }}
            >
              <Pencil size={12} color={COLORS.cream} />
              <input type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
            </label>
          </div>
          <div className="flex-1">
            <h1 className="ccg-display ccg-h1" style={{ fontSize: '2.1rem', fontWeight: 700, color: COLORS.navy, lineHeight: 1.1 }}>Growth Studio</h1>
            <div className="flex items-center gap-2 mt-1 text-sm" style={{ color: COLORS.muted }}>
              <span>Tracking growth for</span>
              {editingHandle ? (
                <input
                  autoFocus
                  className="ccg-input"
                  style={{ width: 200, padding: '4px 8px' }}
                  value={pageHandle}
                  onChange={(e) => setPageHandle(e.target.value)}
                  onBlur={(e) => { saveHandle(e.target.value); setEditingHandle(false); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                />
              ) : (
                <button onClick={() => setEditingHandle(true)} className="flex items-center gap-1 font-medium" style={{ color: COLORS.indigo }}>
                  {pageHandle} <Pencil size={12} />
                </button>
              )}
            </div>
            {editingStory ? (
              <textarea
                autoFocus
                rows={2}
                className="ccg-input mt-1"
                style={{ fontSize: '0.875rem' }}
                value={brandStory}
                onChange={(e) => setBrandStory(e.target.value)}
                onBlur={(e) => { saveBrandStory(e.target.value); setEditingStory(false); }}
              />
            ) : (
              <button onClick={() => setEditingStory(true)} className="text-sm mt-1 text-left flex items-start gap-1" style={{ color: COLORS.muted }}>
                <span>{brandStory}</span> <Pencil size={11} style={{ flexShrink: 0, marginTop: 3 }} />
              </button>
            )}
          </div>
        </div>
        <p className="text-xs mb-3" style={{ color: COLORS.muted }}>Tap the logo or the description above to make this tool your own — for any brand, not just this one.</p>

        <svg width="100%" height="14" viewBox="0 0 400 14" preserveAspectRatio="none" style={{ display: 'block', marginBottom: '1.5rem' }}>
          <path d="M0 7 Q 25 0 50 7 T 100 7 T 150 7 T 200 7 T 250 7 T 300 7 T 350 7 T 400 7" fill="none" stroke={COLORS.line} strokeWidth="2" strokeDasharray="6 5" />
        </svg>

        <div className="flex gap-6 mb-8 overflow-x-auto ccg-scrollx">
          {[
            { id: 'overview', label: 'Overview', icon: LayoutDashboard },
            { id: 'growth', label: 'Growth log', icon: TrendingUp },
            { id: 'content', label: 'Reel log', icon: PlayCircle },
            { id: 'playbook', label: 'Assistant', icon: Sparkles },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 pb-2 whitespace-nowrap ${tab === t.id ? 'ccg-tab-active' : 'ccg-tab'}`}
              style={{ fontWeight: 600 }}
            >
              <t.icon size={16} /> {t.label}
            </button>
          ))}
        </div>

        {!loaded && <p style={{ color: COLORS.muted }}>Loading your saved data…</p>}
        {loadError && (
          <p className="mb-4 text-sm" style={{ color: COLORS.bad }}>
            Could not load saved entries this time. You can still use the tool, but new entries may not be saved.
          </p>
        )}

        {loaded && tab === 'overview' && (
          <Overview
            latest={latest} previous={previous} delta={delta}
            chartData={chartData} hasData={sortedAsc.length > 0}
            goToLog={() => setTab('growth')}
            growthSorted={sortedAsc} allContent={contentEntries}
          />
        )}
        {loaded && tab === 'growth' && (
          <GrowthLog
            form={form} setForm={setForm} onSubmit={submitGrowth}
            entries={sortedDesc} previous={previous} onRemove={removeGrowth}
          />
        )}
        {loaded && tab === 'content' && (
          <ContentLog
            onSubmit={submitContent}
            entries={contentRanked} onRemove={removeContent}
          />
        )}
        {loaded && tab === 'playbook' && (
          <Assistant niche={brandStory} context={buildAssistantContext(latest, contentRanked[0])} />
        )}

        {loaded && (
          <div className="text-center mt-4 mb-2">
            {!confirmingReset ? (
              <button onClick={() => setConfirmingReset(true)} className="text-xs" style={{ color: COLORS.muted }}>
                Clear all logged history
              </button>
            ) : (
              <span className="text-xs" style={{ color: COLORS.bad }}>
                This deletes every growth and reel entry for good.{' '}
                <button onClick={resetAllHistory} className="font-semibold underline">Yes, clear it</button>{' '}
                <button onClick={() => setConfirmingReset(false)} className="underline">Cancel</button>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Collapsible({ title, highlight, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="ccg-panel mb-6" style={{ overflow: 'hidden' }}>
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between gap-3 p-4 text-left">
        <div style={{ minWidth: 0 }}>
          <p className="ccg-stitch font-semibold" style={{ color: COLORS.navy, borderBottom: 'none' }}>{title}</p>
          {!open && <p className="text-xs mt-1 truncate" style={{ color: COLORS.muted }}>{highlight}</p>}
        </div>
        {open ? <ChevronUp size={18} style={{ color: COLORS.muted, flexShrink: 0 }} /> : <ChevronDown size={18} style={{ color: COLORS.muted, flexShrink: 0 }} />}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

function Delta({ value, suffix = '' }) {
  if (value === null || value === undefined) return null;
  const up = value > 0;
  const flat = value === 0;
  const color = flat ? COLORS.muted : up ? COLORS.good : COLORS.bad;
  return (
    <span className="flex items-center gap-0.5 text-xs font-medium" style={{ color }}>
      {!flat && (up ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      {flat ? 'no change' : `${fmt(Math.abs(value))}${suffix} vs last entry`}
    </span>
  );
}

function StatCard({ icon: Icon, label, value, deltaValue, suffix = '', accent, delay = 0 }) {
  return (
    <div className="ccg-panel p-4 ccg-rise" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-center gap-2 mb-2" style={{ color: COLORS.muted }}>
        <Icon size={15} />
        <span className="text-sm">{label}</span>
      </div>
      <div className="ccg-num" style={{ fontSize: '1.7rem', fontWeight: 700, color: accent || COLORS.ink }}>
        {value}{suffix}
      </div>
      <Delta value={deltaValue} suffix={suffix} />
    </div>
  );
}

function Overview({ latest, previous, delta, chartData, hasData, goToLog, growthSorted, allContent }) {
  const digest = weeklyDigest(growthSorted, allContent);
  const hasAnything = hasData || (allContent && allContent.length > 0);
  const items = weekItems(growthSorted, allContent);
  const weekContentRaw = (allContent || []).filter((e) => items.some((it) => it.id === e.id && it.kind === 'content'));
  const engagementChartData = weekContentRaw.map((e) => ({
    name: e.topic.length > 14 ? `${e.topic.slice(0, 14)}…` : e.topic,
    engagement: contentEngagementRate(e),
  }));
  const bestEngagement = engagementChartData.length > 0 ? [...engagementChartData].sort((a, b) => b.engagement - a.engagement)[0] : null;
  const galleryHighlight = items.length > 0
    ? `${items.length} post${items.length !== 1 ? 's' : ''} logged this week — tap to view`
    : 'Nothing logged this week yet';
  const engagementHighlight = bestEngagement ? `Best this week: "${bestEngagement.name}" at ${bestEngagement.engagement}%` : '';
  const growthChartHighlight = latest
    ? `Followers ${fmt(latest.followers)}${previous ? `, ${latest.followers - previous.followers >= 0 ? '+' : ''}${fmt(latest.followers - previous.followers)} vs last entry` : ''}`
    : '';

  if (!hasAnything) {
    return (
      <div className="ccg-panel p-8 text-center">
        <p className="mb-4" style={{ color: COLORS.muted }}>
          Nothing logged yet. Upload a screenshot in the growth log or reel log to see your first report here.
        </p>
        <button className="ccg-btn" onClick={goToLog}>Log this week's numbers</button>
      </div>
    );
  }

  return (
    <div>
      <div className="ccg-panel p-5 mb-6 ccg-rise" style={{ borderColor: COLORS.indigo, borderWidth: 2 }}>
        <p className="ccg-display mb-2" style={{ fontSize: '1.3rem', fontWeight: 600, color: COLORS.navy }}>This week</p>
        <p className="text-sm" style={{ color: COLORS.ink }}>
          {digest || 'Nothing logged this week yet — upload a screenshot in the growth log or reel log to see your weekly report here.'}
        </p>
      </div>

      <Collapsible title="This week's posts" highlight={galleryHighlight}>
        {items.length === 0 ? (
          <p className="text-sm" style={{ color: COLORS.muted }}>Nothing logged this week yet — upload a screenshot in either log to see it appear here.</p>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-1 ccg-scrollx">
            {items.map((item) => (
              <div key={`${item.kind}-${item.id}`} className="ccg-panel" style={{ minWidth: 150, maxWidth: 150, flexShrink: 0, borderColor: COLORS.line, overflow: 'hidden' }}>
                <div style={{ width: '100%', height: 150, background: COLORS.cream }}>
                  {item.screenshot ? (
                    <img src={item.screenshot} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div className="flex items-center justify-center h-full" style={{ color: COLORS.muted }}>
                      {item.kind === 'growth' ? <TrendingUp size={24} /> : <PlayCircle size={24} />}
                    </div>
                  )}
                </div>
                <div className="p-2">
                  <p className="text-xs font-semibold truncate" style={{ color: COLORS.navy }}>{item.title}</p>
                  <p className="text-xs truncate" style={{ color: COLORS.muted }}>{item.subtitle}</p>
                  <div className="flex justify-between mt-1 text-xs ccg-num" style={{ color: COLORS.ink }}>
                    <span title={item.stat1.label}>{item.stat1.value}</span>
                    <span title={item.stat2.label}>{item.stat2.value}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Collapsible>

      {engagementChartData.length > 0 && (
        <Collapsible title="This week's engagement, post by post" highlight={engagementHighlight}>
          <div style={{ width: '100%', height: Math.max(160, engagementChartData.length * 40) }}>
            <ResponsiveContainer>
              <BarChart data={engagementChartData} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="4 4" stroke={COLORS.line} horizontal={false} />
                <XAxis type="number" unit="%" tick={{ fontSize: 11, fill: COLORS.muted }} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: COLORS.muted }} />
                <Tooltip contentStyle={{ fontFamily: 'Inter', fontSize: 13 }} />
                <Bar dataKey="engagement" fill={COLORS.amber} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Collapsible>
      )}

      {hasData ? (
        <>
          <div className="ccg-panel p-4 mb-6 ccg-rise" style={{ borderColor: COLORS.amber, borderWidth: 2 }}>
            <p className="text-sm mb-2" style={{ color: COLORS.muted }}>The number that matters most</p>
            <div className="flex flex-wrap gap-8">
              <div>
                <div className="ccg-num" style={{ fontSize: '2rem', fontWeight: 700, color: COLORS.amber }}>{fmt(latest.orders)}</div>
                <div className="text-sm" style={{ color: COLORS.muted }}>orders from Instagram this entry</div>
              </div>
              <div>
                <div className="ccg-num" style={{ fontSize: '2rem', fontWeight: 700, color: COLORS.amber }}>
                  {latest.conversion === null ? '—' : `${latest.conversion}%`}
                </div>
                <div className="text-sm" style={{ color: COLORS.muted }}>of DMs turned into an order</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatCard delay={0} icon={Users} label="Followers" value={fmt(latest.followers)} deltaValue={delta('followers')} />
            <StatCard delay={60} icon={Heart} label="Engagement rate" value={latest.engagementRate} suffix="%" deltaValue={previous ? +(latest.engagementRate - previous.engagementRate).toFixed(2) : null} />
            <StatCard delay={120} icon={Eye} label="Reach" value={fmt(latest.reach)} deltaValue={delta('reach')} />
            <StatCard delay={180} icon={MessageCircle} label="DMs / inquiries" value={fmt(latest.dms)} deltaValue={delta('dms')} />
          </div>

          <Collapsible title="Overall growth" highlight={growthChartHighlight}>
            <div style={{ width: '100%', height: 300 }}>
              <ResponsiveContainer>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="4 4" stroke={COLORS.line} />
                  <XAxis dataKey="dateLabel" tick={{ fontSize: 12, fill: COLORS.muted }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 12, fill: COLORS.muted }} width={45} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12, fill: COLORS.muted }} width={40} />
                  <Tooltip contentStyle={{ fontFamily: 'Inter', fontSize: 13 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line yAxisId="left" type="monotone" dataKey="followers" name="Followers" stroke={COLORS.indigo} strokeWidth={2.5} dot={{ r: 3 }} />
                  <Line yAxisId="left" type="monotone" dataKey="reach" name="Reach" stroke={COLORS.sky} strokeWidth={2} strokeDasharray="5 3" dot={{ r: 2 }} />
                  <Line yAxisId="right" type="monotone" dataKey="engagementRate" name="Engagement %" stroke={COLORS.amber} strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Collapsible>
        </>
      ) : (
        <p style={{ color: COLORS.muted }}>Add a growth-log snapshot to see follower and reach charts here too.</p>
      )}
    </div>
  );
}

function ScreenshotBanner({ logged, onUndo }) {
  if (!logged) return null;
  return (
    <div className="ccg-panel p-4 mb-6 ccg-rise" style={{ borderColor: COLORS.good, borderWidth: 2 }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {logged.entry && logged.entry.screenshot && (
            <img src={logged.entry.screenshot} alt="Logged screenshot" style={{ height: 44, borderRadius: 6, border: `1px solid ${COLORS.line}` }} />
          )}
          <div>
            <p className="font-semibold" style={{ color: COLORS.navy }}>Logged: {logged.title}</p>
            <p className="text-sm mt-1" style={{ color: COLORS.muted }}>{logged.insight}</p>
          </div>
        </div>
        <button onClick={onUndo} className="text-sm font-medium whitespace-nowrap" style={{ color: COLORS.bad }}>Undo</button>
      </div>
    </div>
  );
}

function GrowthLog({ form, setForm, onSubmit, entries, previous, onRemove }) {
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(null);
  const [analyzeError, setAnalyzeError] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [lastLogged, setLastLogged] = useState(null);

  async function handleFiles(ev) {
    const files = Array.from(ev.target.files || []);
    ev.target.value = '';
    if (files.length === 0) return;
    setAnalyzeError(null);
    const dataUrls = await Promise.all(files.map(fileToDataUrl));
    processBatch(dataUrls);
  }

  async function processBatch(dataUrls) {
    setAnalyzing(true);
    setProgress({ done: 0, total: dataUrls.length });
    const existingDates = entries.map((e) => e.date);
    const assignedDates = assignBatchDates(dataUrls.length, form.date, existingDates);
    const saved = [];
    let failCount = 0;
    for (let i = 0; i < dataUrls.length; i++) {
      try {
        const parsed = await callVision(dataUrls[i], ACCOUNT_EXTRACT_PROMPT);
        const merged = { ...emptyForm(), date: assignedDates[i] };
        Object.keys(FIELD_META).forEach((k) => {
          if (k === 'dms' || k === 'orders' || k === 'plays' || k === 'replies') return;
          if (parsed[k] !== undefined) merged[k] = String(parsed[k]);
        });
        const screenshot = await compressImage(dataUrls[i]);
        const entry = onSubmit({ ...merged, screenshot });
        if (entry) saved.push(entry);
      } catch (e) {
        failCount += 1;
      }
      setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
    }
    setAnalyzing(false);
    setProgress(null);
    if (saved.length === 0) {
      setAnalyzeError('Could not read any of those screenshots. Try uploading them one at a time, or enter the numbers manually below.');
      setExpanded(true);
      return;
    }
    if (saved.length === 1 && failCount === 0) {
      const insight = growthInsight(saved[0], previous);
      setLastLogged({ ids: [saved[0].id], title: formatDateLabel(saved[0].date), insight, entry: saved[0] });
    } else {
      const dateList = saved.map((e) => formatDateLabel(e.date)).join(', ');
      const failNote = failCount > 0 ? ` ${failCount} screenshot${failCount > 1 ? 's' : ''} could not be read.` : '';
      setLastLogged({
        ids: saved.map((e) => e.id),
        title: `${saved.length} snapshot${saved.length > 1 ? 's' : ''}`,
        insight: `Logged for ${dateList}, one week apart by default, most recent first.${failNote} If a date needs fixing, delete that row below and re-add it manually.`,
        entry: saved[saved.length - 1],
      });
    }
  }

  function handleManualSubmit(ev) {
    ev.preventDefault();
    if (!form.date) return;
    const saved = onSubmit({ ...form, screenshot: null });
    if (!saved) return;
    const insight = growthInsight(saved, previous);
    setLastLogged({ ids: [saved.id], title: formatDateLabel(saved.date), insight, entry: saved });
    setExpanded(false);
  }

  return (
    <div>
      <ScreenshotBanner logged={lastLogged} onUndo={() => { lastLogged.ids.forEach(onRemove); setLastLogged(null); }} />

      <div className="ccg-panel p-5 mb-8">
        <div className="flex items-center justify-between mb-4">
          <p className="font-semibold ccg-display" style={{ fontSize: '1.2rem', color: COLORS.navy }}>Log a snapshot</p>
          <input
            type="date" required
            className="ccg-input" style={{ width: 160 }}
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />
        </div>

        <label className="ccg-drop flex flex-col items-center justify-center text-center p-6 mb-4 cursor-pointer">
          {analyzing ? <Loader2 size={22} className="animate-spin mb-2" style={{ color: COLORS.amber }} /> : <Upload size={22} className="mb-2" style={{ color: COLORS.amber }} />}
          <p className="font-semibold" style={{ color: COLORS.navy }}>
            {analyzing ? (progress ? `Reading screenshot ${progress.done + 1} of ${progress.total}…` : 'Reading your screenshot…') : 'Upload Instagram Insights screenshots'}
          </p>
          <p className="text-xs mt-1" style={{ color: COLORS.muted }}>
            Claude reads the numbers and logs each one automatically. Select one screenshot, or several at once to catch up on
            past weeks; older ones get spaced a week apart automatically, working back from the date above. DMs and orders still need typing in, since
            Instagram never shows those.
          </p>
          <input type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} disabled={analyzing} />
        </label>
        {analyzeError && <p className="text-xs mb-3" style={{ color: COLORS.bad }}>{analyzeError}</p>}

        <button type="button" onClick={() => setExpanded((v) => !v)} className="text-sm font-medium mb-4" style={{ color: COLORS.indigo }}>
          {expanded ? 'Hide the number fields' : 'Or enter the numbers manually'}
        </button>

        {expanded && (
          <form onSubmit={handleManualSubmit}>
            {FIELD_GROUPS.map((group) => (
              <div key={group.title} className="mb-5">
                <p className="font-semibold text-sm mb-1" style={{ color: COLORS.navy }}>{group.title}</p>
                <p className="text-xs mb-2" style={{ color: COLORS.muted }}>{group.caption}</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {group.fields.map((key) => (
                    <label key={key} className="text-xs" style={{ color: COLORS.muted }}>
                      {FIELD_META[key].label}
                      <input
                        type="number" min="0" className="ccg-input mt-1"
                        value={form[key]}
                        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <button type="submit" className="ccg-btn flex items-center gap-2"><Plus size={16} /> Save this entry</button>
          </form>
        )}
      </div>

      {entries.length === 0 ? (
        <p style={{ color: COLORS.muted }}>No entries yet — upload a screenshot above to start.</p>
      ) : (
        <div className="ccg-panel overflow-x-auto ccg-scrollx">
          <table className="w-full text-sm">
            <thead>
              <tr className="ccg-stitch text-left" style={{ color: COLORS.muted }}>
                <th className="p-3">Shot</th>
                <th className="p-3">Date</th>
                <th className="p-3">Followers</th>
                <th className="p-3">Reach</th>
                <th className="p-3">Engagement</th>
                <th className="p-3">DMs</th>
                <th className="p-3">Orders</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((raw) => {
                const e = withDerived(raw);
                return (
                  <tr key={e.id} style={{ borderBottom: `1px solid ${COLORS.line}` }}>
                    <td className="p-3">
                      {e.screenshot ? (
                        <img src={e.screenshot} alt="Logged screenshot" style={{ height: 32, borderRadius: 4, border: `1px solid ${COLORS.line}` }} />
                      ) : '—'}
                    </td>
                    <td className="p-3">{formatDateLabel(e.date)}</td>
                    <td className="p-3 ccg-num">{fmt(e.followers)}</td>
                    <td className="p-3 ccg-num">{fmt(e.reach)}</td>
                    <td className="p-3 ccg-num">{e.engagementRate}%</td>
                    <td className="p-3 ccg-num">{fmt(e.dms)}</td>
                    <td className="p-3 ccg-num">{fmt(e.orders)}</td>
                    <td className="p-3">
                      <button onClick={() => onRemove(e.id)} style={{ color: COLORS.muted }} aria-label="Delete entry">
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ContentLog({ onSubmit, entries, onRemove }) {
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(null);
  const [analyzeError, setAnalyzeError] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [lastLogged, setLastLogged] = useState(null);
  const [batchDate, setBatchDate] = useState(todayISO());
  const [form, setForm] = useState({
    date: todayISO(), type: 'Reel', topic: '',
    plays: '', impressions: '', likes: '', comments: '', shares: '', saves: '', reach: '', replies: '',
  });

  async function handleFiles(ev) {
    const files = Array.from(ev.target.files || []);
    ev.target.value = '';
    if (files.length === 0) return;
    setAnalyzeError(null);
    const dataUrls = await Promise.all(files.map(fileToDataUrl));
    processBatch(dataUrls);
  }

  async function processBatch(dataUrls) {
    setAnalyzing(true);
    setProgress({ done: 0, total: dataUrls.length });
    const saved = [];
    let failCount = 0;
    for (let i = 0; i < dataUrls.length; i++) {
      try {
        const parsed = await callVision(dataUrls[i], CONTENT_EXTRACT_PROMPT);
        const screenshot = await compressImage(dataUrls[i]);
        const draft = {
          date: batchDate,
          type: parsed.type || 'Reel',
          topic: parsed.topic || null,
          plays: parsed.plays || 0,
          impressions: parsed.impressions || 0,
          likes: parsed.likes || 0,
          comments: parsed.comments || 0,
          shares: parsed.shares || 0,
          saves: parsed.saves || 0,
          reach: parsed.reach || 0,
          replies: parsed.replies || 0,
          screenshot,
        };
        const entry = onSubmit(draft);
        saved.push(entry);
      } catch (e) {
        failCount += 1;
      }
      setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
    }
    setAnalyzing(false);
    setProgress(null);
    if (saved.length === 0) {
      setAnalyzeError('Could not read any of those screenshots. Try uploading them one at a time, or add a post manually below.');
      setExpanded(true);
      return;
    }
    if (saved.length === 1 && failCount === 0) {
      const insight = contentInsight(saved[0], entries);
      setLastLogged({ ids: [saved[0].id], title: saved[0].topic, insight, entry: saved[0] });
    } else {
      const totalPlays = saved.reduce((s, e) => s + (e.plays || 0), 0);
      const totalActions = saved.reduce((s, e) => s + (e.likes || 0) + (e.comments || 0) + (e.shares || 0) + (e.saves || 0), 0);
      const avgER = +(saved.reduce((s, e) => s + contentEngagementRate(e), 0) / saved.length).toFixed(1);
      const best = [...saved].sort((a, b) => scoreOf(b) - scoreOf(a))[0];
      const failNote = failCount > 0 ? ` ${failCount} screenshot${failCount > 1 ? 's' : ''} could not be read.` : '';
      setLastLogged({
        ids: saved.map((e) => e.id),
        title: `${saved.length} posts for ${formatDateLabel(batchDate)}`,
        insight: `${fmt(totalPlays)} total plays and ${fmt(totalActions)} likes/comments/shares/saves across the batch, averaging ${avgER}% engagement.${best ? ` Best performer: "${best.topic}".` : ''}${failNote}`,
        entry: saved[saved.length - 1],
      });
    }
  }

  function handleManualSubmit(ev) {
    ev.preventDefault();
    if (!form.topic || !form.date) return;
    const saved = onSubmit(form);
    const insight = contentInsight(saved, entries);
    setLastLogged({ ids: [saved.id], title: saved.topic, insight, entry: saved });
    setForm({ date: form.date, type: 'Reel', topic: '', plays: '', impressions: '', likes: '', comments: '', shares: '', saves: '', reach: '', replies: '' });
    setExpanded(false);
  }

  const chartEntries = entries.slice(0, 8).map((e) => ({
    ...e,
    topicShort: e.topic.length > 18 ? `${e.topic.slice(0, 18)}…` : e.topic,
  }));

  return (
    <div>
      <ScreenshotBanner logged={lastLogged} onUndo={() => { lastLogged.ids.forEach(onRemove); setLastLogged(null); }} />

      <div className="ccg-panel p-5 mb-8">
        <div className="flex items-center justify-between mb-4">
          <p className="font-semibold ccg-display" style={{ fontSize: '1.2rem', color: COLORS.navy }}>Log a post</p>
          <input
            type="date" className="ccg-input" style={{ width: 160 }}
            value={batchDate}
            onChange={(e) => setBatchDate(e.target.value)}
          />
        </div>

        <label className="ccg-drop flex flex-col items-center justify-center text-center p-6 mb-4 cursor-pointer">
          {analyzing ? <Loader2 size={22} className="animate-spin mb-2" style={{ color: COLORS.amber }} /> : <Upload size={22} className="mb-2" style={{ color: COLORS.amber }} />}
          <p className="font-semibold" style={{ color: COLORS.navy }}>
            {analyzing ? (progress ? `Reading screenshot ${progress.done + 1} of ${progress.total}…` : 'Reading your screenshot…') : 'Upload reel, story or post insights screenshots'}
          </p>
          <p className="text-xs mt-1" style={{ color: COLORS.muted }}>
            Claude works out whether it's a reel, story, carousel or photo, reads plays, likes, comments, shares, saves, replies and reach off it, and logs
            it here automatically. Select several at once to catch up on old posts — you'll get one combined report for the whole batch.
          </p>
          <input type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} disabled={analyzing} />
        </label>
        {analyzeError && <p className="text-xs mb-3" style={{ color: COLORS.bad }}>{analyzeError}</p>}

        <button type="button" onClick={() => setExpanded((v) => !v)} className="text-sm font-medium" style={{ color: COLORS.indigo }}>
          {expanded ? 'Hide manual entry' : 'Or add a post manually'}
        </button>

        {expanded && (
          <form onSubmit={handleManualSubmit} className="mt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <label className="text-xs" style={{ color: COLORS.muted }}>Date
                <input type="date" required className="ccg-input mt-1" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </label>
              <label className="text-xs" style={{ color: COLORS.muted }}>Format
                <select className="ccg-input mt-1" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option>Reel</option><option>Story</option><option>Carousel</option><option>Single photo</option>
                </select>
              </label>
              <label className="text-xs col-span-2" style={{ color: COLORS.muted }}>What it was about
                <input required placeholder="e.g. bunny keychain restock" className="ccg-input mt-1" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} />
              </label>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {['plays', 'impressions', 'likes', 'comments', 'shares', 'saves', 'reach', 'replies'].map((key) => (
                <label key={key} className="text-xs" style={{ color: COLORS.muted }}>
                  {FIELD_META[key].label}
                  <input type="number" min="0" className="ccg-input mt-1" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
                </label>
              ))}
            </div>
            <button type="submit" className="ccg-btn flex items-center gap-2"><Plus size={16} /> Add post</button>
          </form>
        )}
      </div>

      {entries.length === 0 ? (
        <p style={{ color: COLORS.muted }}>No posts logged yet — upload a screenshot above to see what is actually working.</p>
      ) : (
        <>
          <div className="ccg-panel p-4 mb-6">
            <p className="ccg-stitch pb-2 mb-3 font-semibold" style={{ color: COLORS.navy }}>Best performing posts</p>
            <div style={{ width: '100%', height: Math.max(160, chartEntries.length * 34) }}>
              <ResponsiveContainer>
                <BarChart data={chartEntries} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="4 4" stroke={COLORS.line} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: COLORS.muted }} />
                  <YAxis type="category" dataKey="topicShort" width={130} tick={{ fontSize: 11, fill: COLORS.muted }} />
                  <Tooltip contentStyle={{ fontFamily: 'Inter', fontSize: 13 }} />
                  <Bar dataKey="score" fill={COLORS.amber} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="ccg-panel overflow-x-auto ccg-scrollx">
            <table className="w-full text-sm">
              <thead>
                <tr className="ccg-stitch text-left" style={{ color: COLORS.muted }}>
                  <th className="p-3">#</th>
                  <th className="p-3">Post</th>
                  <th className="p-3">Plays</th>
                  <th className="p-3">Likes</th>
                  <th className="p-3">Comments</th>
                  <th className="p-3">Shares</th>
                  <th className="p-3">Saves</th>
                  <th className="p-3">Eng. rate</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={e.id} style={{ borderBottom: `1px solid ${COLORS.line}`, borderLeft: i === 0 ? `3px solid ${COLORS.amber}` : '3px solid transparent' }}>
                    <td className="p-3 ccg-num">{i + 1}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        {e.screenshot && <img src={e.screenshot} alt="Post screenshot" style={{ height: 30, borderRadius: 4, border: `1px solid ${COLORS.line}` }} />}
                        <div>
                          {e.topic}
                          <div className="text-xs" style={{ color: COLORS.muted }}>
                            {e.type} · {formatDateLabel(e.date)}
                            {e.type === 'Story' && e.replies ? ` · ${fmt(e.replies)} replies` : ''}
                            {e.impressions ? ` · ${fmt(e.impressions)} impressions` : ''}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 ccg-num">{fmt(e.plays)}</td>
                    <td className="p-3 ccg-num">{fmt(e.likes)}</td>
                    <td className="p-3 ccg-num">{fmt(e.comments)}</td>
                    <td className="p-3 ccg-num">{fmt(e.shares)}</td>
                    <td className="p-3 ccg-num">{fmt(e.saves)}</td>
                    <td className="p-3 ccg-num">{contentEngagementRate(e)}%</td>
                    <td className="p-3">
                      <button onClick={() => onRemove(e.id)} style={{ color: COLORS.muted }} aria-label="Delete post">
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="mb-8">
      <p className="ccg-stitch pb-2 mb-3 ccg-display" style={{ fontSize: '1.3rem', fontWeight: 600, color: COLORS.navy }}>{title}</p>
      {children}
    </div>
  );
}

function TrendsPanel({ niche, context }) {
  const [trends, setTrends] = useState(null);
  const [loadingTrends, setLoadingTrends] = useState(false);
  const [trendsError, setTrendsError] = useState(null);

  useEffect(() => { loadCached(); }, []);

  async function loadCached() {
    try {
      const r = await lsGet('ccg-trends');
      if (r) setTrends(JSON.parse(r));
    } catch (e) { /* nothing cached yet */ }
  }

  async function checkTrends() {
    setLoadingTrends(true);
    setTrendsError(null);
    try {
      const prompt = `You are a social media growth assistant for a small business in this space: ${niche || 'handmade crafts'}. Search the web for what's genuinely trending right now on Instagram that's relevant to a business like this — content formats, seasonal moments, audio or hashtag trends, anything timely. Here is this account's own recent performance, for context: ${context || 'No performance data logged yet.'} Do not narrate your search process. Write only the final briefing, in plain text with no markdown headers: first 2-3 sentences on what's trending right now that's relevant to this niche, then exactly three specific, concrete goals for the coming week tailored to the context above — not generic advice. Keep the whole thing under 180 words, plain and encouraging, not corporate-sounding.`;
      // Calls our own serverless function (api/trends.js), which holds the API key and the web-search tool call.
      const resp = await fetch('/api/trends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const data = await resp.json();
      if (data.error) throw new Error((data.error && data.error.message) || data.error || 'API error');
      const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      if (!text) throw new Error('No response text');
      const result = { text, checkedAt: new Date().toISOString() };
      setTrends(result);
      await lsSet('ccg-trends', JSON.stringify(result));
    } catch (e) {
      setTrendsError('Could not check trends right now — try again in a moment.');
    } finally {
      setLoadingTrends(false);
    }
  }

  return (
    <div className="ccg-panel p-5 mb-8 ccg-rise" style={{ borderColor: COLORS.indigo, borderWidth: 2 }}>
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="ccg-display" style={{ fontSize: '1.3rem', fontWeight: 600, color: COLORS.navy }}>Your assistant</p>
        <button onClick={checkTrends} disabled={loadingTrends} className="ccg-btn flex items-center gap-2 whitespace-nowrap">
          {loadingTrends ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
          {loadingTrends ? 'Searching the web…' : trends ? 'Refresh' : "Check what's trending"}
        </button>
      </div>
      {trendsError && <p className="text-xs mb-2" style={{ color: COLORS.bad }}>{trendsError}</p>}
      {trends ? (
        <>
          <p className="text-sm whitespace-pre-line" style={{ color: COLORS.ink }}>{trends.text}</p>
          <p className="text-xs mt-3" style={{ color: COLORS.muted }}>
            Checked {new Date(trends.checkedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </p>
        </>
      ) : (
        <p className="text-sm" style={{ color: COLORS.muted }}>
          Searches the real web for what's trending in your niche right now, and turns it into a few concrete goals for the coming week — built from
          your own logged numbers, not a generic checklist.
        </p>
      )}
    </div>
  );
}

function Assistant({ niche, context }) {
  const metricGroups = [
    { title: 'Audience and reach', why: 'Tells you whether the page is reaching new people, and whether that reach is converting into follows. Reach without new followers usually means the content is being seen but not felt worth following for.' },
    { title: 'Engagement', why: 'Tells you which posts actually land. Likes are the weakest signal; comments, shares, and saves mean someone stopped, felt something, and acted on it. This is your guide for what to make more of.' },
    { title: 'Consistency', why: 'Instagram favours accounts that post often enough to keep showing up, and audiences forget accounts that go quiet. Irregular posting quietly undoes everything else you do well.' },
    { title: 'Business result', why: 'This is the only metric that pays the bills. Followers and likes are proxies; DMs and orders are proof. If reach and engagement are climbing but this row stays flat, the content is entertaining rather than selling.' },
  ];
  const steps = [
    { t: 'Audit', d: 'Look at the last 1–3 months: what has been posted, how the numbers moved, what the account already does well.' },
    { t: 'Strategy and content pillars', d: 'Decide the 3–4 recurring themes to post about (for a shop like this: new stock, process/behind-the-scenes, customer photos, offers) so content is not invented from scratch every day.' },
    { t: 'Content calendar', d: 'Plan what gets posted and when, at least a week ahead, so posting stays consistent instead of reactive.' },
    { t: 'Create and post', d: 'Produce the content and publish on schedule, in the format (reel, carousel, story) that fits the message.' },
    { t: 'Community management', d: 'Reply to comments and DMs quickly. For a small shop, this step is where sales actually get made.' },
    { t: 'Track and report', d: 'Log the numbers from every category above on a fixed schedule (daily for reels and stories, weekly for the account) so trends are visible, not guessed at.' },
    { t: 'Optimise', d: 'Do more of whatever the reel log shows is working, drop what is not, and repeat the loop.' },
  ];
  return (
    <div>
      <TrendsPanel niche={niche} context={context} />
      <Section title="What to analyse, and why">
        <div className="space-y-4">
          {metricGroups.map((m) => (
            <div key={m.title} className="ccg-panel p-4">
              <p className="font-semibold mb-1" style={{ color: COLORS.indigo }}>{m.title}</p>
              <p className="text-sm" style={{ color: COLORS.muted }}>{m.why}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="What a social media agency actually does">
        <div className="space-y-3">
          {steps.map((s, i) => (
            <div key={s.t} className="flex gap-3">
              <div className="ccg-num" style={{ color: COLORS.amber, fontWeight: 700, width: 22, flexShrink: 0 }}>{i + 1}</div>
              <div>
                <p className="font-semibold" style={{ color: COLORS.navy }}>{s.t}</p>
                <p className="text-sm" style={{ color: COLORS.muted }}>{s.d}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="The main focus, after all the analysis">
        <div className="ccg-panel p-5" style={{ borderColor: COLORS.amber, borderWidth: 2 }}>
          <p className="text-sm mb-3" style={{ color: COLORS.ink }}>
            Every metric in this tool sits on one path: reach leads to profile visits, profile visits lead to a DM, and a DM leads to an order.
            Followers, likes, and reach are leading indicators — early signs the path is moving. DMs and orders are the lagging indicator — proof it worked.
          </p>
          <p className="text-sm" style={{ color: COLORS.ink }}>
            For a handmade shop like this one, the job is not "grow the followers." It is to keep pushing people down that path, and to notice
            immediately if a number goes up (say, reach) while the number that pays (orders) does not follow — because that is the sign the content is being
            seen but not chosen.
          </p>
        </div>
      </Section>
    </div>
  );
}
