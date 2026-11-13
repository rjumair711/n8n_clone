// The sections of Settings, in menu order. Each one is its own route,
// /settings/<slug>, so only the open section loads its code and data.
// No React: the menu, the mobile tabs and each page's title read it.

export type SettingsSection = {
  slug: string;
  title: string;
  description: string;
  // Set up by the platform's admins: left out of the menu for everyone else
  adminOnly?: boolean;
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
        description: "Your name, and who you are signed in as.",
      },
      {
        slug: "security",
        title: "Security",
        description: "Your password, two-factor authentication and the devices signed in to your account.",
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
        title: "Usage",
        description: "What this workspace has used this month, and its limits.",
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
        adminOnly: true,
      },
      {
        slug: "rxj-ai",
        title: "RXJ AI included",
        description: "The platform's own model provider, paid for with bought AI credits.",
        adminOnly: true,
      },
      {
        slug: "ai-budgets",
        title: "AI budgets",
        description: "This month's AI spend and the workspace's monthly AI budget.",
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
