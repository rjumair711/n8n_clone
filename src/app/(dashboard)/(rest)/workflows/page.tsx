import { requireAuth } from '@/lib/auth-utils'
import React from 'react'

const Page = async () => {
  await requireAuth()

  return <p>Workflows</p>
}

export default Page