# Spec: trending clips via a research account's Following feed

Status: prototype idea, not started (written 2026-09-24).
Background: [trending-signal.md](trending-signal.md) and the two research notes beside it.

## Problem

Instagram keyword search (`/explore/search/keyword/?q=`) is relevance-ranked and has
no time or sort parameter. A goal such as "trending n3on Kick clips from the last 6
hours" returns posts up to 18 months old. Recency on Instagram only comes from
watching accounts: profile grids and the Following feed are newest-first, and every
opened post carries `published_at`.

## Idea

A dedicated Instagram **research account** follows a curated set of clip accounts.
Its Following feed (`https://www.instagram.com/?variant=following`) then shows only
those accounts' posts, newest first, with no recommendations mixed in. One feed read
replaces one profile read per account.

## Hard constraints

- **jev-social stays read-only.** It never follows, likes, comments, posts or
  messages (AGENTS.md). A person follows accounts by hand; the app only *suggests*
  who to follow.
- **Use a dedicated account, never a posting account.** Not `matt.e.live` or
  `lucid_dreams.tv`, and not the `chrome-cdp` Chrome on 127.0.0.1:9222. Log the research
  account into socai's managed profile (`~/.socai/chrome-profile`,
  `socai config set chrome.profile managed`).
- **No TikTok.** The social-id-crm harvester stays the only TikTok fetcher on this IP.
- **Keep traffic small:** manual following at a human pace, a bounded feed scroll, and a
  handful of sweeps a day.
- **Jev only picks from choices the app builds** and never produces URLs or commands.
  Timestamps, views per hour and ranking are computed in code.

## Parts

### 1. Suggest clip accounts (jev-social, read-only)

- Input: seed topics (e.g. `n3on kick clips`, `kick streamer clips`) and the
  optional existing TikTok clipper handles from social-id-crm as candidate names.
- Run keyword searches; collect the distinct authors of the returned posts.
- For each author, read the profile (`socai instagram profile <user> --num 12`).
- Jev judgments per candidate:
  - Noul: "Does `account` mainly post short clips of livestreamers (Kick/Twitch)?"
  - Noul: "Is `account` focused on streamer `target` (e.g. n3on)?"
  - Noul: "Are these posts re-uploads of other creators' clips rather than original content?" (flag, not a reject).
- Code: posting cadence (posts/day over the last 12 posts) and median views, from
  profile data.
- Output: a ranked follow list (handle, profile URL, why, cadence, median views)
  shown in the UI and saved as JSON/CSV. **No follow button.**

### 2. Manual follow (human)

- Follow the suggested accounts from the research account in socai's Chrome.
- Target size: 30–80 accounts. Prune accounts that go quiet.

### 3. Feed reader (new socai capability)

- socai 0.6.0 Instagram commands are `search`, `profile`, `get-posts`, `page_state`;
  **it cannot read a feed.** Add `socai instagram feed --variant following --num N`
  (or `--since-hours H`), either as a local patch or an upstream request to socai-io.
- Output per card: post URL/shortcode, author, `published_at`, caption, and view/like
  counts where visible. Stop scrolling when cards are older than the window.
- jev-social: add a `read_feed` action to `src/actions.js` and argument mapping in
  `src/socai.js` behind capability detection (fail visibly if absent).

### 4. Scoring (jev-social)

Following the recurring recipe in the research:

| Step | Owner | Rule |
| --- | --- | --- |
| Age cutoff | code | drop posts with `published_at` older than the window (default 6 h) |
| Velocity | code | views/hour since posting ÷ that author's median views/hour; "breaking" at ≥3× |
| Topic match | Jev Noul | "Is this post about streamer `target`?" |
| Same moment | Jev Noul (pairwise, candidates pre-filtered by time and topic) | "Do these two posts show the same stream moment?" |
| Live reaction | Jev Score | how strongly the top comments read as reactions to a fresh moment |
| Rank | code | moments by distinct reposting accounts, then best velocity |

- Output: report of moments, each with its posts (source-linked), account count,
  velocity and age. Search cards stay distinct from opened posts.

## Prototype plan

1. Create the research account; log it into the managed profile.
2. Build Part 1 (suggest list) using existing socai commands only. Validate the
   Jev account-classification questions on ~30 known accounts.
3. Follow by hand.
4. Prototype the feed reader as a local socai patch; measure how many posts cover 6 h.
5. Build Part 4 on feed output; compare against manual judgment for a week.

## Open questions

- Does the Following feed expose view counts on cards, or must each post be opened
  (one step per post)?
- How far back does one feed scroll reach with 50+ busy clip accounts?
- How long will Instagram tolerate a new account that only lurks? Is warming it up
  needed?
- Can the social-id-crm TikTok clipper list map to Instagram handles automatically?
- Upstream the feed command to socai-io, or keep it as a local patch?

## Acceptance

- A 6-hour sweep returns moments with posts all younger than 6 h and source-linked.
- No account-changing action exists anywhere in jev-social.
- Offline tests cover: age cutoff, velocity maths, missing feed capability, and a
  login gate on the research account.
