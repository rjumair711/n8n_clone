import { polarClient } from "@polar-sh/better-auth"
import { twoFactorClient } from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"
import { ssoClient } from "@better-auth/sso/client"


export const authClient = createAuthClient({
    plugins: [
        polarClient(),
        // Single sign-on: "Sign in with SSO", and registering a provider
        ssoClient({ domainVerification: { enabled: true } }),
        twoFactorClient({
            // The password was right and the account has two-factor on: the
            // code is asked for on its own page
            onTwoFactorRedirect: () => {
                window.location.href = "/two-factor"
            },
        }),
    ]
})

