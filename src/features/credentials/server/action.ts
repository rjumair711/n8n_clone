// src/features/credentials/server/actions.ts
'use server'


export const getSmtpCredentials = async () => {
   // Perform the logic here directly using the DB
   // Do NOT import from your tRPC router file here
   const credentials = await db.credential.findMany({ ... });
   return credentials;
}