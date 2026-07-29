import { createSign } from "node:crypto";
import process from "node:process";

const DEFAULT_SITE_URL = "https://russelldigitalads.com/";
const DEFAULT_SITEMAP_URL = "https://russelldigitalads.com/sitemap.xml";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/webmasters";

function base64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function normalizePrivateKey(value) {
  return String(value || "").replace(/\\n/g, "\n");
}

function createJwt({ clientEmail, privateKey }) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(JSON.stringify({
    iss: clientEmail,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600
  }));
  const unsigned = `${header}.${claim}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(privateKey, "base64");
  return `${unsigned}.${signature.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")}`;
}

async function getAccessToken(credentials) {
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: createJwt(credentials)
  });

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Google OAuth token request failed: ${response.status} ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

async function submitSitemap({ siteUrl, sitemapUrl, accessToken }) {
  const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/sitemaps/${encodeURIComponent(sitemapUrl)}`;
  const response = await fetch(endpoint, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Search Console sitemap submission failed: ${response.status} ${text}`);
  }
}

async function main() {
  const clientEmail = process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL;
  const privateKey = normalizePrivateKey(process.env.GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY);
  const siteUrl = process.env.GSC_SITE_URL || DEFAULT_SITE_URL;
  const sitemapUrl = process.env.GSC_SITEMAP_URL || DEFAULT_SITEMAP_URL;
  const postUrl = process.env.POST_URL || "";

  if (!clientEmail || !privateKey) {
    console.log("Skipping Search Console sitemap submission because service account credentials are not configured.");
    return;
  }

  const accessToken = await getAccessToken({ clientEmail, privateKey });
  await submitSitemap({ siteUrl, sitemapUrl, accessToken });
  console.log(`Submitted sitemap to Google Search Console: ${sitemapUrl}`);
  if (postUrl) console.log(`New blog URL included in sitemap: ${postUrl}`);
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
