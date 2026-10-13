"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { authClient } from "@/lib/auth-client";

type AuthLinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  // Where a visitor goes, and where someone who is signed in goes
  signedOutHref?: string;
  signedInHref?: string;
  // Shown instead of the children to someone who is signed in
  signedInLabel?: ReactNode;
};

/**
 * A link of the public pages that depends on the session: "Start free
 * trial" for a visitor, the app for someone who is signed in. The page
 * itself is static; only this asks who is looking.
 */
export const AuthLink = ({
  signedOutHref = "/signup",
  signedInHref = "/workflows",
  signedInLabel,
  children,
  ...props
}: AuthLinkProps) => {
  const { data: session } = authClient.useSession();
  const signedIn = !!session?.user;

  return (
    <Link href={signedIn ? signedInHref : signedOutHref} {...props}>
      {signedIn && signedInLabel ? signedInLabel : children}
    </Link>
  );
};
