import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { buildDownloadHeaders, verifyFileDownload } from "@/lib/file-links";
import { notFoundResponse } from "@/lib/ownership";
import { getOwnedWorkflowFile } from "@/lib/workflow-files";

type StoredFile = Awaited<ReturnType<typeof getOwnedWorkflowFile>>;

// Always a download, never rendered: see buildDownloadHeaders
const download = (file: StoredFile) =>
    new NextResponse(Buffer.from(file.data), {
        status: 200,
        headers: buildDownloadHeaders(file),
    });

/**
 * Downloads a file one of the user's workflows made. This is the "url" of a
 * file reference in the workflow data.
 *
 * The link is signed and works for 15 minutes for whoever has it. Without a
 * valid signature (an expired link, or a link from before links were
 * signed) only the signed-in owner gets the file.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ fileId: string }> }
) {
    const { fileId } = await params;
    const query = new URL(request.url).searchParams;

    const link = verifyFileDownload(
        fileId,
        query.get("expires"),
        query.get("signature")
    );

    if (link === "valid") {
        const file = await prisma.workflowFile.findUnique({ where: { id: fileId } });

        if (!file) {
            return NextResponse.json(
                { error: "File not found. Workflow files are removed after a few days." },
                { status: 404 }
            );
        }

        return download(file);
    }

    const session = await auth.api.getSession({ headers: await headers() });

    if (!session) {
        return link === "unsigned"
            ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
            : NextResponse.json(
                {
                    error:
                        link === "expired"
                            ? "This download link has expired. Links work for 15 minutes; sign in to download the file, or run the workflow again for a new link."
                            : "This download link is not valid.",
                },
                { status: 403 }
            );
    }

    // Scoped to the owner: another account's file id is "not found"
    try {
        return download(await getOwnedWorkflowFile(fileId, session.user.id));
    } catch (error) {
        const response = notFoundResponse(error);
        if (response) return response;
        throw error;
    }
}
