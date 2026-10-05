"use client";

import { CredentialType } from "@prisma/client";
import { createIntegrationNode } from "../integration-node";
import type { IntegrationConfig } from "../integration-dialog";

export const whatsappConfig: IntegrationConfig = {
  label: "WhatsApp",
  description:
    "Send WhatsApp messages through the WhatsApp Business Cloud API.",
  logo: "/logos/whatsapp.svg",
  credentialType: CredentialType.WHATSAPP,
  credentialLabel: "WhatsApp Credential",
  defaultVariableName: "whatsapp",
  operations: [
    { value: "send_text", label: "Send Text Message" },
    { value: "send_template", label: "Send Template Message" },
    { value: "send_document", label: "Send File (Document, Image, Video, Audio)" },
  ],
  fields: [
    {
      name: "phoneNumberId",
      label: "Phone Number ID",
      placeholder: "123456789012345",
      description:
        "The sender's Phone Number ID from Meta's WhatsApp API Setup page (not the phone number itself).",
      required: true,
    },
    {
      name: "to",
      label: "Recipient",
      placeholder: "923001234567",
      description: "Phone number with country code, digits only.",
      required: true,
    },
    {
      name: "message",
      label: "Message",
      type: "textarea",
      placeholder: "Hi {{webhook.body.name}}, your order is confirmed.",
      description:
        "Free text only reaches users who messaged you in the last 24 hours; otherwise send a template.",
      required: true,
      operations: ["send_text"],
    },
    {
      name: "file",
      label: "File",
      placeholder: "pdf.file",
      description:
        "A file variable: a file made by PDF Generator, Convert to File, Google Drive or an HTTP Request download. Like text, it only reaches users who messaged you in the last 24 hours.",
      required: true,
      operations: ["send_document"],
    },
    {
      name: "caption",
      label: "Caption",
      placeholder: "Your invoice for order {{webhook.body.orderId}}",
      operations: ["send_document"],
    },
    {
      name: "templateName",
      label: "Template Name",
      placeholder: "hello_world",
      description: "An approved message template from WhatsApp Manager.",
      required: true,
      operations: ["send_template"],
    },
    {
      name: "languageCode",
      label: "Template Language",
      placeholder: "en_US",
      defaultValue: "en_US",
      required: true,
      operations: ["send_template"],
    },
    {
      name: "templateParamsJson",
      label: "Template Variables",
      type: "textarea",
      placeholder: '["{{webhook.body.name}}", "12345"]',
      description:
        "A JSON array filling the template body's {{1}}, {{2}}... in order.",
      operations: ["send_template"],
    },
  ],
};

export const WhatsappNode = createIntegrationNode(whatsappConfig, (data) =>
  data.to ? `To: ${data.to}` : undefined
);
