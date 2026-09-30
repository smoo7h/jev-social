import { isReel, sourceUrl, targetKind } from "./actions.js";

const record = (value) => value && typeof value === "object" && !Array.isArray(value);
const PRIVATE_EVIDENCE_KEY = /^(?:stdout|stderr|cookie(?:s|_jar|_string)?|dom|dom_state|(?:inner_|outer_)?html|page_source|storage_state|(?:.*_)?headers|authorization|(?:.*_)?token|api_?key|secret|password|raw(?:_.*)?)$/i;
const LOCAL_PATH_KEY = /(?:^|_)(?:local_)?path$|(?:^|_)(?:run|output|artifact)_dir$/i;

export function unwrapResult(value) {
  return record(value?.data) ? value.data : value;
}

export function extractEvidence(raw, action) {
  const data = unwrapResult(raw);
  if (!data || action.kind === "page_state") return [];
  const output = [];
  const add = (value, detailRead = false) => {
    if (!record(value) || value.ok === false) return;
    const entity = record(value.entity) ? value.entity : value;
    if (entity.ok === false) return;
    const item = { ...entity, platform: action.platform };
    item.url = sourceUrl(entity.url || entity.web_url || entity.share_url || value.url || (detailRead ? action.target : ""), action.platform);
    if (!item.url) return;
    if (Array.isArray(value.comments)) item.top_comments = value.comments;
    item.detail_read = detailRead;
    if (action.platform === "instagram" && isReel(entity)) item.is_reel = true;
    item.kind ||= action.platform === "instagram" && isReel(entity) ? "reel" : targetKind(item.url, action.platform) || "result";
    if (action.platform === "instagram" && action.kind === "read_profile") item.source_profile_url = action.target;
    output.push(item);
  };
  const detail = ["read_post", "read_profile", "read_company", "history"].includes(action.kind);
  if (Array.isArray(data)) data.forEach((value) => add(value, detail && action.kind !== "read_profile"));
  for (const key of ["results", "cards", "items", "posts", "videos", "video_cards"]) {
    if (Array.isArray(data[key])) data[key].forEach((value) => add(value, action.kind === "read_post"));
  }
  if (record(data.profile)) {
    add(data.profile, action.kind === "read_profile");
    for (const card of Array.isArray(data.profile.video_cards) ? data.profile.video_cards : []) add(card);
  }
  if (detail && !["read_post"].includes(action.kind) && !record(data.profile)) add(data, true);
  return output;
}

export function mergeEvidence(previous, incoming) {
  const items = new Map(previous.map((item) => [item.url, item]));
  for (const item of incoming) {
    const old = items.get(item.url) || {};
    const fields = Object.fromEntries(Object.entries(item).filter(([, value]) => value !== undefined && value !== null && value !== ""));
    items.set(item.url, { ...old, ...fields, detail_read: Boolean(old.detail_read || item.detail_read) });
  }
  return [...items.values()];
}

export function instagramTrendSignals(items, now = Date.now()) {
  const accounts = new Map();
  for (const item of items) {
    const profile = accountUrl(item);
    if (!profile) continue;
    if (!accounts.has(profile)) accounts.set(profile, []);
    accounts.get(profile).push(item);
  }

  const profiles = new Map();
  for (const [profile, records] of accounts) {
    const posts = records.filter((item) => targetKind(item.url, "instagram") === "post" && sourceUrl(item.source_profile_url, "instagram") === profile);
    const unpinned = posts.filter((item) => pinned(item) === false);
    const pinUnknown = posts.filter((item) => pinned(item) === null).length;
    const orderUnknown = unpinned.filter((item) => timestamp(item) === null).length;
    const baselinePosts = (orderUnknown ? unpinned : [...unpinned].sort((a, b) => timestamp(b) - timestamp(a))).slice(0, 12);
    const observedViews = baselinePosts.map(views).filter(Number.isFinite);
    const medianViews = observedViews.length === 12 && !pinUnknown && !orderUnknown ? median(observedViews) : null;
    const reelRecords = records.filter(isReel);
    const recentReels = reelRecords.filter((item) => {
      const age = ageHours(item, now);
      return isReel(item) && age !== null && age <= 168 && age >= 0;
    });
    const unknownAgeReels = reelRecords.filter((item) => timestamp(item) === null).length;
    profiles.set(profile, { medianViews, baselineCount: observedViews.length, baselinePosts: baselinePosts.length, pinUnknown, orderUnknown, recentReels: recentReels.length, unknownAgeReels });
  }

  const reels = items.filter((item) => isReel(item) && targetKind(item.url, "instagram") === "post").map((item) => {
    const profile = accountUrl(item);
    const baseline = profiles.get(profile)?.medianViews ?? null;
    const count = views(item);
    const age = ageHours(item, now);
    const viewsPerHour = count !== null && age !== null && age > 0 ? count / age : null;
    const multiple = count !== null && baseline !== null && baseline > 0 ? count / baseline : null;
    return {
      url: item.url, profile, views: count, ageHours: age, viewsPerHour,
      medianViews: baseline, medianMultiple: multiple,
      breakout: item.detail_read === true && age !== null && age >= 2 && age <= 48 && multiple !== null && multiple >= 3,
    };
  }).sort((a, b) => (b.viewsPerHour ?? -1) - (a.viewsPerHour ?? -1));

  return { profiles, reels };
}

export function resultObservation(raw, captured) {
  const data = unwrapResult(raw) || {};
  const states = [data, data.state, data.entity, ...(Array.isArray(data.posts) ? data.posts : []), ...(Array.isArray(data.videos) ? data.videos : [])].filter(record);
  const gate = states.find((state) => ["login_required", "challenge_required", "rate_limited"].some((key) => state[key] === true)
    || /login|captcha|challenge|rate.?limit|access.?denied|sign.?in/i.test(String(state.reason || state.status || state.error?.code || state.error || "")));
  return {
    ok: data.ok !== false,
    count: captured.length,
    status: typeof data.status === "string" ? data.status : undefined,
    reason: typeof data.reason === "string" ? data.reason : gate?.reason || gate?.status || (gate && ["login_required", "challenge_required", "rate_limited"].find((key) => gate[key] === true)),
    blocked: Boolean(gate),
    urls: captured.map((item) => item.url),
  };
}

export function publicEvidence(value) {
  if (Array.isArray(value)) return value.map(publicEvidence).filter((item) => item !== undefined);
  if (!record(value)) {
    return typeof value === "string" ? redactLocalPaths(value) : value;
  }
  const clean = {};
  for (const [key, child] of Object.entries(value)) {
    if (LOCAL_PATH_KEY.test(key) || PRIVATE_EVIDENCE_KEY.test(key)) continue;
    const next = publicEvidence(child);
    if (next !== undefined) clean[key] = next;
  }
  return clean;
}

function redactLocalPaths(value) {
  return value
    .replace(/file:\/\/\/[^\s"'`<>)\]}]+/gi, "[redacted path]")
    .replace(/\b[A-Za-z]:[\\/][^\s"'`<>)\]}\r\n]+/g, "[redacted path]")
    .replace(/(^|[\s("'`])\/(?:Users|home|tmp|var|private|etc|usr|opt|bin|Windows|Program Files)\/[^\s"'`<>)\]}\r\n]*/gi, "$1[redacted path]");
}

export function evidenceReport({ request, platform, items, actions, status, stopReason }) {
  const lines = ["# Captured evidence", "", `Request: ${markdown(request)}`, "", `${items.length} records from ${platform}; ${actions.filter((step) => step.command).length} browser operations.`, ""];
  if (platform === "instagram" && /kick|clip|trend|breakout/i.test(request)) {
    const signals = instagramTrendSignals(items);
    lines.push("## Instagram trend signals", "", "Account medians require 12 profile-captured posts with known views, dates, and pin status, ordered newest first after removing pinned posts. An incomplete sample leaves the median unknown. A breakout candidate must be an opened Reel aged 2–48 hours with at least 3× that account median; candidates rank by views per hour.", "");
    const rankedProfiles = [...signals.profiles].sort(([, a], [, b]) => (b.medianViews ?? -1) - (a.medianViews ?? -1) || b.recentReels - a.recentReels);
    lines.push("Accounts below are shown in observed median-view order, then by confirmed Reels in 7 days. Kick relevance must be assessed from the linked evidence; opening a profile alone does not establish relevance. Incomplete metrics cannot establish the requested source ranking.", "");
    for (const [profile, baseline] of rankedProfiles) {
      lines.push(`- [Account](${profile}): median views ${baseline.medianViews ?? "unknown"} (${baseline.baselineCount} view counts across ${baseline.baselinePosts}/12 confirmed-unpinned posts${baseline.pinUnknown ? `; pin status unknown for ${baseline.pinUnknown}` : ""}${baseline.orderUnknown ? `; dates unknown for ${baseline.orderUnknown}` : ""}); Reels confirmed within 7 days ${baseline.recentReels}${baseline.unknownAgeReels ? `; total unknown, age missing for ${baseline.unknownAgeReels}` : "; observed sample only"}.`);
    }
    if (!signals.profiles.size) lines.push("- Account baselines: unknown; no profile-to-post relationships were captured.");
    lines.push("");
    const candidates = signals.reels.filter((item) => item.breakout);
    if (candidates.length) {
      for (const reel of candidates) lines.push(`- [Breakout candidate](${reel.url}): ${reel.views} views; ${reel.ageHours.toFixed(1)} hours old; ${reel.medianMultiple.toFixed(1)}× account median; ${reel.viewsPerHour.toFixed(0)} views/hour.`);
    } else {
      lines.push("- Breakout candidates: none verified; no captured Reel meets all age, view, and baseline requirements.");
    }
    lines.push("");
  }
  for (const [index, item] of items.entries()) {
    lines.push(`## ${index + 1}. ${markdown(item.title || item.name || item.author || "Captured result").slice(0, 180)}`, "", `[Source](${item.url})`, "");
    const text = item.caption || item.description || item.text || item.bio || item.subtitle;
    if (text) lines.push(markdown(text), "");
    lines.push(item.detail_read ? "Details opened through socai." : "Search or profile card; details not opened.", "");
    const comments = item.top_comments || (Array.isArray(item.comments) ? item.comments : []);
    for (const comment of comments.slice(0, 8)) {
      const content = comment.text || comment.content;
      if (content) lines.push(`- Comment: ${markdown(content)}`);
    }
    for (const section of ["experience", "education"]) {
      if (item[section]) lines.push("", `${section}: ${markdown(JSON.stringify(item[section]))}`);
    }
    lines.push("");
  }
  lines.push("## Run notes", "", markdown(stopReason));
  if (!(/instagram/i.test(platform) && /kick|clip|trend|breakout/i.test(request))) lines.push("", "This report lists captured evidence; it does not infer trends or rankings from unverified material.");
  if (status !== "completed") lines.push("", "The run is partial. Available evidence has been preserved.");
  return lines.join("\n");
}

function markdown(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return String(text || "").replace(/[\\`*_{}\[\]<>#|]/g, "\\$&");
}

function timestamp(item) {
  for (const key of ["published_at", "taken_at", "timestamp", "created_at"]) {
    const value = item[key];
    if (typeof value !== "string" && typeof value !== "number") continue;
    const parsed = typeof value === "number" && value < 1e12 ? value * 1000 : new Date(value).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function ageHours(item, now) {
  const posted = timestamp(item);
  return posted === null ? null : (now - posted) / 3_600_000;
}

function views(item) {
  for (const key of ["view_count", "play_count", "views", "video_view_count"]) {
    const value = item[key] ?? item.engagement?.[key];
    const parsed = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value) : NaN;
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return null;
}

function median(values) {
  if (!values.length) return null;
  values.sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}

function accountUrl(item) {
  for (const raw of [item.source_profile_url, item.author_url, item.profile_url, item.author?.url]) {
    const url = sourceUrl(raw, "instagram");
    if (url && targetKind(url, "instagram") === "profile") return url;
  }
  return null;
}

function pinned(item) {
  const flags = [item.is_pinned, item.pinned, item.pinned_for_users].filter((value) => typeof value === "boolean");
  if (flags.includes(true)) return true;
  return flags.length && flags.every((value) => value === false) ? false : null;
}
