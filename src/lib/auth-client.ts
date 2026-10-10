import { polarClient } from "@polar-sh/better-auth"
import { twoFactorClient } from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"


export const authClient = createAuthClient({
    plugins: [
        polarClient(),
        twoFactorClient({
            // The password was right and the account has two-factor on: the
            // code is asked for on its own page
            onTwoFactorRedirect: () => {
                window.location.href = "/two-factor"
            },
        }),
    ]
})

