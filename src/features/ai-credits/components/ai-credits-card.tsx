"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { INCLUDED_CREDENTIAL_NAME, formatCredits } from "@/config/ai-credits";
import { useTRPC } from "@/trpc/client";

/**
 * Billing: the credits of "RXJ AI (included)". What is left of the month's
 * allowance, what was bought, and the packs on sale.
 */
export const AiCreditsCard = () => {
    const trpc = useTRPC();
    const { data, isLoading, isError } = useQuery(trpc.aiCredits.getStatus.queryOptions());
    const [buying, setBuying] = useState<string | null>(null);

    const buyPack = async (productId: string) => {
        setBuying(productId);

        try {
            const response = await fetch("/api/subscription/checkout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ creditPack: productId }),
            });
            const body = await response.json();

            if (body?.url) {
                window.location.href = body.url;
            } else {
                toast.error("Could not start the checkout.");
            }
        } catch {
            toast.error("Could not start the checkout.");
        } finally {
            setBuying(null);
        }
    };

    // Until an admin has set a provider up there is nothing to spend credits on
    if (!isLoading && !isError && data && !data.available && data.purchasedUsd <= 0) {
        return null;
    }

    const usedShare =
        data && data.allowanceUsd > 0
            ? Math.min((data.usedUsd / data.allowanceUsd) * 100, 100)
            : 100;
    const isEmpty = !!data && data.availableUsd <= 0;

    return (
        <div className="rounded-2xl border p-6">
            <h3 className="text-lg font-semibold">AI credits</h3>
            <p className="mt-2 text-sm text-muted-foreground">
                {INCLUDED_CREDENTIAL_NAME} runs models without an API key of your own. Pick
                it as the credential of a Chat Model node, or in Build with AI. Every call
                costs credits: {data ? data.creditsPerUsd.toLocaleString("en-US") : "1,000"}{" "}
                credits are one US dollar of model cost.
            </p>

            {isLoading ? (
                <p className="mt-6 text-sm text-muted-foreground">Loading AI credits...</p>
            ) : isError || !data ? (
                <p className="mt-6 text-sm text-destructive">AI credits could not be loaded.</p>
            ) : (
                <div className="mt-6 space-y-6">
                    <div>
                        <p className="text-3xl font-semibold tabular-nums">
                            {formatCredits(data.availableUsd)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            {data.allowanceUsd > 0
                                ? `credits left: ${formatCredits(data.allowanceLeftUsd)} of this month's ${formatCredits(data.allowanceUsd)} free${
                                    data.purchasedUsd > 0 ? `, and ${formatCredits(data.purchasedUsd)} bought` : ""
                                }`
                                : "bought credits left. Bought credits do not expire."}
                        </p>
                    </div>

                    {/* Only when accounts get free monthly credits (MONTHLY_AI_CREDITS) */}
                    {data.allowanceUsd > 0 && (
                    <div>
                        <div className="mb-1 flex items-center justify-between text-xs">
                            <span>This month&apos;s free credits</span>
                            <span className="tabular-nums">
                                {formatCredits(Math.min(data.usedUsd, data.allowanceUsd))} /{" "}
                                {formatCredits(data.allowanceUsd)} used
                            </span>
                        </div>
                        <div className="h-2 rounded-full bg-muted">
                            <div
                                className={`h-2 rounded-full ${usedShare >= 100 ? "bg-destructive" : "bg-primary"}`}
                                style={{ width: `${usedShare}%` }}
                            />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Monthly credits start again on the 1st of each month (UTC) and do not
                            carry over. Bought credits are used after them and do not expire.
                        </p>
                    </div>
                    )}

                    {isEmpty && (
                        <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                            You have no AI credits left, so nodes that use{" "}
                            {INCLUDED_CREDENTIAL_NAME} stop with an error.{" "}
                            {data.packs.length > 0 ? "Buy credits below, or pick" : "Pick"} your own
                            API key credential on the node.
                        </p>
                    )}

                    <div className="space-y-2">
                        <p className="text-sm font-medium">More credits</p>
                        {data.packs.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                                No credit packs are on sale. Your own API key credential on a
                                node has no credit limit.
                            </p>
                        ) : (
                            <>
                                <div className="flex flex-wrap gap-2">
                                    {data.packs.map((pack) => (
                                        <Button
                                            key={pack.productId}
                                            variant="outline"
                                            size="sm"
                                            disabled={buying !== null}
                                            onClick={() => buyPack(pack.productId)}
                                        >
                                            {buying === pack.productId
                                                ? "Opening checkout..."
                                                : `Buy ${pack.credits.toLocaleString("en-US")} credits`}
                                        </Button>
                                    ))}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    The price is shown at the checkout. The credits are added
                                    when the payment is confirmed, usually within a minute.
                                </p>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
