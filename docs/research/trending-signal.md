# Trending-now signal: summary

Researched 2026-09-24. Detail and citations:
[web / official docs](trending-signal-web.md) · [GitHub code](trending-signal-github.md).
Firecrawl returned request errors in both lanes; the web lane used web search plus
direct doc reads, the GitHub lane used the `gh` CLI.

## Finding

Instagram keyword search is relevance-ranked with no time or sort parameter; every
tool that finds "trending now" on Instagram gets recency elsewhere. The recurring
recipe in 2025–2026 code:

1. **Source by account, not keyword.** Watch a set of clip/repost accounts and read
   their newest reels (profile grids are newest-first), as
   `mirsella/instagram-reels-scraper` does with a logged-in browser.
2. **Recency cutoff from the post timestamp** (`published_at`), in code.
3. **Velocity against the author's own baseline:** views per hour since posting ÷ the
   account's median (e.g. `keel-crawler`: ≥3× and ≤72 h old = "breaking").
4. **Cross-account corroboration:** the same moment reposted by several distinct
   accounts ranks above one big outlier (`nyan`).

Platform alternatives: Twitch Helix clips (time window + view sort, official, free);
Kick has no official clips API (only an undocumented `api/v2/.../clips`), so Kick signal
is viewer-count spikes on a watch-list; YouTube `search.list` with `publishedAfter` +
`order=viewCount`. Instagram's official hashtag `recent_media` (24 h) needs Meta App
Review and is capped at 30 hashtags per 7 days. Trend tools (Google Trends, TikTok
Research API/Creative Center, Exploding Topics) are too slow for a 6 h window.

## Split for jev-social

| Code (numbers) | Jev (typed judgments) |
| --- | --- |
| age cutoff from `published_at` | Choice: which accounts from search results to watch |
| views/hour, author median, multiplier | Noul: is this post about streamer X |
| distinct-account count per moment | Noul: do these two posts show the same moment |
| final ranking | Score: how "live reaction" the top comments read; Noul: re-upload |

Proposed flow: keyword search → Jev picks seed clip accounts → socai reads each
account's recent reels → code filters by age and computes velocity → Jev groups
same-moment posts → report ranks moments by distinct accounts, then velocity.
