"use client";

import { CredentialType } from "@prisma/client";
import { createIntegrationNode } from "../integration-node";
import type { IntegrationConfig } from "../integration-dialog";

export const githubConfig: IntegrationConfig = {
  label: "GitHub",
  description: "Work with issues and repositories on GitHub.",
  logo: "/logos/github.svg",
  credentialType: CredentialType.GITHUB,
  credentialLabel: "GitHub Credential",
  defaultVariableName: "github",
  operations: [
    { value: "create_issue", label: "Create Issue" },
    { value: "list_issues", label: "List Issues" },
    { value: "create_comment", label: "Comment on Issue" },
    { value: "get_repository", label: "Get Repository" },
  ],
  fields: [
    {
      name: "repository",
      label: "Repository",
      placeholder: "owner/repo",
      description: "The repository as owner/name, for example vercel/next.js.",
      required: true,
    },
    {
      name: "title",
      label: "Title",
      placeholder: "Bug: checkout fails",
      required: true,
      operations: ["create_issue"],
    },
    {
      name: "body",
      label: "Body",
      type: "textarea",
      placeholder: "Describe the issue. Markdown is supported.",
      operations: ["create_issue"],
    },
    {
      name: "labels",
      label: "Labels",
      placeholder: "bug, urgent",
      description: "Comma-separated label names.",
      operations: ["create_issue"],
    },
    {
      name: "issueNumber",
      label: "Issue Number",
      placeholder: "42",
      required: true,
      operations: ["create_comment"],
    },
    {
      name: "comment",
      label: "Comment",
      type: "textarea",
      placeholder: "Thanks for the report!",
      required: true,
      operations: ["create_comment"],
    },
    {
      name: "state",
      label: "State",
      type: "select",
      defaultValue: "open",
      options: [
        { value: "open", label: "Open" },
        { value: "closed", label: "Closed" },
        { value: "all", label: "All" },
      ],
      operations: ["list_issues"],
    },
    {
      name: "limit",
      label: "Limit",
      placeholder: "20",
      description: "How many issues to return (up to 100).",
      operations: ["list_issues"],
    },
  ],
};

export const GithubNode = createIntegrationNode(githubConfig, (data) =>
  data.repository ? `${data.repository}` : undefined
);
