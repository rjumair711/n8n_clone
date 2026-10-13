import {
  BotIcon,
  CheckIcon,
  DatabaseZapIcon,
  MemoryStickIcon,
  ShieldCheckIcon,
} from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import { siDeepseek } from "simple-icons";
import { getNodeLabel } from "@/config/node-labels";

// The hero's product visual: a small workflow drawn with HTML and CSS (no
// React Flow, no script) whose nodes light up one after the other like a
// run in the editor. Node names and icons are the app's own.

// One loop of the run, in seconds: when each part is running. A part is
// "done" from the end of its window until RESET.
const LOOP = 12;
const RESET = 11.3;
const FADE = 0.2;

const WINDOWS = {
  trigger: [0.4, 1.4],
  edge1: [1.4, 1.9],
  guardrails: [1.9, 2.9],
  edge2: [2.9, 3.4],
  agent: [3.4, 8],
  model: [3.6, 4.4],
  memory: [3.6, 4.4],
  vector: [4.6, 5.6],
  sheets: [5.8, 7.6],
  edge3: [8, 8.5],
  reply: [8.5, 9.5],
} as const;

type Part = keyof typeof WINDOWS;

// An example run: what the log says, and when each line appears
const LOG_LINES = [
  { at: 1.4, node: getNodeLabel("WHATSAPP_TRIGGER"), text: "message received" },
  { at: 2.9, node: "Guardrails", text: "passed" },
  { at: 5.6, node: "Vector Store", text: "searched documents" },
  {
    at: 5.8,
    node: getNodeLabel("GOOGLE_SHEETS"),
    text: "waiting for approval",
  },
  { at: 7.6, node: "Approval", text: "approved" },
  { at: 9.5, node: getNodeLabel("WHATSAPP"), text: "reply sent" },
];

const percent = (seconds: number) => `${((seconds / LOOP) * 100).toFixed(2)}%`;

// Visible between two moments of the loop, hidden before and after
const shownBetween = (name: string, from: number, to: number) =>
  `@keyframes ${name}{0%,${percent(from)}{opacity:0}${percent(from + FADE)},${percent(to)}{opacity:1}${percent(to + FADE)},100%{opacity:0}}`;

const animated = (name: string) =>
  `.${name}{animation:${name} ${LOOP}s linear infinite}`;

const buildCss = () => {
  const keyframes: string[] = [];
  const rules: string[] = [];

  const add = (name: string, from: number, to: number) => {
    keyframes.push(shownBetween(name, from, to));
    rules.push(animated(name));
  };

  for (const [part, [from, to]] of Object.entries(WINDOWS)) {
    add(`hc-run-${part}`, from, to);
    add(`hc-done-${part}`, to, RESET);
  }

  LOG_LINES.forEach((line, index) => {
    add(`hc-log-${index}`, line.at, RESET);
  });

  add("hc-status-running", WINDOWS.trigger[0], WINDOWS.reply[1]);
  add("hc-status-success", WINDOWS.reply[1], RESET);

  // Still for anyone who asked for less motion: the finished run is shown
  return `${keyframes.join("")}@media (prefers-reduced-motion:no-preference){${rules.join("")}}`;
};

const Node = ({
  part,
  icon,
  label,
  note,
  small = false,
}: {
  part: Part;
  icon: ReactNode;
  label: string;
  note?: string;
  small?: boolean;
}) => (
  <div className={`hc-node ${small ? "py-2 pl-2 pr-3" : ""}`}>
    <span className={`hc-run hc-run-${part}`} />
    <span className={`hc-ok hc-done-${part}`}>
      <CheckIcon className="size-3" strokeWidth={3.5} />
    </span>
    <span className={`hc-icon ${small ? "size-7" : ""}`}>{icon}</span>
    <span className="min-w-0">
      {label}
      {note && <small>{note}</small>}
    </span>
  </div>
);

const Edge = ({ part }: { part: Part }) => (
  <span className="hc-edge">
    <i className={`hc-done-${part}`} />
    <i className={`hc-edge-run hc-run-${part}`} />
  </span>
);

export const HeroCanvas = () => (
  <figure className="hc-frame mkt-ink text-left">
    <style>{buildCss()}</style>

    <figcaption className="sr-only">
      An example workflow in RXJ: a WhatsApp Trigger passes a message to
      Guardrails and then to an AI Agent, which uses a chat model, memory, a
      Vector Store and Google Sheets. Writing to Google Sheets waits for a
      person&apos;s approval. A WhatsApp node sends the reply and the run ends
      with Success.
    </figcaption>

    <div aria-hidden="true">
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <span className="flex gap-1.5">
          <i className="size-2.5 rounded-full bg-white/15" />
          <i className="size-2.5 rounded-full bg-white/15" />
          <i className="size-2.5 rounded-full bg-white/15" />
        </span>
        <span className="truncate text-sm text-m-muted">
          WhatsApp support agent
        </span>
        <span className="relative ml-auto h-6 w-[5.5rem] text-xs">
          <span className="hc-status-success absolute inset-0 flex items-center justify-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 text-emerald-300">
            <i className="size-1.5 rounded-full bg-emerald-400" />
            Success
          </span>
          <span className="hc-status-running absolute inset-0 flex items-center justify-center gap-1.5 rounded-full border border-indigo-300/40 bg-[#1a1d55] text-indigo-100 opacity-0">
            <i className="size-1.5 animate-pulse rounded-full bg-indigo-300" />
            Running
          </span>
        </span>
      </div>

      <div className="grid xl:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="hc-canvas px-4 py-6 sm:px-6 sm:py-8">
          <div className="mx-auto flex max-w-xs flex-col lg:max-w-none lg:flex-row lg:items-start">
            <Node
              part="trigger"
              icon={
                <Image
                  src="/logos/whatsapp.svg"
                  alt=""
                  width={20}
                  height={20}
                />
              }
              label={getNodeLabel("WHATSAPP_TRIGGER")}
              note="On message"
            />
            <Edge part="edge1" />
            <Node
              part="guardrails"
              icon={<ShieldCheckIcon className="size-5 text-sky-300" />}
              label="Guardrails"
              note="Check input"
            />
            <Edge part="edge2" />

            <div className="flex flex-col">
              <Node
                part="agent"
                icon={<BotIcon className="size-5 text-violet-300" />}
                label={getNodeLabel("AI_AGENT")}
                note="Tools Agent"
              />
              <span className="mx-auto h-4 w-px border-l border-dashed border-white/30" />
              <div className="rounded-xl border border-dashed border-white/20 p-2">
                <p className="mb-2 px-1 text-[0.6875rem] uppercase tracking-wider text-m-muted">
                  Chat Model · Memory · Tools
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Node
                    small
                    part="model"
                    icon={
                      <svg
                        viewBox="0 0 24 24"
                        className="size-4"
                        fill={`#${siDeepseek.hex}`}
                        aria-hidden="true"
                      >
                        <path d={siDeepseek.path} />
                      </svg>
                    }
                    label={getNodeLabel("DEEPSEEK")}
                  />
                  <Node
                    small
                    part="memory"
                    icon={
                      <MemoryStickIcon className="size-4 text-indigo-200" />
                    }
                    label={getNodeLabel("BUFFER_MEMORY")}
                  />
                  <Node
                    small
                    part="vector"
                    icon={<DatabaseZapIcon className="size-4 text-sky-300" />}
                    label="Vector Store"
                  />
                  <Node
                    small
                    part="sheets"
                    icon={
                      <Image
                        src="/logos/googleSheet.png"
                        alt=""
                        width={16}
                        height={16}
                      />
                    }
                    label={getNodeLabel("GOOGLE_SHEETS")}
                    note="Needs approval"
                  />
                </div>
              </div>
            </div>

            <Edge part="edge3" />
            <Node
              part="reply"
              icon={
                <Image
                  src="/logos/whatsapp.svg"
                  alt=""
                  width={20}
                  height={20}
                />
              }
              label={getNodeLabel("WHATSAPP")}
              note="Send message"
            />
          </div>
        </div>

        <div className="hc-log border-t border-white/10 p-4 xl:border-l xl:border-t-0">
          <p className="mb-3 text-[0.6875rem] uppercase tracking-wider text-m-muted">
            Execution log · example run
          </p>
          <ul className="space-y-1.5">
            {LOG_LINES.map((line, index) => (
              <li key={line.text} className={`hc-log-${index} flex gap-2`}>
                <CheckIcon
                  className="mt-0.5 size-3.5 shrink-0 text-emerald-400"
                  strokeWidth={3}
                />
                <span className="text-m-muted">
                  <span className="text-m-fg">{line.node}</span> {line.text}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  </figure>
);
