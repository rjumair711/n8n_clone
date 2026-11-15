// The onboarding checklist on the Workflows page: four steps from a new
// account to a workflow that runs by itself. Pure, so the rules can be
// tested; the counts come from the account's own data.

export type OnboardingState = { usedTemplate?: boolean; dismissed?: boolean };

export const readOnboardingState = (value: unknown): OnboardingState => {
  const record = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return {
    ...(record.usedTemplate === true ? { usedTemplate: true } : {}),
    ...(record.dismissed === true ? { dismissed: true } : {}),
  };
};

export type ChecklistStep = {
  id: "credential" | "template" | "run" | "activate";
  title: string;
  description: string;
  href: string;
  action: string;
  done: boolean;
};

export const buildChecklist = (
  counts: { credentials: number; executions: number; activeWorkflows: number },
  state: OnboardingState,
) => {
  const steps: ChecklistStep[] = [
    {
      id: "credential",
      title: "Connect an account",
      description: "Add a credential, such as Sign in with Google, WhatsApp or an AI model key.",
      href: "/credentials",
      action: "Add credential",
      done: counts.credentials > 0,
    },
    {
      id: "template",
      title: "Start from a template",
      description: "Pick a ready-made workflow from the gallery and make it yours.",
      href: "/templates",
      action: "Browse templates",
      done: !!state.usedTemplate,
    },
    {
      id: "run",
      title: "Run a workflow",
      description: "Open a workflow and press Execute workflow to see each node work.",
      href: "/workflows",
      action: "Open workflows",
      done: counts.executions > 0,
    },
    {
      id: "activate",
      title: "Turn it on",
      description: "Switch a workflow to Active so its trigger runs it by itself.",
      href: "/workflows",
      action: "Open workflows",
      done: counts.activeWorkflows > 0,
    },
  ];

  const completed = steps.filter((step) => step.done).length;
  return {
    steps,
    completed,
    total: steps.length,
    // Gone once everything is done or the person closed it
    visible: !state.dismissed && completed < steps.length,
  };
};
