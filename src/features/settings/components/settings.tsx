"use client";

import { AuditLogCard } from "./audit-log-card";
import { SessionsCard } from "./sessions-card";
import { TwoFactorCard } from "./two-factor-card";

export const Settings = () => (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 md:p-8">
        <div>
            <h1 className="text-lg font-semibold md:text-xl">Settings</h1>
            <p className="text-sm text-muted-foreground">
                Two-factor authentication, the devices signed in to your account, and
                what happened on it.
            </p>
        </div>

        <TwoFactorCard />
        <SessionsCard />
        <AuditLogCard />
    </div>
);
