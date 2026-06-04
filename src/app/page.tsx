"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client"; // 💡 Import your auth client

const templates = [
    { title: "AI Chatbot Workflow", description: "Create an AI chatbot using OpenAI." },
    { title: "Discord AI Assistant", description: "Automatically reply to Discord messages." },
    { title: "Email Automation", description: "Send AI-generated email responses." },
];

export default function RootHomepage() {
    const router = useRouter();
    const { data: session } = authClient.useSession(); // 💡 Monitor active user session

    const handlePrimaryAction = () => {
        if (session?.user) {
            router.push("/workflows"); // 💡 Active user goes  straight to dashboard
        } else {
            router.push("/signup"); // 💡 Guest user goes to signup
        }
    };

    return (
        <div className="min-h-screen bg-background">
            <div className="container mx-auto max-w-6xl py-16 px-4">
                <div className="text-center">
                    <div className="inline-flex rounded-full border px-4 py-2 text-sm">
                        🚀 Welcome to RJBase
                    </div>

                    <h1 className="mt-6 text-5xl font-bold tracking-tight">
                        Build Your First AI Workflow
                    </h1>

                    <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
                        Create powerful AI automations in minutes using visual workflows,
                        AI nodes, integrations, and realtime execution.
                    </p>

                    <div className="mt-10 flex justify-center gap-4">
                        <button
                            onClick={handlePrimaryAction}
                            className="rounded-xl bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:opacity-90"
                        >
                            {/* 💡 Dynamic text based on auth state */}
                            {session?.user ? "Go to Dashboard" : "Start Free Trial"}
                        </button>

                        <button
                            onClick={() => router.push("/pricing")}
                            className="rounded-xl border px-6 py-3 text-sm hover:bg-muted"
                        >
                            View Pricing
                        </button>
                    </div>
                </div>

                {/* Templates section */}
                <div className="mt-20">
                    <h2 className="text-2xl font-semibold">Starter Templates</h2>
                    <div className="mt-8 grid gap-6 md:grid-cols-3">
                        {templates.map((template) => (
                            <div key={template.title} className="rounded-2xl border p-6 transition hover:border-primary">
                                <h3 className="text-lg font-semibold">{template.title}</h3>
                                <p className="mt-2 text-sm text-muted-foreground">{template.description}</p>
                                <button 
                                    onClick={handlePrimaryAction} 
                                    className="mt-6 rounded-xl border px-4 py-2 text-sm hover:bg-muted"
                                >
                                    Use Template
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}