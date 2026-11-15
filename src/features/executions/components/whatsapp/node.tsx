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
    { value: "send_buttons", label: "Send Reply Buttons" },
    { value: "send_list", label: "Send List Menu" },
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
      operations: ["send_text", "send_buttons", "send_list"],
    },
    {
      name: "header",
      label: "Header (Optional)",
      placeholder: "Book an appointment",
      description: "Bold text above the message, 60 characters at most.",
      operations: ["send_buttons", "send_list"],
    },
    {
      name: "buttons",
      label: "Buttons",
      type: "textarea",
      placeholder: "yes | Yes, book it\nno | No thanks\nhuman | Talk to a person",
      description:
        "Up to 3, one per line: id | title (20 characters). The tapped button arrives at the WhatsApp Trigger as {{whatsapp.text}} (title) and {{whatsapp.replyId}} (id). A line with only a title gets an id made from it.",
      required: true,
      operations: ["send_buttons"],
    },
    {
      name: "listButton",
      label: "Menu Button",
      placeholder: "See menu",
      defaultValue: "Choose",
      description: "The button that opens the list, 20 characters at most.",
      required: true,
      operations: ["send_list"],
    },
    {
      name: "sections",
      label: "Rows",
      type: "textarea",
      placeholder: "# Pizzas\nmargherita | Margherita | Rs 1,200\npepperoni | Pepperoni | Rs 1,500\n# Drinks\ncola | Cola",
      description:
        "Up to 10 rows, one per line: id | title (24 characters) | description (72, optional). A line starting with # opens a section with that title; with several sections each needs one. The choice arrives as {{whatsapp.text}} and {{whatsapp.replyId}}.",
      required: true,
      operations: ["send_list"],
    },
    {
      name: "footer",
      label: "Footer (Optional)",
      placeholder: "Reply within 24 hours",
      description: "Small grey text under the message, 60 characters at most.",
      operations: ["send_buttons", "send_list"],
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
