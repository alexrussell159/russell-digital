module.exports = function(eleventyConfig) {

  // Copy your existing site into output
  eleventyConfig.addPassthroughCopy("public_html/css");
  eleventyConfig.addPassthroughCopy("public_html/js");
  eleventyConfig.addPassthroughCopy("public_html/assets");
  eleventyConfig.addPassthroughCopy("public_html/components");

  eleventyConfig.addPassthroughCopy("public_html/about");
  eleventyConfig.addPassthroughCopy("public_html/services");
  eleventyConfig.addPassthroughCopy("public_html/pricing");
  eleventyConfig.addPassthroughCopy("public_html/case-studies");
  eleventyConfig.addPassthroughCopy("public_html/free-strategy-call");

  // VERY IMPORTANT → homepage
  eleventyConfig.addPassthroughCopy({ "public_html/index.html": "index.html" });

  // admin (for Decap)
  eleventyConfig.addPassthroughCopy({ "public_html/admin": "admin" });

  return {
    dir: {
      input: "public_html/src",
      includes: "_includes",
      output: "_site"
    }
  };
};