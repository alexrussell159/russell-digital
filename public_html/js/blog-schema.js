(function () {
  const getMeta = (name) =>
    document.querySelector(`meta[name="${name}"]`)?.getAttribute("content") || "";

  const title = getMeta("post:title") || document.title.replace(/\s*[|—-].*$/, "").trim();
  const description = getMeta("post:description") || getMeta("description");
  const image = getMeta("post:image");
  const datePublished = getMeta("post:datePublished");
  const dateModified = getMeta("post:dateModified") || datePublished;
  const author = getMeta("post:author") || "Alex Russell";
  const canonical =
    document.querySelector('link[rel="canonical"]')?.getAttribute("href") || window.location.href;

  const schema = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: title,
    description: description,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": canonical
    },
    author: {
      "@type": "Person",
      name: author
    },
    publisher: {
      "@type": "Organization",
      name: "Russell Digital",
      logo: {
        "@type": "ImageObject",
        url: "https://russelldigitalads.com/assets/russell-digital-favicon.png"
      }
    },
    datePublished: datePublished,
    dateModified: dateModified,
    image: image ? [image] : undefined
  };

  const cleanSchema = JSON.parse(JSON.stringify(schema));

  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.text = JSON.stringify(cleanSchema);
  document.head.appendChild(script);
})();