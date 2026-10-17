# SEO Automation: Free Version (Backlinks + Guest Posts + Notifications)

Runs 1–2 times a week with Manual Triggers and costs $0. It finds relevant websites for backlinks and guest posts, extracts published contact emails with a free LLM, sends the pitches you approve, notifies you of replies and new backlinks by email (or Telegram), and keeps a list of live backlinks for the client report.

---

## 1. Free stack

| Job | Free tool | Free limit |
| --- | --- | --- |
| Find websites | Web Search: Tavily (or self-hosted SearXNG) | 1,000 searches/month |
| Read pages, find emails | Read Web Page + Information Extractor (no Hunter) | No limit |
| AI model | Zhipu GLM-4.7-Flash via Chat Model node (preset "Zhipu Z.ai") | Free, 1 request at a time |
| Store prospects | Airtable Free | 1,000 API calls/month, 1,000 records/base |
| Send outreach | New free Gmail account used only for outreach | 500 emails/day (you use ~20/week) |
| Notify you | Gmail to your notification email, and/or Telegram bot | Free |

**Limits to know:**
- The LLM does not search the web. Web Search finds pages, and the LLM judges and extracts.
- Emails are found only when a site publishes one. Sites with only a contact form are saved as `form_only` for you to submit by hand.
- WhatsApp is not used: business-initiated WhatsApp messages need paid templates. Email and Telegram are free.
- A free Gmail account: keep the volume low (20–40 emails/week) and every email personal, or Google may suspend it.

---

## 2. Credentials in RXJ

| Credential | Name | Value |
| --- | --- | --- |
| Airtable | Airtable SEO | Personal access token |
| Tavily | Tavily | API key |
| Chat Model API Key | GLM Free | Z.ai API key (Chat Model preset: Zhipu Z.ai, model `glm-4.7-flash`) |
| Google account | Outreach Gmail | The free outreach Gmail account |
| Google account | Notify Gmail (optional) | Any account to send notifications from (the outreach one also works) |
| Telegram (optional) | Notify Bot | Bot token; get your chat ID from the bot |

---

## 3. Airtable base "SEO"

**Keywords:** `keyword` (text), `type` (single select: backlink, guest_post), `active` (checkbox), `last_used` (date)

**Prospects:**
`type` (backlink / guest_post), `domain`, `page_url`, `page_title`, `score` (number), `reason`, `where_link_fits`, `target_post` (client URL to pitch), `contact_email`, `contact_name`, `form_url`, `requires_payment` (checkbox), `guidelines_summary` (long text), `topic_ideas` (long text), `draft_subject`, `draft_body` (long text), `status`, `message_id`, `thread_id`, `sent_at` (date+time), `followup_sent_at` (date+time), `live_link_url` (URL), `linked_on` (date), `notes`

**Statuses:** pending, form_only, approved, rejected, sent, replied, interested, accepted, agreed, not_interested, unsubscribed, bounced, no_response, linked

**Suppression:** `email`, `domain`, `reason`

**Views to create in Prospects:**
- "To review": status = pending
- "Submit by hand": status = form_only
- "Backlinks report": status = linked (domain, live_link_url, linked_on). Attach this to the client report.

---

## 4. Workflow F1: Backlink prospecting (free)

| # | Node (variable) | Settings |
| --- | --- | --- |
| 1 | Manual Trigger | — |
| 2 | Airtable `kw` | List · Keywords · filter `AND({active}, {type}='backlink')` · sort `last_used` ascending · Max 1 |
| 3 | Airtable | Update · Keywords · id `{{kw.items.0.id}}` · `last_used` = `{{ $today }}` |
| 4 | Web Search `search` | Tavily · Query `{{kw.items.0.fields.keyword}} "resources" OR "useful links" OR "recommended tools"` · Max Results 10 |
| 5 | Split Out | Input list `search.results` |
| 6 | Edit Fields `p` | `domain (string) = {{ $json.url.split('/')[2].replace(/^www\./,'') }}` · `url (string) = {{item.url}}` · `title (string) = {{item.title}}` |
| 7 | Filter | `{{p.domain}}` does not contain `CLIENTDOMAIN.com` |
| 8 | Remove Duplicates | Field `p.domain` |
| 9 | Limit | Keep first 5 |
| 10 | Airtable `known` | List · Prospects · filter `{domain}='{{p.domain}}'` · Max 1 |
| 11 | Filter | `{{known.count}}` equals `0` |
| 12 | Airtable `supp` | List · Suppression · filter `{domain}='{{p.domain}}'` · Max 1 |
| 13 | Filter | `{{supp.count}}` equals `0` |
| 14 | Read Web Page `page` | URL `{{p.url}}` · Markdown · Max Characters 6000 · On Error: Continue |
| 15 | Information Extractor `score` | Chat Model "GLM Free" on Model port · Text: Prompt F1-score · Fields (below) |
| 16 | Filter | `{{score.output.relevant}}` is true AND `{{score.output.score}}` ≥ 6 |
| 17 | Read Web Page `contact` | URL `https://{{p.domain}}/contact` · Max Characters 4000 · On Error: Continue |
| 18 | Information Extractor `found` | Chat Model on Model port · Text: Prompt F-email · Fields (below) |
| 19 | IF `hasEmail` | `{{found.output.email}}` is not empty AND `{{page.content}} {{contact.content}}` contains `{{found.output.email}}` (stops invented addresses) |
| 20T | AI Agent `draft` (True branch) | Chat Model on Chat Model port · Structured Output Parser: `subject` (string), `body` (string) · no tools · Prompt F1-email |
| 21T | Airtable | Create · Prospects · type backlink · domain, page_url, page_title, score, reason, where_link_fits, target_post, contact_email `{{found.output.email}}`, contact_name `{{found.output.contact_name}}`, draft_subject, draft_body · status **pending** |
| 20F | Airtable (False branch) | Create · Prospects · type backlink · domain, page_url, score, reason, target_post, form_url `{{found.output.form_url}}` · status **form_only** |
| 22 | Aggregate → Gmail (optional) | Send from Notify Gmail to YOUR_NOTIFY_EMAIL · Subject "New backlink prospects to review" |

**Fields for step 15:**
- `relevant (boolean): true only if a link to one of the client's articles would genuinely help this page's readers`
- `score (number): 0-10`
- `reason (string): one sentence`
- `where_link_fits (string): the section or list where the link fits`
- `target_post (string): the URL of the best-matching client article from the list`

**Fields for step 18:**
- `email (string): an email address written in the text, copied exactly. Empty if none. Never guess or construct an address`
- `contact_name (string): the name of the editor or owner if written in the text`
- `form_url (string): a contact form link if there is no email`

**Prompt F1-score:**
```
Client site: CLIENT NAME (CLIENTDOMAIN.com), niche: CLIENT NICHE.
Client articles (title - URL):
[LIST 5-10 OF THE CLIENT'S BEST ARTICLES]

Page title: {{p.title}}
Page URL: {{p.url}}
Page content:
{{page.content}}

Decide whether this page is a resource list, guide or roundup in the same niche where a link to one of the client's articles would genuinely help its readers. Not relevant: shops, forums, news, direct competitors, pages that do not link to other sites.
```

**Prompt F-email:**
```
Find contact details for the owner or editor of {{p.domain}} in the text below.
Copy an email address exactly as written. If no email address is written, leave email empty. Never guess, invent or build an address (such as info@ or contact@) that is not in the text.

Text:
{{page.content}}
{{contact.content}}
```

**Prompt F1-email:**
```
Write a short outreach email (under 120 words) to {{found.output.contact_name}} at {{p.domain}}.
Their page: {{p.title}} ({{p.url}})
Why it fits: {{score.output.reason}}
Where the link fits: {{score.output.where_link_fits}}
Article to suggest: {{score.output.target_post}}
Sender: YOUR NAME, working with CLIENT NAME (CLIENTDOMAIN.com)

Rules: be honest that you work with CLIENT NAME; say specifically why their page; say exactly where the link fits and why it helps their readers; no flattery, no false claims; plain text; if the name is empty, start with "Hi there". End with the sender's name and this line:
"If you'd rather not hear from me again, just reply 'no' and I won't email you again."
Return a subject (under 8 words) and the body.
```

---

## 5. Workflow G1: Guest post prospecting (free)

| # | Node (variable) | Settings |
| --- | --- | --- |
| 1 | Manual Trigger | — |
| 2 | Airtable `kw` | List · Keywords · filter `AND({active}, {type}='guest_post')` · sort `last_used` ascending · Max 1 |
| 3 | Airtable | Update · Keywords · `last_used` = `{{ $today }}` |
| 4 | Web Search `search` | Query `{{kw.items.0.fields.keyword}} "write for us" OR "guest post guidelines" OR "contribute" OR "submit a guest post"` · Max Results 10 |
| 5–13 | Same as F1 steps 5–13 | — |
| 14 | Read Web Page `page` | URL `{{p.url}}` (the "write for us" page) · Max Characters 8000 · On Error: Continue |
| 15 | Information Extractor `guest` | Chat Model on Model port · Text: Prompt G1-check · Fields (below) |
| 16 | Filter | `{{guest.output.accepts_guest_posts}}` is true AND `{{guest.output.requires_payment}}` is false AND `{{guest.output.niche_match}}` ≥ 6 |
| 17 | IF `hasEmail` | `{{guest.output.submission_email}}` not empty AND `{{page.content}}` contains `{{guest.output.submission_email}}` |
| 18T | AI Agent `pitch` (True branch) | Structured Output Parser: `subject`, `body`, `topic_ideas` · no tools · Prompt G1-pitch |
| 19T | Airtable | Create · Prospects · type guest_post · domain, page_url, page_title, score `{{guest.output.niche_match}}`, contact_email `{{guest.output.submission_email}}`, guidelines_summary, topic_ideas, draft_subject, draft_body · status **pending** |
| 18F | Airtable (False branch) | Create · Prospects · type guest_post · domain, page_url, guidelines_summary, form_url `{{guest.output.form_url}}` · status **form_only** |

**Fields for step 15:**
- `accepts_guest_posts (boolean): true if the page invites guest articles`
- `requires_payment (boolean): true if they charge a fee or mention sponsored or paid posts`
- `niche_match (number): 0-10, how closely their topics match CLIENT NICHE`
- `topics_they_want (string)`
- `guidelines_summary (string): word count, link rules, format, how to submit`
- `submission_email (string): an email copied exactly from the text; empty if none; never guess`
- `form_url (string): a submission form link if there is no email`

**Prompt G1-check:**
```
Client niche: CLIENT NICHE.
Page URL: {{p.url}}
Page content:
{{page.content}}

Read this page and report whether the site accepts guest posts, whether it charges for them, how well its topics match the client's niche, and its submission rules. Copy emails exactly; never invent one.
```

**Prompt G1-pitch:**
```
Write a guest post pitch email (under 150 words) to the editor of {{p.domain}}.
Their topics: {{guest.output.topics_they_want}}
Their guidelines: {{guest.output.guidelines_summary}}
Sender: YOUR NAME, writing on behalf of CLIENT NAME (CLIENTDOMAIN.com), niche CLIENT NICHE.

Offer 3 specific article ideas that fit their topics and readers (not promotional). Mention you have read their guidelines and will follow them. Be honest about who you write for. Plain text. End with the sender's name and:
"If you'd rather not hear from me again, just reply 'no' and I won't email you again."
Return subject, body, and topic_ideas (the 3 ideas, one per line).
```

---

## 6. Workflow G2: Write the guest article (after a site accepts)

| # | Node (variable) | Settings |
| --- | --- | --- |
| 1 | Manual Trigger | — |
| 2 | Airtable `acc` | List · Prospects · filter `AND({type}='guest_post', {status}='accepted')` · Max 1 |
| 3 | Filter | `{{acc.count}}` equals `1` |
| 4 | AI Agent `article` | Chat Model on Chat Model port · Structured Output Parser: `title`, `content` · no tools · Prompt G2 |
| 5 | Gmail | Send from Notify Gmail to YOUR_NOTIFY_EMAIL · Subject `Guest article draft for {{acc.items.0.fields.domain}}: {{article.output.title}}` · Body `{{article.output.content}}` |
| 6 | Airtable | Update that record · notes "draft written" |

Before running G2, write the topic the editor chose into the row's `notes` field.

**Prompt G2:**
```
Write a guest article for {{acc.items.0.fields.domain}}.
Topic chosen by the editor: {{acc.items.0.fields.notes}}
Their guidelines (follow exactly): {{acc.items.0.fields.guidelines_summary}}
Author: YOUR NAME, CLIENT NAME (CLIENTDOMAIN.com).

Requirements: genuinely useful, specific, not promotional; follow their word count and format; include exactly ONE natural link to CLIENTDOMAIN.com (use the most relevant client article from: [LIST CLIENT ARTICLE URLS]) only where it helps the reader; never invent statistics or quotes, write [ADD: ...] where a fact or example is needed.
Return title and content (plain text with headings marked as ##).
```

You then edit the draft and send it to the editor yourself.

---

## 7. Sending, replies, follow-ups (changes to B2, B3, B4)

**B2 Sending:** same as the playbook. Gmail credential = Outreach Gmail. Filter `{status}='approved'`, Max 10, Loop + Delay 4 minutes.

**B3 Replies:** same as the playbook, plus notifications. Add a Gmail Send node (from Notify Gmail, to YOUR_NOTIFY_EMAIL) on these branches:

| Classifier category | Airtable status | Notify you |
| --- | --- | --- |
| interested | interested | Yes: "Reply from {{domain}} ({{type}}): {{reply text}}" |
| accepted (add this category: "agrees to a guest post or to add the link") | accepted (guest_post) / agreed (backlink) | Yes: "ACCEPTED: {{domain}}. Next: run G2 or check the link" |
| not_interested | not_interested + Suppression | No |
| unsubscribe | unsubscribed + Suppression | No |
| bounce | bounced + Suppression | No |
| out_of_office / other | replied | Yes (short) |

Optional: put a Telegram node next to each Gmail notify node for instant phone alerts.

**B4 Follow-ups:** same as the playbook (one follow-up after 5 days, Gmail Reply, then stop).

---

## 8. Workflow B5: Link checker with report and notification

| # | Node (variable) | Settings |
| --- | --- | --- |
| 1 | Manual Trigger | — |
| 2 | Airtable `check` | List · Prospects · filter `OR({status}='interested', {status}='agreed', {status}='accepted')` |
| 3 | Split Out | `check.items` |
| 4 | HTTP Request `html` | GET item `page_url` · response as text · On Error: Continue |
| 5 | IF | Response body contains `CLIENTDOMAIN.com` |
| 6 | Airtable (True) | Update · status **linked** · live_link_url = item `page_url` · linked_on = `{{ $today }}` |
| 7 | Gmail (True) | To YOUR_NOTIFY_EMAIL · Subject "New backlink for CLIENT NAME" · Body: domain + page URL |

For guest posts, the link is on a new article URL: when the editor sends the published link, paste it into `page_url` (or `live_link_url`) and set status **agreed**, so B5 checks it.

The **"Backlinks report"** view (status = linked) is the list to attach for the client.

---

## 9. Weekly routine (free limits)

**Monday:** run F1 and G1 → review "To review" in Airtable, edit drafts, set approved/rejected → submit "Submit by hand" forms → run B2.
**Thursday:** run B3, then B4; run G2 for any accepted guest post; optional second round of F1/G1 + B2.
**Monthly:** run B5 and send the "Backlinks report" to the client.

| Per run | Setting | Weekly total |
| --- | --- | --- |
| Web Search | Max Results 10 | ~4 searches |
| Prospects | Limit 5 | ~20 |
| Emails | Max 10 | ~20 |
| Airtable calls | ~40 per run | under 1,000/month |

---

## 10. Placeholders to replace after building

| Placeholder | Replace with |
| --- | --- |
| CLIENTDOMAIN.com | Client's domain |
| CLIENT NAME, CLIENT NICHE | Client's name and niche |
| [LIST 5-10 OF THE CLIENT'S BEST ARTICLES] | Titles + URLs (update when new posts go live) |
| YOUR NAME | Your real name |
| YOUR_NOTIFY_EMAIL | The email that receives notifications |

After the first run of each workflow, open Execution Logs and check the expressions against real output (Airtable `items.0.fields...`, Gmail `threadId`/`messageId`). Pin Web Search and AI outputs while testing.

---

## 11. Rules

- Never send to an email the AI did not copy from the page (step 19 / step 17 check).
- Be honest that you write on behalf of the client. No fake names.
- Skip sites that charge for guest posts (paid links must be marked sponsored, and they cost money).
- One follow-up only. Everyone who says no, unsubscribes or bounces goes to Suppression.
- Edit every AI email and article before it goes out.
- Test first with 2–3 Prospects rows using your own second email address before contacting real sites.