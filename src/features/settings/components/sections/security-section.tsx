"use client";

import { SessionsCard } from "../sessions-card";
import { TwoFactorCard } from "../two-factor-card";

/** Settings → Account → Security: two-factor authentication and sessions. */
export const SecuritySection = () => (
    <div className="space-y-6">
        <TwoFactorCard />
        <SessionsCard />
    </div>
);
