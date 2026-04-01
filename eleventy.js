module.exports = function(eleventyConfig) {
  eleventyConfig.addPassthroughCopy("public_html/css");
  eleventyConfig.addPassthroughCopy("public_html/js");
  eleventyConfig.addPassthroughCopy("public_html/assets");

  return {
    dir: {
      input: "public_html/src",
      includes: "_includes",
      output: "_site"
    },
    markdownTemplateEngine: "njk"
  };
};