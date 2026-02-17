import { LoginForm } from '@/features/auth/components/login-form'
import { requireUnauth } from '@/lib/auth-utils'
<<<<<<< HEAD
import React from 'react'
=======

>>>>>>> b9c9985 (Restore project after zip download and fixes)

const Login = async () => {

  await requireUnauth()

  return (
<<<<<<< HEAD
    <div>
      <LoginForm />
    </div>
=======
    <LoginForm />
>>>>>>> b9c9985 (Restore project after zip download and fixes)
  )
}

export default Login