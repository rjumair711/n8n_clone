import type { NodeExecutor } from "@/features/executions/types";
import { NonRetriableError } from "inngest";
import ky from "ky";
import { renderTemplate } from "../../lib/templates";
import { loadCredentialSecret, toIntegrationError } from "../../lib/integration";

type GithubData = {
  variableName?: string;
  credentialId?: string;
  operation?: string;
  repository?: string;
  title?: string;
  body?: string;
  labels?: string;
  issueNumber?: string;
  comment?: string;
  state?: string;
  limit?: string;
};

const summarizeIssue = (issue: any) => ({
  number: issue.number,
  title: issue.title,
  state: issue.state,
  url: issue.html_url,
  author: issue.user?.login,
  labels: (issue.labels || []).map((label: any) => label.name ?? label),
  body: issue.body,
  createdAt: issue.created_at,
});

export const githubExecutor: NodeExecutor<GithubData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
}) => {
  if (!data.variableName) {
    throw new NonRetriableError("GitHub node: Variable name is missing");
  }
  if (!data.operation) {
    throw new NonRetriableError("GitHub node: Operation is required");
  }

  const repository = renderTemplate(data.repository, context).trim();
  if (!/^[^/\s]+\/[^/\s]+$/.test(repository)) {
    throw new NonRetriableError(
      "GitHub node: Repository must look like owner/repo"
    );
  }

  const token = await loadCredentialSecret({
    step,
    stepId: `github-${nodeId}-get-credential`,
    credentialId: data.credentialId,
    userId,
    label: "GitHub",
  });

  const baseUrl = `https://api.github.com/repos/${repository}`;

  const api = ky.create({
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "rxj-workflows",
    },
  });

  try {
    const result = await step.run(
      `github-${nodeId}-${data.operation}`,
      async () => {
        switch (data.operation) {
          case "create_issue": {
            const title = renderTemplate(data.title, context).trim();
            if (!title) {
              throw new NonRetriableError("GitHub node: Title is required");
            }

            const labels = renderTemplate(data.labels, context)
              .split(",")
              .map((label) => label.trim())
              .filter(Boolean);

            const issue: any = await api
              .post(`${baseUrl}/issues`, {
                json: {
                  title,
                  body: renderTemplate(data.body, context),
                  ...(labels.length > 0 ? { labels } : {}),
                },
              })
              .json();

            return summarizeIssue(issue);
          }

          case "list_issues": {
            const limit = Math.min(
              Number(renderTemplate(data.limit, context)) || 20,
              100
            );

            const issues: any[] = await api
              .get(`${baseUrl}/issues`, {
                searchParams: {
                  state: data.state || "open",
                  per_page: limit,
                },
              })
              .json();

            // The issues endpoint also returns pull requests
            const onlyIssues = issues.filter((issue) => !issue.pull_request);

            return {
              issues: onlyIssues.map(summarizeIssue),
              count: onlyIssues.length,
            };
          }

          case "create_comment": {
            const issueNumber = Number(
              renderTemplate(data.issueNumber, context)
            );
            if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
              throw new NonRetriableError(
                "GitHub node: Issue Number must be a positive number"
              );
            }

            const body = renderTemplate(data.comment, context).trim();
            if (!body) {
              throw new NonRetriableError("GitHub node: Comment is required");
            }

            const comment: any = await api
              .post(`${baseUrl}/issues/${issueNumber}/comments`, {
                json: { body },
              })
              .json();

            return {
              id: comment.id,
              url: comment.html_url,
              body: comment.body,
            };
          }

          case "get_repository": {
            const repo: any = await api.get(baseUrl).json();

            return {
              name: repo.full_name,
              description: repo.description,
              url: repo.html_url,
              stars: repo.stargazers_count,
              forks: repo.forks_count,
              openIssues: repo.open_issues_count,
              defaultBranch: repo.default_branch,
              language: repo.language,
              private: repo.private,
            };
          }

          default:
            throw new NonRetriableError(
              `GitHub node: Unsupported operation "${data.operation}"`
            );
        }
      }
    );

    return {
      ...context,
      [data.variableName]: result,
    };
  } catch (error: any) {
    throw await toIntegrationError("GitHub", error);
  }
};
