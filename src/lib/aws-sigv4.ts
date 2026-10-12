import { createHash, createHmac } from "node:crypto";

// AWS Signature Version 4 for one JSON POST, which is all the Secrets
// Manager needs. Written out here so that reading a secret does not bring
// in the AWS SDK.

const sha256 = (data: string) => createHash("sha256").update(data, "utf8").digest("hex");
const hmac = (key: Buffer | string, data: string) => createHmac("sha256", key).update(data, "utf8").digest();

/**
 * The key a day's requests to one service in one region are signed with.
 */
export const deriveAwsSigningKey = (secretAccessKey: string, date: string, region: string, service: string) =>
  hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, date), region), service), "aws4_request");

export type SignedRequest = {
  url: string;
  headers: Record<string, string>;
  body: string;
};

export const signAwsJsonRequest = ({
  service,
  region,
  target,
  body,
  accessKeyId,
  secretAccessKey,
  now = new Date(),
}: {
  // "secretsmanager"
  service: string;
  region: string;
  // The operation: "secretsmanager.GetSecretValue"
  target: string;
  body: string;
  accessKeyId: string;
  secretAccessKey: string;
  now?: Date;
}): SignedRequest => {
  const host = `${service}.${region}.amazonaws.com`;
  // 20261012T180000Z
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const date = amzDate.slice(0, 8);

  const headers: Record<string, string> = {
    "content-type": "application/x-amz-json-1.1",
    host,
    "x-amz-date": amzDate,
    "x-amz-target": target,
  };

  // Sorted by name, as the signature requires
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((name) => `${name}:${headers[name]}\n`).join("");
  const signedHeaders = names.join(";");

  const canonicalRequest = ["POST", "/", "", canonicalHeaders, signedHeaders, sha256(body)].join("\n");
  const scope = `${date}/${region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonicalRequest)].join("\n");

  const signingKey = deriveAwsSigningKey(secretAccessKey, date, region, service);
  const signature = createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");

  return {
    url: `https://${host}/`,
    headers: {
      ...headers,
      authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    body,
  };
};
