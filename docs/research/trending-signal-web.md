# Trending-right-now signals for short-form streamer clips (open-web research)

Researched 2026-09-24. Scope: how people outside this project detect what is
trending in the last few hours for Kick/Twitch streamer clips, IG Reels, TikTok
and YouTube Shorts. GitHub repos are covered by a separate note.

Conventions:

- **[primary]**: official platform or vendor documentation, fetched on the date shown.
- **[secondary]**: blog or vendor-marketing text. Used only for "who does what".
- **[stale]**: published before 2025. Not used for conclusions.
- "fetched 2026-09-24" means the page shows no date of its own.
- No instagram.com, tiktok.com, kick.com or twitch.tv content pages were fetched.
  Only their developer or docs hosts were fetched.

## 1. TL;DR: strongest signals for "trending right now", ranked

1. **Twitch Helix `GET /helix/clips` with a `started_at`/`ended_at` window.**
   The server returns clips created inside the window, sorted by `view_count`
   descending, and each has `created_at`. This is the only official endpoint we
   found that is both time-filtered and popularity-sorted for streamer clips.
   It needs an app token. It covers Twitch only, and pagination is capped at
   about 1,000 results per query. [primary, 2026-09-16]
2. **Kick live `viewer_count` polling for a known set of streamers.** Kick's
   documented public API has **no clips endpoint**. The v1 livestreams
   endpoint had `sort=viewer_count`, but it was deprecated on 23/06/2026. The
   v2 endpoint is "sorted from oldest to newest" and has no sort. For a fixed
   watch-list such as n3on, use `GET /public/v1/users/livestreams?user_id=`
   (up to 100 IDs, added 03/07/2026) and compute viewer spikes in code.
   [primary, changelog through 11/08/2026]
3. **Live-chat velocity: messages per 5–10 s window compared with a rolling
   baseline.** Commercial auto-clippers (ClipMe, Eklipse, AFKStreamClipper) use
   this to find the moment that is about to become a clip. Twitch EventSub
   `channel.chat.message` works for any channel with the reading user's
   `user:read:chat` scope. Kick `chat.message.sent` works for any channel with
   an app token, but only through a **public webhook URL**, which conflicts
   with jev-social's loopback-only binding. [primary for the APIs; secondary
   for the method]
4. **YouTube Data API `search.list` with `publishedAfter`, `order=viewCount`,
   `videoDuration=short` and `q=<streamer>`.** This is the only official
   cross-platform search that is both time-filtered and sorted by views.
   Follow it with `videos.list` (1 unit per call) to get
   `statistics.viewCount` and `publishedAt` for velocity. The documented quota is
   "100 calls per day" for search. `short` means under 4 minutes, not
   Shorts-only. [primary, 2026-09-14]
5. **Aggregators of community-voted clips.** livestreamfails.com has
   Hot/Trending/New with a "Today" filter and includes Kick clips.
   r/LivestreamFail is available through the Reddit Data API (a reported
   free tier of 100 QPM, not verified against Reddit's own page). Streams Charts has a
   "Top clips on Kick" page. These show which clips humans are upvoting in the
   last few hours. [secondary]
6. **X recent search (last 7 days, up to 100 posts per request,
   pay-per-use at $0.005 per post read).** This is the drama and "what just
   happened on stream" layer that clip channels react to. [primary]
7. **Instagram Graph API.** Hashtag `recent_media` returns only media from the
   last 24 hours, but not in chronological order. It allows 30 unique hashtags
   per 7 days and needs App Review. Business Discovery returns `view_count` and
   `timestamp` per reel for known Business/Creator accounts, such as repost or
   clip pages. Both need the Meta Graph path, which is a different acquisition
   path from socai and Chrome. [primary, 2026-08-17]
8. **Clipping-marketplace boards (Whop Content Rewards and similar).** These
   are a *leading* indicator of which streamers are about to be mass-clipped,
   because someone has funded per-1k-view payouts. There is no API, and all
   evidence is secondary.

**Deprioritised.** None of these can tell you what is trending in the last 6
hours:

- Google Trends API (alpha): data runs only "up to just 2 days ago", and access
  is by application.
- TikTok Research API: new videos take up to 48 h to index, stats lag up to 10
  days, and it is non-commercial only.
- TikTok Creative Center: the shortest window is 7 days, and there is no API.
- Exploding Topics and Glimpse: no sub-day signal documented in what we found.

The Google Trends "Trending now" RSS feed is fresh the same day (verified live
2026-09-24). It is useful as a cross-check when a streamer name spikes in
search, but it has no official docs or terms.

## 2. Signals table

| Signal | How it's obtained (endpoint, auth, cost, limits) | Freshness | Who uses it | Source + date |
|---|---|---|---|---|
| Top clips created in a time window (Twitch) | `GET https://api.twitch.tv/helix/clips?broadcaster_id=…` or `game_id=…` plus `started_at` and `ended_at` (RFC3339; `ended_at` defaults to start + 1 week). Up to 100 per page, and about 1,000 in total across pages ("paginate over different … started_at and ended_at timeframes"). Needs an app or user access token. Free. Token-bucket rate limit per client ID per minute. Fields: `view_count`, `created_at`, `duration`, `vod_offset`, `is_featured`, `title`, `creator_name`. Results by broadcaster or game are "in descending order by view count". | Minutes. The clip appears once created. `vod_offset` is null for "typically minutes". | Clip-channel operators and trackers such as Streams Charts and TwitchTracker-style sites | [Twitch API reference](https://dev.twitch.tv/docs/api/reference/#get-clips), published 2026-09-16; [rate limits guide](https://dev.twitch.tv/docs/api/guide/), fetched 2026-09-24 |
| Live streams by viewer count (Twitch) | `GET /helix/streams` ("descending order by the number of viewers"). Filters: `user_login` (up to 100), `game_id`, `language`. Fields: `viewer_count`, `started_at`, `title`, `tags`. App token. Free. | Live (real time) | Stream trackers and clip operators who pick which live streams to watch | [Twitch API reference](https://dev.twitch.tv/docs/api/reference/#get-streams), 2026-09-16 |
| Live viewers for known streamers (Kick) | `GET https://api.kick.com/public/v1/users/livestreams?user_id=…` (up to 100 IDs; returns `viewer_count`, `started_at`, `title`, `tags`). `GET /public/v2/livestreams` (cursor pagination, filters for `category_id` and `language_code`, "sorted from oldest to newest", no sort parameter). **Deprecated:** `/public/v1/livestreams` with `sort=viewer_count\|started_at` (deprecated 23/06/2026; "Livestreams V1 should now be completely migrated off", 03/07/2026). Needs an OAuth 2.1 app token. Free. | Live | Kick stats sites (KickStats, StreamerStats, Streams Charts) | [Kick livestreams docs](https://docs.kick.com/apis/livestreams.md) and [changelog](https://docs.kick.com/changelog.md), latest entry 11/08/2026 |
| Kick clips | **Not in the documented public API.** The llms.txt index and changelog list no clips endpoint. The only sources are third-party trackers (the Streams Charts "Top clips on Kick, 7 Days" page returned 403 to our fetcher and is not verified) and livestreamfails.com. | Varies | Clip channels | [Kick docs index](https://docs.kick.com/llms.txt), fetched 2026-09-24 |
| Chat velocity (Twitch) | EventSub `channel.chat.message`. "Requires user:read:chat scope from the chatting user." An app token also needs `user:bot` plus the broadcaster's `channel:bot` or moderator status. The WebSocket transport "uses user access tokens" (app tokens fail on WebSockets), so it works from a loopback app with no public URL. Free. | Seconds | ClipMe, Eklipse, AFKStreamClipper (auto-clippers) | [EventSub types](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/), [EventSub WebSockets](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/), fetched 2026-09-24 |
| Chat velocity (Kick) | Webhook event `chat.message.sent`, subscribed via `POST /public/v1/events/subscriptions`. "App access tokens allow you to subscribe to events from any channel given you supply the user ID." Limit: 10,000 subscriptions per event type, or 1,000 for `chat.message.sent` on unverified apps. **Needs a public webhook URL** ("Localhost URLs … won't work"). Also useful: `livestream.status.updated` for stream start and end. | Seconds | Same auto-clippers | [Kick events intro](https://docs.kick.com/events/introduction.md) and [subscribe](https://docs.kick.com/events/subscribe-to-events.md), fetched 2026-09-24 |
| Chat-spike method | Bucket messages into 5–10 s windows. Compare each window with a rolling median or EWMA over the last several minutes, as a multiple or a z-score. Shift the clip start *earlier*, because chat lags by several seconds. Stack the result with audio-loudness and scene-cut signals. | Seconds | ClipMe (vendor) | [ClipMe blog](https://clipme.com/blog/chat-velocity-viral-moments), 2026-07-05 [secondary, vendor] |
| Time-filtered, view-sorted Shorts search | `GET https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=…&publishedAfter=…&order=viewCount&videoDuration=short`. "Quota impact: 100 calls per day. A call to this method has a quota cost of 1 unit in the Search Queries quota bucket." Then `videos.list` (1 unit) for `statistics.viewCount` and `snippet.publishedAt`. API key. Free. | Minutes to hours (index lag not documented) | Clip channels and trend analysts | [search.list](https://developers.google.com/youtube/v3/docs/search/list) and [videos.list](https://developers.google.com/youtube/v3/docs/videos/list), last updated 2026-09-14 |
| IG hashtag, last 24 h | `GET /<IG_HASHTAG_ID>/recent_media?user_id=…&fields=caption,comments_count,like_count,media_type,permalink,timestamp`. "Only returns media objects published within 24 hours". "Responses will not always be in chronological order". Up to 50 per page. **30 unique hashtags per rolling 7 days.** No `username` field. `media_url` is omitted for reels with downloads off or with licensed audio. Needs an Instagram API with Facebook Login app, `instagram_basic`, the **Instagram Public Content Access** feature (App Review), and a Business or Creator account. | Up to 24 h | Social-listening suites (Meta-approved) | [IG Hashtag Recent Media](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-hashtag/recent-media), updated 2026-08-17; [Hashtag search guide](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-facebook-login/hashtag-search.md), fetched 2026-09-24 |
| IG hashtag top media | `GET /<IG_HASHTAG_ID>/top_media`. "Popularity is determined by a mix of views and viewer interaction". Same constraints as above. **No time filter.** | Not time-bounded | Same | [IG Hashtag Top Media](https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-hashtag/top-media.md), fetched 2026-09-24 |
| IG known-account reel stats | `GET /<YOUR_IG_USER_ID>?fields=business_discovery.username(<name>){media{timestamp,view_count,like_count,comments_count,permalink,caption}}`. `view_count` "Available for Business Discovery API only". Business or Creator targets only; age-gated accounts are excluded. Permissions: `instagram_basic`, `instagram_manage_insights`, `pages_read_engagement`. Platform rate limits apply. | Near live counts | Competitor and repost-network monitoring tools | [Business Discovery ref](https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/business_discovery.md), [IG Media ref](https://developers.facebook.com/documentation/instagram-platform/reference/instagram-media.md), fetched 2026-09-24 |
| IG trending audio | Professional Dashboard, then Trending Audio (US professional accounts, up to 50 tracks). No API. Measures audio, not clips. | Days (audio trends "peak within 7 to 10 days") | Creators | [HeyOrca](https://www.heyorca.com/blog/trending-audio-for-reels-tiktok), [Buffer](https://buffer.com/resources/trending-audio-instagram/) (2026) [secondary; search listing only] |
| TikTok Research API | `POST /v2/research/video/query/` with `start_date` and `end_date` (window of 30 days or less). Returns `view_count`, `create_time`, `hashtag_names`, `username`. 1,000 requests or 100,000 records per day. **Non-commercial researchers only.** "New videos take up to 48 hours to be added … statistics … up to 10 days to update." | 48 h or more | Academics | [Query Videos](https://developers.tiktok.com/docs/en/research-api-specs-query-videos) and [Research FAQ](https://developers.tiktok.com/docs/en/research-api-faq), fetched 2026-09-24 |
| TikTok Creative Center | UI only. Trending hashtags, songs, creators and videos, with 7/30/120-day windows. No public API. | 7-day minimum | Advertisers | [Stackmatix guide](https://www.stackmatix.com/blog/tiktok-creative-center-guide) (2026) [secondary; search listing only] |
| Community-voted clip feeds | livestreamfails.com: Hot/Trending/New/Top, "Today" filter, points per clip, covers Twitch, Kick and YouTube; no API or RSS disclosed. r/LivestreamFail through the Reddit Data API: a reported free tier of 100 QPM per OAuth client, averaged over 10 minutes, OAuth required. This comes from a search snippet of Reddit's wiki; the page itself did not load for us, so treat it as unverified. | Minutes | Clip channels and drama channels | [livestreamfails.com/trending](https://livestreamfails.com/trending), fetched 2026-09-24; [Reddit Data API Wiki](https://support.reddithelp.com/hc/en-us/articles/16160319875092-Reddit-Data-API-Wiki) (did not load; unverified) |
| X / Twitter chatter | Recent search, "last 7 days", up to 100 posts per request. Pay-per-use at $0.005 per post read, capped at 3M post reads per month. Same-day duplicate reads are deduplicated. | Minutes | Drama and clip accounts | [X search intro](https://docs.x.com/x-api/posts/search/introduction), [X pricing](https://docs.x.com/x-api/getting-started/pricing), fetched 2026-09-24; pay-per-use launch Feb 2026 per [MediaNama](https://www.medianama.com/2026/02/223-x-developer-api-pricing-pay-per-use-model/) [secondary] |
| Google Trends RSS "Trending now" | `https://trends.google.com/trending/rss?geo=US`, no auth. Items have `pubDate`, `ht:approx_traffic` and news links. Undocumented. | Same day (item timestamped 2026-09-24 09:10 PT when fetched) | SEO and news desks | Fetched live 2026-09-24 |
| Google Trends API (alpha) | Application-only alpha. Daily, weekly, monthly and yearly aggregations over 1,800 days. "The data goes all the way up to just 2 days ago." | 2 days or more | Researchers and publishers | [Google Search Central blog](https://developers.google.com/search/blog/2025/07/trends-api), 2025-07-24 |
| Velocity math (views per hour against the creator's baseline) | Code only. Velocity ratio = views in window ÷ the creator's average for the same window: 10x or more is "viral velocity" and 50x or more is a "breakout". Share ratio = (shares + saves) ÷ views, where 3% or more signals organic spread. | Depends on polling | Analysts and agencies | [Greenfrog Labs](https://greenfroglabs.com/blog/viral-video-definition-metrics-thresholds), 2026-04-11 [secondary] |
| Funded clip campaigns | Whop Content Rewards: brands or streamers fund campaigns at a rate per 1k views; clippers post to TikTok, Reels, Shorts and X and submit URLs. Payouts after about a 72 h review; the budget pool is first-come. No API. | Hours to days (leading) | Clippers | [OpusClip blog](https://www.opus.pro/blog/whop-content-rewards), 2026-08-12 [secondary] |

Stale or unused: the Kotaku piece on r/LivestreamFail (2018) and Know Your Meme
are [stale]. The claim that "10k views in the first hour → 1M in 72 h" comes
from SEO blogs, has no source, and is not used.

## 3. Recency in Instagram specifically

- **Web keyword search** (`/explore/search/keyword/?q=`): according to the
  task brief and observed socai runs, it has no recency or sort parameter. We
  could not verify this against official docs, and we did not fetch
  instagram.com. Meta documents no public web-search API.
- **Graph API hashtag `recent_media`** is the only documented time filter. It
  returns a hard 24-hour window, but:
  - results are "not always in chronological order";
  - only 50 results per page;
  - 30 unique hashtags per rolling 7 days, and even requesting the edge counts
    against the limit;
  - no `username` field, so the author can't be known without another lookup;
  - `media_url` is missing for many reels;
  - it needs a Facebook Login app with App Review for Instagram Public Content
    Access and an IG Business or Creator account as the querying user.

  Usable for tags such as `#n3on` or `#kickclips`, but it is an entirely
  separate, credentialed acquisition path from socai. [primary, 2026-08-17]
- **Graph API `top_media`** is popularity-ranked with no time bound. It has
  the same constraints. [primary]
- **Business Discovery** gives `timestamp` and `view_count` per media item of
  a named Business or Creator account. This suits watching a curated list of
  clip and repost pages, such as fan pages that repost n3on clips. The docs
  describe cursor pagination but **do not state the ordering**, so treat
  newest-first as unverified. [primary]
- **Inside the existing socai path:** each opened post already yields
  `published_at` and engagement counts. On a profile grid, recency comes from
  the product UI, which is observed, not documented. So the cheapest fix
  inside jev-social is to have code filter and sort opened posts by age, and
  to prefer *profile* targets (known clip or repost accounts) over keyword
  search when the goal names a time window.
- **Deprecated:** the Instagram Basic Display API was already shut down before
  this research window (Dec 2024, [stale] knowledge, not re-verified). All
  current reads use the "Instagram API with Facebook Login" or "with Instagram
  Login" docs above.

## 4. Could Jev do this?

Rule: code computes every number and time; Jev judges text. Judgment types
are Score, Yes/no probability (Noul) and Choice. Jev never
estimates velocity, parses timestamps, or picks URLs outside the
code-built candidate set.

| Signal | What code must compute | Jev judgment (typed) |
|---|---|---|
| Recency window | `ageHours = now − published_at` (IG post) or `created_at` (Twitch clip). Drop anything older than the goal's window, for example 6 h, *before* the model sees it. | None. This is a pure filter. If the goal's window is vague ("recent", "this week"), use a **Choice** to map the goal to one of {1h, 6h, 24h, 7d}. |
| View velocity | `viewsPerHour = views / max(ageHours, 0.25)`. Ratio against the account's median views-per-hour from its last N opened posts. Flag ratios of 10x or more. | **Choice** over a shortlist that code has already ranked by velocity: "which of these best matches the goal?" |
| Is it about streamer X | Normalise aliases (for example n3on / neon / @n3on) as a code-side list. | **Yes/no probability**: "is this post about streamer X?" over caption, author and top comments. Filter at p ≥ threshold. |
| Clip-worthiness / "moment" | Build the text state: caption, top comments, and title from a Twitch or Kick clip. | **Score** 0–1: "is this a stream-highlight clip (a reaction or incident) rather than promo or ad content?" |
| Drama or incident detection | Poll the timestamped LSF, Reddit, X or Trends RSS items. Dedupe by URL. | **Yes/no probability**: "does this headline describe a new on-stream incident involving X?" Then a **Choice** of which incident to search for next. |
| Kick or Twitch live spike | Poll `viewer_count` every N minutes and compute Δ against a rolling baseline. Chat-velocity z-score per 10 s window, where the transport allows. | **Yes/no probability**: "is the stream title or current chat excerpt a clip-worthy moment?" Gate this on a numeric spike computed in code. |
| Top clips window (Twitch) | Call Helix clips with `started_at = now − 6h`. The server already sorts by views. | **Score** of relevance to the goal over clip `title`, `broadcaster_name` and `creator_name`. Then a **Choice** of which clip to open next. |
| Repost-network watching | Keep a curated account list. Compute per-account baseline velocity and cross-account duplicate detection (same caption or audio). | **Yes/no probability**: "are these two posts the same clip?" over captions. Then a **Choice** of which account to open next. |
| Funded-campaign signal | A manual or allowlisted list of streamers who currently have funded campaigns. | **Yes/no probability**: "does this post look like a paid clip-campaign repost?" (hashtags, campaign tags). This is useful for down-weighting astroturfed velocity. |

What this means for jev-social under the current constraints (socai only,
read-only, loopback):

- The cheapest win is a code-side recency filter plus velocity ranking on data
  socai already returns (`published_at`, view and like counts).
- The next step is profile targets for known clip and repost accounts instead
  of keyword search.
- Twitch Helix clips, YouTube search, and Kick `users/livestreams` would each
  be a new non-browser capability. Detect them like socai capabilities and
  fail visibly when they are absent.
- Kick chat webhooks need a public URL, which conflicts with the loopback-only
  boundary in AGENTS.md. Treat them as out of scope without a design review.

## 5. Sources

Primary:

- Twitch API Reference (Get Clips, Get Streams, Create Clip From VOD): https://dev.twitch.tv/docs/api/reference/ (published 2026-09-16)
- Twitch API guide, rate limits: https://dev.twitch.tv/docs/api/guide/ (fetched 2026-09-24)
- Twitch EventSub subscription types (`channel.chat.message`): https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/ (fetched 2026-09-24)
- Twitch EventSub WebSockets: https://dev.twitch.tv/docs/eventsub/handling-websocket-events/ (fetched 2026-09-24)
- Kick docs index: https://docs.kick.com/llms.txt (fetched 2026-09-24)
- Kick changelog: https://docs.kick.com/changelog.md (latest entry 11/08/2026; v1 livestreams deprecated 23/06/2026)
- Kick Livestreams API: https://docs.kick.com/apis/livestreams.md (fetched 2026-09-24)
- Kick Events introduction: https://docs.kick.com/events/introduction.md (fetched 2026-09-24)
- Kick Events subscribe: https://docs.kick.com/events/subscribe-to-events.md (fetched 2026-09-24)
- Kick webhook payloads: https://docs.kick.com/events/event-types.md (fetched 2026-09-24)
- IG Hashtag Recent Media: https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-hashtag/recent-media (updated 2026-08-17)
- IG Hashtag Top Media: https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-hashtag/top-media.md (fetched 2026-09-24)
- IG Hashtag Search guide: https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-facebook-login/hashtag-search.md (fetched 2026-09-24)
- IG Business Discovery reference: https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/business_discovery.md (fetched 2026-09-24)
- IG Business Discovery guide: https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-facebook-login/business-discovery.md (fetched 2026-09-24)
- IG Media reference (`view_count`, `timestamp`): https://developers.facebook.com/documentation/instagram-platform/reference/instagram-media.md (fetched 2026-09-24)
- IG Platform overview, rate limits: https://developers.facebook.com/documentation/instagram-platform/overview.md (fetched 2026-09-24)
- YouTube `search.list`: https://developers.google.com/youtube/v3/docs/search/list (last updated 2026-09-14)
- YouTube `videos.list`: https://developers.google.com/youtube/v3/docs/videos/list (last updated 2026-09-14)
- TikTok Research API, Query Videos: https://developers.tiktok.com/docs/en/research-api-specs-query-videos (fetched 2026-09-24)
- TikTok Research API FAQ: https://developers.tiktok.com/docs/en/research-api-faq (fetched 2026-09-24)
- Google Trends API (alpha) announcement: https://developers.google.com/search/blog/2025/07/trends-api (2025-07-24)
- Google Trends Trending-now RSS: https://trends.google.com/trending/rss?geo=US (fetched live 2026-09-24; undocumented)
- X API search overview: https://docs.x.com/x-api/posts/search/introduction (fetched 2026-09-24)
- X API pricing: https://docs.x.com/x-api/getting-started/pricing (fetched 2026-09-24)

Secondary (who does what):

- ClipMe, "Chat Velocity": https://clipme.com/blog/chat-velocity-viral-moments (2026-07-05; vendor)
- Reddit Data API Wiki: https://support.reddithelp.com/hc/en-us/articles/16160319875092-Reddit-Data-API-Wiki (did not load; limit quoted from a search snippet, unverified)
- Eklipse AI highlights: https://eklipse.gg/features/ai-highlights/ (2026; vendor, search listing only, not opened)
- AFKStreamClipper: https://afkstreamclipper.com/ (2026; vendor, search listing only, not opened)
- Greenfrog Labs, viral metrics: https://greenfroglabs.com/blog/viral-video-definition-metrics-thresholds (2026-04-11)
- OpusClip, Whop Content Rewards: https://www.opus.pro/blog/whop-content-rewards (2026-08-12)
- livestreamfails.com trending: https://livestreamfails.com/trending (fetched 2026-09-24)
- Streams Charts, Top clips on Kick: https://streamscharts.com/clips?platform=kick (2026; 403 to our fetcher, not verified)
- Streams Charts, Kick March 2026: https://streamscharts.com/news/kick-reaches-over-500-million-hours-watched-march-2026 (2026; search listing only, not opened)
- Stackmatix, TikTok Creative Center guide: https://www.stackmatix.com/blog/tiktok-creative-center-guide (2026; search listing only, not opened)
- HeyOrca, trending audio: https://www.heyorca.com/blog/trending-audio-for-reels-tiktok (2026; search listing only, not opened)
- Buffer, trending audio: https://buffer.com/resources/trending-audio-instagram/ (Sept 2026; search listing only, not opened)
- MediaNama, X pay-per-use: https://www.medianama.com/2026/02/223-x-developer-api-pricing-pay-per-use-model/ (2026-02; search listing only, not opened)
- Exploding Topics vs Glimpse: https://explodingtopics.com/blog/exploding-topics-vs-glimpse (2026; search listing only, not opened)

Stale (not used for conclusions):

- Kotaku, "Inside Livestreamfail": https://kotaku.com/inside-livestreamfail-the-controversial-forum-that-fue-1830745674 (2018)
- Instagram Basic Display API shutdown (Dec 2024): not re-fetched
