module.exports = function(eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "public_html/css": "css" });
  eleventyConfig.addPassthroughCopy({ "public_html/js": "js" });
  eleventyConfig.addPassthroughCopy({ "public_html/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "public_html/components": "components" });

  eleventyConfig.addPassthroughCopy({ "public_html/about": "about" });
  eleventyConfig.addPassthroughCopy({ "public_html/case-studies": "case-studies" });
  eleventyConfig.addPassthroughCopy({ "public_html/free-strategy-call": "free-strategy-call" });
  eleventyConfig.addPassthroughCopy({ "public_html/pricing": "pricing" });
  eleventyConfig.addPassthroughCopy({ "public_html/services": "services" });
  eleventyConfig.addPassthroughCopy({ "public_html/index.html": "index.html" });

  return {
    dir: {
      input: "public_html/src",
      includes: "_includes",
      output: "_site"
    }
  };
};