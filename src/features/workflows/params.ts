import { parseAsInteger, parseAsString } from "nuqs/server"
import { PAGINATION } from "@/config/constants"


export const workflowsParams = {
    page: parseAsInteger
        .withDefault(PAGINATION.DEFAULT_PAGE)
        .withOptions({ clearOnDefault: true }),
    pageSize: parseAsInteger
        .withDefault(PAGINATION.DEFAULT_PAGE_SIZE)
        .withOptions({ clearOnDefault: true }),
    search: parseAsString
        .withDefault("")
        .withOptions({ clearOnDefault: true }),
    // A folder id, "none" for workflows in no folder, empty for all
    folder: parseAsString
        .withDefault("")
        .withOptions({ clearOnDefault: true }),
    // A tag id; empty for all
    tag: parseAsString
        .withDefault("")
        .withOptions({ clearOnDefault: true }),
}