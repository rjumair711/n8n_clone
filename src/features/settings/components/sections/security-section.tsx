"use client";

import { PasswordCard } from "../password-card";
import { SessionsCard } from "../sessions-card";
import { TwoFactorCard } from "../two-factor-card";

/** Settings → Account → Security: password, two-factor authentication and sessions. */
export const SecuritySection = () => (
    <div className="space-y-6">
        <PasswordCard />
        <TwoFactorCard />
        <SessionsCard />
    </div>
);
