import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Thank you",
  robots: { index: false },
};

// Where Polar sends a buyer of the managed private server after paying
// (the success URL of its checkout link)
export default function ManagedServerThanksPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-xl px-4 py-16">
        <h1 className="text-3xl font-bold tracking-tight">Thank you!</h1>
        <p className="mt-4 text-muted-foreground">
          Your managed private server is ordered. You install it yourself
          with one command, in about five minutes, and we look after it from
          then on.
        </p>

        <h2 className="mt-10 text-lg font-semibold">Set it up</h2>
        <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm text-muted-foreground">
          <li>
            Rent one Ubuntu 24.04 server with at least 4 GB of memory from a
            company such as Hetzner (about $5–7 a month, paid to them).
          </li>
          <li>
            Pick a domain or subdomain for RXJ, for example{" "}
            <span className="font-mono">automate.yourbusiness.com</span>, and
            add a DNS <span className="font-mono">A</span> record for it with
            the server&apos;s IP address.
          </li>
          <li>
            Sign in to RXJ with the email address you paid with and open{" "}
            <Link href="/settings/private-server" className="underline underline-offset-4">
              Settings → Private server
            </Link>
            . Make the install command there and paste it on your server.
          </li>
        </ol>

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

        <Link
          href="/"
          className="mt-8 inline-block rounded-xl border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Back to RXJ
        </Link>
      </div>
    </div>
  );
}
