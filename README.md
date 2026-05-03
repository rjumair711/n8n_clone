# RJBase – AI Workflow Automation Platform

RJBase is a low-cost AI workflow automation platform inspired by tools like n8n. It allows users to create, manage, and execute automated workflows using a visual drag-and-drop builder.

The platform supports trigger nodes, AI integrations, messaging nodes, HTTP requests, background job execution, authentication, subscriptions, and execution history.

---

## 🚀 Features

- Visual drag-and-drop workflow builder
- Manual trigger node
- Webhook trigger node
- Google Form trigger node
- Stripe trigger node
- HTTP request node
- AI integrations:
  - OpenAI
  - Claude / Anthropic
  - Gemini
- Messaging integrations:
  - Discord
  - Slack
- Background workflow execution
- Execution history and status tracking
- Secure credentials management
- User authentication
- Subscription-based access
- Error tracking and monitoring
- Type-safe API layer

---

## 🛠️ Technologies Used

### Frontend

- Next.js App Router
- React
- TypeScript
- React Flow
- Tailwind CSS
- Shadcn UI
- TanStack React Query
- Sonner Toasts

### Backend

- Next.js API Routes
- tRPC
- Prisma ORM
- Neon PostgreSQL
- Inngest for background jobs
- Better Auth for authentication
- Polar for payments and subscriptions

### AI Integrations

- OpenAI API
- Google Gemini API
- Anthropic Claude API

### Monitoring and Developer Tools

- Sentry for error tracking
- CodeRabbit for AI-powered code reviews
- GitHub for version control
- Vercel for deployment

---

## 🧠 Project Architecture

```text
Frontend UI
   ↓
Next.js App Router
   ↓
tRPC API Layer
   ↓
Prisma ORM
   ↓
Neon PostgreSQL

Workflow Execution
   ↓
Inngest Background Jobs
   ↓
Node Executors
   ↓
External APIs / AI Providers / Messaging Services