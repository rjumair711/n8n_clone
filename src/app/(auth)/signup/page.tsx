import { RegisterForm } from '@/features/auth/components/register-form'
import { requireUnauth } from '@/lib/auth-utils'
import React from 'react'

const Register = async () => {
    await requireUnauth()

    return (
<<<<<<< HEAD
        <div>
            <RegisterForm />
        </div>
=======
        <RegisterForm />
>>>>>>> b9c9985 (Restore project after zip download and fixes)
    )
}

export default Register