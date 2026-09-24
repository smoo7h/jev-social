# How GitHub code detects "trending right now" for short-form clips

Research date: 2026-09-24. Scope: public GitHub repositories only (a separate note covers the general web).
Method: `gh search repos` / `gh search code`, then shallow clones into a scratch directory, reading the
function that computes the signal. Every claim below cites a file at a pinned commit SHA. Star counts,
licenses and archive flags come from `gh api repos/{owner}/{repo}` on 2026-09-24. "Last commit" is the
date of the default-branch HEAD commit, not GitHub's `updatedAt` (which moves on stars and issues).

Firecrawl was unusable in this session (`firecrawl_search` returned HTTP 400, the GitHub research tool is
deprecated, `firecrawl_developer_search` returned 404), so all discovery used the `gh` CLI. No
instagram.com, tiktok.com, kick.com or twitch.tv page was fetched.

## 1. TL;DR

Ranked by how many recent repos use each technique, and how well they use it:

1. **Ask the platform for a time window, sorted by views.** This is the most common approach, and it is the
   one parameter Instagram keyword search lacks. Examples: Twitch Helix `GET /helix/clips?started_at=…`
   (results come back in view-count order), Kick's internal `GET kick.com/api/v2/channels/{slug}/clips?sort=view&time=…`,
   and YouTube `search.list(order="viewCount", publishedAfter=now-14d)`. Every Twitch or Kick clip harvester
   found uses one of these, then applies a `min_view_count` floor.
2. **Views per hour since publish, compared with the channel's own median.** This is the most carefully
   engineered signal. `keel-crawler` flags a video as "breaking" when its views-per-hour is at least 3 times the channel's
   median pace and the video is no more than 72 hours old. ViralMint gives views-per-hour 25% of its virality score. `nyan` keeps
   stories above a views-per-hour percentile, with a stricter bar for young stories. `genlab` sets per-niche views-per-hour
   floors.
3. **Chat message rate compared with a slow EMA baseline**, plus a minimum rate, a sustain period, hysteresis and a cooldown.
   Five live-stream auto-clippers use this. It works only on live chat, which Jev never sees. The shape of the
   technique still carries over: a fast measurement against a slow baseline, a required multiple and a
   cooldown. `genlab` has a variant that votes "2 of 3 signals" (z-score, % change, rank velocity).
4. **Watch a known list of accounts and normalise by followers.** `mirsella/instagram-reels-scraper`
   drives a real browser to each watched account's `/reels/` tab and reads `taken_at`
   and `play_count` from the network responses. It ranks reels by `play_count / followers` and groups them into today, yesterday and last month.
   It is the only Instagram approach found that avoids keyword search altogether, and it
   matches jev-social's architecture most closely.
5. **Cross-source corroboration.** `nyan` publishes a story only after it has appeared on at least `min_channels`
   distinct channels. It also sums views after removing outliers (`debiased_views`). For clips, the equivalent is:
   the same n3on moment reposted by several fan or clip accounts in the last few hours.
6. **Platform-native trending endpoints**, such as Kick `sort=trending` and the TikTok Creative Center hashtag list
   with `rank_diff_type` rising, stable or falling. The ranking is computed on the platform's servers, and no repo
   documents how.
7. **An LLM `viral_score` prompt** over a transcript (autoshorts, viral-clips-crew). This is the least rigorous
   approach: no baseline and no time dimension. It judges whether a moment is clippable, not whether it is trending.

## 2. Repo table

S = stale (no commits since 2024), listed for completeness only. No repo in the table is archived.

| Repo | Stars | Last commit | License | Signal it computes | Where in code (file:function) | Data source / API | Notes |
|---|---|---|---|---|---|---|---|
| [AnarchistSid/genlab-platform](https://github.com/AnarchistSid/genlab-platform) | 8 | 2026-09-21 | MIT | (a) Twitch clips from the last N days, `view_count >= min_views`, sorted by views; (b) YouTube views/hour above per-niche floor; (c) Steam player spike: at least 2 of 3 of z≥2, +50% vs rolling mean, rank up ≥5 | `genlab_core/pipeline/stages/fetch_twitch_clips.py:_fetch_clips_for_game` (L197-213), `execute` (L341-343); `media/trending_video_fetcher.py:MIN_VIEW_VELOCITY` (L236-243); `CriticalRush/niches/gaming/flows/spike_detector_flow.py:detect_spikes` (L124-210) | Twitch Helix, YouTube Data API v3, Steam Web API | Most complete production pipeline found; polls every 5 min, 1 h cooldown |
| [miladsafaei-me/keel-crawler](https://github.com/miladsafaei-me/keel-crawler) | 0 | 2026-09-24 | none | Views/hour; channel median baseline; "breaking" = ≥3× channel's settled views-per-hour pace and ≤72 h old | `src/keel_crawler/youtube/velocity.py:channel_baseline`, `outlier_multiplier`, `views_per_hour`, `early_pace_baseline`, `read_velocity`, `VelocityReading.is_breaking` (L62-150) | YouTube Data API v3 | Best-reasoned code in the set; 0 stars, created 2026 |
| [openclaw-easy/ViralMint](https://github.com/openclaw-easy/ViralMint) | 112 | 2026-09-21 | AGPL-3.0 | Virality 0-100 = 30% engagement rate + 25% views/hour (capped at 10k) + 20% recency + 15% views + 10% likes; outlier = views / channel median (tiers at 3×, 5×, 10× and 20×); keyword velocity = mean of the last 25% of a Google Trends 7-day series ÷ mean of the first 75% | `backend/agents/scout.py:compute_virality_score` (L51-120); `backend/services/outlier_detection_service.py:compute_outlier_scores` (L53-87); `backend/services/trend_velocity_service.py:check_keyword_velocity` (L32-96) | yt-dlp search, TikHub, YouTube API, pytrends | AGPL: copy ideas, not code |
| [NyanNyanovich/nyan](https://github.com/NyanNyanovich/nyan) | 326 | 2026-08-25 | Apache-2.0 | Cluster views/hour (the top post is capped at the second-highest, so one runaway post cannot dominate); keep if above a percentile; stricter percentile for young clusters; require ≥ `min_channels` distinct channels | `nyan/clusters.py:debiased_views` (L87-97), `views_per_hour` (L104-106); `nyan/ranker.py:__call__` (L24-33), `filter_by_views` (L64-120) | Telegram channel posts | Not a clip tool; best-tested corroboration pattern |
| [89891383/Kick-Clips-Player](https://github.com/89891383/Kick-Clips-Player) | 0 | 2026-09-12 | none | Kick channel clips, `sort=date\|view`, `time=all\|day\|week\|month`, cursor paging | `index.html` (L116-125 options, L269-271 API builder) | kick.com internal `api/v2/channels/{slug}/clips` | Single HTML file |
| [sarperavci/kick-unofficial-api](https://github.com/sarperavci/kick-unofficial-api) | 25 | 2025-01-27 | MIT | Same Kick endpoint; enum `sort=views\|date\|trending`, `time=24h\|7d\|30d\|all` | `src/api.py:SortOption`/`TimeFilter` (L21-31), `get_channel_clips` (L331-365) | kick.com internal v2 | Value spellings differ from the row above (`view`/`day` vs `views`/`24h`). Verify live before relying on either |
| [GRaVeMoTo/ClipsToVideoMaker](https://github.com/GRaVeMoTo/ClipsToVideoMaker) | 0 | 2026-09-08 | none | Kick clips filtered client-side by `created_at > now - days` | `Kick.py:get_recent_kick_clips` (L4-47) | kick.com internal v2 (curl_cffi, impersonates Chrome to get past Cloudflare) | Shows the endpoint needs a browser fingerprint |
| [PredaaA/kickcom.py](https://github.com/PredaaA/kickcom.py) | 12 | 2026-09-18 | MIT | Live streams sorted by `viewer_count` or `started_at` | `src/kickpy/client.py:fetch_livestreams` (L525-570) | Official Kick public API (`/public/v1/livestreams`, deprecated; v2 exists) | The official API has **no clips endpoint**: neither official wrapper mentions clips |
| [nekiro/kick-api](https://github.com/nekiro/kick-api) | 9 | 2026-08-11 | MIT | Live streams, `viewer_count` | `src/modules/livestreams.ts` (L12, L128-150) | Official Kick public API v1/v2 | Confirms no official clips route |
| [viniciusenari/twitch-highlights-bot](https://github.com/viniciusenari/twitch-highlights-bot) | 48 | 2025-04-24 | GPL-3.0 | Twitch clips in the previous Sunday-to-Saturday window, from Helix view-count order | `project/clips.py:ClipsExtractor.get_clips` (L32-58) | Twitch Helix `/clips` | Canonical example of a time-windowed Helix query |
| [teklynk/twitch_clips_player](https://github.com/teklynk/twitch_clips_player) | 35 | 2026-09-16 | none | `dateRange` days to `start_date`/`end_date`, `prefer_featured` | `assets/js/clips.js` (L171-185, L538-557) | Twitch Helix via the author's PHP proxy | Falls back to "any clip" when the window is empty; don't copy that silent widening |
| [pheelip1577/clipcatcher](https://github.com/pheelip1577/clipcatcher) | 0 | 2026-08-26 | MIT | Chat messages/s ≥ max(2, 3 × EMA baseline); 60 s warmup; 30 s cooldown | `clipcatcher/app/hype_detector.py:HypeDetector._loop` (L70-102) | Twitch IRC | Has tests |
| [Higuy3000/twitch-clipbot](https://github.com/Higuy3000/twitch-clipbot) | 0 | 2026-07-26 | none | 10 s rate vs EMA (τ=300 s); factor ×3, relaxed to ×2 if ≥35% hype words; must hold for 15 s with hysteresis | `clipbot/detector.py:SpikeDetector._check` (L142-182) | Twitch IRC | Clearest spike detector |
| [windycityassassin/reactorlab](https://github.com/windycityassassin/reactorlab) | 0 | 2026-08-29 | none | z(audio RMS)·0.6 + z(chat msgs per 2 s bin)·0.4 ≥ 1.2, then NMS 30 s | `clipping/src/clipping/score.py:detect_highlights` (L114-175); `chat.py:velocity_curve` (L99) | Twitch IRC + stream audio | |
| [Vladshmalii/twitch-auto-clip-bot](https://github.com/Vladshmalii/twitch-auto-clip-bot) | 0 | 2025-10-14 | none | Weighted sum: 0.4·min(chat_velocity/100,1) + audio + video + keywords > 0.7 | `app/services/signal_aggregator.py:calculate_scores` (L17-44) | Twitch IRC, audio, video | Fixed normalisation, no baseline; weak |
| [bihanikeshav/TwitchSnipBot](https://github.com/bihanikeshav/TwitchSnipBot) | 1 | 2025-08-02 | none | 10 s windows with 5 s stride: message rate, unique users, emote density, caps ratio, repetition, entropy; labels are z-scored | `snipbot/features/feature_set.py` (L50-101); `snipbot/labeling/statistical.py:auto_label`, `_z_scores` (L10, L80-86) | Twitch chat logs | ML-feature variant |
| [ChuccyKimber/Kick-Hype-meter](https://github.com/ChuccyKimber/Kick-Hype-meter) | 0 | 2026-03-04 | none | Decaying hype accumulator from Kick chat events | `public/index.html` (hypeScore / decayRate logic) | Kick chat (OAuth) | Overlay only |
| [mirsella/instagram-reels-scraper](https://github.com/mirsella/instagram-reels-scraper) | 2 | 2026-05-17 | none | For each watched account: reels with `taken_at`, `play_count`, likes and comments, ranked by `play_count / followers`, bucketed into today, yesterday and last 30 days | `src/insta/scraper.rs` (L39 intercepts `/api/v1/media/…/info/`, L60-71 reads followers); `src/insta/reel.rs:From<&Value>` (L23-53), `set_ratio` (L55-58); `src/main.rs` (L58-90 sort + buckets) | Headless Chrome, logged-in Instagram, network interception | **Closest to the jev-social architecture** |
| [ericaryu/instagram-ai-trend](https://github.com/ericaryu/instagram-ai-trend) | 0 | 2026-03-06 | none | Hashtag posts, `videoPlayCount ≥ MIN_VIEWS`, sorted by likes + comments | `01_scrape_top_posts.py` (L79-105); `02_clean_and_filter.py:calculate_engagement` (L34-41), sort (L98-99) | Apify `instagram-hashtag-analytics-scraper` / `instagram-hashtag-scraper` | Passes only `resultsType:"posts"`, so the code does not show whether the results are top or recent. **No recency filter at all** |
| [youmeat6678/Instagram-Hashtag-Scraper](https://github.com/youmeat6678/Instagram-Hashtag-Scraper) | 16 | 2026-09-24 | GPL-3.0 | None: scrolls hashtag search results | `scraper.py` (L492: `explore/search/keyword/?q=%23{tag}`) | Selenium | Same endpoint jev-social is stuck on, which confirms the problem rather than solving it |
| [helenamerk/tiktok-trending-api](https://github.com/helenamerk/tiktok-trending-api) | 0 | 2026-01-19 | none | TikTok Creative Center keyword and hashtag lists, `period=7`, `order_by=post\|popular`, by country | `src/services/tiktok-client.ts` (L52 base URL, L99 cookie bootstrap, L139-173 params) | `ads.tiktok.com/creative_radar_api/v1` | Ranking is computed by the platform |
| [Aryadev2005/airra-scrapers](https://github.com/Aryadev2005/airra-scrapers) | 1 | 2026-05-24 | none | Reddit: `(score + 2·comments)/ageHours × linear decay to 48 h × upvote-ratio boost`; TikTok CC hashtags with `rank_diff_type` rising, stable or falling | `scrapers/reddit.ts:calcVelocity` (L29-41); `scrapers/tiktok.ts:rankLabel` (L84-87) | Reddit API; TikTok CC via third-party proxy | CC hashtag and video proxy endpoints noted as broken on 2026-05-16 |
| [lofe-w/tiktok-creative-center-scraper-public](https://github.com/lofe-w/tiktok-creative-center-scraper-public) | 1 | 2026-08-18 | none | n/a | `options/*.json` only | TikTok CC | README and option enums only; scraper code is closed |
| [princepal9120/tkt-cli](https://github.com/princepal9120/tkt-cli) | 2 | 2026-06-17 | none | Creator growth: mean plays of videos inside the period minus mean plays of older videos | `src/metrics.ts:computeGrowthData` (L128-150) | TikTok web (signed requests) | Creator analytics, not trend detection |
| [PraveenKumar7545/youtube-shorts-analyzer](https://github.com/PraveenKumar7545/youtube-shorts-analyzer) | 1 | 2025-05-22 | none | Shorts `order=viewCount`, `publishedAfter=now-14d`; views/day | `youtube_api.py:get_trending_shorts` (L76-97); `data_processor.py` (L42) | YouTube Data API v3 | |
| [slaavass/youtube-outlier-finder](https://github.com/slaavass/youtube-outlier-finder) | 5 | 2026-07-25 | MIT | Channel outlier = median Shorts views / subscribers, with subscriber cap and view floor | `src/config.ts` (L10-16, L256-280); `src/index.ts` | YouTube Data API v3 | |
| [shkuratovdesigner/yuben-app](https://github.com/shkuratovdesigner/yuben-app) | 16 | 2026-09-15 | MIT | Channel median views for the outlier baseline | `youtube_api.py:get_channel_median_views` (L353-432) | YouTube Data API v3 | Long-form focus |
| [Virlo-AI/Virlo-Agent-Plugin](https://github.com/Virlo-AI/Virlo-Agent-Plugin) | 0 | 2026-09-23 | MIT | Agent instructions: `order_by=rising`, follower-tier filters, "require 3+ outliers before calling a trend" | `skills/short-form-trend-research/SKILL.md` (L57-85) | Virlo paid API | No computation in repo; useful heuristics |
| [Upload-Post/skill-autoshorts](https://github.com/Upload-Post/skill-autoshorts) | 142 | 2026-05-02 | none | LLM `viral_score` 1-10 per transcript segment; a weekly job ranks winners by 0.6·views + 0.4·engagement rate | `autoshorts.py:ANALYZE_PROMPT` (L255-280), `learn` (L686-725) | Gemini + Upload-Post analytics | Clip selection, not trend detection |
| [alexfazio/viral-clips-crew](https://github.com/alexfazio/viral-clips-crew) | 768 | 2026-02-16 | MIT | LLM ranks the top 4 transcript segments by "viral potential" | `extracts.py` (L61-67) | CrewAI + LLM | No numbers |
| [jdesai22/clip-farming](https://github.com/jdesai22/clip-farming) | 3 | 2026-01-24 | MIT | Weighted hook, motion, audio and scene-change score per scene | `src/viral_scorer.py:score_moments` (L57-110) | Local video | Clip selection, not trending |
| [offish/twitchtube](https://github.com/offish/twitchtube) **S** | 612 | 2023-04-03 | MIT | Most-viewed Twitch clips per period | n/a | Twitch Helix | Stale; not used for conclusions |
| [xurei/twitch-highlights-logger](https://github.com/xurei/twitch-highlights-logger) **S** | 35 | 2023-05-13 | GPL-3.0 | VOD chat activity | n/a | Twitch | Stale; not used for conclusions |

Permalink form for every row: `https://github.com/{repo}/blob/{sha}/{path}#L{a}-L{b}`. SHAs are in §5.

## 3. Techniques in detail

### 3.1 Time-windowed platform query, ordered by views (Twitch / Kick / YouTube)

Twitch Helix returns clips created inside `[started_at, ended_at]`, most-viewed first. genlab
(`fetch_twitch_clips.py` L204-213, L341-343):

```python
started_at = (datetime.now(UTC) - timedelta(days=lookback_days)).isoformat()
r = requests.get("https://api.twitch.tv/helix/clips", headers=headers, params={
        "game_id": game_id, "first": max_clips, "started_at": started_at})
...
all_clips = [c for c in all_clips if c.get("view_count", 0) >= min_views]
all_clips.sort(key=lambda x: x.get("view_count", 0), reverse=True)
```

Kick has no clips route in its official public API. Every harvester uses the internal endpoint instead.
Kick-Clips-Player, `index.html` L269-271:

```js
const API=(cur)=>{ let u=`https://kick.com/api/v2/channels/${encodeURIComponent(streamer)}/clips?sort=${encodeURIComponent(sort)}&time=${encodeURIComponent(time)}`; if(cur)u+=`&cursor=${cur}`; ... };
const buildCursor=last=>(!last||!last.id)?null:{view:sort==="view"?(last.views??last.view_count??0):0,id:last.id};
```

`time` is `all|day|week|month` there, but `24h|7d|30d|all` in kick-unofficial-api (`api.py` L27-31). That repo
also lists a `sort=trending` option. For "n3on clips from the last 6 hours", the closest native query is
`sort=view&time=day`, followed by a client-side filter on `created_at >= now-6h`. GRaVeMoTo's
`get_recent_kick_clips` (`Kick.py` L20-38) does the same with a day cutoff. Its use of `impersonate="chrome120"` shows
that Cloudflare blocks plain HTTP clients.

YouTube: `search.list(videoDuration="short", order="viewCount", publishedAfter=now-14d)`
(`youtube-shorts-analyzer/youtube_api.py` L91-97).

### 3.2 Views per hour since publish, compared with the channel's own pace

keel-crawler, `velocity.py` L62-80 and L106-113:

```python
def channel_baseline(view_counts, *, window=20):
    return median([float(v) for v in view_counts[:window]])   # median, so one hit can't hide the next
def outlier_multiplier(view_count, baseline):
    if baseline <= 0: return 0.0                              # no baseline -> no claim
    return round(view_count / baseline, 2)
...
    def is_breaking(self) -> bool:
        return self.multiplier >= 3.0 and self.age_hours <= 72
```

`early_pace_baseline` (L116-129) builds the channel's normal views-per-hour only from videos 3-60 days old. Younger videos
are still accelerating, and older ones have flattened. `hours_since` floors age at 0.25 h, which prevents a divide-by-zero spike.

ViralMint, `scout.py` L85-98:

```python
hours_old = max((now_utc - upload_date).total_seconds() / 3600, 1)
engagement_rate = (likes + comments * 2) / views
recency_bonus = 1.0 / (1 + days_old / 30)
vph = views / hours_old
vph_score = min(vph / 10_000, 1.0)
```

nyan, `ranker.py` L96-105 plus L108-120, uses percentiles instead of fixed caps. It sorts all candidates' views-per-hour, takes the
value at `views_percentile` as the bar, and applies a higher percentile to items younger than
`higher_trigger_age_minutes`. Fresh items must clear a higher bar because their views-per-hour is noisy.

### 3.3 Chat-rate spike against a slow baseline (live only)

twitch-clipbot, `detector.py` L143-164:

```python
rate = len(self._msgs) / self.window                       # last 10 s
needed_factor = self.factor * (2/3) if hype >= self.hype_bonus else self.factor
threshold = max(self.min_rate, needed_factor * baseline)   # baseline = EMA, tau 300 s
if self._hot_since is None:
    if rate < threshold: return None
    self._hot_since = now
elif rate < threshold * self.sustain_floor:                # hysteresis
    self._hot_since = None; return None
...
if held < self.sustain: return None                        # must stay hot 15 s
```

clipcatcher uses the same idea with an EMA α of 0.0023 per 0.5 s tick (`hype_detector.py` L84-102). reactorlab z-scores
chat bins and audio loudness, combines them 0.4/0.6, and applies non-maximum suppression (`score.py` L143-175). genlab's Steam
detector (`spike_detector_flow.py` L176-195) is a polling analogue that suits snapshot data:

```python
z = _z_score(players, history[:-1])
pct_change = (players - avg) / avg if avg > 0 else 0
rank_vel = old_avg_rank - rank
signals = [z >= 2.0, pct_change >= 0.50, rank_vel >= 5]
if sum(signals) >= 2: ...
```

### 3.4 Account watchlist, normalised by followers (Instagram)

mirsella, `scraper.rs` L39 and L60-71, plus `reel.rs` L29-35 and L55-58. The scraper navigates to `instagram.com/{account}/reels/`,
intercepts `/api/v1/media/…/info/`, and reads `play_count`, `like_count`, `comment_count`, `taken_at` and followers:

```rust
let views = reel["play_count"].as_u64().map(|v| v as usize);
let epoch_time_s = reel["taken_at"].as_i64().unwrap();
...
pub fn set_ratio(&mut self, followers_count: usize) {
    let ratio = self.views.unwrap_or_default() as f32 / followers_count as f32;
```

`main.rs` L58-90 sorts by ratio and writes separate `today`, `yesterday` and `last month` sheets. slaavass does the
same at channel level (median Shorts views ÷ subscribers, `config.ts` L10-16).

### 3.5 Cross-source corroboration

nyan, `ranker.py` L24-33, plus `clusters.py` L87-97:

```python
unique_channels = {d.channel_id for d in cluster.docs}
is_big_cluster = len(unique_channels) >= min_channels
...
views.sort(reverse=True)
views[0] = views[1]        # cap the single biggest post so one outlier can't carry the cluster
return sum(views)
```

The Virlo skill states the same rule in prose: "One-off viral videos are noise. Look for a pattern across 3+
outliers" (`SKILL.md` L85).

### 3.6 Platform-native "trending" lists

Two examples: TikTok Creative Center `creative_radar_api/v1` with `period`, `country_code` and `order_by=post|popular` (helenamerk
`tiktok-client.ts` L52, L139-141), and `rank_diff_type` 1/2/3 for rising, stable or falling (airra `tiktok.ts`). Kick also offers `sort=trending`.
None of these repos shows how the platform computes the ranking. The endpoints also break often (airra's header lists the
CC hashtag and video proxies as returning `{}` since 2026-05-16).

## 4. Could Jev do this?

The AGENTS.md boundary applies: Jev chooses from options the application builds and returns typed judgments. It never
writes numbers, URLs or selectors. The table below says which part of each technique stays in code and which can become a
Jev question.

| Technique | Keep in code (numeric) | Map to Jev (semantic), with the exact question |
|---|---|---|
| Time window + view sort | `published_at >= now - window`; drop older posts; sort by views. The window comes from the goal ("last 6 hours"), parsed by code or chosen by Jev from a fixed menu | **Choice** over `{1h, 6h, 24h, 7d, any}`: "Which recency window does this research goal ask for?" |
| Views per hour + channel median | `vph = views / max(age_h, 0.25)`; the author's baseline is the median of the recent posts we opened on that author; `multiplier = vph / baseline`; breaking = ≥3× and ≤72 h (keel-crawler) | None. Jev only receives the resulting number as state text when choosing the next action |
| Recency when `published_at` is missing (search cards) | Prefer opening the post to read `published_at` | **Yes/no probability** on the card or caption text: "Does this post describe something that happened within the last day?" Use it to decide which cards to open first, never as a substitute for the timestamp in the report |
| Re-upload detection | none | **Yes/no**: "Is this post a re-upload of an older clip rather than a new moment?" (caption plus top comments such as "this is old", "from 2024") |
| Cross-account corroboration (nyan) | Count distinct authors per cluster, apply `min_accounts`, sum views after capping the top post | **Yes/no probability** per candidate pair: "Do these two posts show the same streamer moment?" Code builds the clusters from Jev's pairwise answers |
| Chat-hype detection → comment reaction | Ratio of hype-token comments, comment count per hour | **Score**: "How strongly do these top comments read as a reaction to a fresh, live moment rather than generic praise?" |
| Account watchlist (mirsella) | Visit each watched profile's reels tab; read `taken_at`, views, followers; `ratio = views/followers` | **Choice** over captured profile targets: "Which of these accounts most likely posts n3on or Kick streamer clips?" Choose once, then walk the list in code |
| Which candidate to open next | Budget and step limits | **Choice** over captured targets: "Which of these posts is most likely a recent n3on clip?" |

The best combination for the n3on case is:

1. Keyword search seeds candidate clip-repost accounts.
2. Jev chooses which of those accounts to watch.
3. Code opens each chosen account's reels tab and keeps only posts with `published_at` in the requested window.
4. Code computes views/hour and a per-author median multiplier.
5. Jev runs pairwise same-moment checks to cluster the posts across accounts.
6. The report ranks clusters by distinct accounts, then by debiased views-per-hour.

## 5. Sources

HEAD commit SHAs, as cloned on 2026-09-24:

- AnarchistSid/genlab-platform @ `c77c1e47f7f48e068b19a5101efe9eddbc3a6429`
- miladsafaei-me/keel-crawler @ `8f54efcc3268c0fa0b7989e277902824031b08bc`
- openclaw-easy/ViralMint @ `a036f39b8ed3127f6cb2dc5c9b5938aceb2cd09f`
- NyanNyanovich/nyan @ `67d573d0a653559f070159c6621d9e53504337fe`
- 89891383/Kick-Clips-Player @ `5dc560b1072c3c4ac56e9dde7626c02b350b2bda`
- sarperavci/kick-unofficial-api @ `9022a23e2e3e0b5058f6e73ecdad08dd271b0a5e`
- GRaVeMoTo/ClipsToVideoMaker @ `fe14a4a0b8f780510e0d98d18c4cf51b3a8d971e`
- PredaaA/kickcom.py @ `fe21e02f2490f5d6590beb6c725dad2888391e35`
- nekiro/kick-api @ `e700446571a52577bafed220a08881f08dea5ebf`
- viniciusenari/twitch-highlights-bot @ `ccb33d87b0c1f9b93c41fefbe2b9af97a715cd21`
- teklynk/twitch_clips_player @ `adf3f58967bddd178fba97506b2c61c556ee0a51`
- pheelip1577/clipcatcher @ `162e2418621be6c446169676715eeea588c48a9d`
- Higuy3000/twitch-clipbot @ `3431055027862565bfb903185088d36047cdd00f`
- windycityassassin/reactorlab @ `2fb91a593279b90a69af05debbdc0c73125d1499`
- Vladshmalii/twitch-auto-clip-bot @ `96d67fc4254bb744e862b975df81e49a5c598ede`
- bihanikeshav/TwitchSnipBot @ `7d3fa2fad8dee60c03617a30706214009012b1ea`
- ChuccyKimber/Kick-Hype-meter @ `de1ef440f03642a4f32de211101990756c812710`
- mirsella/instagram-reels-scraper @ `7560caaf8d2dcc0b4300ac195b92daf23af698a5`
- ericaryu/instagram-ai-trend @ `226b995f1a30b019e64965103a970c316869ae3b`
- youmeat6678/Instagram-Hashtag-Scraper @ `7796703fc8c2fa8ef4da8dee53c35ccfb1a5d5b2`
- helenamerk/tiktok-trending-api @ `197443e109a855f4fdae849c5cdcb9c57c517669`
- Aryadev2005/airra-scrapers @ `5529c82ef0b1cfd6432399309bd29a52e9806039`
- lofe-w/tiktok-creative-center-scraper-public @ `7c7d044eda4d7843af1d181165f4c9834781e187`
- princepal9120/tkt-cli @ `15164b42bacdada647a1b563c82fd9bf42b5584d`
- PraveenKumar7545/youtube-shorts-analyzer @ `ade88c30740b9ce0d1be5d4e153820f2f7c22f15`
- slaavass/youtube-outlier-finder @ `73b3fd714f028da8e4a9139a97f87eb5c16b5268`
- shkuratovdesigner/yuben-app @ `2ef920572074bf342dcc59e5d94f309efdb394fc`
- Virlo-AI/Virlo-Agent-Plugin @ `3983f4dc1a3b2304cbdcac3135ef93b8bd500a1f`
- Upload-Post/skill-autoshorts @ `e902b2a8d9dcd0ee98e776b5e0455c6c1f30618a`
- alexfazio/viral-clips-crew @ `82888d948177216949ab432031f3867b5a19a1c6`
- jdesai22/clip-farming @ `d2c6aa57481132ff9d266fc9e3c86c3d6aa096a1`
- offish/twitchtube @ `212a53d4a5141594b5db91b1b672fb26b79aea2a` (stale)
- xurei/twitch-highlights-logger @ `e0106637abe724d77b6d4f0c406d3b73c8e0a261` (stale)

Screened and dropped as having no signal code, as off-topic, or as scaffolding with no stars: `mopidevimahima/instagram-trends-collector`
(scrapes a later.com blog post), `briceparrott1/trend-setter` (Google Trends `rising_percent` only),
`Pihu1998/social-trend-agent` (TikTokApi hashtag fetch with no ranking), `andrei0182/tiktok-market-scout` (ad
saturation), `skovely/tiktok-trendslayer` (README/skill only, EchoTik API), `data-scrape/instagram-hashtag-scraper`,
`genaroibc/clippitt`, `yui-915/kick-chat-downloader`.

Caveats: the Kick endpoints are undocumented and their parameter spellings disagree between repos. The TikTok CC
endpoints are unstable. None of this was validated live, as required by the brief.
