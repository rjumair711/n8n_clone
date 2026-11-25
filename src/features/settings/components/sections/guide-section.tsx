"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDownIcon, LightbulbIcon, SearchIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/client";
import { type GuideChapter, type GuideTopic, searchGuide } from "../../lib/guide-content";

// **bold** and `code` inside a guide text; everything else is plain text
const INLINE = /(\*\*[^*]+\*\*|`[^`]+`)/g;

const Inline = ({ text }: { text: string }) => (
    <>
        {text.split(INLINE).map((part, index) => {
            if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
                return (
                    <strong key={index} className="font-medium text-foreground">
                        {part.slice(2, -2)}
                    </strong>
                );
            }
            if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
                return (
                    <code key={index} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.8125rem] text-foreground">
                        {part.slice(1, -1)}
                    </code>
                );
            }
            return part;
        })}
    </>
);

const Topic = ({ topic }: { topic: GuideTopic }) => (
    <div id={`guide-topic-${topic.id}`} className="scroll-mt-6 space-y-2.5">
        <h4 className="text-sm font-semibold">{topic.title}</h4>
        {topic.body?.map((paragraph, index) => (
            <p key={index} className="text-sm leading-relaxed text-muted-foreground">
                <Inline text={paragraph} />
            </p>
        ))}
        {topic.steps && (
            <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground marker:text-foreground/60">
                {topic.steps.map((step, index) => (
                    <li key={index} className="pl-1">
                        <Inline text={step} />
                    </li>
                ))}
            </ol>
        )}
        {topic.points && (
            <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground marker:text-foreground/40">
                {topic.points.map((point, index) => (
                    <li key={index} className="pl-1">
                        <Inline text={point} />
                    </li>
                ))}
            </ul>
        )}
        {topic.tip && (
            <p className="flex gap-2 rounded-md bg-muted/60 px-3 py-2 text-sm leading-relaxed text-muted-foreground">
                <LightbulbIcon className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden />
                <span>
                    <Inline text={topic.tip} />
                </span>
            </p>
        )}
        {topic.links && topic.links.length > 0 && (
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {topic.links.map((link) => (
                    <Link key={link.href} href={link.href} className="font-medium text-primary underline-offset-4 hover:underline">
                        {link.label} →
                    </Link>
                ))}
            </p>
        )}
    </div>
);

/**
 * Settings → Help → Platform guide: every part of RXJ and how to use it,
 * with a search over all of it. The chapters come from the server
 * (guide-content.ts, already without what this server does not offer); the
 * admins' chapter is shown to admins only.
 */
export const GuideSection = ({ chapters }: { chapters: GuideChapter[] }) => {
    const trpc = useTRPC();
    const { data: security } = useQuery(trpc.settings.getSecurity.queryOptions());
    const isAdmin = !!security?.isAdmin;
    const [query, setQuery] = useState("");
    const [open, setOpen] = useState<Set<string>>(() => new Set([chapters[0]?.id]));

    const visible = useMemo(
        () => chapters.filter((chapter) => isAdmin || !chapter.adminOnly),
        [chapters, isAdmin]
    );
    const results = useMemo(() => searchGuide(visible, query), [visible, query]);
    const searching = query.trim().length > 0;
    const topicCount = results.reduce((sum, chapter) => sum + chapter.topics.length, 0);

    // A link to #guide-<chapter> opens that chapter; one to
    // #guide-topic-<topic> (from a node or an error) opens the topic's
    // chapter and scrolls to the topic
    useEffect(() => {
        const openFromHash = () => {
            const hash = window.location.hash;
            const topicId = hash.startsWith("#guide-topic-") ? hash.slice("#guide-topic-".length) : null;
            const id = topicId
                ? chapters.find((chapter) => chapter.topics.some((topic) => topic.id === topicId))?.id
                : hash.replace(/^#guide-/, "");
            if (!id || !chapters.some((chapter) => chapter.id === id)) return;

            setQuery("");
            setOpen((current) => new Set(current).add(id));
            requestAnimationFrame(() =>
                document
                    .getElementById(topicId ? `guide-topic-${topicId}` : `guide-${id}`)
                    ?.scrollIntoView({ block: "start" })
            );
        };
        openFromHash();
        window.addEventListener("hashchange", openFromHash);
        return () => window.removeEventListener("hashchange", openFromHash);
    }, [chapters]);

    const toggle = (id: string) =>
        setOpen((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });

    const jumpTo = (id: string) => {
        setQuery("");
        setOpen((current) => new Set(current).add(id));
        requestAnimationFrame(() =>
            document.getElementById(`guide-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
        );
    };

    return (
        <div className="space-y-6">
            <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search the guide: webhook, WhatsApp, approval, budget..."
                    aria-label="Search the guide"
                    className="pl-9 pr-9"
                />
                {searching && (
                    <button
                        type="button"
                        onClick={() => setQuery("")}
                        aria-label="Clear the search"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                    >
                        <XIcon className="size-4" />
                    </button>
                )}
            </div>

            {searching ? (
                <p className="text-sm text-muted-foreground" aria-live="polite">
                    {topicCount === 0
                        ? "Nothing in the guide matches that. Try another word, or ask us under Support."
                        : `${topicCount} ${topicCount === 1 ? "topic" : "topics"} found`}
                </p>
            ) : (
                <nav aria-label="Chapters of the guide" className="rounded-xl border p-4">
                    <p className="pb-2 text-xs font-medium text-muted-foreground">Chapters</p>
                    <ol className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                        {visible.map((chapter, index) => (
                            <li key={chapter.id}>
                                <a
                                    href={`#guide-${chapter.id}`}
                                    onClick={(event) => {
                                        event.preventDefault();
                                        history.replaceState(null, "", `#guide-${chapter.id}`);
                                        jumpTo(chapter.id);
                                    }}
                                    className="flex gap-2 rounded px-1 py-1 text-muted-foreground transition-colors hover:text-foreground"
                                >
                                    <span className="w-5 shrink-0 tabular-nums text-foreground/40">{index + 1}</span>
                                    {chapter.title}
                                </a>
                            </li>
                        ))}
                    </ol>
                </nav>
            )}

            <div className="space-y-3">
                {results.map((chapter) => {
                    const expanded = searching || open.has(chapter.id);

                    return (
                        <section
                            key={chapter.id}
                            id={`guide-${chapter.id}`}
                            aria-labelledby={`guide-${chapter.id}-title`}
                            className="scroll-mt-6 rounded-xl border"
                        >
                            <h3 id={`guide-${chapter.id}-title`}>
                                <button
                                    type="button"
                                    onClick={() => toggle(chapter.id)}
                                    aria-expanded={expanded}
                                    aria-controls={`guide-${chapter.id}-body`}
                                    disabled={searching}
                                    className="flex w-full items-start gap-3 p-4 text-left disabled:cursor-default"
                                >
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-base font-semibold">{chapter.title}</span>
                                        <span className="mt-0.5 block text-sm font-normal text-muted-foreground">
                                            {chapter.summary}
                                        </span>
                                    </span>
                                    {!searching && (
                                        <ChevronDownIcon
                                            className={cn(
                                                "mt-1 size-4 shrink-0 text-muted-foreground transition-transform",
                                                expanded && "rotate-180"
                                            )}
                                            aria-hidden
                                        />
                                    )}
                                </button>
                            </h3>
                            {expanded && (
                                <div id={`guide-${chapter.id}-body`} className="space-y-6 border-t px-4 py-5">
                                    {chapter.topics.map((topic) => (
                                        <Topic key={topic.id} topic={topic} />
                                    ))}
                                </div>
                            )}
                        </section>
                    );
                })}
            </div>

            <p className="text-sm text-muted-foreground">
                Still stuck? Write to us under{" "}
                <Link href="/support" className="font-medium text-primary underline-offset-4 hover:underline">
                    Support
                </Link>
                , or use the <strong className="font-medium text-foreground">Help</strong> button in the
                workflow editor to send us the workflow with your question.
            </p>
        </div>
    );
};
