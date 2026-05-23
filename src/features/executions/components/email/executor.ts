// email/executor.ts

import { EMAIL_CHANNEL_NAME, emailChannel } from "@/inngest/channels/email";
import { NodeExecutor } from "../../types";
import { NonRetriableError } from "inngest";
import nodemailer from "nodemailer";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import Handlebars from "handlebars";

type EmailData = {
  recipient?: string;
  subject?: string;
  body?: string;
  credentialId?: string;
};

export const emailExecutor: NodeExecutor<EmailData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
}) => {

  // Loading state
  await step.sendEvent("email-loading", {
    name: "email/status",
    data: {
      channel: EMAIL_CHANNEL_NAME,
      topic: "status",
      nodeId,
      status: "loading",
      message: "Sending email...",
    },
  });

  // Validation
  if (!data.credentialId) {
    throw new NonRetriableError("Email node: Credential ID is required");
  }

  if (!data.recipient) {
    throw new NonRetriableError("Email node: Recipient is required");
  }

  if (!data.subject) {
    throw new NonRetriableError("Email node: Subject is required");
  }

  if (!data.body) {
    throw new NonRetriableError("Email node: Body is required");
  }

  // Get credential
  const credential = await step.run("get-email-credential", () =>
    prisma.credential.findUnique({
      where: {
        id: data.credentialId,
        userId,
      },
    })
  );

  if (!credential) {
    throw new NonRetriableError("Email node: Credential not found");
  }

  // Parse SMTP config
  let smtpConfig: {
    host: string;
    port: string;
    user: string;
    pass: string;
    fromName?: string;
  };

  try {
    smtpConfig = JSON.parse(decrypt(credential.value));
  } catch {
    throw new NonRetriableError(
      "Email node: Invalid SMTP credential format"
    );
  }

  const { host, port, user, pass, fromName } = smtpConfig;

  // Parse variables
  const recipient = Handlebars.compile(data.recipient)(context);
  const subject = Handlebars.compile(data.subject)(context);
  const body = Handlebars.compile(data.body)(context);

  // Create transporter
  const transporter = nodemailer.createTransport({
    host,
    port: parseInt(port),
    secure: parseInt(port) === 465,
    auth: {
      user,
      pass,
    },
  });

  try {

    // Send email
    const info = await transporter.sendMail({
      from: `"${fromName || "RJBase"}" <${user}>`,
      to: recipient,
      subject,
      html: body,
    });

    // Success event
    await step.sendEvent("email-success", {
      name: "email/status",
      data: {
        channel: EMAIL_CHANNEL_NAME,
        topic: "status",
        nodeId,
        status: "success",
        message: "Email sent successfully",
      },
    });

    return {
      ...context,
      emailSend: {
        success: true,
        messageId: info.messageId,
      },
    };

  } catch (error: any) {

    // Error event
    await step.sendEvent("email-error", {
      name: "email/status",
      data: {
        channel: EMAIL_CHANNEL_NAME,
        topic: "status",
        nodeId,
        status: "error",
        message: error.message,
      },
    });

    throw new NonRetriableError(
      `Email node failed: ${error.message}`
    );
  }
};