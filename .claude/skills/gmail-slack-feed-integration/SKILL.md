---
name: gmail-slack-feed-integration
description: Use when adding Gmail and/or Slack message feeds to a web application. Covers OAuth token refresh, API fetching, scope detection with parallel fallback, HTML-to-text body extraction, cursor-based pagination, user name resolution, and display message transformation. Use when you see "fetch emails", "Slack messages", "message feed", "inbox integration", or need to read Gmail/Slack via API tokens.
---

# Gmail & Slack Feed Integration

## Overview

Integrate Gmail and Slack message feeds into any web app using OAuth tokens and REST APIs. Handles the full pipeline: token refresh, message listing, detail fetching, scope-limited fallbacks, body extraction, and display-ready transformation.

## When to Use

- Adding a Gmail inbox feed or email reader to an app
- Adding a Slack message feed or channel viewer
- Need to fetch and display messages from Gmail/Slack APIs
- Dealing with Gmail OAuth scope limitations (metadata-only vs full access)
- Building a command center, CRM, or dashboard with communication feeds

## Environment Variables

```bash
# Gmail (Google OAuth2)
CC_GOOGLE_CLIENT_ID=your-google-client-id
CC_GOOGLE_CLIENT_SECRET=your-google-client-secret
CC_GOOGLE_REFRESH_TOKEN=your-google-refresh-token

# Slack
CC_SLACK_USER_TOKEN=xoxp-...   # Preferred: user token
CC_SLACK_BOT_TOKEN=xoxb-...    # Fallback: bot token
```

## Gmail Integration

### 1. Token Refresh

Google OAuth refresh tokens are long-lived but access tokens expire (~1 hour). Refresh before each batch of API calls.

```typescript
// Module-level scope tracking
let _hasBodyAccess: boolean | null = null;

async function refreshAccessToken(): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.CC_GOOGLE_CLIENT_ID!,
      client_secret: process.env.CC_GOOGLE_CLIENT_SECRET!,
      refresh_token: process.env.CC_GOOGLE_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Token refresh failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const json = await res.json() as { access_token: string; scope?: string };

  // Detect granted scope to know if body access is available
  if (json.scope) {
    _hasBodyAccess = /gmail\.(readonly|modify|compose)/.test(json.scope);
    if (!_hasBodyAccess) {
      console.warn(`[Gmail] Limited scope: ${json.scope}. Bodies unavailable.`);
    }
  }

  return json.access_token;
}
```

**Key insight:** The `scope` field in the token response tells you what permissions were granted. `gmail.metadata` = headers only, no bodies. `gmail.readonly` = full access.

### 2. List Messages

```typescript
const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

async function listMessages(
  token: string,
  maxResults = 30,
  pageToken?: string
): Promise<{ messages: { id: string; threadId: string }[]; nextPageToken?: string }> {
  const params = new URLSearchParams({ maxResults: String(maxResults) });
  if (pageToken) params.set('pageToken', pageToken);

  const res = await fetch(`${BASE}/messages?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error(`List failed (${res.status})`);
  return res.json();
}
```

### 3. Get Message Detail (with Scope Fallback)

This is the critical pattern. When scope is `gmail.metadata`, `format=full` returns 403. Fall back to parallel metadata + minimal requests.

```typescript
async function getMessageDetail(token: string, messageId: string) {
  const url = `${BASE}/messages/${messageId}`;
  const headers = { Authorization: `Bearer ${token}` };

  // Strategy 1: Try full format (has body + headers)
  if (_hasBodyAccess !== false) {
    const res = await fetch(`${url}?format=full`, { headers });
    if (res.ok) return res.json();
    if (res.status === 403) {
      _hasBodyAccess = false; // Mark for future requests
    } else {
      throw new Error(`Gmail detail failed (${res.status})`);
    }
  }

  // Strategy 2: Parallel metadata + minimal (scope-limited fallback)
  const [metaRes, minRes] = await Promise.all([
    fetch(`${url}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Date`, { headers }),
    fetch(`${url}?format=minimal`, { headers }),
  ]);

  const meta = metaRes.ok ? await metaRes.json() : {};
  const minimal = minRes.ok ? await minRes.json() : {};

  return {
    id: meta.id || minimal.id || messageId,
    threadId: meta.threadId || minimal.threadId || '',
    snippet: meta.snippet || minimal.snippet || '',
    payload: meta.payload,
    internalDate: meta.internalDate || minimal.internalDate,
  };
}
```

**Why parallel?** `format=metadata` gives headers but no snippet. `format=minimal` gives snippet but no headers. Merge both for best available content under limited scope.

### 4. Body Extraction

Emails have complex MIME structures. Extract text/plain first, fall back to stripping HTML.

```typescript
function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractTextBody(part: any): string {
  if (!part) return '';

  // First: look for text/plain
  if (part.mimeType === 'text/plain' && part.body?.data) {
    return decodeBase64Url(part.body.data);
  }

  // Recurse into sub-parts
  if (part.parts) {
    for (const sub of part.parts) {
      if (sub.mimeType === 'text/plain' && sub.body?.data) {
        return decodeBase64Url(sub.body.data);
      }
    }
    for (const sub of part.parts) {
      const text = extractTextBody(sub);
      if (text) return text;
    }
  }

  // Fallback: extract HTML and strip tags
  if (part.mimeType === 'text/html' && part.body?.data) {
    return stripHtmlTags(decodeBase64Url(part.body.data));
  }
  if (part.parts) {
    for (const sub of part.parts) {
      if (sub.mimeType === 'text/html' && sub.body?.data) {
        return stripHtmlTags(decodeBase64Url(sub.body.data));
      }
    }
  }

  return '';
}
```

### 5. Build Display Message

```typescript
type GmailDisplayMessage = {
  id: string;
  thread_id: string;
  from: string;
  to: string;
  cc: string;
  subject: string;
  date: string;
  snippet: string;
  body_preview: string;
  body_full: string;
  gmail_link: string;
  has_attachments: boolean;
  scope_limited?: boolean;
};

function getHeader(msg: any, name: string): string {
  return msg.payload?.headers?.find(
    (h: any) => h.name.toLowerCase() === name.toLowerCase()
  )?.value || '';
}

function buildDisplayMessage(detail: any): GmailDisplayMessage {
  const from = getHeader(detail, 'From');
  const body = detail.payload ? extractTextBody(detail.payload) : '';
  const snippet = detail.snippet || '';
  const senderMatch = from.match(/^([^<]+)/);

  return {
    id: detail.id,
    thread_id: detail.threadId,
    from: senderMatch ? senderMatch[1].replace(/["']/g, '').trim() : from,
    to: getHeader(detail, 'To'),
    cc: getHeader(detail, 'Cc'),
    subject: getHeader(detail, 'Subject') || '(no subject)',
    date: getHeader(detail, 'Date')
      ? new Date(getHeader(detail, 'Date')).toISOString()
      : new Date(parseInt(detail.internalDate || '0', 10)).toISOString(),
    snippet,
    body_preview: body ? body.slice(0, 500) : snippet,
    body_full: body || snippet,
    gmail_link: `https://mail.google.com/mail/u/0/#inbox/${detail.id}`,
    has_attachments: !!(detail.payload?.parts?.some(
      (p: any) => p.mimeType && !p.mimeType.startsWith('text/') &&
        !p.mimeType.startsWith('multipart/') && (p.body?.size || 0) > 0
    )),
    scope_limited: _hasBodyAccess === false,
  };
}
```

### 6. Batch Fetch for Display

```typescript
async function fetchGmailFeed(maxResults = 100, pageToken?: string) {
  const token = await refreshAccessToken();
  const list = await listMessages(token, maxResults, pageToken);

  if (!list.messages?.length) {
    return { ok: true, messages: [], total_count: 0, fetched_at: new Date().toISOString() };
  }

  // Fetch details in batches of 10 for parallelism
  const BATCH = 10;
  const results: GmailDisplayMessage[] = [];
  for (let i = 0; i < list.messages.length; i += BATCH) {
    const batch = list.messages.slice(i, i + BATCH);
    const details = await Promise.all(
      batch.map((m) => getMessageDetail(token, m.id).catch(() => null))
    );
    for (const d of details) {
      if (d) results.push(buildDisplayMessage(d));
    }
  }

  return {
    ok: true,
    messages: results,
    total_count: results.length,
    next_page_token: list.nextPageToken,
    fetched_at: new Date().toISOString(),
  };
}
```

---

## Slack Integration

### 1. Generic API Helper

Slack uses simple Bearer tokens (no refresh needed) and a consistent `ok` field in responses.

```typescript
async function slackApi<T>(
  endpoint: string,
  params: Record<string, string> = {}
): Promise<T> {
  const token = process.env.CC_SLACK_USER_TOKEN || process.env.CC_SLACK_BOT_TOKEN;
  if (!token) throw new Error('No Slack token configured');

  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`https://slack.com/api/${endpoint}?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error(`Slack API ${res.status}`);
  const json = await res.json();
  if (!json.ok) throw new Error(`Slack error: ${json.error}`);
  return json as T;
}
```

### 2. List Channels (Cursor Pagination)

```typescript
type SlackChannel = {
  id: string;
  name: string;
  is_member: boolean;
  is_archived: boolean;
  is_im?: boolean;
  is_mpim?: boolean;
  user?: string; // For DMs: the other user's ID
};

async function fetchAllChannels(): Promise<SlackChannel[]> {
  const all: SlackChannel[] = [];
  let cursor = '';

  do {
    const params: Record<string, string> = {
      types: 'public_channel,private_channel,im,mpim',
      exclude_archived: 'true',
      limit: '200',
    };
    if (cursor) params.cursor = cursor;

    const res = await slackApi<{
      channels: SlackChannel[];
      response_metadata?: { next_cursor?: string };
    }>('conversations.list', params);

    for (const ch of res.channels) {
      if (ch.is_archived) continue;
      if (ch.is_im || ch.is_mpim || ch.is_member) all.push(ch);
    }
    cursor = res.response_metadata?.next_cursor || '';
  } while (cursor);

  return all;
}
```

### 3. Fetch Channel Messages

```typescript
type SlackMessage = {
  ts: string;
  user?: string;
  text?: string;
  subtype?: string;
  bot_id?: string;
};

async function fetchChannelMessages(
  channelId: string,
  oldestTimestamp: string
): Promise<SlackMessage[]> {
  const res = await slackApi<{ messages: SlackMessage[] }>(
    'conversations.history',
    { channel: channelId, oldest: oldestTimestamp, limit: '100' }
  );

  return res.messages.filter(
    (m) => !m.subtype && !m.bot_id && m.text && m.text.length > 5
  );
}
```

**Filtering:** Skip bot messages, system subtypes (channel_join, etc.), and very short messages.

### 4. User Name Resolution (with Cache)

```typescript
const userNameCache = new Map<string, string>();

async function resolveUserName(userId: string): Promise<string> {
  if (userNameCache.has(userId)) return userNameCache.get(userId)!;

  try {
    const res = await slackApi<{ user: { real_name?: string; name?: string } }>(
      'users.info',
      { user: userId }
    );
    const name = res.user.real_name || res.user.name || userId;
    userNameCache.set(userId, name);
    return name;
  } catch {
    userNameCache.set(userId, userId);
    return userId;
  }
}
```

### 5. Build Slack Feed

```typescript
type SlackDisplayMessage = {
  ts: string;
  sender: string;
  text: string;
  timestamp: string; // ISO string
};

type SlackChannelFeed = {
  id: string;
  name: string;
  label: string;
  is_dm: boolean;
  messages: SlackDisplayMessage[];
};

async function fetchSlackFeed(
  windowMinutes = 10080, // 7 days
  limitPerChannel = 200
): Promise<{ ok: boolean; channels: SlackChannelFeed[]; total_messages: number }> {
  const oldest = String((Date.now() - windowMinutes * 60_000) / 1000);
  const channels = await fetchAllChannels();
  const feeds: SlackChannelFeed[] = [];

  for (const ch of channels) {
    // Rate limit for large workspaces
    if (channels.length > 20) await new Promise((r) => setTimeout(r, 250));

    const messages = await fetchChannelMessages(ch.id, oldest);
    if (!messages.length) continue;

    const display: SlackDisplayMessage[] = [];
    for (const m of messages.slice(0, limitPerChannel)) {
      const sender = m.user ? await resolveUserName(m.user) : 'bot';
      display.push({
        ts: m.ts,
        sender,
        text: m.text || '',
        timestamp: new Date(parseFloat(m.ts) * 1000).toISOString(),
      });
    }

    // Channel label
    const label = ch.is_im
      ? `DM: ${ch.user ? await resolveUserName(ch.user) : ch.name}`
      : ch.is_mpim
        ? `Group: ${ch.name}`
        : `#${ch.name}`;

    feeds.push({
      id: ch.id,
      name: ch.name,
      label,
      is_dm: !!ch.is_im,
      messages: display.sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts)),
    });
  }

  // Sort channels by most recent message
  feeds.sort((a, b) => {
    const aLast = a.messages[a.messages.length - 1]?.ts || '0';
    const bLast = b.messages[b.messages.length - 1]?.ts || '0';
    return parseFloat(bLast) - parseFloat(aLast);
  });

  return {
    ok: true,
    channels: feeds,
    total_messages: feeds.reduce((sum, f) => sum + f.messages.length, 0),
  };
}
```

---

## API Route Pattern (Next.js)

Wire up as POST actions in a single route handler:

```typescript
// app/api/command-center/route.ts
export async function POST(req: Request) {
  const body = await req.json();
  const { action } = body;

  if (action === 'fetch_gmail_messages') {
    const result = await fetchGmailFeed(
      Number(body.maxResults) || 100,
      body.pageToken || undefined
    );
    return Response.json(result);
  }

  if (action === 'fetch_email_detail') {
    const id = String(body.messageId || '').trim();
    if (!id) return Response.json({ ok: false, error: 'messageId required' }, { status: 400 });
    const token = await refreshAccessToken();
    const detail = await getMessageDetail(token, id);
    return Response.json({ ok: true, message: buildDisplayMessage(detail) });
  }

  if (action === 'fetch_slack_messages') {
    const result = await fetchSlackFeed(
      Number(body.windowMinutes) || 10080,
      Number(body.limitPerChannel) || 200
    );
    return Response.json(result);
  }
}
```

## Client-Side API Functions

```typescript
async function postApi<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch('/api/command-center', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API Error: ${res.status}`);
  return res.json();
}

export const fetchGmailMessages = (maxResults = 100, pageToken?: string) =>
  postApi<GmailFeedResult>({ action: 'fetch_gmail_messages', maxResults, pageToken });

export const fetchEmailDetail = (messageId: string) =>
  postApi<{ ok: boolean; message: GmailDisplayMessage }>({ action: 'fetch_email_detail', messageId });

export const fetchSlackMessages = (windowMinutes = 10080, limitPerChannel = 200) =>
  postApi<SlackFeedResult>({ action: 'fetch_slack_messages', windowMinutes, limitPerChannel });
```

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Assuming Gmail always returns body | Check `scope` in token response; fall back to metadata+minimal |
| Only extracting `text/plain` | Many emails are HTML-only; strip tags from `text/html` as fallback |
| No rate limiting for Slack | Add 250ms delay between channel fetches for workspaces with 20+ channels |
| Not caching Slack user lookups | Cache `users.info` results; same user appears across many messages |
| Ignoring `format=full` 403 | Mark `_hasBodyAccess = false` and switch strategy permanently |
| Fetching all message details serially | Use `Promise.all()` in batches of 10 for parallel fetching |
| Not filtering Slack bot messages | Filter `subtype` and `bot_id` to get human messages only |

## Required Google OAuth Scopes

| Scope | Access Level |
|-------|-------------|
| `gmail.metadata` | Headers only, no body, no snippet via metadata format |
| `gmail.readonly` | Full read access including body content |
| `gmail.modify` | Read + write (labels, send) |

## Required Slack Token Scopes

| Scope | Purpose |
|-------|---------|
| `channels:history` | Read public channel messages |
| `channels:read` | List public channels |
| `groups:history` | Read private channel messages |
| `groups:read` | List private channels |
| `im:history` | Read DM messages |
| `im:read` | List DMs |
| `mpim:history` | Read group DM messages |
| `mpim:read` | List group DMs |
| `users:read` | Resolve user IDs to names |
