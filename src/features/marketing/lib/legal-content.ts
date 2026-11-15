// The facts and words of the Terms (/terms), Privacy (/privacy) and Contact
// (/contact) pages. Meta's app review and Google's OAuth verification both
// ask for the privacy policy's address; Meta also asks for data deletion
// instructions, which are the #data-deletion section of /privacy.
//
// Change the operator, address or date here only: every page reads them.

export const LEGAL = {
  operator: "RJ Umair",
  email: "umairajput711@gmail.com",
  country: "Pakistan",
  updated: "15 November 2026",
} as const;

export type LegalSection = {
  id: string;
  title: string;
  paragraphs: string[];
  list?: string[];
};

const { operator, email, country } = LEGAL;

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    id: "who",
    title: "Who we are",
    paragraphs: [
      `RXJ is a hosted platform for building workflows and AI agents. It is run by ${operator}, an individual based in ${country} ("we", "us"). For anything about your data, write to ${email}.`,
      "This policy covers the hosted RXJ service and this website. A server you run yourself from the self-hosted edition is under your control, and this policy does not apply to it.",
    ],
  },
  {
    id: "collect",
    title: "What we collect",
    paragraphs: ["We collect only what the service needs to work:"],
    list: [
      "Account details: your name, email address, a hashed password (if you sign up with one), and your profile picture if you sign in with Google or GitHub.",
      "Workflows you build: their nodes, settings and version history.",
      "Credentials you save (API keys, OAuth tokens, passwords for SMTP or databases). They are encrypted with AES-256-GCM and are never sent back to your browser.",
      "Execution data: the input and output of each node when a workflow runs, which may include messages, emails, spreadsheet rows or other data your workflows process. Known secret patterns are redacted from these logs.",
      "Files that workflows create or receive, such as voice notes and images sent to your bots.",
      "Chat widget conversations on websites where you install the RXJ chat widget.",
      "Billing records from our payment provider: your plan, orders and AI credit balance. We never see or store your card number.",
      "Technical data: IP address and browser details in server logs, used for security and rate limiting, and error reports when something breaks.",
    ],
  },
  {
    id: "use",
    title: "How we use it",
    paragraphs: [
      "We use your data to run the service: to sign you in, store and run your workflows, show you your executions, send you account emails (verification, password reset, and an email when a workflow fails, which you can turn off in Settings), bill your plan, prevent abuse and fix errors.",
      "We do not sell your data, we do not show you advertising, and we do not use your workflows, credentials or execution data to train AI models.",
    ],
  },
  {
    id: "google",
    title: "Google user data",
    paragraphs: [
      "When you connect a Google account (Gmail, Google Sheets, Google Calendar, Google Drive), RXJ asks only for the access the nodes you use need. Your workflows then read or write that data on your behalf: for example, reading new emails for a Gmail trigger, appending or updating rows in a sheet, or creating a calendar event.",
      "RXJ's use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements. We use Google user data only to provide the features you set up, we do not transfer it to others except as needed to run those features or as the law requires, we do not use it for advertising, and no person at RXJ reads it unless you ask us to for support, it is needed for security, or the law requires it.",
      "You can disconnect at any time by deleting the credential in RXJ or by removing RXJ's access at myaccount.google.com/permissions.",
    ],
  },
  {
    id: "meta",
    title: "WhatsApp, Messenger and Instagram data",
    paragraphs: [
      "When you connect a WhatsApp Business, Messenger or Instagram account, Meta sends the messages your customers write to your workflow, and your workflow can reply through Meta's APIs. We process these messages only to run the workflows you built. The messages and their replies are kept in your execution data for the retention period you choose.",
    ],
  },
  {
    id: "providers",
    title: "Services we use",
    paragraphs: [
      "These companies process data for us, each only for the part of the service it provides:",
    ],
    list: [
      "Vercel: hosting of the app and website.",
      "Neon: the database.",
      "Inngest: running workflows in the background.",
      "Sentry: error reports.",
      "Polar: payments and subscriptions.",
      "Resend: account emails.",
      "Google and GitHub: sign-in, if you choose them.",
      "AI model providers (such as OpenAI, Anthropic, Google, DeepSeek and others): when a workflow uses RXJ's built-in AI credits, the prompt is sent to the provider of the model it uses. With your own API key, your data goes to that provider under your own account.",
    ],
  },
  {
    id: "retention",
    title: "How long we keep it",
    paragraphs: [
      "Execution data is kept for 7, 30 or 90 days, as you set in each workflow (30 by default), and then deleted. Files made or received by workflows are kept for 7 days. Chat widget transcripts are kept for 30 days. Your account, workflows and credentials are kept until you delete them or ask us to delete your account. Billing records are kept as long as the law requires.",
    ],
  },
  {
    id: "data-deletion",
    title: "Deleting your data",
    paragraphs: [
      "You can delete any workflow, credential or execution yourself in the app at any time. Deleting a credential removes the stored tokens straight away.",
      `To delete your whole account and everything in it, email ${email} from the address you signed up with, with the subject "Delete my account". We delete the account, its workflows, credentials, executions and files within 30 days and confirm by email. This also covers data received through Facebook, WhatsApp, Instagram and Google.`,
    ],
  },
  {
    id: "rights",
    title: "Your rights",
    paragraphs: [
      `You can ask us for a copy of your data, ask us to correct it or delete it, or object to how we use it. Write to ${email} and we will answer within 30 days.`,
    ],
  },
  {
    id: "security",
    title: "Security",
    paragraphs: [
      "Connections are encrypted with HTTPS, credentials are encrypted at rest, code in workflows runs in a sandbox, and two-factor sign-in is available. No service is perfectly secure; if we learn of a breach that affects your data, we will tell you.",
    ],
  },
  {
    id: "children",
    title: "Children",
    paragraphs: [
      "RXJ is not meant for anyone under 18, and we do not knowingly collect their data.",
    ],
  },
  {
    id: "changes",
    title: "Changes",
    paragraphs: [
      "If we change this policy, we update the date at the top. For a significant change, we will tell you by email or in the app before it takes effect.",
    ],
  },
];

export const TERMS_SECTIONS: LegalSection[] = [
  {
    id: "agreement",
    title: "Agreement",
    paragraphs: [
      `These terms are an agreement between you and ${operator}, who runs RXJ ("we", "us"). By creating an account or using RXJ you agree to them and to the Privacy Policy. If you use RXJ for a business, you agree on its behalf.`,
    ],
  },
  {
    id: "account",
    title: "Your account",
    paragraphs: [
      "You must be at least 18 and give a real email address. Keep your password and API keys safe: you are responsible for what is done with your account. Tell us straight away if you think someone else has access to it.",
    ],
  },
  {
    id: "use",
    title: "Acceptable use",
    paragraphs: ["You may not use RXJ to:"],
    list: [
      "send spam or unsolicited bulk messages, or break the rules of WhatsApp, Meta, Google, Telegram or any other service you connect;",
      "break the law, including privacy and consumer protection laws;",
      "harass, defraud or harm anyone, or spread malware;",
      "get into systems or data you have no right to, or attack, overload or probe RXJ or other services;",
      "resell or share RXJ itself, or get around plan limits or usage caps.",
    ],
  },
  {
    id: "content",
    title: "Your content",
    paragraphs: [
      "Your workflows, credentials and the data they process are yours. You give us only the permission we need to store, run and display them for you. You are responsible for having the right to use the data and the accounts you connect, and for what your workflows and AI agents send.",
    ],
  },
  {
    id: "third-party",
    title: "Other services",
    paragraphs: [
      "Workflows connect to services we do not run, such as WhatsApp, Gmail or OpenAI. Their own terms apply to your use of them, and we are not responsible for their availability, prices or changes to their APIs.",
    ],
  },
  {
    id: "ai",
    title: "AI output",
    paragraphs: [
      "AI models can be wrong. Check what an agent says or does before you rely on it for anything important, and use approvals for actions that must not go wrong.",
    ],
  },
  {
    id: "billing",
    title: "Plans and payment",
    paragraphs: [
      "Paid plans are billed in advance through our payment provider, Polar, and renew until you cancel. You can cancel at any time; the plan stays active until the end of the period you paid for. AI credits that you buy do not expire, but they are not refundable once used. If a payment fails, we may move the account to the free plan.",
      "We may change prices or plan limits. We will tell you at least 14 days before a price change applies to you.",
    ],
  },
  {
    id: "termination",
    title: "Ending the agreement",
    paragraphs: [
      "You can stop using RXJ and ask us to delete your account at any time. We may suspend or close an account that breaks these terms or puts the service or other people at risk; where we can, we will warn you first and give you a chance to export your workflows.",
    ],
  },
  {
    id: "warranty",
    title: "No warranty",
    paragraphs: [
      'RXJ is provided "as is". We work to keep it running and your data safe, but we do not promise that it will be uninterrupted or free of errors, or that a workflow will always run on time.',
    ],
  },
  {
    id: "liability",
    title: "Limit of liability",
    paragraphs: [
      "As far as the law allows, we are not liable for indirect or consequential losses, such as lost profits or lost data, and our total liability for any claim is limited to what you paid us in the 12 months before it.",
    ],
  },
  {
    id: "law",
    title: "Governing law",
    paragraphs: [
      `These terms are governed by the laws of ${country}, and its courts have jurisdiction over any dispute about them.`,
    ],
  },
  {
    id: "changes",
    title: "Changes",
    paragraphs: [
      "We may update these terms. We update the date at the top, and for a significant change we tell you by email or in the app before it takes effect. If you keep using RXJ after that, you accept the new terms.",
    ],
  },
  {
    id: "contact",
    title: "Contact",
    paragraphs: [`Questions about these terms: ${email}.`],
  },
];
