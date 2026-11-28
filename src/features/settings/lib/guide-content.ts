import { ACCOUNT_MESSAGE_CAPS } from "@/config/message-caps";
import { HOSTED_MONTHLY_EXECUTIONS } from "@/config/plans";

// The words of Settings → Help → Platform guide: how to use every part of
// RXJ, written for customers. Like the Docs page (marketing/lib/docs-content.ts)
// everything here describes what the app does today (see README.md): change
// a line only together with the feature. Numbers come from the code.
//
// No React and no server imports: the page builds the guide on the server
// and hands the plain data to the guide's client component.
//
// Inline markup in any text: **bold** and `code`. Nothing else is read.

export type GuideLink = { label: string; href: string };

export type GuideTopic = {
  id: string;
  title: string;
  // Paragraphs
  body?: string[];
  // A numbered how-to
  steps?: string[];
  // A bulleted list
  points?: string[];
  // A highlighted hint under the topic
  tip?: string;
  links?: GuideLink[];
  // Only on the hosted app, or only on a self-hosted server
  hostedOnly?: boolean;
  selfHostedOnly?: boolean;
};

export type GuideChapter = {
  id: string;
  title: string;
  summary: string;
  topics: GuideTopic[];
  // Only shown to the platform's admins
  adminOnly?: boolean;
  hostedOnly?: boolean;
};

const number = (value: number) => value.toLocaleString("en-US");
const caps = ACCOUNT_MESSAGE_CAPS;

const CHAPTERS = (nodeCount: number): GuideChapter[] => [
  {
    id: "getting-started",
    title: "Getting started",
    summary: "What RXJ is, the words it uses, and the quickest way to a workflow that runs by itself.",
    topics: [
      {
        id: "what-is-rxj",
        title: "What RXJ does",
        body: [
          `RXJ automates work for you. You build a **workflow**: a chain of steps that starts when something happens (a WhatsApp message, a new order, a form, a time of day) and then does the work: asks an AI, writes to a Google Sheet, sends an email, replies to the customer. RXJ has ${nodeCount} kinds of steps, called nodes.`,
          "If you know n8n, RXJ works the same way: the same kind of canvas, the same node names, and the same `{{ $json }}` expressions.",
        ],
      },
      {
        id: "words",
        title: "The words RXJ uses",
        points: [
          "**Workflow:** a set of connected nodes that does one job. It is **inactive** until you switch it on.",
          "**Node:** one step. A node has settings, takes the data of the steps before it, and adds its own result.",
          "**Trigger:** the first node. It decides when the workflow runs: by hand, on a schedule, on a message, on a webhook.",
          "**Execution:** one run of a workflow. Every run is listed under **Executions** with what each node did.",
          "**Credential:** a saved login or API key for another service (Gmail, WhatsApp, OpenAI). It is stored encrypted and never shown again.",
          "**Variable name:** the name under which a node's result is kept, for example `agent` or `sheetsResult`. Later nodes read it as `{{agent.output}}`.",
          "**Workspace:** the place your workflows, credentials and executions live. You can invite other people into it.",
        ],
      },
      {
        id: "first-workflow",
        title: "Your first workflow in five minutes",
        steps: [
          "Open **Templates** in the sidebar and pick one that is close to what you need, or press **Build with AI** on the Workflows page and describe it in one sentence.",
          "The workflow opens in the editor. Nodes marked **Not Configured** need your input: open each one and choose a credential or fill in the missing fields.",
          "Press **Save**, then **Execute workflow** to try it once. Watch the nodes turn green, and open any node to see what it received and produced.",
          "When it does what you want, switch it to **Active**. From now on it runs by itself whenever its trigger fires.",
          "Check **Executions** now and then. If a run fails you also get an email (you can turn that off in Settings → Profile).",
        ],
        links: [
          { label: "Templates", href: "/templates" },
          { label: "Workflows", href: "/workflows" },
        ],
      },
      {
        id: "checklist",
        title: "The Get started checklist",
        body: [
          "New accounts see **Get started with RXJ** above the workflows list: connect an account, start from a template, run a workflow, turn it on. Each step ticks itself off from what you have done, and the list disappears when all four are done (or for good with its ✕).",
        ],
      },
      {
        id: "sidebar",
        title: "Finding your way around",
        points: [
          "**Build:** Workflows (your workflows, folders and tags), Templates (ready-made workflows) and Chatbots (a document chatbot in one step).",
          "**Operate:** Executions (every run), Approvals (questions waiting for your yes or no) and Credentials (your saved logins).",
          "**Help:** Support, to email us or send a message from inside the app.",
          "**Your account button** at the bottom: Settings, Usage, Billing, API Keys, Docs and Sign out.",
          "**The workspace switcher** at the top, when you are a member of more than one workspace.",
        ],
      },
    ],
  },
  {
    id: "editor",
    title: "The workflow editor",
    summary: "Adding and connecting nodes, saving, testing, and the settings every workflow has.",
    topics: [
      {
        id: "canvas",
        title: "Building on the canvas",
        points: [
          "Click **+** (or the plus on a node's output) to add a node. Search by name or by what it does.",
          "Drag from one node's output dot to another node's input to connect them. Select a connection and press Delete to remove it.",
          "Double-click a node to open its settings. Every field accepts expressions such as `{{webhook.body.email}}`.",
          "Scroll to zoom, drag the background to move around. Ctrl+Z / Cmd+Z undoes and Ctrl+Shift+Z redoes up to 50 steps.",
          "**Sticky notes** (the note button next to the undo arrows) explain a workflow to whoever opens it next. They never run.",
        ],
      },
      {
        id: "save-run-activate",
        title: "Save, test and switch on",
        points: [
          "**Save** stores the workflow. Only saved changes run when the trigger fires.",
          "**Execute workflow** runs it once from the editor so you can watch it. A run from the editor does not send failure emails.",
          "**Active** makes schedules, webhooks and chat triggers work. An inactive workflow only runs when you start it.",
          "**Open chat** appears for workflows with a Chat Trigger, so you can talk to your AI agent right in the editor.",
        ],
      },
      {
        id: "node-toolbar",
        title: "When a node fails: the node toolbar",
        body: ["Hover a node to see its toolbar. Its error settings decide what happens when that one node fails:"],
        points: [
          "**On Error: Stop** (default) ends the run as failed. **Continue** carries on with the error in the node's result.",
          "**Retry On Fail** tries the node again a few times, for services that sometimes do not answer.",
          "**Execute Once** runs the node for the first item only, when it comes after a list.",
        ],
      },
      {
        id: "pinning",
        title: "Testing one part: pinned data and partial runs",
        body: [
          "The flask button on a node's toolbar saves time while you build. **Pin latest output** keeps what the node produced; in editor runs a pinned node is not run again, its pinned result is used. Pin an AI call that costs money, a message you do not want to send twice, or a trigger whose real event you do not want to wait for.",
          "**Run this node only** runs just that node, and **Run from here** runs it and everything after it, using the saved data of the nodes before it. Run the workflow once first so that data exists.",
        ],
        tip: "Live runs (webhooks, schedules, the public chat, the API) ignore pins and always run every node.",
      },
      {
        id: "workflow-settings",
        title: "Workflow settings (the gear button)",
        points: [
          "**Time zone:** schedules read their time on this clock. `0 9 * * *` in Asia/Karachi runs at 9:00 Pakistan time. No zone means UTC.",
          "**Don't save node input/output:** for workflows that handle private data. Runs then keep only their status and errors, and cannot be retried.",
          "**Monthly AI budget:** stops this workflow's AI nodes once the month's AI spend reaches it.",
          "**Duplicate:** an inactive copy with the same nodes and credentials.",
          "**Download as JSON:** a backup of the saved workflow. Credentials and secrets are never in the file.",
        ],
      },
      {
        id: "history",
        title: "Version history",
        body: [
          "Every Save that changes a workflow keeps a version. **History** in the editor's header lists them with what changed (nodes added, removed, changed). **Restore** puts an older version back; the restore is itself a version, so it can be undone too.",
          "The newest 50 versions of the last 30 days are kept. Each execution says which version it ran.",
        ],
      },
      {
        id: "import",
        title: "Import and moving workflows",
        body: [
          "On the Workflows page, **Import** opens a file made with Download as JSON as a new, inactive workflow. In another account the credentials have to be picked again, and webhook triggers get a new address. Files from n8n cannot be imported: their node types are different.",
        ],
      },
      {
        id: "organise",
        title: "Folders and tags",
        body: [
          "Keep the Workflows page tidy with **New folder**, and with **Move to folder** and **Edit tags...** in a workflow's menu. Pick a folder or a tag to see only those workflows. Folders are one level deep; a workflow has up to 10 tags.",
        ],
      },
    ],
  },
  {
    id: "triggers",
    title: "Triggers: when a workflow runs",
    summary: "Every workflow starts with one trigger. Pick the one that matches the event you care about.",
    topics: [
      {
        id: "trigger-list",
        title: "The triggers",
        points: [
          "**Manual Trigger:** runs when you press Execute workflow, or from the API.",
          "**Schedule Trigger:** runs on a cron pattern, read in the workflow's time zone. `*/15 * * * *` is every 15 minutes, `0 9 * * 1-5` is 9:00 on weekdays. The dialog shows the next three runs.",
          "**Webhook Trigger:** runs on an HTTP request to the workflow's own address, protected by a secret. It can answer at once, when the last node finishes, or with a Respond to Webhook node.",
          "**Chat Trigger:** a chat with your workflow, in the editor, on a hosted page, or as a widget on your website.",
          "**Form Trigger:** a public form hosted by RXJ (see Forms).",
          "**WhatsApp, Telegram, Messenger and Instagram Triggers:** run on every incoming message; they set `{{chatInput}}` and `{{sessionId}}` for an AI Agent.",
          "**Gmail Trigger** and **RSS Feed Trigger:** check for new emails or feed items every few minutes.",
          "**Shopify, WooCommerce, Stripe, Typeform and Google Form Triggers:** run on store orders, payments and form answers.",
          "**MCP Server Trigger:** makes the workflow a tool that Claude, Cursor or another AI agent can call.",
          "**Error Trigger:** runs when a workflow fails, so you can send your own alert.",
          "**When Executed by Another Workflow:** the start of a sub-workflow.",
        ],
      },
      {
        id: "public-address",
        title: "Triggers that receive events from other services",
        body: [
          "WhatsApp, Telegram, Messenger, Instagram, Shopify, WooCommerce, Stripe and Typeform send their events to the address shown in the trigger's settings. Copy it into that service, and **activate the workflow** first: most services check the address when you save it. A Telegram bot's webhook is registered for you when you switch the workflow on.",
          "If a service sends the same event twice, RXJ starts only one run (repeats are remembered for 7 days).",
        ],
      },
    ],
  },
  {
    id: "data",
    title: "Data, expressions and files",
    summary: "How one node uses what another produced, how lists are handled, and how files travel.",
    topics: [
      {
        id: "expressions",
        title: "Expressions",
        body: ["Write `{{ }}` in any field to put data in it. Both RXJ's and n8n's styles work:"],
        points: [
          "`{{webhook.body.name}}`: a node's result by its variable name.",
          "`{{ $json.price * $json.quantity }}`: any JavaScript expression, run in a safe sandbox.",
          "`{{ $('myApiCall').item.json.id }}`: another node's result, n8n style.",
          "`{{json order}}`: a whole object or list as JSON.",
          "`{{ $now }}`, `{{ $today }}`, `{{ $itemIndex }}`: the time now, the start of today, the position in a list.",
          "`{{execution.resumeUrl}}` and `{{execution.formUrl}}`: links that continue a waiting run.",
        ],
        tip: "Open a node after a test run: its Input and Output tabs show exactly which fields you can use.",
      },
      {
        id: "items",
        title: "Lists and items",
        body: [
          "After a list node (Split Out, Sort, Limit, Remove Duplicates, Summarize, RSS Read, Extract from File) every following node runs **once per item**, with the item at `{{item}}` or `{{ $json }}`. IF, Filter and Switch decide per item. Aggregate, Loop or Convert to File gather the items back into one.",
          "An HTTP Request or Code node that returns a list does not split it by itself: add a Split Out after it. At most 100 items reach one node.",
        ],
      },
      {
        id: "transform",
        title: "Shaping data",
        points: [
          "**Edit Fields:** set, keep, remove and rename fields, one `name (type) = value` per line.",
          "**Split Out / Aggregate:** a list into items, and items back into a list.",
          "**Sort, Limit, Remove Duplicates, Summarize:** order, cut, de-duplicate and total (like a pivot table).",
          "**Set Variable, Date & Time, Text Formatter, Calculator:** small everyday helpers.",
          "**JavaScript Code:** your own code, in a sandbox with no network or file access (10 seconds by default).",
        ],
      },
      {
        id: "data-table",
        title: "Data tables: memory between runs",
        body: [
          "The **Data Table** node keeps rows by a key, with no credential needed: an \"already contacted\" list, an order's status, the step a chat has reached. Check Row Exists followed by an IF skips people you already wrote to.",
          "See and delete the rows under Settings → Data tables. Limits: 50 tables, 10,000 rows a table, 16 KB a row.",
        ],
        links: [{ label: "Data tables", href: "/settings/data-tables" }],
      },
      {
        id: "files",
        title: "Files",
        body: [
          "Files are passed by reference. A node that makes or downloads a file (PDF Generator, Convert to File, HTTP Request, Google Drive, a form upload, a WhatsApp photo) gives a file variable such as `pdf.file`; type that variable into another node's **File** or **Attachments** field to send or read it.",
          "**PDF Generator** writes Urdu and Arabic correctly, right to left. **Extract from File** reads Excel, CSV, PDF and Word files back into data.",
          "A file can be up to 10 MB, you can store up to 200 MB, and files are deleted after 7 days. For bigger files (videos for Reels) and lasting links, use the **S3 Storage** node with your own bucket (Amazon S3, Cloudflare R2, Backblaze, Wasabi, DigitalOcean Spaces): upload, then **Get Link** to hand the file to Instagram or a customer.",
        ],
      },
    ],
  },
  {
    id: "flow",
    title: "Branches, waiting and approvals",
    summary: "Making decisions, pausing a run, asking a person, and handling errors.",
    topics: [
      {
        id: "routing",
        title: "Decisions",
        points: [
          "**IF:** a True and a False output.",
          "**Switch:** one of several outputs by ordered rules, with a fallback.",
          "**Filter:** stops the branch unless the condition is true.",
          "**Merge:** joins branches back together.",
          "**Loop:** runs the connected nodes once for every item in a list.",
          "**Execute Workflow:** runs another workflow and uses its result, so a job used in many places is built once.",
        ],
      },
      {
        id: "wait",
        title: "Waiting",
        body: [
          "The **Wait** node pauses a run for a time, until a date, until its resume link is called, or until a form is filled in. While it waits the execution shows **Waiting**, costs nothing, and can be cancelled from its page. The longest wait is 7 days.",
        ],
      },
      {
        id: "approvals",
        title: "Asking a person: approvals",
        body: [
          "**Send and Wait for Approval** asks a yes/no question and continues through its **Approved** or **Rejected** output. The question arrives on the **Approvals** page and, if you choose, by email, Slack, Telegram or WhatsApp, with Approve and Reject links that work once and expire (24 hours by default).",
          "AI agents use the same approvals for their tools (see AI agents). Use it before anything that is hard to undo: sending a quote, posting publicly, refunding.",
        ],
        links: [{ label: "Approvals", href: "/approvals" }],
      },
      {
        id: "approve-with-edits",
        title: "Approve with edits: fix an AI draft before it goes out",
        body: [
          "Let the approver correct the text instead of only saying yes or no: an AI-written email, a quote, a social post.",
        ],
        steps: [
          "In **Send and Wait for Approval**, fill in **Editable Fields**, one per line: `subject: {{draft.subject}}` and `body: {{draft.body}}`.",
          "The approver sees each field in a text box, already filled in, on the Approve page of the link and on the **Approvals** page. They change what they like and approve.",
          "In the node after **Approved**, use the final text: `{{approval.fields.body}}`, not the draft. `{{approval.edited}}` is true when something was changed.",
        ],
        tip: "Rejecting ignores any changes. Up to 10 fields, 10,000 characters each.",
      },
      {
        id: "errors",
        title: "Handling failures",
        points: [
          "Per node: **On Error**, **Retry On Fail** (see the node toolbar).",
          "**Stop and Error:** fail the run on purpose with your own message.",
          "**Error Trigger:** a workflow that runs when another one fails, for example to post to your team's Telegram group.",
          "**Failure emails:** on by default, at most one an hour per workflow, with the failed node and the error.",
          "**Retry** on a failed execution runs it again with the same starting data, using the workflow as it is now: fix the workflow, then retry.",
        ],
      },
    ],
  },
  {
    id: "forms",
    title: "Forms",
    summary: "A public form hosted by RXJ: no website and no sign-in needed for the person filling it in.",
    topics: [
      {
        id: "form-trigger",
        title: "Making a form",
        steps: [
          "Start a workflow with a **Form Trigger** and add fields: text, email, number, dropdown, date, file upload, checkbox.",
          "Set a title, a description, the button label, and what happens after submitting: a thank-you message or a redirect.",
          "Save and activate the workflow, then share the **Form URL** from the trigger's settings.",
          "Each answer is at `{{form.<field>}}`: the field `Your name` is `{{form.your_name}}`. A file field gives a file variable such as `form.cv`.",
        ],
        tip: "Switch on Require a CAPTCHA if the form gets spam. A form takes at most 30 submissions a minute.",
      },
      {
        id: "multi-step",
        title: "Multi-step forms and forms in other workflows",
        body: [
          "A **Form** node after the trigger is the next page of the same form, and can greet the person with an earlier answer. A **Wait** node set to On Form Submitted pauses any workflow until a form is filled in: send the link `{{execution.formUrl}}` in an email or chat first.",
        ],
      },
    ],
  },
  {
    id: "ai",
    title: "AI agents and models",
    summary: "Connecting a model, building an agent with tools and memory, and keeping it safe and affordable.",
    topics: [
      {
        id: "models",
        title: "Choosing a model",
        body: [
          "Model nodes: **OpenAI**, **Anthropic**, **Gemini**, **DeepSeek**, **Kimi**, **Qwen**, and **Chat Model** for any OpenAI-compatible provider (OpenRouter, Groq, Mistral, Together, Zhipu GLM, MiniMax, SiliconFlow, Ollama and more, or your own base URL). Add the provider's API key under Credentials, pick it on the node, and use **Load models** to see what the key can use.",
          "Models marked **Free** cost nothing at the provider (with rate limits). Models marked **Data processed in China** send your data to servers in mainland China.",
        ],
        links: [{ label: "Credentials", href: "/credentials" }],
      },
      {
        id: "rxj-ai",
        title: "RXJ AI (included): no API key of your own",
        hostedOnly: true,
        body: [
          "When it is set up, a Chat Model node's credential list offers **RXJ AI (included)**: RXJ's own keys call the model and you pay with **AI credits** bought under Billing (1,000 credits are one US dollar of model cost). When the credits run out, nodes that use it stop with a message saying so; your own credentials keep working.",
        ],
        links: [{ label: "Billing", href: "/billing" }],
      },
      {
        id: "agent",
        title: "The AI Agent",
        body: [
          "The **AI Agent** works like n8n's Tools Agent: a model that decides which tools to use and keeps going until it has an answer. Plug into its ports:",
        ],
        points: [
          "**Chat Model** (required): the model that thinks. A **Model Router** can try a cheap model first and switch to a strong one when it fails.",
          "**Memory:** remembers the conversation per session. **Postgres Memory** also keeps a summary and long-term facts about each contact.",
          "**Tools:** any node becomes a tool, for example Google Sheets Lookup Row, Web Search, a Vector Store or another workflow. Write `{{$fromAI \"city\" \"The city\"}}` in a tool's field to let the agent fill it in.",
          "**Parser:** a Structured Output Parser makes it answer with JSON in your structure.",
        ],
        tip: "Write clear instructions in the System Message: who the agent is, what it may do, what it must never do, and what to say when it does not know.",
      },
      {
        id: "agent-safety",
        title: "Keeping agents safe",
        points: [
          "Each tool shows a risk level: **Read**, **Write** or **Dangerous**. Dangerous tools (deletes, raw SQL, SSH, other workflows) only run when **Allow dangerous tools** is on.",
          "**Require approval** per tool: the run pauses and a person approves or rejects the exact action first. It is on by default for Write and Dangerous tools on new agents.",
          "**Max Tool Calls** (default 25) and **Max Iterations** (default 10) stop an agent that goes round in circles.",
          "**Guardrails** checks text before or after the agent: it masks or blocks personal data, limits length, and catches prompt injection and off-topic messages.",
          "Tool results are treated as data, never as orders. Even so, give an agent only the tools and credentials it really needs.",
        ],
      },
      {
        id: "memory",
        title: "Memory and contact facts",
        body: [
          "With **Postgres Memory** an agent remembers each contact across conversations (a name, a preference, an order number). Use something that stays the same for a person as the Contact ID, for example `{{whatsapp.from}}`.",
          "See and delete what agents remember under Settings → Contact memory, for example when a customer asks to be forgotten.",
        ],
        links: [{ label: "Contact memory", href: "/settings/contact-memory" }],
      },
      {
        id: "reliability",
        title: "Fallback models and the Model Router",
        body: [
          "A **Chat Model** node can list up to 5 **Fallback Models**, tried in order when its model times out, is overloaded (HTTP 429 or 5xx) or cannot be reached. A wrong key is not passed on: fix it instead. The node's output says which model answered (`modelUsed`, `fallbackUsed`).",
        ],
      },
      {
        id: "documents",
        title: "Answering from your documents (RAG)",
        body: [
          "A **Vector Store** keeps your documents in a collection and finds the parts closest in meaning to a question. Insert text into it, then connect it to an agent's Tools port in Search mode. **Document Loader** fills a collection from a Google Drive folder or a Notion database and skips documents that have not changed: put it after a Schedule Trigger to keep it up to date.",
          "The quickest way to all of this is the **Chatbots** page (see Chatbots).",
        ],
      },
      {
        id: "ai-nodes",
        title: "Other AI nodes",
        points: [
          "**Text Classifier:** sorts text into your categories and continues on that category's output.",
          "**Information Extractor:** pulls named values (`name (type): description`) out of free text.",
          "**Analyze Image / Document:** reads images and PDFs, scans included: all the text, named fields (an invoice's number and total), or a description.",
          "**Transcribe Audio** and **Text to Speech:** voice notes into text, and answers into audio.",
          "**Image Generation:** a picture from a prompt, for posts and product images.",
          "**Web Search**, **Read Web Page** and **Browser:** bring web pages into a workflow; the Browser node uses a real Chrome for pages that need JavaScript, clicks or screenshots.",
          "**MCP Client:** gives an agent the tools of an MCP server. **Think Tool** and **AI Agent Tool** help agents plan and hand tasks to other agents.",
        ],
      },
      {
        id: "ai-cost",
        title: "Watching AI spend",
        body: [
          "Every model call's tokens and estimated cost are recorded: per run on the execution's page (AI usage), and per month under Settings → AI budgets. Set a **monthly AI budget** for the workspace there, or for one workflow in its settings: when the month's spend reaches it, AI nodes stop until the budget is raised or the month ends.",
          "The amounts are estimates. When you use your own keys, your provider's invoice is what counts.",
        ],
        links: [{ label: "AI budgets", href: "/settings/ai-budgets" }],
      },
    ],
  },
  {
    id: "chatbots",
    title: "Chatbots and the website chat",
    summary: "A chatbot that answers from your documents, on your website, by link and on WhatsApp.",
    topics: [
      {
        id: "create-chatbot",
        title: "Create a chatbot in one step",
        steps: [
          "Open **Chatbots** in the sidebar and press **Create a chatbot**.",
          "Give it a name, upload documents (PDF, Word, text, Markdown, CSV, up to 3 MB each) and/or website addresses (one page per line).",
          "Pick the model that answers, and an OpenAI or Gemini credential for reading the documents.",
          "Optionally add a welcome message, extra instructions and WhatsApp.",
          "Copy the **widget snippet** into your website, or share the **link**. Add or remove documents on the chatbot's page any time.",
        ],
        tip: "The chatbot is a normal workflow underneath: open it in the editor to change anything.",
        links: [{ label: "Chatbots", href: "/chatbots" }],
      },
      {
        id: "widget",
        title: "The website chat widget",
        body: [
          "Switch on **Make chat public** in any Chat Trigger to get an embed snippet and a hosted chat page. Set its title, colour, welcome message, avatar and direction (right to left for Urdu and Arabic). **Allowed domains** keeps it off other people's sites.",
          "Each visitor has their own conversation. The optional **Talk to a human** button sends the conversation to you by email, Slack or WhatsApp and stops the bot in that chat.",
          "Every message is an execution and counts towards the month's runs.",
        ],
      },
    ],
  },
  {
    id: "videos-social",
    title: "Videos and social media automation",
    summary: "Make videos automatically, and post them as Reels, Shorts, YouTube videos and LinkedIn posts.",
    topics: [
      {
        id: "video-overview",
        title: "What you can build",
        points: [
          "**Render Video:** a finished video from a template or a JSON description, with **Creatomate** or **JSON2Video** (your own account and API key).",
          "**Instagram / Facebook Post:** Reels, carousels and Stories on Instagram; photos and videos on a Facebook Page.",
          "**YouTube:** upload, change titles and thumbnails, list your videos, reply to comments.",
          "**LinkedIn:** text, link and picture posts on your profile or Company Page.",
          "**S3 Storage:** keep big videos in your own bucket and hand them on with a link.",
          "**Comment to DM:** answer comments on your posts with a private message (see Apps, messaging and credentials).",
        ],
        tip: "Videos are not stored inside the workflow (a workflow file is at most 10 MB). They travel as links: the render's link, or an S3 Storage link.",
      },
      {
        id: "render-video",
        title: "Render a video: choose Creatomate or JSON2Video",
        body: [
          "Both are paid services with a free trial; every render uses your credits there. Pick the one that fits how you work:",
        ],
        points: [
          "**Creatomate** if you like designing visually: build a template in its editor (a title, your logo, a photo, music, a voice-over slot), then the workflow fills in the texts and pictures. Best for branded Reels and Shorts that look the same every time.",
          "**JSON2Video** if your videos are made from a script: scenes with pictures or clips, built-in AI voices and automatic subtitles. Good for \"faceless\" YouTube videos and explainers.",
        ],
        links: [{ label: "Credentials", href: "/credentials" }],
      },
      {
        id: "render-creatomate",
        title: "Set up Creatomate",
        steps: [
          "Make an account at creatomate.com and design a template (or start from one of theirs). Give the elements you want to change clear names, such as Title, Photo and Voiceover.",
          "In Creatomate open **Project settings > API Key** and copy it. In RXJ: Credentials > New credential > **Creatomate**, paste it, save.",
          "Open the template, press **Use template > API Integration** and copy the **template_id**.",
          "Add a **Render Video** node: Provider **Creatomate**, Make It From **A template**, your credential, the Template ID.",
          "In **Template Values** write one line per change, as element name and property: `Title.text: {{article.title}}` and `Photo.source: {{image.url}}`. Pictures, videos and sounds are public https addresses.",
          "Run it. The node waits until the video is ready (usually 1 to 5 minutes) and gives `{{video.url}}`.",
        ],
      },
      {
        id: "render-json2video",
        title: "Set up JSON2Video",
        steps: [
          "Make an account at json2video.com and copy the primary key from the dashboard's **API Keys** page. In RXJ: Credentials > New credential > **JSON2Video**.",
          "Easiest: create a template in JSON2Video with variables (for example `headline` and `script`), and copy its id.",
          "Add a **Render Video** node: Provider **JSON2Video**, Make It From **A template**, the Template ID, and in Template Values `headline: {{article.title}}` and `script: {{article.script}}`.",
          "Advanced: Make It From **A JSON description** and write the whole movie (scenes, texts, voice, subtitles) as JSON. Put workflow text in with `{{json article.script}}`, so quotes in it cannot break the JSON.",
          "Run it and use `{{video.url}}` in the next node.",
        ],
      },
      {
        id: "video-recipes",
        title: "Recipes: from an idea to a posted video",
        points: [
          "**Daily Reel:** Schedule Trigger (every morning) → Google Sheets Get Rows (today's topic) → AI Agent (writes a 30-second script and a caption) → Render Video (Creatomate template, 1080 x 1920) → Send and Wait for Approval with Editable Fields (caption) → Instagram / Facebook Post, **Instagram Reel**, Video `{{video.url}}`, Caption `{{approval.fields.caption}}`.",
          "**Faceless YouTube video:** Form Trigger (a topic) → AI Agent (script, title, description, tags) → Render Video (JSON2Video, AI voice and subtitles) → YouTube **Upload Video**, Video `{{video.url}}`, Privacy Private → a Telegram message to you with `{{youtube.url}}` to check it before you publish.",
          "**One video, everywhere:** after Render Video, run the Instagram Reel, YouTube Upload and LinkedIn **Share Link** (to the YouTube video) nodes one after the other.",
          "**Keep your videos:** S3 Storage cannot take a link directly, so turn on **Save As File** on Render Video (videos up to 10 MB), then S3 Storage **Upload File** with File `video.file`, and **Get Link** whenever a node needs the video again.",
          "**Answer every comment:** YouTube **List Comments** (Schedule Trigger, hourly) → Split Out → AI Agent (a short friendly reply) → YouTube **Reply to Comment** with Comment ID `{{item.commentId}}`. For Instagram, use the Instagram Trigger on comments (Comment to DM).",
        ],
        tip: "Start with Privacy Private on YouTube and an approval step before posting. When the results look right every time, remove the approval.",
      },
      {
        id: "youtube-setup",
        title: "Connect YouTube",
        steps: [
          "Credentials > New credential > **YouTube Channel** > **Connect YouTube**, and sign in with the Google account of the channel (pick the Brand Account if the channel is one).",
          "Allow both YouTube permissions. Your Gmail and Sheets credential is separate and does not change.",
          "Until RXJ's Google app has passed Google's YouTube audit, YouTube keeps uploaded videos private: publish them yourself in YouTube Studio.",
          "Uploads are at most 512 MB. Each upload uses a big part of the daily YouTube quota, so a few uploads a day is the comfortable limit.",
        ],
      },
      {
        id: "linkedin-setup",
        title: "Connect LinkedIn",
        steps: [
          "Credentials > New credential > **LinkedIn Account** > **Connect LinkedIn**, and sign in.",
          "Add a **LinkedIn** node: Create Post, Share Link or Post With Image. `#words` become hashtags.",
          "LinkedIn sign-ins last 60 days. When a node says the sign-in expired, open the credential and press **Reconnect LinkedIn**; your workflows keep working.",
        ],
      },
    ],
  },
  {
    id: "integrations",
    title: "Apps, messaging and credentials",
    summary: "Connecting RXJ to the services you use, and what each one needs.",
    topics: [
      {
        id: "credentials",
        title: "Adding a credential",
        steps: [
          "Open **Credentials** in the sidebar and press **New credential**.",
          "Choose the type. Google and Salesforce use **Sign in**; others need an API key or token from the service's own settings.",
          "Give it a name you will recognise and save. The secret is encrypted and never shown again: to change it, type a new one.",
        ],
        tip: "In a shared workspace, members use a credential by its name but can never see its value. Only owners and admins add or change credentials.",
        links: [{ label: "Credentials", href: "/credentials" }],
      },
      {
        id: "messaging",
        title: "Messaging",
        points: [
          "**WhatsApp** (Business Cloud API): text, approved templates, files, reply buttons and list menus. You can only write free text to someone who wrote to you in the last 24 hours; start a conversation with an approved template.",
          "**Telegram:** a bot from @BotFather; text and files, voice notes and photos in.",
          "**Messenger and Instagram:** replies to people who wrote to your Page or account, answers to comments on your posts (see Comment to DM), and posts: Instagram photos, Reels, carousels and Stories, Facebook Page photos and videos (the **Instagram / Facebook Post** node; videos as a public .mp4 link or a file).",
          "**Email:** Gmail, SMTP, Resend or SendGrid, with attachments. **Slack, Discord, Twilio** (SMS and WhatsApp).",
          "**LinkedIn:** post text, a link or a picture on your profile (or a Company Page once your LinkedIn app is approved for it). Connect it under Credentials; LinkedIn sign-ins last 60 days, and **Reconnect** on the credential renews it without touching your workflows.",
          "**YouTube:** upload videos (from a link or an S3 Storage file, up to 512 MB), change titles, descriptions, tags, privacy and thumbnails, list your videos with views, and reply to comments. Connect the channel under Credentials > YouTube Channel. Until RXJ's Google app has passed Google's YouTube audit, uploaded videos stay private.",
        ],
      },
      {
        id: "comment-to-dm",
        title: "Comment to DM: leads from your posts",
        body: [
          "Turn comments into conversations: someone comments \"PRICE\" under your post or reel, gets a private message from you at once, and a public reply so others see you answered.",
        ],
        steps: [
          "Start a workflow with an **Instagram Trigger** (or **Messenger Trigger** for a Facebook Page) and set **Trigger On** to **Comments on posts**.",
          "Optionally type keywords in **Only Comments Containing** (`price, info, link`) and limit it to some posts or reels.",
          "In your Meta app, subscribe the webhook to **comments** (Instagram) or **feed** (Facebook Page) as well as messages, then activate the workflow.",
          "Add an **Instagram** node with **Send Private Reply**, Comment ID `{{instagram.commentId}}`, and your message: the price list, a link, or a question.",
          "Add another with **Reply to Comment** (\"Sent you a DM!\"). Use **Hide Comment** for spam.",
          "When the person answers the DM, the trigger gets their message like any other: set Trigger On to **Messages and comments** and let an AI Agent continue, saving the lead to Google Sheets.",
        ],
        tip: "Meta allows one private reply per comment, within 7 days of it. Your own replies never start the workflow again. The template \"Instagram comment to DM: leads in Google Sheets\" has all of this ready.",
        links: [{ label: "Templates", href: "/templates" }],
      },
      {
        id: "apps",
        title: "Apps and databases",
        points: [
          "**Google Sheets:** Append Row, Get Rows, Lookup Row, Update Row and Append or Update Row. Row 1 holds the column names.",
          "**Google Calendar** (List Events tells you if a slot is free), **Google Drive**, **Gmail**.",
          "**Shopify** and **WooCommerce:** orders, products, customers and stock, plus triggers for new and paid orders.",
          "**WordPress:** create and update posts and pages (as drafts by default), upload pictures for the featured image, and list categories and tags. Make an **application password** in WordPress under Users > Profile and save it as `username:password`.",
          "**Google Search Console:** clicks, impressions, CTR and position by query, page, country or date; whether a page is indexed; your sitemaps. Sign in with Google (a Google account connected before has to be connected again), or use a service account added as a user of your property. Read-only.",
          "**Notion, Airtable, HubSpot, Salesforce, Jira, GitHub.**",
          "**Postgres** and **MySQL:** put values in **Query Parameters**, never typed into the SQL.",
          "**HTTP Request:** any other API. Private and local addresses are blocked.",
        ],
      },
      {
        id: "ssh",
        title: "SSH",
        selfHostedOnly: true,
        body: [
          "The **SSH** node runs a command on a server of yours and returns its output. Use `{{shellQuote value}}` for anything that comes from outside, such as webhook data.",
        ],
      },
      {
        id: "ssh-hosted",
        title: "SSH (own server only)",
        hostedOnly: true,
        body: [
          "The SSH node only runs on a self-hosted or managed private RXJ server, not on the hosted app. Templates that use it show an **Own server** badge.",
        ],
      },
    ],
  },
  {
    id: "templates-ai-builder",
    title: "Templates and Build with AI",
    summary: "Two ways to start without building every node yourself.",
    topics: [
      {
        id: "templates",
        title: "Templates",
        body: [
          "The **Templates** gallery has ready-made workflows for shops, clinics, schools, support and more. Click a card to read what it does and its setup steps, then **Use template**: a copy opens in your account, with **Not Configured** on every node that needs your own account, phone number ID, sheet or folder. Changing a template later never changes your copy.",
        ],
        links: [{ label: "Templates", href: "/templates" }],
      },
      {
        id: "build-with-ai",
        title: "Build with AI",
        body: [
          "Press **Build with AI** on the Workflows page or in the editor and describe what you need, for example \"when a WhatsApp message arrives, answer it with Gemini and save the question in a Google Sheet\". On a canvas with nodes, describe a change instead (\"send it on Telegram instead\"); **Undo this change** puts it back.",
          "It uses one of your own model credentials (or RXJ AI included) and counts towards your AI spend. It never fills in credentials, and never switches a workflow on: you review, set up, save and activate.",
        ],
      },
    ],
  },
  {
    id: "monitoring",
    title: "Executions and monitoring",
    summary: "Seeing what ran, why something failed, and running it again.",
    topics: [
      {
        id: "executions",
        title: "The Executions page",
        body: [
          "Every run is listed with its workflow, what started it, when and how long, and its status: **Running**, **Waiting**, **Success** or **Failed**. Open one to see each node's input, output and error, the workflow version it used, and its AI usage and cost.",
          "Secrets in node data are replaced by `[REDACTED]` before anything is stored.",
        ],
        links: [{ label: "Executions", href: "/executions" }],
      },
      {
        id: "retry",
        title: "Retry and run again",
        body: [
          "A failed execution has **Retry**, a successful one **Run again**: it starts from the same trigger data with the workflow as it is now. A waiting execution has **Cancel**.",
        ],
      },
      {
        id: "retention",
        title: "How long runs are kept",
        body: [
          "On the Executions page, **Execution data retention** keeps your execution data for 7, 30 (default) or 90 days. Waiting and running executions are never removed.",
        ],
      },
      {
        id: "evaluations",
        title: "Testing an agent: evaluations",
        body: [
          "**Evaluations** in the editor's header tests a workflow over a set of inputs and scores the answers: exact match, contains, JSON schema, or an AI judge against your criteria. Change the model or prompt, run again, and compare up to four runs side by side by score, cost and time.",
          "Each row is a real execution: it counts towards the month's runs, and a workflow that sends messages sends them for every row.",
        ],
      },
    ],
  },
  {
    id: "team",
    title: "Workspaces, members and roles",
    summary: "Working together on the same workflows without sharing passwords.",
    topics: [
      {
        id: "workspace",
        title: "Your workspace",
        body: [
          "Workflows, credentials, executions, chatbots and AI budgets belong to the workspace you are working in. Your password, two-factor settings, sessions and API keys are always your own. When you are a member of other workspaces, pick one in the sidebar's switcher.",
        ],
      },
      {
        id: "invite",
        title: "Inviting someone",
        steps: [
          "Open Settings → Members & roles and invite their email address with a role.",
          "No email is sent: tell them to sign in to RXJ with that address.",
          "They find the invitation under Settings → General and accept it.",
        ],
        links: [{ label: "Members & roles", href: "/settings/members" }],
      },
      {
        id: "roles",
        title: "What each role may do",
        points: [
          "**Viewer:** sees workflows, executions, usage and the names of credentials.",
          "**Editor:** also creates, edits, runs and deletes workflows, chatbots, evaluations and approvals, and uses credentials in nodes.",
          "**Admin:** also adds, changes and deletes credentials, sets AI budgets and retention, invites and removes editors and viewers, and renames the workspace.",
          "**Owner:** everything, including making and removing admins.",
        ],
        tip: "Limits are counted for the workspace's owner, whoever of its members runs the workflow.",
      },
    ],
  },
  {
    id: "settings",
    title: "A tour of Settings",
    summary: "What each part of Settings is for.",
    topics: [
      {
        id: "account-settings",
        title: "Account",
        points: [
          "**Profile:** your name, and whether RXJ emails you when a workflow fails.",
          "**Security:** your password, two-factor authentication, and every signed-in device with Sign out.",
          "**API Keys:** keys for running workflows from your own code (see Public API).",
        ],
        links: [
          { label: "Profile", href: "/settings/profile" },
          { label: "Security", href: "/settings/security" },
        ],
      },
      {
        id: "private-server-settings",
        title: "Private server",
        hostedOnly: true,
        body: ["**Private server:** your managed private server, its install command, and whether it is online (see Your own server)."],
        links: [{ label: "Private server", href: "/settings/private-server" }],
      },
      {
        id: "workspace-settings",
        title: "Workspace",
        points: [
          "**General:** the workspace's name, invitations for you, and leaving a workspace.",
          "**Members & roles:** who is in the workspace and their roles.",
          "**Data tables:** the rows your Data Table nodes keep.",
          "**Usage:** what this workspace used this month against its limits.",
          "**Audit log:** sign-ins and changes made with your account, with the time and address.",
        ],
      },
      {
        id: "ai-settings",
        title: "AI",
        points: [
          "**Contact memory:** what agents remember about each contact, with delete buttons.",
          "**AI budgets:** this month's AI spend and the workspace's monthly budget.",
        ],
      },
    ],
  },
  {
    id: "limits",
    title: "Usage, limits and billing",
    summary: "What every account gets, and the limits that keep the platform fair.",
    hostedOnly: true,
    topics: [
      {
        id: "everything-included",
        title: "Everything is included",
        body: [
          `There are no plans and no trials: every account can use every node, template and feature, with as many workflows and credentials as it likes, and ${number(HOSTED_MONTHLY_EXECUTIONS)} workflow runs a month. Every run counts, whatever started it (a test in the editor, a webhook, a chat message, an evaluation row). Deleting executions does not give runs back. The count starts again on the 1st (UTC).`,
        ],
        links: [{ label: "Usage", href: "/settings/usage" }],
      },
      {
        id: "message-caps",
        title: "Daily message limits",
        body: [
          `To stop the platform being used for bulk sending, an account can send per day (UTC): ${number(caps.email)} emails (every recipient counts), ${number(caps.whatsapp)} WhatsApp messages, ${number(caps.twilio)} Twilio messages and ${number(caps.telegram)} Telegram messages. A node that would go over fails before it sends anything.`,
        ],
      },
      {
        id: "billing",
        title: "Billing",
        body: [
          "**Billing** is where you buy AI credits for RXJ AI (included) and see your AI spend. It is always about your own account, whichever workspace you are in.",
          "For no limits at all, and SSH, run RXJ on a server of your own: yourself for free, or as a **managed private server** that we install and look after (see Pricing).",
        ],
        links: [
          { label: "Billing", href: "/billing" },
          { label: "Pricing", href: "/pricing" },
        ],
      },
    ],
  },
  {
    id: "api",
    title: "Public API and MCP",
    summary: "Running workflows from your own code, or from another AI.",
    topics: [
      {
        id: "api-keys",
        title: "API keys",
        steps: [
          "Open Settings → API Keys and create a key with the scopes it needs and, if you like, an expiry date.",
          "Copy it: it is shown only once.",
          "Send it as `Authorization: Bearer <key>` or `X-API-Key: <key>`. **Revoke** stops a key at once.",
        ],
        links: [{ label: "API Keys", href: "/settings/api-keys" }],
      },
      {
        id: "endpoints",
        title: "What the API does",
        points: [
          "`GET /api/v1/workflows`: list your workflows.",
          "`POST /api/v1/workflows/:id/execute`: run a workflow from its Manual Trigger; the JSON body becomes the run's data.",
          "`GET /api/v1/executions/:id`: a run's status and, once finished, its output.",
          "`GET /api/v1/executions?workflowId=...`: recent runs.",
          "`POST /api/v1/executions/:id/retry`: run an execution again.",
        ],
        tip: "A key may make 120 requests a minute.",
      },
      {
        id: "mcp-server",
        title: "Your workflow as a tool for other AIs",
        body: [
          "Start a workflow with an **MCP Server Trigger**, give the tool a name, a description and its parameters, and set a bearer token of at least 16 characters. Claude, Cursor or another agent can then call it at the address the node shows. Treat the token like a password; change it to revoke access.",
        ],
      },
    ],
  },
  {
    id: "security",
    title: "Security and privacy",
    summary: "How your account and your customers' data are protected, and what you can do yourself.",
    topics: [
      {
        id: "protect-account",
        title: "Protect your account",
        steps: [
          "Turn on **two-factor authentication** under Settings → Security: scan the QR code with an authenticator app and keep the backup codes somewhere safe.",
          "Check **Active sessions** there now and then, and sign out devices you do not recognise.",
          "Look at the **Audit log** for sign-ins and changes you did not make.",
        ],
        tip: "Ten wrong passwords in 15 minutes lock password sign-in for that account for 15 minutes.",
        links: [{ label: "Security", href: "/settings/security" }],
      },
      {
        id: "data-protection",
        title: "How your data is protected",
        points: [
          "Credentials are encrypted (AES-256-GCM) and never sent to any browser, yours included.",
          "Secrets are replaced by `[REDACTED]` in execution logs.",
          "Webhooks check each service's signature or a secret, and every webhook is rate limited.",
          "Code and expressions run in a sandbox with no network or file access.",
          "Requests to private or local network addresses are blocked.",
          "File download links expire after 15 minutes.",
        ],
      },
      {
        id: "good-habits",
        title: "Good habits",
        points: [
          "Give an AI agent only the tools it needs, and require approval for anything that sends, pays or deletes.",
          "Use **Don't save node input/output** for workflows that handle sensitive personal data.",
          "Never paste API keys into ordinary fields such as an HTTP header: use a credential, so it is encrypted and redacted.",
          "Share a workflow's resume, approval or MCP links only with the people who should use them.",
        ],
      },
    ],
  },
  {
    id: "own-server",
    title: "Your own server",
    summary: "The managed private server: RXJ on a server of your own, with no limits.",
    hostedOnly: true,
    topics: [
      {
        id: "managed-server",
        title: "Setting up a managed private server",
        steps: [
          "Buy it on the Pricing page while signed in, with the email address of your RXJ account.",
          "Rent a Linux server (VPS) and point your domain's DNS at it.",
          "Open Settings → Private server, enter the domain and an admin email, and press **Make install command**.",
          "Paste the command on your server. It installs everything, makes a backup every night and updates itself every week.",
          "Settings → Private server then shows whether the server is online, its version and its last backup.",
        ],
        tip: "Paid with another email address? Contact support and we will link the server to your account.",
        links: [{ label: "Private server", href: "/settings/private-server" }],
      },
    ],
  },
  {
    id: "troubleshooting",
    title: "Troubleshooting and support",
    summary: "The problems people meet most often, and how to reach us.",
    topics: [
      {
        id: "common-problems",
        title: "Common problems",
        points: [
          "**The workflow does not run by itself:** is it **Active**, and was the latest change saved? Schedules use the workflow's time zone (UTC if none is set).",
          "**A webhook trigger never fires:** the service must have the address from the trigger's settings, and the workflow must be active. Messaging services also need a public https address.",
          "**WhatsApp messages are not delivered:** free text only reaches people who wrote to you in the last 24 hours. Use an approved template to start a conversation.",
          "**A Google node says `invalid_grant`:** the Google sign-in expired or was revoked. Open the credential and sign in again.",
          "**A node is Not Configured:** open it and choose a credential or fill in the required fields.",
          "**A field is empty in a later node:** open the earlier node after a test run and copy the exact path from its Output tab.",
          "**\"Monthly AI budget reached\":** raise or remove the budget under Settings → AI budgets, or wait for the 1st.",
          "**\"Daily ... limit reached\" or the run limit:** the count starts again at 00:00 UTC, or on the 1st for runs.",
          "**A run is stuck on Waiting:** it is at a Wait, Form or approval step. Answer it, or Cancel it on its page.",
        ],
      },
      {
        id: "support",
        title: "Getting help",
        body: [
          "Open **Support** in the sidebar to email us or send a message from the app. From the editor, the **Help** button sends your message together with the workflow and the selected node, so we can see the problem (credentials are never sent). Replies appear under Support → My messages.",
          "When you write, include the workflow, the node, what you entered and the exact error from the execution's page.",
        ],
        links: [
          { label: "Support", href: "/support" },
          { label: "Docs", href: "/docs" },
        ],
      },
    ],
  },
  {
    id: "admin",
    title: "For platform admins",
    summary: "The settings and pages only the platform's admins have.",
    adminOnly: true,
    topics: [
      {
        id: "admin-2fa",
        title: "Two-factor first",
        body: [
          "Publishing templates, setting model prices, setting up RXJ AI, answering support messages and assigning managed servers all need two-factor authentication on your account.",
        ],
      },
      {
        id: "admin-ai",
        title: "Model prices and RXJ AI (included)",
        points: [
          "**Settings → Model prices:** US dollars per million input, output and cached tokens for each provider and model. AI spend, budgets and credits use them; a model without a price shows as \"No price\". The card lists models that ran without one.",
          "**Settings → RXJ AI included:** add a provider, its API key and the model IDs customers may pick. Every included model needs a price, or it cannot be used.",
        ],
        links: [
          { label: "Model prices", href: "/settings/model-prices" },
          { label: "RXJ AI included", href: "/settings/rxj-ai" },
        ],
      },
      {
        id: "admin-templates",
        title: "Publishing templates",
        body: [
          "Build a workflow, then on the Templates page press **New template** and pick it, with a name, description and category. Write the description as a summary, then `Set up:` and the steps separated by semicolons. Every node is scanned for secrets before it is saved. Hidden templates are only visible to admins.",
        ],
      },
      {
        id: "admin-area",
        title: "The admin area",
        points: [
          "**Overview:** new support messages, accounts, sign-ups, active workflows, runs and failures.",
          "**Support:** customers' messages with a read-only view of the workflow; reply and mark as resolved.",
          "**Customers:** every account with its workflows, runs and latest failures.",
          "**Managed servers:** every customer's server, problems first; assign a purchase to the right account.",
          "**Errors:** failed runs of the last day, week or month, by customer and grouped by error.",
        ],
        links: [{ label: "Admin", href: "/admin" }],
      },
    ],
  },
];

/**
 * The guide as one server shows it: without the hosted app's chapters and
 * topics on a self-hosted server, and without the self-hosted ones on the
 * hosted app. Whether the admin chapter shows is decided per viewer.
 */
export const buildGuide = ({
  nodeCount,
  selfHosted,
}: {
  nodeCount: number;
  selfHosted: boolean;
}): GuideChapter[] =>
  CHAPTERS(nodeCount)
    .filter((chapter) => !(selfHosted && chapter.hostedOnly))
    .map((chapter) => ({
      ...chapter,
      topics: chapter.topics.filter((topic) =>
        selfHosted ? !topic.hostedOnly : !topic.selfHostedOnly
      ),
    }))
    .filter((chapter) => chapter.topics.length > 0);

/** All the words of a topic, for the search box. */
export const topicText = (topic: GuideTopic) =>
  [
    topic.title,
    ...(topic.body ?? []),
    ...(topic.steps ?? []),
    ...(topic.points ?? []),
    topic.tip ?? "",
    ...(topic.links ?? []).map((link) => link.label),
  ]
    .join(" ")
    .replace(/\*\*|`/g, "")
    .toLowerCase();

/** The chapters and topics that contain every word of a search. */
export const searchGuide = (chapters: GuideChapter[], query: string): GuideChapter[] => {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);

  if (words.length === 0) return chapters;

  return chapters
    .map((chapter) => {
      const chapterText = `${chapter.title} ${chapter.summary}`.toLowerCase();
      return {
        ...chapter,
        topics: chapter.topics.filter((topic) => {
          const text = `${chapterText} ${topicText(topic)}`;
          return words.every((word) => text.includes(word));
        }),
      };
    })
    .filter((chapter) => chapter.topics.length > 0);
};
