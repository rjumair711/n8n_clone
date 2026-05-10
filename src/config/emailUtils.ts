import nodemailer from "nodemailer";

interface SmtpCredentials {
  host: string;
  port: number;
  user: string;
  pass: string;
}

// Function to send email using SMTP credentials
export const sendEmail = async (smtpData: SmtpCredentials, recipient: string, subject: string, body: string) => {
  // Create reusable transport object using SMTP transport
  const transporter = nodemailer.createTransport({
    host: smtpData.host,  // e.g., smtp.gmail.com
    port: smtpData.port,  // e.g., 465 or 587
    secure: smtpData.port === 465,  // Use SSL/TLS for port 465
    auth: {
      user: smtpData.user,  // User's email address
      pass: smtpData.pass,  // User's email password or app password
    },
  });

  // Email content
  const mailOptions = {
    from: smtpData.user,  // Use the user's email address
    to: recipient,
    subject: subject,
    text: body,
  };

  // Send email
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent: " + info.response);
    return info;
  } catch (error) {
    console.error("Error sending email:", error);
    throw new Error("Error sending email: " + error.message);
  }
};