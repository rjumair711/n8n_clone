import "server-only";
import prisma from "@/lib/db";

export type LandingTemplate = {
  id: string;
  name: string;
  description: string;
  category: string;
  language: string;
  nodeTypes: string[];
};

// How many published templates are read to pick from. The page shows six
// and looks for one per use case.
const MAX_READ = 60;

/**
 * The published templates of the gallery, most used first. Hidden ones
 * (published = false) are never read. Read-only; when the database cannot
 * be reached the page is built without templates instead of failing.
 */
export const getPublishedTemplates = async (): Promise<LandingTemplate[]> => {
  try {
    return await prisma.workflowTemplate.findMany({
      where: { published: true },
      orderBy: [{ useCount: "desc" }, { createdAt: "desc" }],
      take: MAX_READ,
      // The workflow itself (nodes, connections) stays in the database
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        language: true,
        nodeTypes: true,
      },
    });
  } catch (error) {
    console.error(
      "Landing page: the templates could not be read",
      error instanceof Error ? error.message : error,
    );

    return [];
  }
};

/**
 * The six templates of the landing page: English ones first, because the
 * page is in English, then the others in the same order.
 */
export const pickFeaturedTemplates = (
  templates: LandingTemplate[],
  count = 6,
) =>
  [
    ...templates.filter((template) => template.language === "en"),
    ...templates.filter((template) => template.language !== "en"),
  ].slice(0, count);

/** The template a use case links to: the first English one whose name matches. */
export const findTemplateFor = (
  templates: LandingTemplate[],
  pattern: RegExp,
) =>
  templates.find(
    (template) => template.language === "en" && pattern.test(template.name),
  ) ?? null;
