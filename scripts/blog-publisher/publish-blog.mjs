import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const TIME_ZONE = "America/Chicago";
const SITE_URL = "https://russelldigitalads.com";
const MIN_WORDS = Number(process.env.BLOG_MIN_WORDS || 900);
const MODEL = process.env.OPENAI_MODEL || "gpt-5-mini";
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const force = args.has("--force");

function group(name, fn) {
  console.log(`::group::${name}`);
  try {
    return fn();
  } finally {
    console.log("::endgroup::");
  }
}

function read(relativePath) {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

function unixPath(value) {
  return value.split(path.sep).join("/");
}

function stripHtml(value) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\{[%{][\s\S]*?[%}]\}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 110)
    .replace(/-+$/g, "");
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(the|and|or|for|with|your|you|how|what|why|when|to|of|in|a|an|is|are|on|by|from)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(value) {
  return new Set(normalize(value).split(" ").filter(Boolean));
}

function jaccard(a, b) {
  const setA = tokenSet(a);
  const setB = tokenSet(b);
  if (!setA.size || !setB.size) return 0;
  let overlap = 0;
  for (const token of setA) {
    if (setB.has(token)) overlap += 1;
  }
  return overlap / new Set([...setA, ...setB]).size;
}

function parseFrontMatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return null;
  const lines = match[1].split(/\r?\n/);
  const data = {};
  let key = null;

  for (const line of lines) {
    const keyMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (keyMatch) {
      key = keyMatch[1];
      let value = keyMatch[2] || "";
      value = value.replace(/^["']|["']$/g, "");
      data[key] = value;
      continue;
    }

    const listMatch = line.match(/^\s*-\s*(.+)$/);
    if (listMatch && key) {
      if (!Array.isArray(data[key])) data[key] = [];
      data[key].push(listMatch[1].replace(/^["']|["']$/g, ""));
      continue;
    }

    if (/^\s+/.test(line) && key && typeof data[key] === "string") {
      data[key] = `${data[key]} ${line.trim().replace(/^["']|["']$/g, "")}`.trim();
    }
  }

  const body = markdown.slice(match[0].length);
  return { data, body };
}

function listFiles(dir, predicate, files = []) {
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      listFiles(full, predicate, files);
    } else if (predicate(full)) {
      files.push(full);
    }
  }
  return files;
}

function getDecapBlogFolder() {
  const config = read("admin/config.yml");
  const collectionIndex = config.indexOf('name: "blog"');
  const relevant = collectionIndex >= 0 ? config.slice(collectionIndex) : config;
  const match = relevant.match(/folder:\s*"?([^"\r\n]+)"?/);
  if (!match) throw new Error("Could not derive Decap blog folder from admin/config.yml.");
  return match[1].trim();
}

function getExistingPosts(blogFolder) {
  const postFiles = listFiles(path.join(ROOT, blogFolder), (file) => path.basename(file) === "index.md");
  return postFiles.map((file) => {
    const markdown = readFileSync(file, "utf8");
    const parsed = parseFrontMatter(markdown);
    if (!parsed) throw new Error(`Missing front matter: ${unixPath(path.relative(ROOT, file))}`);
    const slug = path.basename(path.dirname(file));
    return {
      file,
      slug,
      url: `/blog/${slug}/`,
      title: parsed.data.title || "",
      description: parsed.data.description || "",
      body: parsed.body || "",
      wordCount: countWords(parsed.body || "")
    };
  });
}

function getInternalUrls(existingPosts) {
  const urls = new Set(["/"]);
  const sourceFiles = listFiles(path.join(ROOT, "public_html"), (file) => /\.(html|njk|md)$/i.test(file));
  const linkPattern = /href=["'](https:\/\/russelldigitalads\.com)?(\/[^"'#?]+\/?)["']/g;

  for (const file of sourceFiles) {
    const text = readFileSync(file, "utf8");
    let match;
    while ((match = linkPattern.exec(text))) {
      const urlPath = match[2];
      if (!urlPath.includes("{{") && !urlPath.match(/\.(css|js|png|jpg|jpeg|webp|gif|svg)$/i)) {
        const normalizedPath = urlPath.endsWith("/") ? urlPath : `${urlPath}/`;
        if (routeExists(normalizedPath)) urls.add(normalizedPath);
      }
    }
  }

  for (const post of existingPosts) urls.add(post.url);
  return [...urls].sort();
}

function routeExists(urlPath) {
  if (urlPath === "/") return true;
  const clean = urlPath.replace(/^\/+|\/+$/g, "");
  return (
    existsSync(path.join(ROOT, "public_html", clean, "index.html")) ||
    existsSync(path.join(ROOT, "public_html", clean)) ||
    existsSync(path.join(ROOT, "public_html/src", clean, "index.md")) ||
    existsSync(path.join(ROOT, "public_html/src", clean, "index.njk"))
  );
}

function getSiteContext(existingPosts, internalUrls) {
  const files = [
    "public_html/index.html",
    "public_html/about/index.html",
    "public_html/services/index.html",
    "public_html/pricing/index.html",
    "public_html/free-strategy-call-offer/index.html",
    "public_html/case-studies/africactn/index.html"
  ];

  const pageText = files
    .filter((file) => existsSync(path.join(ROOT, file)))
    .map((file) => `SOURCE: ${file}\n${stripHtml(read(file)).slice(0, 3500)}`)
    .join("\n\n");

  const postSamples = existingPosts
    .slice(-8)
    .map((post) => {
      const excerpt = post.body.replace(/\s+/g, " ").slice(0, 1400);
      return `TITLE: ${post.title}\nDESCRIPTION: ${post.description}\nEXCERPT: ${excerpt}`;
    })
    .join("\n\n");

  return {
    pageText,
    postSamples,
    internalUrls: internalUrls.join("\n")
  };
}

function normalizeClaim(value) {
  return String(value || "")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function getApprovedClaimTokens() {
  const sourceFiles = [
    "public_html/index.html",
    "public_html/about/index.html",
    "public_html/services/index.html",
    "public_html/pricing/index.html",
    "public_html/free-strategy-call-offer/index.html",
    "public_html/case-studies/africactn/index.html"
  ].filter((file) => existsSync(path.join(ROOT, file)));

  const claims = new Set();
  const claimPattern = /\$\s?\d[\d,]*(?:\+)?(?:\s?[-–—]\s?\$\s?\d[\d,]*(?:\+)?)?(?:\s?\/\s?(?:month|mo|hour))?|\d+(?:\.\d+)?\s?%|\d+\s?[-–—]\s?\d+\s?(?:months?|days?|hours?|articles)/gi;

  for (const file of sourceFiles) {
    const text = stripHtml(read(file));
    for (const match of text.matchAll(claimPattern)) {
      claims.add(normalizeClaim(match[0]));
    }
  }

  return claims;
}

function readQueue() {
  const queuePath = path.join(ROOT, "blog-automation/topic-queue.json");
  const queue = JSON.parse(readFileSync(queuePath, "utf8").replace(/^\uFEFF/, ""));
  if (!Array.isArray(queue.pending)) throw new Error("blog-automation/topic-queue.json must contain a pending array.");
  return { queuePath, queue };
}

function readUsedTopics() {
  const file = path.join(ROOT, "blog-automation/used-topics.jsonl");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function chicagoParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23"
  });
  return Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
}

function isTopicDue(topic) {
  if (!topic.publishDate || !topic.publishTimeCT) return true;
  const now = chicagoParts();
  const nowKey = `${now.year}-${now.month}-${now.day}T${now.hour}:${now.minute}`;
  const topicKey = `${topic.publishDate}T${topic.publishTimeCT}`;
  return topicKey <= nowKey;
}

function selectTopic(queue, existingPosts, usedTopics) {
  const usedTitles = [
    ...existingPosts.map((post) => post.title),
    ...usedTopics.map((item) => item.title || item.topic)
  ].filter(Boolean);

  for (const topic of queue.pending) {
    if (!isTopicDue(topic)) continue;
    const candidate = `${topic.topic} ${topic.angle || ""}`;
    const duplicate = usedTitles.some((used) => normalize(used) === normalize(topic.topic) || jaccard(used, candidate) >= 0.62);
    if (!duplicate) return topic;
  }

  throw new Error("No safe due topics remain in blog-automation/topic-queue.json.");
}

function countWords(markdown) {
  return (markdown.match(/\b[\w'-]+\b/g) || []).length;
}

function markdownLinks(markdown) {
  return [...markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1].trim());
}

function extractResponseText(data) {
  if (typeof data.output_text === "string") return data.output_text;
  const chunks = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (content.text) chunks.push(content.text);
    }
  }
  return chunks.join("\n");
}

function parseJsonOutput(text) {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  return JSON.parse(trimmed);
}

function chicagoTimestamp(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "longOffset"
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const offset = (parts.timeZoneName || "GMT-05:00").replace("GMT", "");
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.000${offset}`;
}

function shouldRunNow() {
  if (force || process.env.GITHUB_EVENT_NAME !== "schedule") return true;
  const parts = chicagoParts();
  const allowedHours = new Set(["08", "12", "16"]);
  const allowedDays = new Set(["Mon", "Tue", "Wed", "Thu", "Fri"]);
  const allowed = allowedDays.has(parts.weekday) && allowedHours.has(parts.hour) && parts.minute === "17";
  console.log(`Chicago gate: ${parts.weekday} ${parts.hour}:${parts.minute} ${TIME_ZONE}; allowed=${allowed}`);
  return allowed;
}

function yamlScalar(value) {
  return JSON.stringify(String(value).replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim());
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapTitle(title, maxLineLength = 30) {
  const words = String(title).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLineLength && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) lines.push(current);
  return lines.slice(0, 4);
}

function renderHeroImage(title) {
  const lines = wrapTitle(title);
  const lineHeight = 68;
  const startY = 330 - ((lines.length - 1) * lineHeight) / 2;
  const titleLines = lines
    .map((line, index) => {
      return `<text x="600" y="${startY + index * lineHeight}" text-anchor="middle">${escapeXml(line)}</text>`;
    })
    .join("\n      ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(title)}</title>
  <desc id="desc">Modern Russell Digital blog image with the article title centered over a clean search-growth dashboard.</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f8fafc"/>
      <stop offset="0.45" stop-color="#edf6f4"/>
      <stop offset="1" stop-color="#fff7ed"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ff5a1f"/>
      <stop offset="0.48" stop-color="#f8c32d"/>
      <stop offset="1" stop-color="#0fba9f"/>
    </linearGradient>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="28" flood-color="#151923" flood-opacity="0.12"/>
    </filter>
    <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse">
      <path d="M34 0H0V34" fill="none" stroke="#dbe3ec" stroke-width="1" opacity="0.55"/>
    </pattern>
  </defs>
  <rect width="1200" height="675" fill="url(#bg)"/>
  <rect width="1200" height="675" fill="url(#grid)" opacity="0.5"/>
  <path d="M78 517 C218 461 308 543 463 489 C620 434 674 321 862 349 C1019 373 1076 483 1200 447 L1200 675 L78 675 Z" fill="#ffffff" opacity="0.72"/>
  <rect x="72" y="90" width="268" height="158" rx="24" fill="#ffffff" filter="url(#softShadow)" opacity="0.95"/>
  <rect x="860" y="410" width="268" height="138" rx="24" fill="#ffffff" filter="url(#softShadow)" opacity="0.95"/>
  <rect x="872" y="134" width="196" height="56" rx="18" fill="#ffffff" filter="url(#softShadow)" opacity="0.92"/>
  <circle cx="112" cy="132" r="11" fill="#ff5a1f"/>
  <circle cx="144" cy="132" r="11" fill="#f8c32d"/>
  <circle cx="176" cy="132" r="11" fill="#0fba9f"/>
  <rect x="112" y="169" width="168" height="12" rx="6" fill="#d8dee8"/>
  <rect x="112" y="198" width="104" height="12" rx="6" fill="#d8dee8"/>
  <path d="M900 505 L940 472 L984 492 L1031 445 L1087 466" fill="none" stroke="#0fba9f" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="904" y="444" width="174" height="14" rx="7" fill="#d8dee8"/>
  <rect x="904" y="471" width="86" height="12" rx="6" fill="#d8dee8"/>
  <rect x="908" y="151" width="124" height="12" rx="6" fill="#151923"/>
  <rect x="908" y="172" width="82" height="8" rx="4" fill="#aeb8c8"/>
  <rect x="186" y="126" width="828" height="423" rx="34" fill="#ffffff" filter="url(#softShadow)"/>
  <rect x="230" y="170" width="740" height="9" rx="4.5" fill="url(#accent)"/>
  <text x="600" y="238" text-anchor="middle" fill="#687386" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="800">RUSSELL DIGITAL</text>
  <g fill="#111827" font-family="Arial, Helvetica, sans-serif" font-size="52" font-weight="900" letter-spacing="0">
      ${titleLines}
  </g>
  <text x="600" y="486" text-anchor="middle" fill="#5c6472" font-family="Arial, Helvetica, sans-serif" font-size="23" font-weight="700">SEO strategy for businesses that need actual leads</text>
</svg>
`;
}

function renderDecisionImage(title) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720" viewBox="0 0 1200 720" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(title)}</title>
  <desc id="desc">A clean decision framework for evaluating SEO readiness.</desc>
  <rect width="1200" height="720" rx="0" fill="#f8fafc"/>
  <rect x="96" y="82" width="1008" height="556" rx="34" fill="#ffffff"/>
  <rect x="132" y="122" width="936" height="10" rx="5" fill="#ff5a1f"/>
  <text x="160" y="194" fill="#111827" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="900">SEO is worth it when the signals line up</text>
  <text x="160" y="242" fill="#5f6b7c" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="700">Demand, visibility, conversion, and capacity all have to make sense.</text>
  <g font-family="Arial, Helvetica, sans-serif" font-weight="800">
    <rect x="160" y="314" width="196" height="142" rx="22" fill="#fff7ed"/>
    <text x="258" y="374" text-anchor="middle" fill="#111827" font-size="26">Demand</text>
    <text x="258" y="413" text-anchor="middle" fill="#ff5a1f" font-size="46">01</text>
    <rect x="386" y="314" width="196" height="142" rx="22" fill="#ecfeff"/>
    <text x="484" y="374" text-anchor="middle" fill="#111827" font-size="26">Visibility</text>
    <text x="484" y="413" text-anchor="middle" fill="#0fba9f" font-size="46">02</text>
    <rect x="612" y="314" width="196" height="142" rx="22" fill="#fefce8"/>
    <text x="710" y="374" text-anchor="middle" fill="#111827" font-size="26">Conversion</text>
    <text x="710" y="413" text-anchor="middle" fill="#d99b00" font-size="46">03</text>
    <rect x="838" y="314" width="196" height="142" rx="22" fill="#f1f5f9"/>
    <text x="936" y="374" text-anchor="middle" fill="#111827" font-size="26">Follow-up</text>
    <text x="936" y="413" text-anchor="middle" fill="#334155" font-size="46">04</text>
  </g>
  <path d="M204 536 H996" stroke="#d7dee8" stroke-width="12" stroke-linecap="round"/>
  <path d="M204 536 H742" stroke="#0fba9f" stroke-width="12" stroke-linecap="round"/>
  <circle cx="742" cy="536" r="22" fill="#0fba9f"/>
  <text x="160" y="596" fill="#111827" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="900">Do the boring checks before you buy the big strategy.</text>
</svg>
`;
}

function renderSignalImage(title) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720" viewBox="0 0 1200 720" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(title)}</title>
  <desc id="desc">A clean visual checklist for local SEO signals.</desc>
  <rect width="1200" height="720" fill="#111827"/>
  <circle cx="1030" cy="140" r="122" fill="#0fba9f" opacity="0.22"/>
  <circle cx="176" cy="592" r="160" fill="#ff5a1f" opacity="0.16"/>
  <rect x="106" y="86" width="988" height="548" rx="34" fill="#ffffff"/>
  <text x="160" y="174" fill="#111827" font-family="Arial, Helvetica, sans-serif" font-size="44" font-weight="900">${escapeXml(title)}</text>
  <g font-family="Arial, Helvetica, sans-serif">
    <rect x="162" y="238" width="876" height="66" rx="18" fill="#f8fafc"/>
    <circle cx="206" cy="271" r="14" fill="#0fba9f"/>
    <text x="238" y="281" fill="#111827" font-size="25" font-weight="800">People are already searching for the service.</text>
    <rect x="162" y="326" width="876" height="66" rx="18" fill="#f8fafc"/>
    <circle cx="206" cy="359" r="14" fill="#f8c32d"/>
    <text x="238" y="369" fill="#111827" font-size="25" font-weight="800">Your pages can turn visits into calls or forms.</text>
    <rect x="162" y="414" width="876" height="66" rx="18" fill="#f8fafc"/>
    <circle cx="206" cy="447" r="14" fill="#ff5a1f"/>
    <text x="238" y="457" fill="#111827" font-size="25" font-weight="800">Your Google Business Profile is not dead weight.</text>
    <rect x="162" y="502" width="876" height="66" rx="18" fill="#f8fafc"/>
    <circle cx="206" cy="535" r="14" fill="#111827"/>
    <text x="238" y="545" fill="#111827" font-size="25" font-weight="800">You can keep publishing and measuring without guessing.</text>
  </g>
</svg>
`;
}

function injectArticleVisuals(body, slug) {
  const firstImage = `![SEO decision framework](${slug}-decision-framework.svg)`;
  const secondImage = `![Local SEO signal checklist](${slug}-signal-checklist.svg)`;
  let nextBody = body;

  if (!nextBody.includes(firstImage)) {
    nextBody = nextBody.replace(/(\n## [^\n]+\n)/, `\n${firstImage}\n\n$1`);
  }

  if (!nextBody.includes(secondImage)) {
    const marker = "\n## What to measure";
    if (nextBody.includes(marker)) {
      nextBody = nextBody.replace(marker, `\n${secondImage}\n${marker}`);
    }
  }

  return nextBody;
}

function renderPost({ title, description, date, updated, image, body }) {
  return [
    "---",
    "layout: post.njk",
    "author: Alex Russell",
    `title: ${yamlScalar(title)}`,
    `description: ${yamlScalar(description)}`,
    `date: ${date}`,
    `updated: ${updated}`,
    "tags:",
    "  - blog",
    `image: ${image}`,
    "---",
    "",
    body.trim(),
    ""
  ].join("\n");
}

function removeUnsupportedClaimSentences(markdown, approvedClaims) {
  const bannedLanguagePattern = /\b(guarantee(?:d|s)?|#1|number one|limited spots|limited time|certified partner|official partner|proprietary AI|exclusive data)\b/i;
  const claimPattern = /\$\s?\d[\d,]*(?:\+)?(?:\s?[-–—]\s?\$\s?\d[\d,]*(?:\+)?)?(?:\s?\/\s?(?:month|mo|hour))?|\d+(?:\.\d+)?\s?%/gi;
  const hasUnsupportedClaim = (sentence) => {
    if (bannedLanguagePattern.test(sentence)) return true;
    for (const match of sentence.matchAll(claimPattern)) {
      if (!approvedClaims.has(normalizeClaim(match[0]))) return true;
    }
    return false;
  };

  return markdown
    .split(/\n{2,}/)
    .map((block) => {
      if (/^#{1,6}\s/.test(block.trim())) return block;
      const sentences = block.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) || [block];
      const kept = sentences.filter((sentence) => !hasUnsupportedClaim(sentence));
      return kept.join(" ").replace(/\s+/g, " ").trim();
    })
    .filter(Boolean)
    .join("\n\n");
}

function validationError(message, details = {}) {
  return { ok: false, message, details };
}

function validateDraft({ markdown, slug, blogFolder, existingPosts, usedTopics, internalUrls, approvedClaims }) {
  const parsed = parseFrontMatter(markdown);
  if (!parsed) return validationError("Draft is missing YAML front matter.");

  const data = parsed.data;
  const required = ["layout", "author", "title", "description", "date", "updated", "tags", "image"];
  for (const field of required) {
    if (!data[field] || (Array.isArray(data[field]) && !data[field].length)) {
      return validationError(`Missing required front matter field: ${field}`);
    }
  }

  if (data.layout !== "post.njk") return validationError("layout must be post.njk.");
  if (data.author !== "Alex Russell") return validationError("author must be Alex Russell.");
  if (!Array.isArray(data.tags) || !data.tags.includes("blog")) return validationError("tags must include blog.");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000-\d{2}:\d{2}$/.test(data.date)) {
    return validationError("date must match existing ISO offset convention.");
  }

  const targetDir = path.join(ROOT, blogFolder, slug);
  if (existsSync(targetDir)) return validationError("Slug folder already exists.", { slug });

  const normalizedTitle = normalize(data.title);
  const titleDuplicate = existingPosts.some((post) => normalize(post.title) === normalizedTitle);
  if (titleDuplicate) return validationError("Title already exists.", { title: data.title });

  const usedDuplicate = usedTopics.some((item) => normalize(item.title || item.topic) === normalizedTitle);
  if (usedDuplicate) return validationError("Title already exists in used topic record.", { title: data.title });

  const overlap = [...existingPosts, ...usedTopics].find((item) => jaccard(item.title || item.topic || "", data.title) >= 0.62);
  if (overlap) return validationError("Topic substantially overlaps an existing or used topic.", { overlap });

  const wordCount = countWords(parsed.body);
  if (wordCount < MIN_WORDS) return validationError(`Article is below the required word count of ${MIN_WORDS}.`, { wordCount });

  if (/\b(TODO|TBD|lorem ipsum|placeholder|insert\s+(quote|stat|link|image|example)|coming soon)\b/i.test(markdown)) {
    return validationError("Draft contains placeholder text.");
  }

  const paragraphs = parsed.body
    .split(/\n{2,}/)
    .map((paragraph) => normalize(paragraph))
    .filter((paragraph) => paragraph.split(" ").length >= 12);
  if (new Set(paragraphs).size !== paragraphs.length) return validationError("Draft contains duplicate paragraphs.");

  const bannedLanguage = markdown.match(/\b(guarantee(?:d|s)?|#1|number one|limited spots|limited time|certified partner|official partner|proprietary AI|exclusive data)\b/i);
  if (bannedLanguage) return validationError("Draft contains a prohibited claim pattern.", { match: bannedLanguage[0] });

  const claimPattern = /\$\s?\d[\d,]*(?:\+)?(?:\s?[-–—]\s?\$\s?\d[\d,]*(?:\+)?)?(?:\s?\/\s?(?:month|mo|hour))?|\d+(?:\.\d+)?\s?%/gi;
  for (const claim of markdown.matchAll(claimPattern)) {
    if (!approvedClaims.has(normalizeClaim(claim[0]))) {
      return validationError("Draft contains an unsupported numeric or pricing claim.", { match: claim[0] });
    }
  }

  const urlSet = new Set(internalUrls);
  const links = markdownLinks(parsed.body);
  if (!links.length) return validationError("Draft must include at least one internal link.");
  for (const link of links) {
    if (/^https?:\/\//i.test(link) && !link.startsWith(SITE_URL)) {
      return validationError("Draft contains an external link.", { link });
    }
    const internalPath = link.startsWith(SITE_URL) ? link.slice(SITE_URL.length) : link;
    const cleanPath = internalPath.split("#")[0].split("?")[0];
    const normalizedPath = cleanPath.endsWith("/") ? cleanPath : `${cleanPath}/`;
    if (!urlSet.has(normalizedPath)) return validationError("Draft contains an invalid internal link.", { link });
  }

  return { ok: true, wordCount, title: data.title, description: data.description };
}

async function generateArticle({ topic, siteContext, existingPosts, internalUrls, previousFailure }) {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set.");

  const developerPrompt = [
    "You write blog posts for Russell Digital.",
    "Use only the company and website facts supplied in the prompt.",
    "Do not invent products, prices, statistics, locations, guarantees, customer stories, laws, deadlines, certifications, or company claims.",
    "Never use rankings like #1, guaranteed-result language, or unsupported numerical claims.",
    "You may use pricing, plan names, and numeric claims only when they are explicitly included in the supplied site facts or topic brief.",
    "Match the direct, practical style of the existing Russell Digital blog samples.",
    "Write like the current posts on russelldigitalads.com/blog: plainspoken, specific, direct, occasionally blunt, and focused on what business owners actually need to know.",
    "Open with the problem in plain English, then give the honest answer quickly.",
    "Use mostly short and medium sentences. Do not stack abstract ideas together.",
    "Keep most paragraphs between one and three sentences. Avoid walls of text.",
    "Lead with the practical instruction. Add the explanation after it.",
    "Use bold-label bullets for checks, mistakes, red flags, document-style lists, or decision points.",
    "Use numbered lists only when the actions must happen in order.",
    "Do not put more than three normal paragraphs in a row without a useful heading, list, or numbered process.",
    "Repeat the main term naturally when needed instead of overusing vague pronouns.",
    "Use direct cause and effect for SEO topics: weak page -> fewer calls, missing tracking -> bad decisions, thin service pages -> weaker rankings.",
    "Allow slightly uneven section lengths. A slightly uneven article is better than a perfectly symmetrical one.",
    "Use plain observations like 'This is where businesses usually get stuck.' when they fit.",
    "Use bolded takeaways, practical bullets, red flags, and FAQ sections when they fit the topic.",
    "Avoid polished SaaS-marketing filler, inflated adjectives, em dashes, fake urgency, and generic AI-sounding phrasing.",
    "Avoid formal transitions like additionally, furthermore, in today's landscape, unlock, leverage, seamless, robust, game-changing, and tailored solutions.",
    "Use short sections with useful H2/H3 headings, conversational explanations, and concrete checks or examples that can be supported by the supplied site context.",
    "Do not copy paragraphs from the samples; learn the cadence and point of view.",
    "Return only valid JSON with keys: title, description, body.",
    "The body must be Markdown and must include useful internal links from the supplied URL inventory.",
    "Include a natural CTA based on existing site CTAs, especially booking a strategy call.",
    `Write at least ${MIN_WORDS + 100} words.`
  ].join("\n");

  const userPrompt = JSON.stringify({
    topic,
    requiredInternalUrls: internalUrls,
    existingBlogSamples: siteContext.postSamples,
    existingSiteFacts: siteContext.pageText,
    rewriteInstruction: previousFailure ? `Rewrite to fix this validation failure: ${JSON.stringify(previousFailure)}` : null
  });

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: MODEL,
      input: [
        { role: "developer", content: developerPrompt },
        { role: "user", content: userPrompt }
      ],
      max_output_tokens: 5000,
      text: {
        format: {
          type: "json_schema",
          name: "automated_blog_article",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["title", "description", "body"],
            properties: {
              title: {
                type: "string",
                minLength: 20,
                maxLength: 120
              },
              description: {
                type: "string",
                minLength: 80,
                maxLength: 180
              },
              body: {
                type: "string",
                minLength: 5000
              }
            }
          }
        }
      }
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`OpenAI Responses API failed: ${response.status} ${JSON.stringify(data)}`);
  }

  return parseJsonOutput(extractResponseText(data));
}

function writeGeneratedPost({ article, topic, blogFolder, existingPosts, usedTopics, internalUrls, approvedClaims }) {
  const timestamp = chicagoTimestamp();
  const title = String(article.title || topic.topic || "").trim();
  const description = String(article.description || "").trim();
  const slug = slugify(article.slug || title);
  const imageName = `${slug}.svg`;
  const markdown = renderPost({
    title,
    description,
    date: timestamp,
    updated: timestamp,
    image: imageName,
    body: injectArticleVisuals(removeUnsupportedClaimSentences(String(article.body || "").trim(), approvedClaims), slug)
  });

  const validation = validateDraft({ markdown, slug, blogFolder, existingPosts, usedTopics, internalUrls, approvedClaims });
  if (!validation.ok) return { ok: false, validation, markdown, slug };

  const postDir = path.join(ROOT, blogFolder, slug);
  mkdirSync(postDir, { recursive: true });
  writeFileSync(path.join(postDir, "index.md"), markdown, "utf8");
  writeFileSync(path.join(postDir, imageName), renderHeroImage(title), "utf8");
  writeFileSync(path.join(postDir, `${slug}-decision-framework.svg`), renderDecisionImage("SEO decision framework"), "utf8");
  writeFileSync(path.join(postDir, `${slug}-signal-checklist.svg`), renderSignalImage("Local SEO signal checklist"), "utf8");

  return { ok: true, slug, title, description, wordCount: validation.wordCount };
}

function removeGeneratedPost(blogFolder, slug) {
  if (!slug) return;
  const postDir = path.join(ROOT, blogFolder, slug);
  const resolved = path.resolve(postDir);
  const allowedRoot = path.resolve(path.join(ROOT, blogFolder));
  if (resolved.startsWith(`${allowedRoot}${path.sep}`) && existsSync(resolved)) {
    rmSync(resolved, { recursive: true, force: true });
  }
}

function runBuild() {
  if (process.platform === "win32") {
    execFileSync("cmd.exe", ["/d", "/s", "/c", "npm.cmd run build"], {
      cwd: ROOT,
      stdio: "inherit"
    });
    return;
  }

  execFileSync("npm", ["run", "build"], { cwd: ROOT, stdio: "inherit" });
}

function saveQueueAndHistory({ queuePath, queue, topic, result }) {
  queue.pending = queue.pending.filter((item) => item !== topic);
  writeFileSync(queuePath, `${JSON.stringify(queue, null, 2)}\n`, "utf8");

  const historyPath = path.join(ROOT, "blog-automation/used-topics.jsonl");
  const entry = {
    title: result.title,
    slug: result.slug,
    topic: topic.topic,
    publishDate: topic.publishDate || null,
    publishTimeCT: topic.publishTimeCT || null,
    sourceId: topic.sourceId || null,
    publishedAt: chicagoTimestamp(),
    source: "automated-publisher"
  };
  const existing = existsSync(historyPath) ? readFileSync(historyPath, "utf8").trimEnd() : "";
  writeFileSync(historyPath, `${existing}${existing ? "\n" : ""}${JSON.stringify(entry)}\n`, "utf8");
}

async function main() {
  if (!shouldRunNow()) {
    console.log("Skipping because this is not one of the configured America/Chicago publish times.");
    return;
  }

  const blogFolder = group("Inspect Decap and existing posts", () => {
    const folder = getDecapBlogFolder();
    console.log(`Decap blog folder: ${folder}`);
    return folder;
  });

  const existingPosts = getExistingPosts(blogFolder);
  const internalUrls = getInternalUrls(existingPosts);
  const { queuePath, queue } = readQueue();
  const usedTopics = readUsedTopics();
  const approvedClaims = getApprovedClaimTokens();

  group("Repository inventory", () => {
    console.log(`Existing posts: ${existingPosts.length}`);
    console.log(`Internal URLs: ${internalUrls.length}`);
    console.log(`Pending topics: ${queue.pending.length}`);
    console.log(`Used topic records: ${usedTopics.length}`);
    console.log(`Minimum word count: ${MIN_WORDS}`);
    console.log(`Approved site claim tokens: ${approvedClaims.size}`);
  });

  const topic = selectTopic(queue, existingPosts, usedTopics);
  console.log(`Selected topic: ${topic.topic}`);

  if (dryRun) {
    group("Dry run build", () => runBuild());
    console.log("Dry run completed without calling OpenAI or writing a post.");
    return;
  }

  const siteContext = getSiteContext(existingPosts, internalUrls);
  let lastFailure = null;
  let result = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    group(`Generate attempt ${attempt}`, () => {
      console.log(`Model: ${MODEL}`);
      if (lastFailure) console.log(`Previous validation failure: ${JSON.stringify(lastFailure)}`);
    });

    const article = await generateArticle({
      topic,
      siteContext,
      existingPosts,
      internalUrls,
      previousFailure: lastFailure
    });

    result = writeGeneratedPost({
      article,
      topic,
      blogFolder,
      existingPosts,
      usedTopics,
      internalUrls,
      approvedClaims
    });

    if (!result.ok) {
      lastFailure = result.validation;
      console.log(`Validation failed on attempt ${attempt}: ${JSON.stringify(lastFailure, null, 2)}`);
      continue;
    }

    try {
      group(`Eleventy production build attempt ${attempt}`, () => runBuild());
      break;
    } catch (error) {
      removeGeneratedPost(blogFolder, result.slug);
      lastFailure = {
        ok: false,
        message: "Eleventy production build failed.",
        details: { error: error.message }
      };
      result = null;
      console.log(`Build validation failed on attempt ${attempt}: ${JSON.stringify(lastFailure, null, 2)}`);
    }
  }

  if (!result?.ok) {
    throw new Error(`Article failed validation after rewrite attempt: ${JSON.stringify(lastFailure)}`);
  }

  saveQueueAndHistory({ queuePath, queue, topic, result });

  console.log(`Generated article: public_html/src/blog/${result.slug}/index.md`);
  console.log(`Title: ${result.title}`);
  console.log(`Word count: ${result.wordCount}`);
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
