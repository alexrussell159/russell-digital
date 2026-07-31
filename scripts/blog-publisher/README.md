# Automated Blog Publisher

This publisher creates Decap-compatible Eleventy blog posts in `public_html/src/blog`.

It is designed to run from GitHub Actions on the production branch. It reads the
existing site, existing posts, and Decap CMS config before generating anything.

## Commands

```bash
npm run blog:dry-run
npm run blog:publish
```

`blog:dry-run` checks the repository shape, topic queue, internal URL inventory,
and production Eleventy build without calling OpenAI or writing a post.

`blog:publish` is used by GitHub Actions. Scheduled runs start around 3:00 AM,
8:00 AM, and 2:00 PM America/Chicago on weekdays. If GitHub Actions starts late,
the publisher still runs and publishes the next due queued topic.

## GitHub Settings

Add `OPENAI_API_KEY` as a GitHub Actions secret. Do not commit API keys.

Optionally set repository variable `OPENAI_BLOG_MODEL`; otherwise the workflow
uses `gpt-5-mini`.

## Google Search Console notification

After a generated post is committed, the workflow can resubmit
`https://russelldigitalads.com/sitemap.xml` to Google Search Console. This is
Google's supported API path for alerting Google to normal blog URLs at scale.

Add these GitHub Actions secrets:

```text
GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL
GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY
```

Create them from a Google Cloud service account with the Search Console API
enabled, then add that service account email as an owner or full user on the
Search Console property. If the Search Console property is a domain property,
set repository variable `GSC_SITE_URL` to the exact property ID, for example
`sc-domain:russelldigitalads.com`. Otherwise the workflow uses the URL-prefix
property `https://russelldigitalads.com/`.
