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
import { NodeType } from "@prisma/client"
import { Clock, FilterIcon, GlobeIcon, Mail, MousePointerIcon, Send, VariableIcon, ChevronDown, ChevronRight } from "lucide-react"
import { toast } from "sonner"

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
]

const coreExecutionNodes: NodeTypeOption[] = [
    {
        type: NodeType.FILTER,
        label: "Filter",
        description: "Continue only if a condition is true",
        icon: FilterIcon
    },
    {
        type: NodeType.HTTP_REQUEST,
        label: "HTTP Request",
        description: "Makes an HTTP request",
        icon: GlobeIcon
    },
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
        type: NodeType.SET_VARIABLE,
        label: "Set Variable",
        description: "Set a workflow variable",
        icon: VariableIcon
    },
    {
        type: NodeType.DELAY,
        label: "Delay",
        description: "Pause workflow for a specific duration",
        icon: Clock,
    },
    {
        type: NodeType.WEBHOOK_RESPONSE,
        label: "Webhook Response",
        description: "Send a response to a webhook",
        icon: Send 
    },
    {
        type: NodeType.EMAIL_SEND,
        label: "Email",
        description: "Send an email notification step",
        icon: "/logos/email.jfif"
    },
    {
        type: NodeType.GOOGLE_SHEETS,
        label: "Google Sheets",
        description: "Add data to a Google Sheet",
        icon: "/logos/googleSheet.png"
    }
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

    // 2. State management for dropdown collapsible menus
    const [openSections, setOpenSections] = useState<Record<string, boolean>>({
        triggers: false,
        aiModels: false,
        actions: false,
    })

    const toggleSection = (sectionKey: string) => {
        setOpenSections((prev) => ({
            ...prev,
            [sectionKey]: !prev[sectionKey],
        }))
    }

    const handleNodeSelect = useCallback((selection: NodeTypeOption) => {
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

        onOpenChange(false)
    }, [setNodes, getNodes, onOpenChange, screenToFlowPosition])

    // Helper map renderer to align rows cleanly
    const renderNodeList = (nodes: NodeTypeOption[]) => (
        <div className="flex flex-col">
            {nodes.map((nodeType) => {
                const Icon = nodeType.icon;
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
                                <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                                    {nodeType.label}
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
    const menuSections = [
        { id: "triggers", title: "TRIGGERS", data: triggerNodes },
        { id: "aiModels", title: "AI & LANGUAGE MODELS", data: aiNodes },
        { id: "actions", title: "LOGIC & INTEGRATIONS", data: coreExecutionNodes },
    ]

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetTrigger asChild>{children}</SheetTrigger>
            <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col h-screen bg-background">
                
                {/* Fixed Non-Scrollable Header Section */}
                <div className="p-6 border-b border-border flex-shrink-0">
                    <SheetHeader>
                        <SheetTitle className="text-xl font-semibold tracking-tight">Add a Node</SheetTitle>
                        <SheetDescription className="text-sm text-muted-foreground mt-1">
                            Select a trigger or execution block to add to your flow builder canvas.
                        </SheetDescription>
                    </SheetHeader>
                </div>

                {/* Independent Scrollable Content Area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {menuSections.map((section) => {
                        const isOpen = openSections[section.id];
                        return (
                            <div key={section.id} className="border border-border/40 rounded-xl bg-card/30 overflow-hidden shadow-2xs">
                                
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
                                <div className={`grid transition-all duration-200 ease-in-out ${
                                    isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 pointer-events-none"
                                }`}>
                                    <div className="overflow-hidden bg-background/50">
                                        {renderNodeList(section.data)}
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
                
            </SheetContent>
        </Sheet>
    )
}