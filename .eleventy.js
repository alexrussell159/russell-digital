module.exports = function(eleventyConfig) {

  eleventyConfig.addPassthroughCopy("public_html/css");
  eleventyConfig.addPassthroughCopy("public_html/js");
  eleventyConfig.addPassthroughCopy("public_html/assets");
  eleventyConfig.addPassthroughCopy("public_html/components");

  eleventyConfig.addPassthroughCopy("public_html/about");
  eleventyConfig.addPassthroughCopy("public_html/services");
  eleventyConfig.addPassthroughCopy("public_html/pricing");
  eleventyConfig.addPassthroughCopy("public_html/case-studies");
  eleventyConfig.addPassthroughCopy("public_html/free-strategy-call");

  eleventyConfig.addPassthroughCopy({ "public_html/index.html": "index.html" });
  eleventyConfig.addPassthroughCopy({ "public_html/admin": "admin" });

  // copy post-local images
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