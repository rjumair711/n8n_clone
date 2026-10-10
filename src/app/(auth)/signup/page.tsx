import { RegisterForm } from '@/features/auth/components/register-form'
import { requireUnauth } from '@/lib/auth-utils'
import { getTurnstileConfig } from '@/lib/turnstile'
import React from 'react'

const Register = async () => {
    await requireUnauth()

    // Read on the server at request time: the site key is public, but it is
    // a plain environment variable, not one built into the browser bundle
    const turnstileSiteKey = getTurnstileConfig()?.siteKey ?? null

    return (
        <div>
            <RegisterForm turnstileSiteKey={turnstileSiteKey} />
        </div>
    )
}

export default Register
