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
          Your managed private server is ordered. We will email you at the
          address you paid with, within one working day, to set it up.
        </p>

        <h2 className="mt-10 text-lg font-semibold">What to have ready</h2>
        <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm text-muted-foreground">
          <li>
            An account with a server company such as Hetzner, with one Ubuntu
            server of at least 4 GB of memory (about $5–7 a month, paid to
            them). We can help you choose one.
          </li>
          <li>
            A domain or subdomain for RXJ, for example{" "}
            <span className="font-mono">automate.yourbusiness.com</span>, and
            access to its DNS settings.
          </li>
          <li>
            The email addresses of the people who will use it.
          </li>
        </ol>

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
