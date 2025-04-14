const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");
const TurndownService = require("turndown");

const INPUT_FOLDER = "./test";
const OUTPUT_FOLDER = "./out";

// Check if a filename was provided
if (process.argv.length < 3) {
  console.error("Usage: node convert.js <htmlfile>");
  process.exit(1);
}

// Get the HTML file path from command line arguments
const htmlFilePath = process.argv[2];

// Read the HTML file
fs.readFile(htmlFilePath, "utf8", (err, htmlContent) => {
  if (err) {
    console.error(`Error reading file: ${err.message}`);
    process.exit(1);
  }

  // Load HTML content into cheerio
  const $ = cheerio.load(htmlContent);

  // Extract title from h1
  const title = $("h1").first().text().trim() || "Untitled";

  // Extract hashtags from .hashtag spans
  const tags = [];
  $(".hashtag").each((i, elem) => {
    const tag = $(elem).text().trim();
    // Remove # if present and add to tags array
    if (tag) {
      tags.push(tag.startsWith("#") ? tag.substring(1) : tag);
    }
  });

  // Remove the h1 from the HTML as it will be in the YAML header
  $("h1").first().remove();

  // Convert HTML to Markdown
  const turndownService = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
  });

  const markdown = turndownService.turndown($.html());

  // Create YAML front matter
  const yamlHeader = [
    "---",
    `title: "${title}"`,
    `tags: [${tags.map((tag) => `"${tag}"`).join(", ")}]`,
    "---",
    "",
    markdown,
  ].join("\n");

  // Generate output filename
  const outputFilePath = path.join(
    path.dirname(htmlFilePath),
    `${path.basename(htmlFilePath, path.extname(htmlFilePath))}.md`
  );

  // Write the Markdown file
  fs.writeFile(outputFilePath, yamlHeader, "utf8", (err) => {
    if (err) {
      console.error(`Error writing file: ${err.message}`);
      process.exit(1);
    }
    console.log(`Converted ${htmlFilePath} to ${outputFilePath}`);
  });
});
