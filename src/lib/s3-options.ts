// S3-compatible storage: what the credential form (browser) and the S3
// Storage node's executor share, so nothing here may import server code.

export type S3Provider = "aws" | "r2" | "b2" | "wasabi" | "spaces" | "custom";

export type S3Credential = {
  provider: S3Provider;
  // Empty for AWS (the region decides); the service's own address otherwise
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export const S3_PROVIDERS: {
  value: S3Provider;
  label: string;
  endpoint: string;
  region: string;
  help: string;
}[] = [
  {
    value: "aws",
    label: "Amazon S3",
    endpoint: "",
    region: "us-east-1",
    help: "IAM > Users > Security credentials > Create access key. Give it access to the bucket only.",
  },
  {
    value: "r2",
    label: "Cloudflare R2",
    endpoint: "https://<ACCOUNT_ID>.r2.cloudflarestorage.com",
    region: "auto",
    help: "R2 > Manage R2 API Tokens > Create API token (Object Read & Write, for this bucket). The endpoint is shown with the token.",
  },
  {
    value: "b2",
    label: "Backblaze B2",
    endpoint: "https://s3.us-west-004.backblazeb2.com",
    region: "us-west-004",
    help: "App Keys > Add a New Application Key for the bucket. The endpoint is on the bucket's page (S3 URL).",
  },
  {
    value: "wasabi",
    label: "Wasabi",
    endpoint: "https://s3.eu-central-1.wasabisys.com",
    region: "eu-central-1",
    help: "Access Keys > Create new access key. Use the endpoint of the bucket's region.",
  },
  {
    value: "spaces",
    label: "DigitalOcean Spaces",
    endpoint: "https://fra1.digitaloceanspaces.com",
    region: "fra1",
    help: "API > Spaces Keys > Generate New Key. The endpoint is the region's, without the bucket name.",
  },
  {
    value: "custom",
    label: "Other S3-compatible (MinIO...)",
    endpoint: "https://minio.example.com",
    region: "us-east-1",
    help: "Any service that speaks the S3 API. On a self-hosted server, a MinIO on your own network has to be on PRIVATE_NETWORK_ALLOWLIST.",
  },
];

export const isS3Provider = (value: unknown): value is S3Provider =>
  S3_PROVIDERS.some((provider) => provider.value === value);

/**
 * The stored credential, or what is wrong with it. The endpoint has to be
 * https: the requests are signed with the secret key.
 */
export const readS3Credential = (value: unknown): S3Credential => {
  const stored = (value ?? {}) as Partial<S3Credential>;
  const provider = isS3Provider(stored.provider) ? stored.provider : "aws";
  const endpoint = String(stored.endpoint ?? "").trim().replace(/\/+$/, "");
  const region = String(stored.region ?? "").trim() || (provider === "r2" ? "auto" : "us-east-1");
  const accessKeyId = String(stored.accessKeyId ?? "").trim();
  const secretAccessKey = String(stored.secretAccessKey ?? "").trim();

  if (!accessKeyId || !secretAccessKey) throw new Error("the access key ID and secret access key are required");
  if (provider !== "aws" && !endpoint) throw new Error("the endpoint is required for this provider");
  if (endpoint) {
    // Before parsing: "<ACCOUNT_ID>" is not even an address
    if (/[<>]/.test(endpoint)) throw new Error("replace the <ACCOUNT_ID> placeholder in the endpoint");
    let url: URL;
    try {
      url = new URL(endpoint);
    } catch {
      throw new Error("the endpoint must be an address such as https://<account>.r2.cloudflarestorage.com");
    }
    if (url.protocol !== "https:") throw new Error("the endpoint must start with https://");
    if (url.username || url.password || url.search || url.hash) throw new Error("the endpoint must be a plain address");
  }
  if (!/^[a-z0-9-]{2,40}$/i.test(region)) throw new Error("the region is not valid");

  return { provider, endpoint, region, accessKeyId, secretAccessKey };
};

// Bucket names: S3's rules (lower case, digits, dots, hyphens)
export const isBucketName = (value: string) => /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(value) && !value.includes("..");

// A temporary link works for at most 7 days (S3's limit for signed links)
export const MAX_LINK_MINUTES = 7 * 24 * 60;
export const DEFAULT_LINK_MINUTES = 60;
