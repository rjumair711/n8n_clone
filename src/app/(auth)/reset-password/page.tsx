import { ResetPasswordForm } from '@/features/auth/components/reset-password-form'

type Props = {
  searchParams: Promise<{ token?: string; error?: string }>;
}

// The link in the reset email lands here as /reset-password?token=...
const ResetPassword = async ({ searchParams }: Props) => {
  const { token, error } = await searchParams

  return (
    <div>
      <ResetPasswordForm token={token} invalid={!!error} />
    </div>
  )
}

export default ResetPassword
