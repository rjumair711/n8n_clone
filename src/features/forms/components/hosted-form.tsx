"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle2Icon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    TurnstileWidget,
    type TurnstileHandle,
} from "@/features/auth/components/turnstile-widget";
import type { FormField, FormPage } from "@/lib/form-fields";

// How often, and for how long, the page asks what comes next after a
// submission. After that it says thank you: the answer was received.
const POLL_INTERVAL_MS = 1500;
const POLL_LIMIT_MS = 60_000;

type Props = {
    // Null: no page yet, the workflow is still working towards one
    page: FormPage | null;
    // Where the page is posted, and (for pages of a running execution)
    // where to ask what comes next
    submitUrl: string;
    // Set for a form that asks for a Turnstile CAPTCHA
    captchaSiteKey?: string;
    // True for a page of a running execution
    continues?: boolean;
};

type View =
    | { kind: "form" }
    | { kind: "waiting" }
    | { kind: "done"; message: string }
    | { kind: "error"; message: string };

const fieldClass =
    "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

const FieldInput = ({ field }: { field: FormField }) => {
    const common = { id: field.name, name: field.name, required: field.required };

    switch (field.type) {
        case "dropdown":
            return (
                <select {...common} defaultValue="" className={fieldClass}>
                    <option value="" disabled={field.required}>
                        Select...
                    </option>
                    {field.options.map((option) => (
                        <option key={option} value={option}>
                            {option}
                        </option>
                    ))}
                </select>
            );
        case "checkbox":
            return (
                <input
                    {...common}
                    type="checkbox"
                    value="true"
                    className="size-4 rounded border-input"
                />
            );
        case "file":
            return <Input {...common} type="file" />;
        case "number":
            return <Input {...common} type="number" step="any" inputMode="decimal" />;
        case "email":
            return <Input {...common} type="email" autoComplete="email" />;
        case "date":
            return <Input {...common} type="date" />;
        default:
            return <Input {...common} type="text" />;
    }
};

/**
 * A hosted form: the page of a Form Trigger, and the pages a running
 * workflow shows (Form node, Wait node "On Form Submitted"). After a page
 * is submitted it waits for the next page, and ends with the last page's
 * thank-you message or redirect.
 */
export const HostedForm = ({
    page: initialPage,
    submitUrl: initialSubmitUrl,
    captchaSiteKey,
    continues = false,
}: Props) => {
    const [page, setPage] = useState(initialPage);
    const [submitUrl, setSubmitUrl] = useState(initialSubmitUrl);
    const [view, setView] = useState<View>(
        initialPage ? { kind: "form" } : { kind: "waiting" }
    );
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [formError, setFormError] = useState("");
    const [submitting, setSubmitting] = useState(false);
    // Only the first page (the trigger's) asks for the CAPTCHA
    const [needsCaptcha, setNeedsCaptcha] = useState(!!captchaSiteKey && !continues);
    const [captchaToken, setCaptchaToken] = useState<string | null>(null);
    const captcha = useRef<TurnstileHandle>(null);
    // The page that was submitted last: its thank-you ends the form
    const lastPage = useRef<FormPage | null>(null);

    const finish = useCallback(() => {
        const last = lastPage.current;

        if (last?.redirectUrl) {
            window.location.href = last.redirectUrl;
            return;
        }

        setView({
            kind: "done",
            message: last?.thankYouMessage || "Thank you. Your response was received.",
        });
    }, []);

    // Asks what comes next until there is a page, the workflow ended, or
    // the time is up
    const waitForNext = useCallback(
        (url: string) => {
            const startedAt = Date.now();
            let stopped = false;

            const ask = async () => {
                if (stopped) return;

                try {
                    const response = await fetch(url, { cache: "no-store" });
                    const next = await response.json();

                    if (next.state === "page") {
                        setPage(next.page);
                        setSubmitUrl(url);
                        setErrors({});
                        setFormError("");
                        setView({ kind: "form" });
                        return;
                    }

                    if (next.state === "failed") {
                        setView(
                            lastPage.current
                                ? {
                                    kind: "error",
                                    message:
                                        "Your answers were received, but something went wrong afterwards. You do not need to submit again.",
                                }
                                : { kind: "error", message: "This form is no longer available." }
                        );
                        return;
                    }

                    if (next.state === "done" || response.status === 404) {
                        if (lastPage.current) finish();
                        else setView({ kind: "error", message: "This form is not open right now." });
                        return;
                    }
                } catch {
                    // A dropped request: asked again below
                }

                if (Date.now() - startedAt > POLL_LIMIT_MS) {
                    if (lastPage.current) finish();
                    else setView({ kind: "error", message: "This form is not ready. Try again later." });
                    return;
                }

                setTimeout(ask, POLL_INTERVAL_MS);
            };

            void ask();

            return () => {
                stopped = true;
            };
        },
        [finish]
    );

    // Opened before the workflow reached its form page
    useEffect(() => {
        if (!initialPage) return waitForNext(initialSubmitUrl);
    }, [initialPage, initialSubmitUrl, waitForNext]);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!page || submitting) return;

        const body = new FormData(event.currentTarget);

        if (needsCaptcha) {
            if (!captchaToken) {
                setFormError("Please complete the check that you are not a robot.");
                return;
            }
            body.set("cf-turnstile-response", captchaToken);
        }

        setSubmitting(true);
        setErrors({});
        setFormError("");

        try {
            const response = await fetch(submitUrl, { method: "POST", body });
            const result = await response.json().catch(() => ({}));

            if (!response.ok || !result.success) {
                setErrors(result.errors ?? {});
                setFormError(result.error || "The form could not be submitted. Try again.");
                // An answer works once
                captcha.current?.reset();
                return;
            }

            lastPage.current = page;
            setNeedsCaptcha(false);

            if (result.next) {
                setView({ kind: "waiting" });
                waitForNext(result.next);
            } else {
                finish();
            }
        } catch {
            setFormError("The form could not be submitted. Check your connection and try again.");
            captcha.current?.reset();
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <main className="flex min-h-svh items-start justify-center bg-muted/40 p-4 md:p-10">
            <div className="w-full max-w-xl rounded-xl border bg-background p-6 shadow-sm md:p-8">
                {view.kind === "waiting" && (
                    <div className="flex flex-col items-center gap-3 py-10 text-center">
                        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">One moment...</p>
                    </div>
                )}

                {view.kind === "done" && (
                    <div className="flex flex-col items-center gap-3 py-10 text-center">
                        <CheckCircle2Icon className="size-8 text-green-600" />
                        <p className="whitespace-pre-wrap text-base">{view.message}</p>
                    </div>
                )}

                {view.kind === "error" && (
                    <div className="py-10 text-center">
                        <p className="text-sm text-muted-foreground">{view.message}</p>
                    </div>
                )}

                {view.kind === "form" && page && (
                    <form onSubmit={handleSubmit} className="space-y-5" noValidate={false}>
                        <div className="space-y-1">
                            <h1 className="text-xl font-semibold">{page.title}</h1>
                            {page.description && (
                                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                                    {page.description}
                                </p>
                            )}
                        </div>

                        {page.fields.map((field) => (
                            <div
                                key={field.name}
                                className={
                                    field.type === "checkbox"
                                        ? "flex flex-row-reverse items-center justify-end gap-2"
                                        : "space-y-1.5"
                                }
                            >
                                <Label htmlFor={field.name}>
                                    {field.label}
                                    {field.required && <span className="text-red-600"> *</span>}
                                </Label>
                                <FieldInput field={field} />
                                {errors[field.name] && (
                                    <p className="basis-full text-sm text-red-600">
                                        {errors[field.name]}
                                    </p>
                                )}
                            </div>
                        ))}

                        {needsCaptcha && captchaSiteKey && (
                            <TurnstileWidget
                                ref={captcha}
                                siteKey={captchaSiteKey}
                                onToken={setCaptchaToken}
                            />
                        )}

                        {formError && <p className="text-sm text-red-600">{formError}</p>}

                        <Button type="submit" disabled={submitting} className="w-full">
                            {submitting && <Loader2Icon className="size-4 animate-spin" />}
                            {page.submitLabel}
                        </Button>
                    </form>
                )}
            </div>
        </main>
    );
};

export const FormUnavailable = ({ message }: { message: string }) => (
    <main className="flex min-h-svh items-start justify-center bg-muted/40 p-4 md:p-10">
        <div className="w-full max-w-xl rounded-xl border bg-background p-8 text-center shadow-sm">
            <p className="text-sm text-muted-foreground">{message}</p>
        </div>
    </main>
);
