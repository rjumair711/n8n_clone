// LinkedIn settings shared by the sign-in (server), the node's executor and
// its dialog (browser), so nothing here may import server code.

// Sign In with LinkedIn (OpenID Connect) and Share on LinkedIn
export const LINKEDIN_PERSON_SCOPES = ["openid", "profile", "w_member_social"];
// Community Management API, after LinkedIn's review
export const LINKEDIN_ORGANIZATION_SCOPES = ["w_organization_social", "r_organization_admin"];

// LinkedIn's versioned REST API: "YYYYMM". LinkedIn supports each version
// for about a year; LINKEDIN_API_VERSION on the server overrides it.
export const LINKEDIN_DEFAULT_API_VERSION = "202610";

// The most a post's text may have
export const LINKEDIN_MAX_TEXT = 3000;
