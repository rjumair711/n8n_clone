// How a customer connects their own server after buying the managed
// private server. One list, shown in the popup after payment, on the
// thanks page and in Settings → Private server. No React, no server code.

export type InstallStep = { title: string; description: string };

export const PRIVATE_SERVER_SETTINGS_HREF = "/settings/private-server";

export const MANAGED_SERVER_INSTALL_STEPS: InstallStep[] = [
  {
    title: "Sign in with the email you paid with",
    description:
      "Your server is linked to the RXJ account with that address, once the address is verified.",
  },
  {
    title: "Rent a server",
    description:
      "One Ubuntu 24.04 server with at least 4 GB of memory, from a company such as Hetzner, DigitalOcean or Contabo (about $5–7 a month, paid to them).",
  },
  {
    title: "Point your domain at it",
    description:
      "Pick a domain or subdomain, for example automate.yourbusiness.com, and add a DNS A record for it with the server's IP address.",
  },
  {
    title: "Make your install command",
    description:
      "In Settings → Private server, enter the domain and the admin's email and press “Make install command”. Copy it: it is shown once.",
  },
  {
    title: "Paste it on your server",
    description:
      "Sign in to the server (SSH) and paste the command. In about five minutes RXJ runs on your domain, and Settings → Private server shows it as Online.",
  },
];

export const INSTALL_STEPS_FOOTER =
  "You can see these steps again any time in Settings → Private server, or on the Docs page in the sidebar.";
