// src/utils/resendClient.ts

import { Resend } from "resend";

// Initialize the Resend client with your API key
const resend = new Resend(process.env.RESEND_API_KEY);

export default resend;