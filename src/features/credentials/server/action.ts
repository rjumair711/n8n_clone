'use server'

import prisma from "@/lib/db";
import { CredentialType } from "@prisma/client";

export async function getSmtpCredentials() {
   return await prisma.credential.findMany({
      where: {
         type: CredentialType.SMTP,
      },
      select: {
         id: true,
         name: true,
      },
   });
}