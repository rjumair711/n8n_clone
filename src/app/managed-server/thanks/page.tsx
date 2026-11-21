import type { Metadata } from "next";
import Link from "next/link";
import { InstallStepsList } from "@/features/managed-servers/components/managed-server-welcome-dialog";
import { ThanksWelcome } from "@/features/managed-servers/components/thanks-welcome";
import {
  INSTALL_STEPS_FOOTER,
  PRIVATE_SERVER_SETTINGS_HREF,
} from "@/features/managed-servers/lib/install-steps";

export const metadata: Metadata = {
  title: "Thank you",
  robots: { index: false },
};

// Where Polar sends a buyer of the managed private server after paying
// (the success URL of its checkout link). The popup with the steps opens at
// once; the page shows the same steps behind it.
export default function ManagedServerThanksPage() {
  return (
    <div className="min-h-screen bg-background">
      <ThanksWelcome />
      <div className="container mx-auto max-w-xl px-4 py-16">
        <h1 className="text-3xl font-bold tracking-tight">Thank you!</h1>
        <p className="mt-4 text-muted-foreground">
          Your managed private server is ordered. You connect your own server
          to RXJ with one command, in about five minutes, and we look after it
          from then on.
        </p>

        <h2 className="mt-10 text-lg font-semibold">Connect your server</h2>
        <div className="mt-4">
          <InstallStepsList />
        </div>

        <p className="mt-6 text-sm text-muted-foreground">{INSTALL_STEPS_FOOTER}</p>

        <p className="mt-6 text-sm text-muted-foreground">
          Stuck at any step?{" "}
          <Link href="/contact" className="underline underline-offset-4">
            Contact us
          </Link>{" "}
          and we will set it up with you.
        </p>

        <p className="mt-10 text-sm text-muted-foreground">
          Your receipt from Polar has a link to manage or cancel the
          subscription.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href={PRIVATE_SERVER_SETTINGS_HREF}
            className="inline-block rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Open Private server settings
          </Link>
          <Link
            href="/"
            className="inline-block rounded-xl border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Back to RXJ
          </Link>
        </div>
      </div>
    </div>
  );
}
