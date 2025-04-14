const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");
const TurndownService = require("turndown");

const INPUT_FOLDER = "./test";
const OUTPUT_FOLDER = "./out";
const IMAGE_FOLDER = "./out/images";
const RELATIVE_LINK_PATH = "/garden/plant/";
const RELATIVE_IMAGE_PATH = "/images/";

// Create output directory if it doesn't exist
if (!fs.existsSync(OUTPUT_FOLDER)) {
  fs.mkdirSync(OUTPUT_FOLDER, { recursive: true });
}

// Create images directory if it doesn't exist
if (!fs.existsSync(IMAGE_FOLDER)) {
  fs.mkdirSync(IMAGE_FOLDER, { recursive: true });
}

// Function to copy a file
function copyFile(source, destination) {
  try {
    fs.copyFileSync(source, destination);
    console.log(`Copied: ${source} -> ${destination}`);
    return true;
  } catch (err) {
    console.error(`Error copying file ${source}: ${err.message}`);
    return false;
  }
}

// Process a single HTML file
function processHtmlFile(htmlFilePath) {
  const relativePath = path.relative(INPUT_FOLDER, htmlFilePath);
  const outputDir = path.join(OUTPUT_FOLDER, path.dirname(relativePath));

  // Create output subdirectories if needed
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Read the HTML file
  fs.readFile(htmlFilePath, "utf8", (err, htmlContent) => {
    if (err) {
      console.error(`Error reading file ${htmlFilePath}: ${err.message}`);
      return;
    }

    // Load HTML content into cheerio
    const $ = cheerio.load(htmlContent);

    // Extract metadata from head if available
    const metaCreated =
      $('meta[name="created"]').attr("content") || new Date().toISOString();
    const metaModified =
      $('meta[name="modified"]').attr("content") || new Date().toISOString();

    // Remove the head element so it's not in the markdown output
    $("head").remove();

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

    // Remove the .hashtag spans from the HTML after extracting them
    $(".hashtag").remove();

    // Process links to use RELATIVE_LINK_PATH
    $("a").each((i, elem) => {
      const href = $(elem).attr("href");
      if (href && !href.startsWith("http") && !href.startsWith("#")) {
        // It's a relative link
        const linkPath = href.endsWith(".html")
          ? RELATIVE_LINK_PATH + path.basename(href, ".html")
          : href;
        $(elem).attr("href", linkPath);
      }
    });
    
    // Process images and attachments
    const baseDir = path.dirname(htmlFilePath);
    $("img, [href$='.pdf'], [href$='.doc'], [href$='.docx'], [href$='.xls'], [href$='.xlsx'], [href$='.ppt'], [href$='.pptx'], [href$='.zip']").each((i, elem) => {
      const isImage = elem.tagName === 'img';
      const attrName = isImage ? 'src' : 'href';
      const srcPath = $(elem).attr(attrName);
      
      if (srcPath && !srcPath.startsWith("http") && !srcPath.startsWith("data:")) {
        // It's a relative path to an image or attachment
        const absoluteSrcPath = path.resolve(baseDir, srcPath);
        
        if (fs.existsSync(absoluteSrcPath)) {
          const fileName = path.basename(srcPath);
          const destPath = path.join(IMAGE_FOLDER, fileName);
          
          // Copy the file to the images folder
          copyFile(absoluteSrcPath, destPath);
          
          // Update the src/href attribute to point to the new location
          $(elem).attr(attrName, RELATIVE_IMAGE_PATH + fileName);
        } else {
          console.warn(`Warning: File not found: ${absoluteSrcPath}`);
        }
      }
    });

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
      `created: ${metaCreated}`,
      `modified: ${metaModified}`,
      "---",
      "",
      markdown,
    ].join("\n");

    // Generate output filename
    const outputFilePath = path.join(
      outputDir,
      `${path.basename(htmlFilePath, path.extname(htmlFilePath))}.md`
    );

    // Write the Markdown file
    fs.writeFile(outputFilePath, yamlHeader, "utf8", (err) => {
      if (err) {
        console.error(`Error writing file ${outputFilePath}: ${err.message}`);
        return;
      }
      console.log(`Converted ${htmlFilePath} to ${outputFilePath}`);
    });
  });
}

// Check if a specific file was provided as an argument
if (process.argv.length >= 3) {
  const htmlFilePath = process.argv[2];
  if (fs.existsSync(htmlFilePath) && htmlFilePath.endsWith(".html")) {
    processHtmlFile(htmlFilePath);
  } else {
    console.error(`File not found or not an HTML file: ${htmlFilePath}`);
  }
} else {
  // Process all HTML files in the INPUT_FOLDER
  console.log(`Processing all HTML files in ${INPUT_FOLDER}...`);

  // Function to recursively find all HTML files
  function findHtmlFiles(dir) {
    let results = [];
    const files = fs.readdirSync(dir);

    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        // Recursively search directories
        results = results.concat(findHtmlFiles(filePath));
      } else if (file.endsWith(".html")) {
        results.push(filePath);
      }
    }

    return results;
  }

  try {
    const htmlFiles = findHtmlFiles(INPUT_FOLDER);

    if (htmlFiles.length === 0) {
      console.log(`No HTML files found in ${INPUT_FOLDER}`);
    } else {
      console.log(`Found ${htmlFiles.length} HTML files to process`);
      htmlFiles.forEach(processHtmlFile);
    }
  } catch (err) {
    console.error(`Error reading directory ${INPUT_FOLDER}: ${err.message}`);
  }
}
