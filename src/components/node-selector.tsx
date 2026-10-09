"use client"

import { createId } from "@paralleldrive/cuid2"
import { useReactFlow } from "@xyflow/react"
import React, { useCallback, useState } from "react"
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger
} from "./ui/sheet"
import { Input } from "@/components/ui/input"
import { NodeType } from "@prisma/client"
import { Braces, DatabaseZap, FileInput, FileOutput, FileText, PencilRuler, Plug, Rss, ScanText, Tags } from "lucide-react"
import { AlertTriangle, ArrowDownUp, CopyMinus, Group, ListEnd, OctagonX, Reply, Sigma, Split, Workflow } from "lucide-react"
import { Clock, FilterIcon, GlobeIcon, MousePointerIcon, Send, VariableIcon, ChevronDown, ChevronRight, Code2, Bot, MemoryStickIcon, Search, Type, Calculator, GitBranch, GitFork, Merge, Repeat, Webhook, MessageSquare } from "lucide-react"
import { toast } from "sonner"
import { Lock } from "lucide-react"
import { getRequiredPlanForNode } from "@/config/plans"
import { useCurrentPlan } from "@/features/subscription/hook/use-current-plan"
import { UpgradeModal } from "@/components/upgrade-modal"

export type NodeTypeOption = {
    type: NodeType,
    label: string;
    description: string;
    icon: React.ComponentType<{ className?: string }> | string
}

// 1. Grouped Node Definitions

const triggerNodes: NodeTypeOption[] = [
    {
        type: NodeType.MANUAL_TRIGGER,
        label: "Trigger manually",
        description: "Runs the flow on clicking a button, Good for getting started quickly",
        icon: MousePointerIcon,
    },
    {
        type: NodeType.GOOGLE_FORM_TRIGGER,
        label: "Google Form",
        description: "Runs the flow when a Google Form is submitted",
        icon: "/logos/googleform.svg",
    },
    {
        type: NodeType.STRIPE_TRIGGER,
        label: "Stripe Event",
        description: "Runs the flow when a Stripe Event is captured",
        icon: "/logos/stripe.svg",
    },
    {
        type: NodeType.SCHEDULE_TRIGGER,
        label: "Schedule Trigger",
        description: "Runs the flow at specific times or periodic intervals (Cron)",
        icon: "/logos/schedule-trigger.png",
    },
    {
        type: NodeType.WEBHOOK_TRIGGER,
        label: "Webhook",
        description: "Runs the flow when an HTTP request hits this workflow's webhook URL",
        icon: Webhook,
    },
    {
        type: NodeType.CHAT_TRIGGER,
        label: "Chat Trigger",
        description: "Runs the flow when a message is sent in the chat panel. Pair it with an AI Agent",
        icon: MessageSquare,
    },
    {
        type: NodeType.TELEGRAM_TRIGGER,
        label: "Telegram Trigger",
        description: "Runs the flow when your Telegram bot receives a message",
        icon: "/logos/telegram.jfif",
    },
    {
        type: NodeType.WHATSAPP_TRIGGER,
        label: "WhatsApp Trigger",
        description: "Runs the flow when your WhatsApp Business number receives a message",
        icon: "/logos/whatsapp.svg",
    },
    {
        type: NodeType.GMAIL_TRIGGER,
        label: "Gmail Trigger",
        description: "Runs the flow when a new email arrives in your Gmail inbox",
        icon: "/logos/gmail.svg",
    },
    {
        type: NodeType.RSS_FEED_TRIGGER,
        label: "RSS Feed Trigger",
        description: "Runs the flow when a new item appears in an RSS or Atom feed",
        icon: Rss,
    },
    {
        type: NodeType.TYPEFORM_TRIGGER,
        label: "Typeform Trigger",
        description: "Runs the flow when someone submits your typeform",
        icon: "/logos/typeform.svg",
    },
    {
        type: NodeType.EXECUTE_WORKFLOW_TRIGGER,
        label: "When Executed by Another Workflow",
        description: "Runs the flow when an Execute Workflow node or an AI Agent tool calls it",
        icon: Workflow,
    },
    {
        type: NodeType.ERROR_TRIGGER,
        label: "Error Trigger",
        description: "Runs the flow when a workflow fails, to send an alert",
        icon: AlertTriangle,
    },
]

const dataNodes: NodeTypeOption[] = [
    {
        type: NodeType.EDIT_FIELDS,
        label: "Edit Fields",
        description: "Set, keep, remove and rename fields. After a list node it reshapes every item",
        icon: PencilRuler,
    },
    {
        type: NodeType.SPLIT_OUT,
        label: "Split Out",
        description: "Turn a list inside your data into separate items",
        icon: Split,
    },
    {
        type: NodeType.AGGREGATE,
        label: "Aggregate",
        description: "Combine a field from many items into a single list",
        icon: Group,
    },
    {
        type: NodeType.SORT,
        label: "Sort",
        description: "Order the items of a list by a field",
        icon: ArrowDownUp,
    },
    {
        type: NodeType.LIMIT,
        label: "Limit",
        description: "Keep only the first or last items of a list",
        icon: ListEnd,
    },
    {
        type: NodeType.REMOVE_DUPLICATES,
        label: "Remove Duplicates",
        description: "Remove items that repeat an earlier item",
        icon: CopyMinus,
    },
    {
        type: NodeType.SUMMARIZE,
        label: "Summarize",
        description: "Count, sum or average a list, like a pivot table",
        icon: Sigma,
    },
]

const fileNodes: NodeTypeOption[] = [
    {
        type: NodeType.PDF_GENERATOR,
        label: "PDF Generator",
        description: "Make a PDF from text: an invoice, a report, a letter",
        icon: FileText,
    },
    {
        type: NodeType.CONVERT_TO_FILE,
        label: "Convert to File",
        description: "Turn workflow data into a CSV, JSON or text file",
        icon: FileOutput,
    },
    {
        type: NodeType.EXTRACT_FROM_FILE,
        label: "Extract from File",
        description: "Read a CSV, JSON or text file back into workflow data",
        icon: FileInput,
    },
]

const logicNodes: NodeTypeOption[] = [
    {
        type: NodeType.FILTER,
        label: "Filter",
        description: "Continue only if a condition is true",
        icon: FilterIcon
    },
    {
        type: NodeType.IF,
        label: "IF",
        description: "Route to a true or false branch based on conditions",
        icon: GitBranch
    },
    {
        type: NodeType.SWITCH,
        label: "Switch",
        description: "Route to one of several branches based on rules",
        icon: GitFork
    },
    {
        type: NodeType.MERGE,
        label: "Merge",
        description: "Join branches back into a single path",
        icon: Merge
    },
    {
        type: NodeType.LOOP,
        label: "Loop",
        description: "Run a set of nodes once for every item in a list",
        icon: Repeat
    },
    {
        type: NodeType.EXECUTE_WORKFLOW,
        label: "Execute Workflow",
        description: "Run another workflow and use its result",
        icon: Workflow
    },
    {
        type: NodeType.STOP_AND_ERROR,
        label: "Stop and Error",
        description: "Fail the workflow with your own error message",
        icon: OctagonX
    },
    {
        type: NodeType.CALCULATOR,
        label: "Calculator",
        description: "Perform mathematical operations on numbers or variables",
        icon: Calculator 
    },
    {
        type: NodeType.SET_VARIABLE,
        label: "Set Variable",
        description: "Set a workflow variable",
        icon: VariableIcon
    },
    {
        type: NodeType.TEXT_FORMATTER,
        label: "Text Formatter",
        description: "Transform, clean, or extract text strings",
        icon: Type 
    },
    {
        type: NodeType.DATE_TIME, 
        label: "Date & Time",
        description: "Get current time, format, manipulate, or compare dates",
        icon: "/logos/clock.svg", 
    },
    {
        type: NodeType.CODE,
        label: "JavaScript Code",
        description: "Run custom JavaScript or TypeScript code to transform data",
        icon: Code2
    },
    {
        type: NodeType.DELAY,
        label: "Delay",
        description: "Pause workflow for a specific duration",
        icon: Clock,
    },
    {
        type: NodeType.BUFFER_MEMORY,
        label: "Memory",
        description: "Store data in a memory",
        icon: MemoryStickIcon
    },
]

const aiNodes: NodeTypeOption[] = [
    {
        type: NodeType.GEMINI,
        label: "Gemini",
        description: "Uses Google Gemini to generate text and process data",
        icon: "/logos/gemini.svg"
    },
    {
        type: NodeType.OPENAI,
        label: "OpenAI",
        description: "Uses OpenAI models to generate text or completion tasks",
        icon: "/logos/openai.svg"
    },
    {
        type: NodeType.ANTHROPIC,
        label: "Anthropic",
        description: "Uses Anthropic models to generate text",
        icon: "/logos/anthropic.svg"
    },
    {
        type: NodeType.DEEPSEEK,
        label: "DeepSeek",
        description: "Low-cost DeepSeek models to generate text. Works as an AI Agent's Chat Model",
        icon: "/logos/deepseek.svg"
    },
    {
        type: NodeType.KIMI,
        label: "Kimi",
        description: "Low-cost Kimi models from Moonshot AI to generate text. Works as an AI Agent's Chat Model",
        icon: "/logos/kimi.svg"
    },
    {
        type: NodeType.QWEN,
        label: "Qwen",
        description: "Low-cost Qwen models from Alibaba Cloud to generate text. Works as an AI Agent's Chat Model",
        icon: "/logos/qwen.svg"
    },
    {
        type: NodeType.AI_AGENT, 
        label: "AI Agent",
        description: "Tools Agent: a chat model that decides which connected tools to call",
        icon: Bot
    },
    {
        type: NodeType.CHAT_MODEL,
        label: "Chat Model (OpenRouter, Groq, Ollama...)",
        description: "Any OpenAI-compatible model: OpenRouter, Groq, DeepSeek, Mistral, Together, Ollama. Works as an AI Agent's Chat Model",
        icon: "/logos/chat-model.svg"
    },
    {
        type: NodeType.TEXT_CLASSIFIER,
        label: "Text Classifier",
        description: "Sort text into your own categories with a chat model and branch on the result",
        icon: Tags
    },
    {
        type: NodeType.INFORMATION_EXTRACTOR,
        label: "Information Extractor",
        description: "Pull names, numbers, dates and other values out of free text",
        icon: ScanText
    },
    {
        type: NodeType.STRUCTURED_OUTPUT_PARSER,
        label: "Structured Output Parser",
        description: "Make an AI Agent answer with JSON in a structure you define",
        icon: Braces
    },
    {
        type: NodeType.VECTOR_STORE,
        label: "Vector Store",
        description: "Save documents and search them by meaning (RAG). Works as an AI Agent tool",
        icon: DatabaseZap
    },
    {
        type: NodeType.MCP_CLIENT_TOOL,
        label: "MCP Client",
        description: "Give an AI Agent the tools of an MCP server",
        icon: Plug
    }
]

const communicationNodes: NodeTypeOption[] = [
    {
        type: NodeType.DISCORD,
        label: "Discord",
        description: "Send a message to Discord",
        icon: "/logos/discord.svg"
    },
    {
        type: NodeType.SLACK,
        label: "Slack",
        description: "Send a message to Slack",
        icon: "/logos/slack.svg"
    },
    {
        type: NodeType.EMAIL_SEND,
        label: "Email",
        description: "Send an email notification step",
        icon: "/logos/email.jfif"
    },
    {
        type: NodeType.RESEND,
        label: "Resend",
        description: "Send an email with the Resend API",
        icon: "/logos/resend.svg"
    },
    {
        type: NodeType.SENDGRID,
        label: "SendGrid",
        description: "Send an email with the SendGrid API",
        icon: "/logos/sendgrid.svg"
    },
    {
        type: NodeType.TWILIO,
        label: "Twilio",
        description: "Send SMS and WhatsApp messages with Twilio",
        icon: "/logos/twilio.svg"
    },
    {
        type: NodeType.GMAIL,
        label: "Gmail",
        description: "Send, reply to and read emails with your Google account",
        icon: "/logos/gmail.svg"
    },
    {
        type: NodeType.TELEGRAM,
        label: "Telegram",
        description: "Send a message or interact with a Telegram bot",
        icon: "/logos/telegram.jfif" 
    },
    {
        type: NodeType.WHATSAPP,
        label: "WhatsApp",
        description: "Send WhatsApp messages with the Business Cloud API",
        icon: "/logos/whatsapp.svg"
    },
]

const productivityNodes: NodeTypeOption[] = [
    {
        type: NodeType.GOOGLE_SHEETS,
        label: "Google Sheets",
        description: "Add data to a Google Sheet",
        icon: "/logos/googleSheet.png"
    },
    {
        type: NodeType.GOOGLE_DRIVE,
        label: "Google Drive",
        description: "Upload, download, find and delete files in Google Drive",
        icon: "/logos/google-drive.svg"
    },
    {
        type: NodeType.GOOGLE_CALENDAR,
        label: "Google Calendar",
        description: "Create or manage events in a Google Calendar",
        icon: "/logos/calender.png" 
    },
    {
        type: NodeType.NOTION,
        label: "Notion",
        description: "Create or manage pages in Notion",
        icon: "/logos/notion.png" 
    },
    {
        type: NodeType.GITHUB,
        label: "GitHub",
        description: "Create issues, comment and read repositories",
        icon: "/logos/github.svg"
    },
    {
        type: NodeType.AIRTABLE,
        label: "Airtable",
        description: "List, create, update or delete Airtable records",
        icon: "/logos/airtable.svg"
    },
    {
        type: NodeType.POSTGRES,
        label: "Postgres",
        description: "Run SQL queries against a PostgreSQL database",
        icon: "/logos/postgres.svg"
    },
    {
        type: NodeType.MYSQL,
        label: "MySQL",
        description: "Run SQL queries against a MySQL or MariaDB database",
        icon: "/logos/mysql.svg"
    },
    {
        type: NodeType.JIRA,
        label: "Jira",
        description: "Create, read and search issues in Jira Cloud",
        icon: "/logos/jira.svg"
    },
    {
        type: NodeType.HUBSPOT,
        label: "HubSpot",
        description: "Create, update and find contacts and deals in HubSpot CRM",
        icon: "/logos/hubspot.svg"
    },
    {
        type: NodeType.SALESFORCE,
        label: "Salesforce",
        description: "Query, create, update and delete records of any Salesforce object",
        icon: "/logos/salesforce.svg"
    },
]

const networkNodes: NodeTypeOption[] = [
    {
        type: NodeType.SSH,
        label: "SSH",
        description: "Run a command on your own server over SSH",
        icon: "/logos/ssh.svg"
    },
    {
        type: NodeType.RSS_READ,
        label: "RSS Read",
        description: "Read the items of an RSS or Atom feed",
        icon: Rss
    },
    {
        type: NodeType.HTTP_REQUEST,
        label: "HTTP Request",
        description: "Call any API, with headers, query parameters and authentication",
        icon: GlobeIcon
    },
    {
        type: NodeType.RESPOND_TO_WEBHOOK,
        label: "Respond to Webhook",
        description: "Answer the HTTP request that started the workflow",
        icon: Reply
    },
    {
        type: NodeType.WEBHOOK_RESPONSE,
        label: "Webhook Callback",
        description: "POST the workflow's data to another URL",
        icon: Send
    },
]

interface NodeSelectorProps {
    open: boolean,
    onOpenChange: (open: boolean) => void,
    children: React.ReactNode
}

export function NodeSelector({
    open,
    onOpenChange,
    children
}: NodeSelectorProps) {
    const { setNodes, getNodes, screenToFlowPosition } = useReactFlow()

    // Nodes outside the user's plan are shown with a lock
    const { data: currentPlan } = useCurrentPlan()
    const [upgradeOpen, setUpgradeOpen] = useState(false)

    const getRequiredPlan = (type: NodeType) =>
        currentPlan
            ? getRequiredPlanForNode(type, currentPlan.plan, currentPlan.trialEndsAt)
            : null

    // 2. State management
    const [searchQuery, setSearchQuery] = useState("")
    const [openSections, setOpenSections] = useState<Record<string, boolean>>({
        triggers: false,
        logic: false,
        data: false,
        files: false,
        aiModels: false,
        communications: false,
        productivity: false,
        network: false,
    })

    const toggleSection = (sectionKey: string) => {
        setOpenSections((prev) => ({
            ...prev,
            [sectionKey]: !prev[sectionKey],
        }))
    }

    const handleNodeSelect = useCallback((selection: NodeTypeOption) => {
        const requiredPlan = getRequiredPlan(selection.type)

        if (requiredPlan) {
            toast.error(`${selection.label} requires the ${requiredPlan} plan`)
            setUpgradeOpen(true)
            return;
        }

        if (selection.type === NodeType.MANUAL_TRIGGER) {
            const nodes = getNodes()
            const hasManualTrigger = nodes.some(
                (node) => node.type === NodeType.MANUAL_TRIGGER,
            )

            if (hasManualTrigger) {
                toast.error("Only one manual trigger is allowed per workflow")
                return;
            }
        }

        setNodes((nodes) => {
            const hasInitialTrigger = nodes.some(
                (node) => node.type === NodeType.INITIAL
            )

            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;

            const flowPosition = screenToFlowPosition({
                x: centerX + (Math.random() - 0.5) * 200,
                y: centerY + (Math.random() - 0.5) * 200,
            })

            const newNode = {
                id: createId(),
                data: {},
                position: flowPosition,
                type: selection.type
            }

            if (hasInitialTrigger) {
                return [newNode];
            }

            return [...nodes, newNode]
        })

        // Reset search query when closing the menu
        setSearchQuery("")
        onOpenChange(false)
    }, [setNodes, getNodes, onOpenChange, screenToFlowPosition, currentPlan])

    // Helper map renderer to align rows cleanly
    const renderNodeList = (nodes: NodeTypeOption[]) => (
        <div className="flex flex-col">
            {nodes.map((nodeType) => {
                const Icon = nodeType.icon;
                const requiredPlan = getRequiredPlan(nodeType.type);
                return (
                    <div
                        key={nodeType.type}
                        className="w-full justify-start h-auto py-3.5 px-4 cursor-pointer 
                                 border-l-2 border-transparent hover:border-l-primary hover:bg-muted/40 
                                 transition-all duration-150 rounded-r-md group"
                        onClick={() => handleNodeSelect(nodeType)}
                    >
                        <div className="flex items-start gap-4 w-full overflow-hidden">
                            <div className="flex-shrink-0 mt-0.5 bg-secondary/50 p-1.5 rounded-md group-hover:bg-background transition-colors">
                                {typeof Icon === "string" ? (
                                    <img
                                        src={Icon}
                                        alt={nodeType.label}
                                        className="size-5 object-contain rounded-sm"
                                    />
                                ) : (
                                    <Icon className="size-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                                )}
                            </div>
                            <div className="flex flex-col items-start text-left min-w-0">
                                <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors flex items-center gap-2">
                                    {nodeType.label}
                                    {requiredPlan && (
                                        <span className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                            <Lock className="size-3" />
                                            {requiredPlan}
                                        </span>
                                    )}
                                </span>
                                <span className="text-xs text-muted-foreground line-clamp-2 mt-0.5 leading-relaxed">
                                    {nodeType.description}
                                </span>
                            </div>
                        </div>
                    </div>
                )
            })}
        </div>
    )

    // Formatted array layout to dynamically iterate accordion rows
    const allMenuSections = [
        { id: "triggers", title: "TRIGGERS", data: triggerNodes },
        { id: "logic", title: "CORE LOGIC", data: logicNodes },
        { id: "data", title: "DATA TRANSFORMATION", data: dataNodes },
        { id: "files", title: "FILES", data: fileNodes },
        { id: "aiModels", title: "AI & LANGUAGE MODELS", data: aiNodes },
        { id: "communications", title: "COMMUNICATIONS", data: communicationNodes },
        { id: "productivity", title: "PRODUCTIVITY APPS", data: productivityNodes },
        { id: "network", title: "NETWORK & API", data: networkNodes },
    ]

    // Filter sections based on search query
    const filteredSections = allMenuSections
        .map((section) => ({
            ...section,
            data: section.data.filter(
                (node) =>
                    node.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    node.description.toLowerCase().includes(searchQuery.toLowerCase())
            ),
        }))
        .filter((section) => section.data.length > 0) // Hide empty sections

    return (
        <>
        <UpgradeModal open={upgradeOpen} onOpenChange={setUpgradeOpen} />
        <Sheet open={open} onOpenChange={(isOpen) => {
            if (!isOpen) setSearchQuery(""); // Clear search on close
            onOpenChange(isOpen);
        }}>
            <SheetTrigger asChild>{children}</SheetTrigger>
            <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col h-screen bg-background">

                {/* Fixed Non-Scrollable Header Section */}
                <div className="p-6 pb-4 border-b border-border flex-shrink-0 space-y-4">
                    <SheetHeader>
                        <SheetTitle className="text-xl font-semibold tracking-tight">Add a Node</SheetTitle>
                        <SheetDescription className="text-sm text-muted-foreground mt-1">
                            Select a trigger or execution block to add to your flow builder canvas.
                        </SheetDescription>
                    </SheetHeader>
                    
                    {/* Search Bar */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                        <Input 
                            placeholder="Search for Nodes, Triggers, or Apps..." 
                            className="pl-9 bg-muted/30 border-border/50 focus-visible:ring-1 focus-visible:ring-primary/50"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>

                {/* Independent Scrollable Content Area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {filteredSections.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-40 text-center space-y-2">
                            <Search className="size-8 text-muted-foreground/30" />
                            <p className="text-sm text-muted-foreground">No nodes found matching "{searchQuery}"</p>
                        </div>
                    ) : (
                        filteredSections.map((section) => {
                            // Automatically open sections if there is a search query
                            const isOpen = searchQuery.length > 0 ? true : openSections[section.id];
                            
                            return (
                                <div key={section.id} className="border border-border/40 rounded-xl bg-card/30 overflow-hidden shadow-sm">
                                    {/* Accordion Click Target Header */}
                                    <button
                                        onClick={() => toggleSection(section.id)}
                                        className="flex items-center justify-between w-full p-4 text-xs font-bold tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-all border-b border-border/20"
                                    >
                                        <span>{section.title}</span>
                                        {isOpen ? (
                                            <ChevronDown className="size-4 opacity-70" />
                                        ) : (
                                            <ChevronRight className="size-4 opacity-70" />
                                        )}
                                    </button>

                                    {/* Dropdown Collapsible Element Panel */}
                                    <div className={`grid transition-all duration-200 ease-in-out ${isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 pointer-events-none"
                                        }`}>
                                        <div className="overflow-hidden bg-background/50">
                                            {renderNodeList(section.data)}
                                        </div>
                                    </div>
                                </div>
                            )
                        })
                    )}
                </div>

            </SheetContent>
        </Sheet>
        </>
    )
}