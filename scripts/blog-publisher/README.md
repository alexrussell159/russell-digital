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

`blog:publish` is used by GitHub Actions. Scheduled runs are gated by the
America/Chicago timezone so publishing happens only at 8:17 AM, 12:17 PM, and
4:17 PM on weekdays.

## GitHub Settings

Add `OPENAI_API_KEY` as a GitHub Actions secret. Do not commit API keys.

Optionally set repository variable `OPENAI_BLOG_MODEL`; otherwise the workflow
uses `gpt-5-mini`.
