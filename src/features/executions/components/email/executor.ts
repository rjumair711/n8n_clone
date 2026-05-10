// email/executor.ts
import { emailChannel } from "@/inngest/channels/email";
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
  publish,
}) => {
  await publish(
    emailChannel().status({ nodeId, status: "loading", message: "Sending email..." })
  );

  if (!data.credentialId) {
    await publish(emailChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("Email node: Credential ID is required");
  }
  if (!data.recipient) {
    await publish(emailChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("Email node: Recipient is required");
  }
  if (!data.subject) {
    await publish(emailChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("Email node: Subject is required");
  }
  if (!data.body) {
    await publish(emailChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("Email node: Body is required");
  }

  const credential = await step.run("get-email-credential", () =>
    prisma.credential.findUnique({
      where: { id: data.credentialId, userId },
    })
  );

  if (!credential) {
    await publish(emailChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("Email node: Credential not found");
  }

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
    await publish(emailChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("Email node: Invalid SMTP credential format");
  }

  const { host, port, user, pass, fromName } = smtpConfig;

  // Support {{variable}} interpolation like other nodes
  const recipient = Handlebars.compile(data.recipient)(context);
  const subject = Handlebars.compile(data.subject)(context);
  const body = Handlebars.compile(data.body)(context);

  const transporter = nodemailer.createTransport({
    host,
    port: parseInt(port),
    secure: parseInt(port) === 465,
    auth: { user, pass },
  });

  try {
    const info = await transporter.sendMail({
      from: `"${fromName || "RJBase"}" <${user}>`,
      to: recipient,
      subject,
      html: body,
    });

    await publish(emailChannel().status({ nodeId, status: "success" }));

    return {
      ...context,
      emailSend: { success: true, messageId: info.messageId },
    };
  } catch (error: any) {
    await publish(
      emailChannel().status({ nodeId, status: "error", message: error.message })
    );
    throw error;
  }
};