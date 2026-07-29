import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import zlib from "node:zlib";

const ROOT = process.cwd();
const TIME_ZONE = "America/Chicago";
const SITE_URL = "https://russelldigitalads.com";
const MIN_WORDS = Number(process.env.BLOG_MIN_WORDS || 650);
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

function allowedArticleInternalUrls(internalUrls) {
  return internalUrls.filter((url) => !url.toLowerCase().includes("africactn"));
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
    "public_html/free-strategy-call-offer/index.html"
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

function getWritingStyleGuide() {
  return read("blog-automation/russell-digital-article-instructions.md");
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
    "public_html/free-strategy-call-offer/index.html"
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
  return [...markdown.matchAll(/(?<!!)\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1].trim());
}

function preferredInternalUrl(internalUrls) {
  const preferred = [
    "/free-strategy-call-offer/",
    "/services/",
    "/pricing/",
    "/blog/"
  ];
  return preferred.find((url) => internalUrls.includes(url)) || internalUrls.find((url) => url !== "/") || "/";
}

function ensureInternalLink(body, internalUrls) {
  if (markdownLinks(body).length) return body;
  const url = preferredInternalUrl(internalUrls);
  return [
    body.trim(),
    "",
    "## Next step",
    "",
    `If you want a second set of eyes on the opportunity, start with a [free strategy call](${url}) and use it to pressure-test the next move.`
  ].join("\n");
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

function currentPublishSlot(date = new Date()) {
  const parts = chicagoParts(date);
  const allowedHours = new Set(["08", "12", "16"]);
  const allowedDays = new Set(["Mon", "Tue", "Wed", "Thu", "Fri"]);
  const minute = Number(parts.minute);
  if (!allowedDays.has(parts.weekday) || !allowedHours.has(parts.hour) || minute < 17 || minute > 47) {
    return null;
  }
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:17`;
}

function shouldRunNow() {
  if (force || process.env.GITHUB_EVENT_NAME !== "schedule") return true;
  const parts = chicagoParts();
  const slot = currentPublishSlot();
  const allowed = Boolean(slot);
  console.log(`Chicago gate: ${parts.weekday} ${parts.hour}:${parts.minute} ${TIME_ZONE}; slot=${slot || "none"}; allowed=${allowed}`);
  return allowed;
}

function hasPublishedSlot(usedTopics, slot) {
  if (!slot) return false;
  const [slotDate, slotTime] = slot.split("T");
  const slotHour = slotTime.slice(0, 2);
  return usedTopics.some((item) => {
    if (item.publishSlotCT === slot) return true;
    const publishedAt = String(item.publishedAt || "");
    if (!publishedAt.startsWith(`${slotDate}T${slotHour}:`)) return false;
    const minute = Number(publishedAt.slice(14, 16));
    return Number.isFinite(minute) && minute >= 17 && minute <= 47;
  });
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
  <text x="600" y="238" text-anchor="middle" fill="#687386" font-family="Poppins, sans-serif" font-size="22" font-weight="800">RUSSELL DIGITAL</text>
  <g fill="#111827" font-family="Poppins, sans-serif" font-size="52" font-weight="900" letter-spacing="0">
      ${titleLines}
  </g>
  <text x="600" y="486" text-anchor="middle" fill="#5c6472" font-family="Poppins, sans-serif" font-size="23" font-weight="700">SEO strategy for businesses that need actual leads</text>
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
  <text x="160" y="194" fill="#111827" font-family="Poppins, sans-serif" font-size="42" font-weight="900">SEO is worth it when the signals line up</text>
  <text x="160" y="242" fill="#5f6b7c" font-family="Poppins, sans-serif" font-size="24" font-weight="700">Demand, visibility, conversion, and capacity all have to make sense.</text>
  <g font-family="Poppins, sans-serif" font-weight="800">
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
  <text x="160" y="596" fill="#111827" font-family="Poppins, sans-serif" font-size="26" font-weight="900">Do the boring checks before you buy the big strategy.</text>
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
  <text x="160" y="174" fill="#111827" font-family="Poppins, sans-serif" font-size="44" font-weight="900">${escapeXml(title)}</text>
  <g font-family="Poppins, sans-serif">
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

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function clamp(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16)
  };
}

function mix(a, b, amount) {
  return {
    r: a.r + (b.r - a.r) * amount,
    g: a.g + (b.g - a.g) * amount,
    b: a.b + (b.b - a.b) * amount
  };
}

function createCanvas(width, height, top = "#f8fafc", bottom = "#fff7ed") {
  const pixels = new Uint8Array(width * height * 4);
  const c1 = hexToRgb(top);
  const c2 = hexToRgb(bottom);

  for (let y = 0; y < height; y += 1) {
    const t = y / Math.max(1, height - 1);
    const base = mix(c1, c2, t);
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const glow = Math.sin((x / width) * Math.PI) * 10;
      pixels[i] = clamp(base.r + glow);
      pixels[i + 1] = clamp(base.g + glow);
      pixels[i + 2] = clamp(base.b + glow);
      pixels[i + 3] = 255;
    }
  }

  return { width, height, pixels };
}

function blendPixel(canvas, x, y, color, alpha = 1) {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
  const i = (Math.floor(y) * canvas.width + Math.floor(x)) * 4;
  const amount = Math.max(0, Math.min(1, alpha * (color.a ?? 1)));
  canvas.pixels[i] = clamp(canvas.pixels[i] * (1 - amount) + color.r * amount);
  canvas.pixels[i + 1] = clamp(canvas.pixels[i + 1] * (1 - amount) + color.g * amount);
  canvas.pixels[i + 2] = clamp(canvas.pixels[i + 2] * (1 - amount) + color.b * amount);
  canvas.pixels[i + 3] = 255;
}

function drawRect(canvas, x, y, width, height, color, alpha = 1) {
  for (let yy = Math.max(0, y); yy < Math.min(canvas.height, y + height); yy += 1) {
    for (let xx = Math.max(0, x); xx < Math.min(canvas.width, x + width); xx += 1) {
      blendPixel(canvas, xx, yy, color, alpha);
    }
  }
}

function drawCircle(canvas, cx, cy, radius, color, alpha = 1) {
  const r2 = radius * radius;
  for (let y = Math.max(0, cy - radius); y < Math.min(canvas.height, cy + radius); y += 1) {
    for (let x = Math.max(0, cx - radius); x < Math.min(canvas.width, cx + radius); x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = dx * dx + dy * dy;
      if (dist <= r2) {
        const edge = Math.min(1, (r2 - dist) / (radius * 12));
        blendPixel(canvas, x, y, color, alpha * Math.max(0.18, edge));
      }
    }
  }
}

function drawLine(canvas, x1, y1, x2, y2, thickness, color, alpha = 1) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / Math.max(1, steps);
    drawCircle(canvas, x1 + dx * t, y1 + dy * t, thickness / 2, color, alpha);
  }
}

function writePng(canvas) {
  const raw = Buffer.alloc((canvas.width * 4 + 1) * canvas.height);
  for (let y = 0; y < canvas.height; y += 1) {
    const rawStart = y * (canvas.width * 4 + 1);
    raw[rawStart] = 0;
    Buffer.from(canvas.pixels.buffer, y * canvas.width * 4, canvas.width * 4).copy(raw, rawStart + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(canvas.width, 0);
  ihdr.writeUInt32BE(canvas.height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function hashString(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function renderBlogPng(variant = "hero", seedText = "") {
  const seed = hashString(`${variant}:${seedText}`);
  const palettes = [
    ["#fffaf3", "#eefaf7", "#ff5a1f", "#0fba9f", "#f8c32d", "#2563eb"],
    ["#f8fafc", "#eef2ff", "#14b8a6", "#6366f1", "#f59e0b", "#ef4444"],
    ["#f0fdfa", "#f8fafc", "#0891b2", "#22c55e", "#f97316", "#1f2937"],
    ["#fff7ed", "#f1f5f9", "#ea580c", "#2563eb", "#16a34a", "#eab308"],
    ["#f7fee7", "#eff6ff", "#65a30d", "#0284c7", "#f97316", "#7c3aed"]
  ];
  const palette = palettes[seed % palettes.length];
  const [top, bottom] = palette;
  const canvas = createCanvas(1200, 1200, top, bottom);
  const orange = { ...hexToRgb(palette[2]), a: 1 };
  const teal = { ...hexToRgb(palette[3]), a: 1 };
  const yellow = { ...hexToRgb(palette[4]), a: 1 };
  const blue = { ...hexToRgb(palette[5]), a: 1 };
  const green = { ...hexToRgb("#22c55e"), a: 1 };
  const ink = { ...hexToRgb("#111827"), a: 1 };
  const slate = { ...hexToRgb("#64748b"), a: 1 };
  const white = { ...hexToRgb("#ffffff"), a: 1 };
  const layout = (seed + { hero: 0, decision: 2, signal: 5 }[variant]) % 6;

  if (layout === 0) {
    for (let y = 160; y < 1040; y += 58) drawLine(canvas, 120, y, 1080, y, 1, slate, 0.1);
    drawRect(canvas, 135, 170, 610, 760, white, 0.9);
    drawRect(canvas, 795, 255, 260, 520, white, 0.82);
    drawRect(canvas, 185, 235, 350, 22, ink, 0.86);
    drawRect(canvas, 185, 292, 455, 16, ink, 0.46);
    drawLine(canvas, 240, 760, 370, 650, 14, teal, 0.9);
    drawLine(canvas, 370, 650, 515, 690, 14, teal, 0.9);
    drawLine(canvas, 515, 690, 670, 500, 14, teal, 0.9);
    drawCircle(canvas, 670, 500, 28, orange, 1);
    drawRect(canvas, 840, 330, 130, 18, orange, 0.82);
    drawRect(canvas, 840, 410, 170, 18, blue, 0.75);
    drawRect(canvas, 840, 490, 105, 18, teal, 0.82);
    drawCircle(canvas, 900, 675, 58, yellow, 0.82);
  } else if (layout === 1) {
    drawRect(canvas, 120, 145, 960, 870, white, 0.93);
    drawRect(canvas, 165, 205, 360, 20, ink, 0.72);
    drawRect(canvas, 165, 250, 590, 14, slate, 0.26);
    for (let i = 0; i < 3; i += 1) {
      const x = 165 + i * 285;
      drawRect(canvas, x, 330, 235, 135, [teal, blue, orange][i], 0.14);
      drawRect(canvas, x + 30, 370, 110, 16, ink, 0.48);
      drawRect(canvas, x + 30, 412, 150, 10, slate, 0.24);
    }
    drawRect(canvas, 165, 555, 580, 295, white, 0.98);
    for (let i = 0; i < 6; i += 1) {
      drawRect(canvas, 210 + i * 78, 770 - i * 34, 44, 80 + i * 34, [teal, blue, orange, yellow, green, ink][i], 0.78);
    }
    drawRect(canvas, 790, 555, 220, 295, white, 0.96);
    for (let i = 0; i < 5; i += 1) {
      drawCircle(canvas, 835, 610 + i * 46, 13, [green, blue, teal, orange, yellow][i], 1);
      drawRect(canvas, 865, 603 + i * 46, 105 + i * 11, 10, slate, 0.32);
    }
    drawLine(canvas, 165, 925, 1010, 925, 12, slate, 0.18);
    drawLine(canvas, 165, 925, 790, 925, 12, orange, 0.85);
  } else if (layout === 2) {
    drawRect(canvas, 125, 135, 950, 930, white, 0.92);
    drawRect(canvas, 125, 135, 950, 86, ink, 0.9);
    drawCircle(canvas, 185, 178, 13, orange, 1);
    drawCircle(canvas, 225, 178, 13, yellow, 1);
    drawCircle(canvas, 265, 178, 13, teal, 1);
    drawRect(canvas, 180, 285, 210, 600, blue, 0.08);
    for (let i = 0; i < 5; i += 1) {
      drawRect(canvas, 220, 335 + i * 88, 122 + i * 18, 14, ink, 0.3);
      drawRect(canvas, 220, 365 + i * 88, 92 + i * 14, 9, slate, 0.22);
    }
    drawRect(canvas, 455, 285, 500, 240, white, 0.98);
    drawRect(canvas, 490, 330, 230, 18, ink, 0.7);
    drawRect(canvas, 490, 375, 330, 12, slate, 0.26);
    drawLine(canvas, 510, 470, 605, 415, 9, teal, 0.9);
    drawLine(canvas, 605, 415, 700, 445, 9, teal, 0.9);
    drawLine(canvas, 700, 445, 860, 350, 9, teal, 0.9);
    drawCircle(canvas, 860, 350, 24, orange, 1);
    for (let i = 0; i < 4; i += 1) {
      const x = 455 + (i % 2) * 255;
      const y = 590 + Math.floor(i / 2) * 165;
      drawRect(canvas, x, y, 220, 120, [teal, orange, blue, yellow][i], 0.16);
      drawRect(canvas, x + 28, y + 34, 124, 14, ink, 0.48);
      drawRect(canvas, x + 28, y + 68, 150, 9, slate, 0.24);
    }
  } else if (layout === 3) {
    drawRect(canvas, 145, 145, 910, 910, white, 0.9);
    for (let i = 0; i < 6; i += 1) {
      const y = 245 + i * 110;
      drawRect(canvas, 215, y, 610 + (i % 3) * 55, 50, white, 0.96);
      drawCircle(canvas, 248, y + 25, 15, [green, blue, teal, orange, yellow, ink][i], 1);
      drawRect(canvas, 292, y + 16, 300 + i * 35, 11, slate, 0.35);
      drawRect(canvas, 292, y + 36, 155 + i * 30, 8, slate, 0.2);
    }
    drawRect(canvas, 780, 260, 180, 180, teal, 0.16);
    drawCircle(canvas, 870, 350, 54, teal, 0.82);
  } else if (layout === 4) {
    drawRect(canvas, 120, 160, 960, 850, white, 0.92);
    drawRect(canvas, 170, 220, 370, 22, ink, 0.72);
    drawRect(canvas, 170, 270, 520, 14, slate, 0.28);
    drawRect(canvas, 170, 350, 570, 315, white, 0.98);
    drawRect(canvas, 205, 395, 245, 18, ink, 0.66);
    drawRect(canvas, 205, 438, 420, 12, slate, 0.24);
    for (let i = 0; i < 5; i += 1) {
      drawRect(canvas, 225 + i * 82, 575 - i * 28, 46, 90 + i * 28, [orange, blue, teal, yellow, green][i], 0.82);
    }
    drawRect(canvas, 790, 350, 210, 315, blue, 0.12);
    drawCircle(canvas, 895, 455, 55, orange, 0.84);
    drawRect(canvas, 835, 565, 115, 14, ink, 0.44);
    drawRect(canvas, 835, 600, 145, 10, slate, 0.22);
    for (let i = 0; i < 3; i += 1) {
      const x = 170 + i * 285;
      drawRect(canvas, x, 740, 240, 135, [teal, orange, blue][i], 0.15);
      drawRect(canvas, x + 30, 782, 135, 14, ink, 0.44);
      drawRect(canvas, x + 30, 817, 165, 9, slate, 0.22);
    }
  } else {
    drawRect(canvas, 145, 145, 910, 910, white, 0.88);
    drawRect(canvas, 210, 230, 330, 22, ink, 0.82);
    drawRect(canvas, 210, 285, 520, 16, slate, 0.3);
    for (let i = 0; i < 4; i += 1) {
      const x = 210 + (i % 2) * 410;
      const y = 420 + Math.floor(i / 2) * 235;
      drawRect(canvas, x, y, 310, 150, [teal, orange, blue, yellow][i], 0.18);
      drawRect(canvas, x + 35, y + 44, 210, 14, ink, 0.44);
      drawRect(canvas, x + 35, y + 82, 150, 10, slate, 0.28);
    }
    drawCircle(canvas, 895, 280, 80, green, 0.72);
  }

  return writePng(canvas);
}

function imagePromptForArticle({ title, topic, variant }) {
  const base = [
    "Create a square 1:1 PNG blog image for Russell Digital, a Houston SEO and digital marketing website.",
    "Style: polished, modern, clean PNG. Use crisp composition, generous spacing, and a professional SaaS/SEO editorial look.",
    "Create real variation between images: change layout, camera angle, palette, density, and visual metaphor. Do not reuse the same line-chart card composition or the same dashboard twice.",
    "Acceptable concepts: SEO dashboard mockups, Google Search Console-style performance charts, Semrush/Ahrefs-style reports without real logos, local search result mockups, service-page wireframes, chart overlays on realistic laptop/desk scenes, or a clean title-card visual for video topics.",
    "The finished image should look like a high-quality editorial blog thumbnail, not a generic placeholder.",
    "Avoid: fake readable UI text, real third-party logos, cheesy stock-photo people, robot hands, neon cyberpunk, messy charts, blurry text, distorted typography, generic AI slop, screenshots of real websites.",
    `Article title: ${title}`,
    `Topic brief: ${topic.topic || title}`
  ];

  if (variant === "decision") {
    base.push("Image concept: a decision framework or comparison dashboard with offset cards, branching paths, audit columns, or tool-style panels.");
    base.push("Make this image visibly different from the cover image and the checklist image.");
  } else if (variant === "signal") {
    base.push("Image concept: a signal checklist, analytics board, local SEO audit workspace, GSC-style chart, map/search mockup, or measurement dashboard.");
    base.push("Make this image visibly different from the cover image and the decision image.");
  } else {
    base.push("Image concept: a strong cover image. It can be an SEO tool mockup, realistic laptop/desk scene with chart overlays, service-page mockup, or clean video-title-card style visual.");
    base.push("Make this feel like the lead image for this exact article, not a generic template.");
  }

  return base.join("\n");
}

function extractGeneratedImageBase64(data) {
  for (const item of data.output || []) {
    if (item.type === "image_generation_call" && item.result) return item.result;
    for (const content of item.content || []) {
      if (content.type === "output_image" && content.image_base64) return content.image_base64;
      if (content.b64_json) return content.b64_json;
    }
  }
  return null;
}

async function generateImagePng({ title, topic, variant }) {
  if (!process.env.OPENAI_API_KEY) return null;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_IMAGE_PROMPT_MODEL || MODEL,
      input: imagePromptForArticle({ title, topic, variant }),
      tools: [
        {
          type: "image_generation",
          model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
          size: "1024x1024",
          quality: "medium",
          output_format: "png"
        }
      ]
    })
  });

  const data = await response.json();
  if (!response.ok) {
    console.log(`Image generation failed for ${variant}: ${response.status} ${JSON.stringify(data)}`);
    return null;
  }

  const imageBase64 = extractGeneratedImageBase64(data);
  return imageBase64 ? Buffer.from(imageBase64, "base64") : null;
}

async function writeArticleImages({ postDir, slug, title, topic }) {
  const images = [
    { file: "cover.png", variant: "hero" },
    { file: "decision-framework.png", variant: "decision" },
    { file: "signal-checklist.png", variant: "signal" }
  ];

  for (const image of images) {
    const generated = await generateImagePng({ title, topic, variant: image.variant });
    writeFileSync(path.join(postDir, image.file), generated || renderBlogPng(image.variant, `${slug}:${title}:${image.file}`));
    console.log(`${generated ? "Generated" : "Rendered fallback"} image: ${image.file}`);
  }
}

function injectArticleVisuals(body, slug) {
  const firstImage = "![SEO decision framework](decision-framework.png)";
  const secondImage = "![Local SEO signal checklist](signal-checklist.png)";
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

  const forbiddenResidue = markdown.match(/\b(AfricaCTN|CTN|ECTN|BESC|BSC|FERI|BIETC|CNCA|ARCCLA|ACD|SPN|cargo tracking note|bill of lading|customs clearance|destination port|discharge port|vessel arrival|shipper|freight forwarder)\b/i);
  if (forbiddenResidue) return validationError("Draft contains AfricaCTN, shipping, or logistics residue.", { match: forbiddenResidue[0] });

  const externalDomainMention = markdown.match(/\b(?!russelldigitalads\.com\b)([a-z0-9-]+\.)+(com|net|org|io|co|ai|edu|gov)\b/i);
  if (externalDomainMention) return validationError("Draft contains an external domain mention.", { match: externalDomainMention[0] });

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
    "Use only russelldigitalads.com facts, supplied topic details, and existing Russell Digital article context. Ignore competitors and external websites entirely.",
    "Do not mention, cite, link to, quote, paraphrase, or rely on competitors or external sources.",
    "Do not use AfricaCTN shipping facts, CTN language, port language, customs language, certificate names, country-page logic, or logistics compliance framing.",
    "Do not invent products, prices, statistics, locations, guarantees, customer stories, laws, deadlines, certifications, or company claims.",
    "Never use rankings like #1, guaranteed-result language, or unsupported numerical claims.",
    "You may use pricing, plan names, and numeric claims only when they are explicitly included in the supplied site facts or topic brief.",
    getWritingStyleGuide(),
    "Use the existing Russell Digital posts only for approved company facts, internal links, and offer context. Do not copy their more salesy cadence.",
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

async function writeGeneratedPost({ article, topic, blogFolder, existingPosts, usedTopics, internalUrls, approvedClaims }) {
  const timestamp = chicagoTimestamp();
  const title = String(article.title || topic.topic || "").trim();
  const description = String(article.description || "").trim();
  const slug = slugify(article.slug || title);
  const imageName = "cover.png";
  const cleanedBody = removeUnsupportedClaimSentences(String(article.body || "").trim(), approvedClaims);
  const body = ensureInternalLink(injectArticleVisuals(cleanedBody, slug), internalUrls);
  const markdown = renderPost({
    title,
    description,
    date: timestamp,
    updated: timestamp,
    image: imageName,
    body
  });

  const validation = validateDraft({ markdown, slug, blogFolder, existingPosts, usedTopics, internalUrls, approvedClaims });
  if (!validation.ok) return { ok: false, validation, markdown, slug };

  const postDir = path.join(ROOT, blogFolder, slug);
  mkdirSync(postDir, { recursive: true });
  writeFileSync(path.join(postDir, "index.md"), markdown, "utf8");
  await writeArticleImages({ postDir, slug, title, topic });

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

async function renderImagesForExistingPost(slug) {
  const blogFolder = getDecapBlogFolder();
  const postDir = path.join(ROOT, blogFolder, slug);
  if (!existsSync(postDir)) throw new Error(`Post folder does not exist: ${postDir}`);
  const post = getExistingPosts(blogFolder).find((item) => item.slug === slug);
  await writeArticleImages({
    postDir,
    slug,
    title: post?.title || slug,
    topic: { topic: post?.title || slug }
  });
  console.log(`Rendered PNG images for ${slug}`);
}

function saveQueueAndHistory({ queuePath, queue, topic, result, publishSlotCT }) {
  queue.pending = queue.pending.filter((item) => item !== topic);
  writeFileSync(queuePath, `${JSON.stringify(queue, null, 2)}\n`, "utf8");

  const historyPath = path.join(ROOT, "blog-automation/used-topics.jsonl");
  const entry = {
    title: result.title,
    slug: result.slug,
    topic: topic.topic,
    publishDate: topic.publishDate || null,
    publishTimeCT: topic.publishTimeCT || null,
    publishSlotCT: publishSlotCT || null,
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
  const internalUrls = allowedArticleInternalUrls(getInternalUrls(existingPosts));
  const { queuePath, queue } = readQueue();
  const usedTopics = readUsedTopics();
  const approvedClaims = getApprovedClaimTokens();
  const publishSlotCT = process.env.GITHUB_EVENT_NAME === "schedule" ? currentPublishSlot() : null;
  if (hasPublishedSlot(usedTopics, publishSlotCT)) {
    console.log(`Skipping because the ${publishSlotCT} America/Chicago publish slot already has an automated post.`);
    return;
  }

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

    result = await writeGeneratedPost({
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

  saveQueueAndHistory({ queuePath, queue, topic, result, publishSlotCT });

  console.log(`Generated article: public_html/src/blog/${result.slug}/index.md`);
  console.log(`Title: ${result.title}`);
  console.log(`Word count: ${result.wordCount}`);
}

if (args.has("--render-post-images")) {
  const slug = process.argv[process.argv.indexOf("--render-post-images") + 1];
  if (!slug) {
    console.error("Missing slug after --render-post-images.");
    process.exit(1);
  }
  renderImagesForExistingPost(slug).catch((error) => {
    console.error(error.stack || error.message || error);
    process.exit(1);
  });
} else {
  main().catch((error) => {
    console.error(error.stack || error.message || error);
    process.exit(1);
  });
}
