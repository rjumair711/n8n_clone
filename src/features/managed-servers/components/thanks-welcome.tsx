"use client";

import { useEffect, useState } from "react";
import { ManagedServerWelcomeDialog } from "./managed-server-welcome-dialog";

/** On the thanks page Polar opens after paying: the popup opens at once. */
export const ThanksWelcome = () => {
    const [open, setOpen] = useState(false);

    // After the first render, so the page itself is there behind it
    useEffect(() => setOpen(true), []);

    return <ManagedServerWelcomeDialog open={open} onOpenChange={setOpen} />;
};
