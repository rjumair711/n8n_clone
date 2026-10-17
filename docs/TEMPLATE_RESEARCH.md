# Template research: what RXJ can build from a public n8n workflow collection

Date: 2026-10-17. Source: a public collection of 2,053 n8n workflow files
(`Danitilahun/n8n-workflow-templates`, cloned outside this repository to
`C:\Users\HP\Documents\research\`). The repository has no license, so **nothing
from it is copied here or anywhere in RXJ**: no workflow JSON, names,
descriptions or prompts. This report only counts which node types the files
use, and the template ideas in section 3 are written from scratch for RXJ.
The repository's own instructions and scripts were not used or run.

## How it was measured

* Every `workflows/*.json` file was parsed as data. For each workflow, the
  set of node types was mapped to RXJ (the `NodeType` enum in
  `prisma/schema.prisma`, `src/config/node-components.ts` and the node
  descriptions in the README).
* Each n8n node type got one of: **yes** (an RXJ node does it), **workaround**
  (RXJ can do it another way, for example a Qdrant vector store becomes RXJ's
  own Vector Store, a Wikipedia tool becomes an HTTP Request), **missing**, or
  **not planned** (local files, shell commands, n8n's own API).
* Operations count too: a Google Sheets node that updates rows is missing in
  RXJ even though RXJ has a Google Sheets node, because RXJ's only appends.
* Sticky notes and No Operation nodes are ignored.
* A workflow counts as **risky** when it uses contact-finding or
  lead-enrichment services (Hunter, Clearbit, Lemlist, Uplead, Dropcontact,
  Phantombuster, Bright Data, Apify, Airtop) or its name points at scraping,
  bulk or cold messaging. The check is deliberately strict; some of the 72
  are harmless, but none are used for ideas.
* Scripts used: in the session scratchpad, not in this repository.

## 1. Coverage

| Class | Workflows | Share |
|---|---:|---:|
| Buildable in RXJ today with its own nodes | 637 | 31% |
| Buildable with a workaround | 225 | 11% |
| **Buildable today, total** | **862** | **42%** |
| Needs a service or operation RXJ lacks | 910 | 44% |
| Needs something not planned (local files, shell, n8n API) | 155 | 8% |
| Flagged risky (left out) | 72 | 4% |
| Uses community nodes (left out) | 44 | 2% |
| Broken (no nodes, or not valid JSON) | 10 | <1% |

Of the 1,772 workflows that are not broken, risky, community or "not
planned", **49% can be built in RXJ today**. Many of the 637 are small
demos (a manual trigger and two nodes); the useful share is lower than
the count suggests.

### Node mapping (the 70 most used n8n node types)

"Workflows" is how many of the 2,053 files use the type at least once.

| n8n node type | Workflows | RXJ | RXJ node / note |
|---|---:|---|---|
| `set` | 1064 | yes | EDIT_FIELDS |
| `httpRequest` | 891 | yes | HTTP_REQUEST |
| `manualTrigger` | 771 | yes | MANUAL_TRIGGER |
| `if` | 659 | yes | IF |
| `code` | 515 | yes | CODE |
| `langchain.lmChatOpenAi` | 434 | yes | OPENAI |
| `langchain.agent` | 379 | yes | AI_AGENT |
| `merge` | 338 | yes | MERGE |
| `scheduleTrigger` | 311 | yes | SCHEDULE_TRIGGER |
| `webhook` | 308 | yes | WEBHOOK_TRIGGER |
| `splitOut` | 294 | yes | SPLIT_OUT |
| `googleSheets` | 281 | partly | GOOGLE_SHEETS appends only; read = Drive download + Extract from File; update/upsert missing |
| `switch` | 231 | yes | SWITCH |
| `splitInBatches` | 223 | yes | LOOP |
| `langchain.memoryBufferWindow` | 197 | yes | BUFFER_MEMORY |
| `filter` | 194 | yes | FILTER |
| `langchain.chainLlm` | 193 | yes | OPENAI/GEMINI/CHAT_MODEL |
| `langchain.openAi` | 190 | mostly | OPENAI / ANALYZE_DOCUMENT / TRANSCRIBE_AUDIO / TEXT_TO_SPEECH; no image generation |
| `langchain.chatTrigger` | 181 | yes | CHAT_TRIGGER |
| `executeWorkflowTrigger` | 180 | yes | EXECUTE_WORKFLOW_TRIGGER |
| `telegram` | 175 | yes | TELEGRAM |
| `aggregate` | 172 | yes | AGGREGATE |
| `gmail` | 167 | mostly | GMAIL (no labels or drafts; incoming attachments not downloaded) |
| `googleDrive` | 165 | yes | GOOGLE_DRIVE |
| `respondToWebhook` | 156 | yes | RESPOND_TO_WEBHOOK |
| `langchain.outputParserStructured` | 153 | yes | STRUCTURED_OUTPUT_PARSER |
| `wait` | 148 | yes | WAIT |
| `slack` | 139 | yes | SLACK |
| `function` | 122 | yes | CODE |
| `extractFromFile` | 118 | yes | EXTRACT_FROM_FILE |
| `formTrigger` | 114 | yes | FORM_TRIGGER |
| `airtable` | 113 | yes | AIRTABLE |
| `langchain.lmChatGoogleGemini` | 112 | yes | GEMINI |
| `cron` | 108 | yes | SCHEDULE_TRIGGER |
| `langchain.toolWorkflow` | 100 | yes | EXECUTE_WORKFLOW |
| `langchain.documentDefaultDataLoader` | 99 | yes | VECTOR_STORE |
| `telegramTrigger` | 92 | mostly | TELEGRAM_TRIGGER (voice/audio arrive as files; photos and documents do not) |
| `html` | 85 | workaround | Read Web Page / Code |
| `langchain.textSplitterRecursiveCharacterTextSplitter` | 76 | yes | VECTOR_STORE |
| `markdown` | 74 | workaround | Code / Text Formatter |
| `langchain.embeddingsOpenAi` | 71 | yes | VECTOR_STORE |
| `emailSend` | 70 | yes | EMAIL_SEND |
| `langchain.informationExtractor` | 70 | yes | INFORMATION_EXTRACTOR |
| `convertToFile` | 70 | yes | CONVERT_TO_FILE |
| `executeWorkflow` | 67 | yes | EXECUTE_WORKFLOW |
| `notion` | 60 | yes | NOTION |
| `limit` | 58 | yes | LIMIT |
| `gmailTrigger` | 53 | yes | GMAIL_TRIGGER |
| `n8n` | 50 | not planned | n8n API |
| `langchain.chainSummarization` | 48 | yes | LLM node |
| `langchain.toolHttpRequest` | 48 | yes | HTTP_REQUEST |
| `readWriteFile` | 47 | not planned | local files |
| `itemLists` | 46 | yes | SPLIT_OUT/AGGREGATE/SORT/LIMIT |
| `langchain.vectorStoreQdrant` | 45 | workaround | VECTOR_STORE (RXJ's own store) |
| `langchain.textClassifier` | 41 | yes | TEXT_CLASSIFIER |
| `googleDriveTrigger` | 40 | missing |  |
| `spreadsheetFile` | 36 | yes | CONVERT_TO_FILE/EXTRACT_FROM_FILE |
| `hubspot` | 34 | yes | HUBSPOT |
| `form` | 33 | yes | FORM |
| `googleCalendar` | 32 | partly | GOOGLE_CALENDAR create/update/delete; no list or availability |
| `dateTime` | 32 | yes | DATE_TIME |
| `removeDuplicates` | 32 | yes | REMOVE_DUPLICATES |
| `openAi` | 31 | yes | OPENAI |
| `functionItem` | 30 | yes | CODE |
| `postgres` | 30 | yes | POSTGRES |
| `langchain.toolWikipedia` | 30 | workaround | HTTP Request (Wikipedia API) |
| `summarize` | 30 | yes | SUMMARIZE |
| `twitter` | 29 | missing |  |
| `mattermost` | 29 | missing |  |
| `editImage` | 29 | missing | Edit Image (utility) |

All services RXJ already has as nodes (Telegram, WhatsApp, Slack, Discord,
Notion, Airtable, HubSpot, Postgres, MySQL, GitHub, Jira, Salesforce,
Twilio, Shopify, WooCommerce, SendGrid, Typeform, RSS) map one to one, and
the AI nodes cover n8n's LangChain nodes: AI Agent, chat models (OpenAI,
Gemini, Claude, DeepSeek, and OpenRouter, Groq, Mistral, Ollama through
Chat Model), memory, output parser, text classifier, information
extractor, vector store and document loading, MCP client and server.

## 2. Missing integrations

### 2a. Gaps in services RXJ already has

These are not new services, but they block more workflows than any new
service does. "Blocked only by it" counts workflows that would become
buildable if this one thing were added.

| Gap | Workflows | Blocked only by it | Work |
|---|---:|---:|---|
| Google Sheets: read rows, update, append-or-update, delete, clear | 105 (plus 198 read nodes that need the Drive workaround) | 69 | Medium: same Google credential, Sheets API `values.get/update/batchUpdate`; match a row by a column |
| Google Drive Trigger (new or changed file in a folder) | 36 | 21 | Medium: polling trigger like the Gmail Trigger |
| Edit Image (resize, crop, text, compose) | 29 | 19 | Medium: `sharp` is already a dependency (server only) |
| OpenAI image generation | 23 | 12 | Simple: one operation on the OpenAI node; output is a file |
| XML parse / build | 19 | 14 | Simple: a utility node |
| Crypto (hash, HMAC, random) | 18 | 9 | Simple: a utility node, Node's `crypto` |
| Google Sheets Trigger (new or changed row) | 16 | 3 | Medium: polling, compares with the last poll |
| Compression (zip / unzip) | 12 | 4 | Simple; needs the same unpacked-size limits as Extract from File |
| Notion Trigger | 12 | 6 | Medium: polling |
| GitHub Trigger | 11 | 7 | Medium: webhook with signature check |
| Airtable Trigger | 11 | 8 | Medium: polling |
| HubSpot Trigger | 6 | 4 | Medium: app webhooks |
| Twilio Trigger (incoming SMS) | 5 | 3 | Medium: webhook with signature check |
| Google Calendar: list events, free/busy | (most of the 32 calendar workflows read events) | | Simple: two operations on the existing node |

Not visible in the counts, but found while checking: **photos and documents
sent to a Telegram or WhatsApp bot do not reach the workflow as files**
(only voice and audio do), and **incoming Gmail attachments are not
downloaded**. For businesses in Pakistan and the Gulf, "customer sends a
photo of the payment receipt" is a very common flow; adding image and
document files to both triggers (and Gmail attachments) would open many
templates. Work: medium, the voice download code in
`src/features/executions/components/apps/voice.ts` already does the hard
part.

### 2b. Top 30 services RXJ lacks

Ranked by the number of workflows that use the service (its trigger and
tool variants counted together). Work:

* **Key**: an API key or token and a REST (or GraphQL) API. Build like the
  existing integration nodes; a few days each.
* **Key + URL**: the same, but the user types the server's address
  (self-hosted or per-account domain), so the SSRF guard applies.
* **OAuth**: needs an OAuth app, consent screen and token refresh (or reuse
  of the existing Google credential).
* **Trigger**: also needs a webhook or polling trigger.
* **Protocol**: not HTTP; needs a client library and connection handling.

| # | Service | Workflows | With trigger | Blocked only by it | Work |
|---:|---|---:|---:|---:|---|
| 1 | Microsoft Outlook (mail, calendar) | 29 | 7 | 18 | OAuth (Microsoft Graph) + Trigger |
| 2 | X (Twitter) | 28 | 0 | 10 | OAuth (user context), paid API tiers |
| 3 | WordPress | 28 | 0 | 17 | Key + URL (application password, REST) |
| 4 | IMAP email (any mailbox) | 26 | 26 | 19 | Protocol + Trigger (polling) |
| 5 | Mattermost | 25 | 0 | 13 | Key + URL (personal access token) |
| 6 | Supabase | 21 | 0 | 15 | Key + URL (project URL + service key, REST) |
| 7 | Google Docs | 21 | 0 | 12 | OAuth, but reuses the existing Google credential |
| 8 | Pipedrive | 20 | 6 | 12 | Key (API token); its trigger needs webhooks |
| 9 | YouTube | 20 | 0 | 9 | OAuth (Google) for uploads, key for reading |
| 10 | Redis | 17 | 0 | 9 | Protocol (connection string) |
| 11 | OpenWeatherMap | 16 | 0 | 8 | Key |
| 12 | Zendesk | 15 | 1 | 12 | Key + URL (subdomain, email + API token) |
| 13 | Amazon S3 and S3-compatible storage | 14 | 0 | 6 | Key + URL (access keys, request signing) |
| 14 | Baserow | 14 | 0 | 11 | Key + URL (token; often self-hosted) |
| 15 | LinkedIn | 14 | 0 | 6 | OAuth with app review; hard |
| 16 | Spotify | 12 | 0 | 7 | OAuth; low value for RXJ's users |
| 17 | Mautic | 12 | 3 | 8 | Key + URL (basic auth) + Trigger |
| 18 | Dropbox | 11 | 0 | 5 | OAuth |
| 19 | Todoist | 10 | 0 | 7 | Key |
| 20 | Linear | 10 | 4 | 8 | Key (GraphQL); trigger via webhooks |
| 21 | Webflow | 9 | 5 | 7 | Key; trigger via webhooks |
| 22 | NocoDB | 9 | 0 | 6 | Key + URL (often self-hosted) |
| 23 | Trello | 9 | 1 | 5 | Key (key + token) |
| 24 | Hacker News | 9 | 0 | 6 | No key (public API); a template with HTTP Request may be enough |
| 25 | Google Analytics | 9 | 0 | 6 | OAuth or service account (existing Google credential) |
| 26 | Mailchimp | 8 | 1 | 7 | Key (data-centre in the key) |
| 27 | monday.com | 8 | 0 | 4 | Key (GraphQL) |
| 28 | uProc | 8 | 0 | 6 | Key; low value |
| 29 | ClickUp | 7 | 2 | 4 | Key |
| 30 | Asana | 7 | 2 | 6 | Key (personal access token) |

Also seen through plain HTTP Request nodes (already buildable, but a
dedicated node may be worth it later): OpenAI, Bright Data (scraping,
excluded), LINE, Google APIs, OpenRouter, Perplexity, Cloudinary,
ConvertAPI, ElevenLabs, Firecrawl (RXJ has it in Read Web Page).

**Candidates for step 3 (key or token only, no OAuth), by workflows
unlocked:** WordPress (17), Supabase (15), Mattermost (13), Pipedrive (12,
actions only), Zendesk (12), Baserow (11), OpenWeatherMap (8), Mailchimp
(7). WordPress, Supabase, Mattermost, Pipedrive and OpenWeatherMap are the
top five by usage; Zendesk or Mailchimp may matter more to small
businesses than Mattermost. Larger gains come from section 2a: Google
Sheets read/update alone unblocks 69 workflows.

## 3. Template ideas RXJ can build today (60)

Written for RXJ, for small businesses in Pakistan and the Gulf. Each line
lists the RXJ nodes it needs and the minimum plan: the cheapest plan that
unlocks all of them (`getMinPlanForNodes` in `src/config/plans.ts`). Today
**WhatsApp** and **SSH** need **Pro**; **Gmail**, **Google Sheets**, the
**Schedule Trigger** and the **AI Agent** need **Intermediate**; everything
else is **Free**. Beginner unlocks no node that Free lacks, so no template
needs Beginner. "Reads a sheet" means Google Drive (download as CSV) and
Extract from File, which is Free; writing to a sheet needs Google Sheets.
Ideas that need a missing piece from section 2 are left out (no photos from
chat apps, no sheet updates).

Existing templates are not repeated (clinic, school fee, shop order, real
estate and FAQ bots; invoice to sheet; CV screening; Shopify WhatsApp
confirmation and abandoned cart email).

### WhatsApp (Pro)

1. **Cash-on-delivery confirmation**: a new WooCommerce order sends the buyer an approved WhatsApp template asking to confirm; the reply marks the order confirmed or cancelled with a note. WooCommerce Trigger, WhatsApp, WhatsApp Trigger, IF, WooCommerce. **Pro**
2. **Order status by WhatsApp**: the customer sends an order number and gets its status and tracking back. WhatsApp Trigger, Information Extractor, Shopify or WooCommerce, WhatsApp. **Pro**
3. **Voice note helper**: voice messages in Urdu or Arabic are transcribed and answered in text. WhatsApp Trigger, Transcribe Audio, Gemini, WhatsApp. **Pro**
4. **Delivery charge checker**: the customer types a city or area and gets the delivery charge and time from your list. WhatsApp Trigger, Gemini (list in the prompt), WhatsApp. **Pro**
5. **Product catalogue assistant**: answers questions about products from your catalogue documents, and hands over to a person when unsure. WhatsApp Trigger, AI Agent, Vector Store, Memory, Telegram (alert to staff), WhatsApp. **Pro**
6. **Abandoned checkout nudge**: one WhatsApp reminder to opted-in shoppers whose checkout stayed open. Schedule Trigger, Shopify, IF, WhatsApp. **Pro**
7. **Appointment reminders**: the day before, reminds each client in your bookings sheet with an approved template. Schedule Trigger, Google Drive, Extract from File, IF, WhatsApp. **Pro**
8. **After-sale review request**: three days after an order is fulfilled, asks the customer for a rating; low ratings alert the owner. Shopify Trigger, Wait, WhatsApp, WhatsApp Trigger, IF, Telegram. **Pro**

### Telegram

9. **New order alert for the team**: every Shopify or WooCommerce order posts a short summary to a staff Telegram group. Shopify Trigger, Edit Fields, Telegram. **Free**
10. **Simple AI bot**: a Telegram bot that answers questions with Gemini in the user's language. Telegram Trigger, Gemini, Telegram. **Free**
11. **Voice notes to Notion**: voice messages to your bot become text pages in a Notion database. Telegram Trigger, Transcribe Audio, Notion, Telegram. **Free**
12. **News digest channel**: new items from local news RSS feeds are summarised in two lines and posted to a channel. RSS Feed Trigger, Gemini, Telegram. **Free**
13. **Staff knowledge bot**: answers staff questions from documents in a Google Drive folder. Document Loader, Vector Store, Telegram Trigger, Gemini, Telegram. **Free**
14. **Expense logger**: "fuel 2500" sent to the bot becomes a dated row in a sheet. Telegram Trigger, Information Extractor, Google Sheets, Telegram. **Intermediate**
15. **Overdue invoice reminder to the owner**: every morning lists unpaid invoices from a sheet. Schedule Trigger, Google Drive, Extract from File, Filter, Aggregate, Telegram. **Intermediate**
16. **Leave and expense approval**: a request form asks a manager on Telegram to approve or reject, and emails the result. Form Trigger, Send and Wait for Approval (Telegram), Email. **Free**

### Google Sheets and Gmail (Intermediate)

17. **Form to sheet with confirmation email**: every submission becomes a row and the person gets a confirmation in their language. Form Trigger, Google Sheets, Gmail. **Intermediate**
18. **Marketplace order emails to a sheet**: order emails (Daraz, Noon, Amazon style text) are parsed into rows. Gmail Trigger, Information Extractor, Google Sheets. **Intermediate**
19. **Inbox triage**: incoming emails are sorted into sales, support, billing and spam; urgent ones alert Slack. Gmail Trigger, Text Classifier, Slack. **Intermediate**
20. **AI reply with approval**: drafts a reply to each customer email, a person approves it, then it is sent in the thread. Gmail Trigger, Gemini, Send and Wait for Approval, Gmail. **Intermediate**
21. **Daily sales email**: a morning summary of yesterday's orders, totals and top products. Schedule Trigger, Shopify, Summarize, Gmail. **Intermediate**
22. **Weekly PDF report**: reads a sheet, totals it per category and emails a PDF (Urdu and Arabic supported). Schedule Trigger, Google Drive, Extract from File, Summarize, PDF Generator, Gmail. **Intermediate**
23. **Admission enquiries**: a school enquiry form saves to a sheet and answers parents with the fee and next steps. Form Trigger, Google Sheets, Gemini, Gmail. **Intermediate**
24. **Newsletter summaries**: newsletters in your inbox are summarised and sent to Telegram, so the inbox stays clean. Gmail Trigger, Gemini, Telegram, Gmail (mark as read). **Intermediate**

### Forms and bookings

25. **Booking form with calendar event**: a two-page booking form creates a Google Calendar event and emails a confirmation. Form Trigger, Form, Google Calendar, Email. **Free**
26. **Feedback with sentiment alert**: negative feedback alerts the manager at once. Form Trigger, Text Classifier, Telegram. **Free**
27. **Event registration with PDF ticket**: each registration gets a PDF ticket by email. Form Trigger, PDF Generator, Email. **Free**
28. **Quote request**: a form request becomes an AI-drafted quote that a person approves before it is emailed. Form Trigger, OpenAI, Send and Wait for Approval, Email. **Free**
29. **Leads from forms into the CRM**: Typeform or Google Form answers create a HubSpot contact and a Slack note. Typeform Trigger, HubSpot, Slack. **Free**
30. **Complaint intake**: a complaint form with a photo upload is read, summarised and filed as a Notion or Jira ticket. Form Trigger, Analyze Image / Document, Notion. **Free**

### E-commerce (Shopify, WooCommerce, Stripe)

31. **Low stock alert**: a product update with stock under your limit alerts the team. Shopify Trigger, IF, Telegram. **Free**
32. **Orders ledger**: every paid order becomes a row in a sheet for accounts. Shopify Trigger, Edit Fields, Google Sheets. **Intermediate**
33. **Shipping email**: a fulfilled order emails the customer the tracking link. Shopify Trigger, Email (or Resend). **Free**
34. **Product descriptions in three languages**: a new product gets English, Urdu and Arabic descriptions written into it. Shopify Trigger, OpenAI, Shopify. **Free**
35. **Cancelled or refunded order alert**: WooCommerce cancellations and refunds post to Slack with the reason. WooCommerce Trigger, Filter, Slack. **Free**
36. **Payment to CRM**: a Stripe payment creates a HubSpot deal and tells the team. Stripe Trigger, HubSpot, Slack. **Free**
37. **Website order-help chat**: a chat on the store looks up orders and answers delivery and return questions. Chat Trigger, AI Agent, WooCommerce (tool), Memory. **Intermediate**

### AI chat and documents

38. **Website chat from your documents**: a public chat widget answers from your PDFs and pages only. Document Loader, Vector Store, Chat Trigger, AI Agent, Memory. **Intermediate**
39. **Restaurant menu and table booking chat**: answers menu questions and saves bookings to Airtable. Chat Trigger, AI Agent, Airtable (tool), Memory. **Intermediate**
40. **Translator chat**: a public chat that translates between English, Urdu and Arabic. Chat Trigger, Gemini. **Free**
41. **Booking tools for AI assistants**: an MCP server that lets an AI assistant create and move your calendar events. MCP Server Trigger, Google Calendar. **Free**
42. **Document summary by email**: upload a PDF or Word file on a form and get a summary by email. Form Trigger, Extract from File, Gemini, Email. **Free**
43. **Safe public assistant**: a public chatbot that masks phone numbers and CNICs and refuses off-topic or jailbreak messages. Chat Trigger, Guardrails, AI Agent, Memory. **Intermediate**
44. **Meeting notes**: upload a recording; get a transcript, a summary and action items in Notion. Form Trigger, Transcribe Audio, Gemini, Notion. **Free**

### Marketing and social

45. **Scheduled Instagram and Facebook posts**: posts planned in a sheet go out at their time. Schedule Trigger, Google Drive, Extract from File, Filter, Instagram / Facebook Post. **Intermediate**
46. **Blog post to Instagram**: a new blog post (RSS) gets an AI caption and is posted with its image. RSS Feed Trigger, OpenAI, Instagram / Facebook Post. **Free**
47. **Instagram DM assistant**: answers common questions in Instagram direct messages. Instagram Trigger, AI Agent, Memory, Instagram. **Intermediate**
48. **Messenger FAQ bot**: answers questions sent to your Facebook Page. Messenger Trigger, Gemini, Messenger. **Free**
49. **Weekly content ideas**: searches the web for your topic and writes five post ideas into Notion. Schedule Trigger, Web Search, Gemini, Notion. **Intermediate**
50. **Event promotion approval**: a draft post from a form is approved on Telegram before it is published. Form Trigger, Send and Wait for Approval, Instagram / Facebook Post. **Free**

### Operations and admin

51. **Workflow failure alerts**: any failed workflow posts its name and error to Telegram or Slack. Error Trigger, Telegram. **Free**
52. **Website uptime check**: checks your site every 5 minutes and alerts when it is down or slow. Schedule Trigger, HTTP Request, IF, Telegram. **Intermediate**
53. **Invoice generator**: an invoice form makes a PDF, emails it and saves it to Drive. Form Trigger, PDF Generator, Email, Google Drive. **Free**
54. **Support email to Jira**: support emails become Jira issues with the key details pulled out. Gmail Trigger, Information Extractor, Jira. **Intermediate**
55. **Webhook logger**: incoming webhook data is saved to Postgres or MySQL, and errors alert Slack. Webhook Trigger, Postgres, IF, Slack. **Free**
56. **Staff check-in**: staff send "in" or "out" to a Telegram bot and it is logged with the time. Telegram Trigger, Date & Time, Google Sheets. **Intermediate**

### Education and community

57. **School announcements**: a teacher submits an announcement, the principal approves it, and it is posted to the parents' Telegram channel. Form Trigger, Send and Wait for Approval, Telegram. **Free**
58. **Result lookup bot**: students send their roll number and get their result from a database. Telegram Trigger, Information Extractor, Postgres, Telegram. **Free**
59. **Daily tip channel**: posts the next tip or quote from a sheet you write, once a day. Schedule Trigger, Google Drive, Extract from File, Telegram. **Intermediate**
60. **Community event RSVP**: an RSVP form saves to a sheet and confirms on Telegram or by email. Form Trigger, Google Sheets, Email. **Intermediate**

Plans in total: 8 Pro, 23 Intermediate, 29 Free.

## 4. Left out

* **Broken (10)**: no nodes or not valid JSON.
* **Community nodes (44)**: packages outside n8n's own nodes (PDF tool kits,
  scrapers, document generators, MCP and other add-ons). Their behaviour
  cannot be checked.
* **Risky (72)**: contact-finding and lead-enrichment services, scraping
  services, and names that point at bulk or cold messaging. Bulk WhatsApp
  messaging is also against WhatsApp's rules and would get a business
  number blocked.
* **Not planned (155)**: reading and writing files on the server's disk,
  running shell commands, n8n's own API. RXJ's SSH node runs commands on a
  server the user owns, which is the safe form of the same need.
