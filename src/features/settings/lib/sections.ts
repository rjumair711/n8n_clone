// The sections of Settings, in menu order. Each one is its own route,
// /settings/<slug>, so only the open section loads its code and data.
// No React: the menu, the mobile tabs and each page's title read it.

export type SettingsSection = {
  slug: string;
  title: string;
  description: string;
};

export type SettingsGroup = {
  title: string;
  sections: SettingsSection[];
};

export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    title: "Account",
    sections: [
      {
        slug: "profile",
        title: "Profile",
        description: "Who you are signed in as.",
      },
      {
        slug: "security",
        title: "Security",
        description: "Two-factor authentication and the devices signed in to your account.",
      },
      {
        slug: "api-keys",
        title: "API Keys",
        description: "Run your workflows and read their results from your own code.",
      },
    ],
  },
  {
    title: "Workspace",
    sections: [
      {
        slug: "workspace",
        title: "General",
        description: "The workspace you are working in, and invitations to other workspaces.",
      },
      {
        slug: "members",
        title: "Members & roles",
        description: "Who works in this workspace, and what each role may do.",
      },
      {
        slug: "usage",
        title: "Usage & plan",
        description: "This workspace's plan, what it has used this month, and its limits.",
      },
      {
        slug: "audit-log",
        title: "Audit log",
        description: "Sign-ins and changes made with your account, in every workspace.",
      },
    ],
  },
  {
    title: "AI",
    sections: [
      {
        slug: "model-prices",
        title: "Model prices",
        description: "What each model costs per million tokens, for AI spend and budgets.",
      },
      {
        slug: "rxj-ai",
        title: "RXJ AI included",
        description: "The platform's own model provider and the credits each plan includes.",
      },
      {
        slug: "ai-budgets",
        title: "AI budgets",
        description: "This month's AI spend and the workspace's monthly AI budget.",
      },
    ],
  },
  {
    title: "Enterprise",
    sections: [
      {
        slug: "git-sync",
        title: "Git sync",
        description: "Environments, and the workflows kept in a GitHub repository.",
      },
      {
        slug: "secrets",
        title: "External secrets",
        description: "Secret stores that credentials can read their values from.",
      },
      {
        slug: "sso",
        title: "SSO",
        description: "Sign-in through your company's identity provider.",
      },
    ],
  },
];

export const SETTINGS_SECTIONS = SETTINGS_GROUPS.flatMap((group) => group.sections);

// What /settings opens
export const FIRST_SETTINGS_SECTION = SETTINGS_SECTIONS[0];

export const settingsHref = (slug: string) => `/settings/${slug}`;

export const getSettingsSection = (slug: string): SettingsSection => {
  const section = SETTINGS_SECTIONS.find((item) => item.slug === slug);

  if (!section) throw new Error(`Unknown settings section: ${slug}`);

  return section;
};
