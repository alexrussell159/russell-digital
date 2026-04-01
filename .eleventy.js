module.exports = function(eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "public_html/css": "css" });
  eleventyConfig.addPassthroughCopy({ "public_html/js": "js" });
  eleventyConfig.addPassthroughCopy({ "public_html/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "public_html/components": "components" });

  eleventyConfig.addPassthroughCopy({ "public_html/about": "about" });
  eleventyConfig.addPassthroughCopy({ "public_html/services": "services" });
  eleventyConfig.addPassthroughCopy({ "public_html/pricing": "pricing" });
  eleventyConfig.addPassthroughCopy({ "public_html/case-studies": "case-studies" });
  eleventyConfig.addPassthroughCopy({ "public_html/free-strategy-call": "free-strategy-call" });

  eleventyConfig.addPassthroughCopy({ "public_html/index.html": "index.html" });

  eleventyConfig.addPassthroughCopy({ "public_html/admin": "admin" });

  eleventyConfig.addPassthroughCopy({
    "public_html/src/blog/**/*.png": "blog"
  });
  eleventyConfig.addPassthroughCopy({
    "public_html/src/blog/**/*.jpg": "blog"
  });
  eleventyConfig.addPassthroughCopy({
    "public_html/src/blog/**/*.jpeg": "blog"
  });
  eleventyConfig.addPassthroughCopy({
    "public_html/src/blog/**/*.webp": "blog"
  });
  eleventyConfig.addPassthroughCopy({
    "public_html/src/blog/**/*.gif": "blog"
  });
  eleventyConfig.addPassthroughCopy({
    "public_html/src/blog/**/*.svg": "blog"
  });

  return {
    dir: {
      input: "public_html/src",
      includes: "_includes",
      output: "_site"
    }
  };
};