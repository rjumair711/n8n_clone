"use client";

import { useEffect, useState } from "react";
import { centsToUsd, parseBudgetCents } from "@/lib/ai-cost";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * A monthly budget in US dollars: a field, Save, and Remove when one is
 * set. `onSave` gets dollars, or null to remove the budget.
 */
export const BudgetForm = ({
    budgetCents,
    isPending,
    onSave,
}: {
    budgetCents: number | null;
    isPending: boolean;
    onSave: (budgetUsd: number | null) => void;
}) => {
    const saved = budgetCents === null ? "" : String(centsToUsd(budgetCents));
    const [value, setValue] = useState(saved);

    // Follows what the server has after a save
    useEffect(() => setValue(saved), [saved]);

    const cents = parseBudgetCents(value);
    const isInvalid = cents === undefined;

    return (
        <form
            className="space-y-1.5"
            onSubmit={(event) => {
                event.preventDefault();
                if (cents === undefined) return;

                onSave(centsToUsd(cents));
            }}
        >
            <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">$</span>
                <Input
                    inputMode="decimal"
                    placeholder="No budget"
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    aria-label="Monthly AI budget in US dollars"
                    aria-invalid={isInvalid}
                    className="h-8"
                />
                <Button
                    type="submit"
                    size="sm"
                    disabled={isPending || isInvalid || value.trim() === saved}
                >
                    Save
                </Button>
                {budgetCents !== null && (
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={isPending}
                        onClick={() => onSave(null)}
                    >
                        Remove
                    </Button>
                )}
            </div>
            {isInvalid && (
                <p className="text-xs text-destructive">
                    Type an amount in dollars, at least 0.01, or leave it empty for no budget.
                </p>
            )}
        </form>
    );
};
