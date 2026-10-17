/**
 * Up to two letters for an avatar: the first letters of the first and last
 * word of the name, else the first letter of the email.
 */
export const getInitials = (name: string | null | undefined, email: string | null | undefined): string => {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);

  if (words.length > 0) {
    const first = words[0][0] ?? "";
    const last = words.length > 1 ? (words[words.length - 1][0] ?? "") : "";

    return (first + last).toUpperCase();
  }

  return (email ?? "?").trim().charAt(0).toUpperCase() || "?";
};
