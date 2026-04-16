const sitemap = require("@quasibit/eleventy-plugin-sitemap");

module.exports = function (eleventyConfig) {
  eleventyConfig.addPlugin(sitemap, {
    sitemap: {
      hostname: "https://russelldigitalads.com"
    }
  });

  eleventyConfig.addPassthroughCopy({ "public_html/css": "css" });
  eleventyConfig.addPassthroughCopy({ "public_html/js": "js" });
  eleventyConfig.addPassthroughCopy({ "public_html/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "public_html/components": "components" });

  eleventyConfig.addPassthroughCopy({ "public_html/about": "about" });
  eleventyConfig.addPassthroughCopy({ "public_html/services": "services" });
  eleventyConfig.addPassthroughCopy({ "public_html/pricing": "pricing" });
  eleventyConfig.addPassthroughCopy({ "public_html/case-studies": "case-studies" });
  eleventyConfig.addPassthroughCopy({ "public_html/free-strategy-call": "free-strategy-call" });
  eleventyConfig.addPassthroughCopy({ "public_html/free-strategy-call-offer": "free-strategy-call-offer" });



  eleventyConfig.addPassthroughCopy({ "public_html/index.html": "index.html" });
  eleventyConfig.addPassthroughCopy({ "admin": "admin" });

  eleventyConfig.addPassthroughCopy("public_html/src/blog/**/*.png");
  eleventyConfig.addPassthroughCopy("public_html/src/blog/**/*.jpg");
  eleventyConfig.addPassthroughCopy("public_html/src/blog/**/*.jpeg");
  eleventyConfig.addPassthroughCopy("public_html/src/blog/**/*.webp");
  eleventyConfig.addPassthroughCopy("public_html/src/blog/**/*.gif");
  eleventyConfig.addPassthroughCopy("public_html/src/blog/**/*.svg");

  return {
    dir: {
      input: "public_html/src",
      includes: "_includes",
      output: "_site"
    }
  };
};
