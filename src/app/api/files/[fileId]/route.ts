import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

// Lets the signed-in owner download a file one of their workflows made.
// This is the "url" of a file reference in the workflow data.
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ fileId: string }> }
) {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { fileId } = await params;

    // Scoped to the owner: another account's file id is "not found"
    const file = await prisma.workflowFile.findFirst({
        where: { id: fileId, userId: session.user.id },
    });

    if (!file) {
        return NextResponse.json(
            { error: "File not found. Workflow files are removed after a few days." },
            { status: 404 }
        );
    }

    return new NextResponse(Buffer.from(file.data), {
        status: 200,
        headers: {
            "Content-Type": file.mimeType,
            "Content-Length": String(file.size),
            // Always a download, never rendered: the content comes from a
            // workflow and must not run as a page on this origin
            "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "sandbox",
            "Cache-Control": "private, no-store",
        },
    });
}
