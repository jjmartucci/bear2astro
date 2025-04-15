const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");
const TurndownService = require("turndown");

// Function to slugify a string
function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .replace(/\s+/g, "-") // Replace spaces with -
    .replace(/[^\w\-]+/g, "") // Remove all non-word chars
    .replace(/\-\-+/g, "-") // Replace multiple - with single -
    .replace(/^-+/, "") // Trim - from start of text
    .replace(/-+$/, ""); // Trim - from end of text
}

const {
  ORGANIZED_BY_TAG,
  INPUT_FOLDER,
  OUTPUT_FOLDER,
  IMAGE_FOLDER,
  RELATIVE_LINK_PATH,
  RELATIVE_IMAGE_PATH,
  UNNEST_TAGS,
} = process.env;

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
    // Make sure the destination directory exists
    const destDir = path.dirname(destination);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

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
    const title =
      $('meta[name="title"]').attr("content") ||
      $("title").text().trim() ||
      "Untitled";

    // Extract the first paragraph for description
    const firstParagraph = $("p").first().text().trim() || "";
    
    // Extract the first image if available
    let firstImagePath = "";
    const firstImg = $("img").first();
    if (firstImg.length) {
      const srcPath = firstImg.attr("src");
      if (srcPath && !srcPath.startsWith("http") && !srcPath.startsWith("data:")) {
        firstImagePath = RELATIVE_IMAGE_PATH + path.basename(srcPath);
      }
    }

    // Remove the head element so it's not in the markdown output
    $("head").remove();

    // Extract hashtags from .hashtag spans
    const tags = [];
    $(".hashtag").each((i, elem) => {
      const tag = $(elem).text().trim();
      // Remove # if present and add to tags array
      if (tag) {
        let cleanTag = tag.startsWith("#") ? tag.substring(1) : tag;
        // Ignore the ORGANIZED_BY_TAG tag
        if (cleanTag !== ORGANIZED_BY_TAG) {
          // If UNNEST_TAGS is true and the tag has a parent/child format,
          // only use the child part
          if (UNNEST_TAGS === 'true' && cleanTag.includes('/')) {
            cleanTag = cleanTag.split('/').pop();
          }
          tags.push(cleanTag);
        }
      }
    });

    // Keep the h1 in the output

    // Remove the .hashtag spans from the HTML after extracting them
    $(".hashtag").remove();

    // Process links to use RELATIVE_LINK_PATH with slugified names
    $("a").each((i, elem) => {
      const href = $(elem).attr("href");
      if (href && !href.startsWith("http") && !href.startsWith("#")) {
        // It's a relative link
        if (href.endsWith(".html")) {
          // Decode the URL encoded filename before slugifying
          const decodedHref = decodeURIComponent(href);
          const baseName = path.basename(decodedHref, ".html");
          const slugifiedName = slugify(baseName);
          $(elem).attr("href", RELATIVE_LINK_PATH + slugifiedName);
        }
      }
    });

    // Process images and attachments
    const baseDir = path.dirname(htmlFilePath);
    $(
      "img, [href$='.pdf'], [href$='.doc'], [href$='.docx'], [href$='.xls'], [href$='.xlsx'], [href$='.ppt'], [href$='.pptx'], [href$='.zip']"
    ).each((i, elem) => {
      const isImage = elem.tagName === "img";
      const attrName = isImage ? "src" : "href";
      const srcPath = $(elem).attr(attrName);

      if (
        srcPath &&
        !srcPath.startsWith("http") &&
        !srcPath.startsWith("data:")
      ) {
        // It's a relative path to an image or attachment
        // Decode the URL encoded path for file system operations
        const decodedSrcPath = decodeURIComponent(srcPath);

        const absoluteSrcPath = path.isAbsolute(decodedSrcPath)
          ? decodedSrcPath
          : path.resolve(baseDir, decodedSrcPath);

        if (fs.existsSync(absoluteSrcPath)) {
          // Keep the original filename (possibly encoded) for the destination
          const fileName = path.basename(srcPath);
          // But use decoded filename for the actual file system operation
          const decodedFileName = path.basename(decodedSrcPath);
          const destPath = path.join(IMAGE_FOLDER, decodedFileName);

          // Copy the file to the images folder - using synchronous method
          try {
            fs.copyFileSync(absoluteSrcPath, destPath);
            console.log(`Copied: ${absoluteSrcPath} -> ${destPath}`);

            // Update the src/href attribute to point to the new location
            // Keep the original encoding in the path
            $(elem).attr(attrName, RELATIVE_IMAGE_PATH + fileName);
          } catch (err) {
            console.error(
              `Error copying file ${absoluteSrcPath}: ${err.message}`
            );
          }
        } else {
          console.warn(`Warning: File not found: ${absoluteSrcPath}`);
        }
      }
    });

    // Convert HTML to Markdown
    const turndownService = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      // Preserve ID attributes in the output
      headingStyle: "atx",
      codeBlockStyle: "fenced",
    });

    // Preserve ID attributes in the output
    turndownService.addRule('preserveIds', {
      filter: function(node) {
        // Apply to any element with an ID attribute
        return node.id && node.id.length > 0;
      },
      replacement: function(content, node, options) {
        // If this is a heading, add the ID as an anchor
        if (node.tagName.match(/^H[1-6]$/)) {
          const level = node.tagName.charAt(1);
          const prefix = '#'.repeat(level);
          return `${prefix} ${content} {#${node.id}}\n\n`;
        }
        
        // For other elements, add the ID as an HTML attribute
        // This will be preserved in the markdown
        return `<span id="${node.id}">${content}</span>`;
      }
    });
    
    // Add custom rule for iframes and embedded content
    turndownService.addRule('iframe', {
      filter: ['iframe', 'embed', 'object'],
      replacement: function(content, node) {
        const src = node.getAttribute('src') || '';
        const width = node.getAttribute('width') || '';
        const height = node.getAttribute('height') || '';
        const title = node.getAttribute('title') || '';
        
        let attributes = [];
        if (width) attributes.push(`width="${width}"`);
        if (height) attributes.push(`height="${height}"`);
        if (title) attributes.push(`title="${title}"`);
        
        const attributeString = attributes.length > 0 ? ' ' + attributes.join(' ') : '';
        
        // Return raw HTML to be preserved in the markdown
        return '\n\n' + 
               `<iframe src="${src}"${attributeString}></iframe>` + 
               '\n\n';
      }
    });
    
    // Add custom rule for footnote references
    turndownService.addRule('footnoteReference', {
      filter: function(node) {
        // Match elements that are likely footnote references
        return (
          (node.tagName === 'A' || node.tagName === 'SUP') &&
          (node.classList.contains('footnote-ref') || 
           node.getAttribute('role') === 'doc-noteref' ||
           (node.textContent.match(/^\[\d+\]$/) && node.getAttribute('href')?.startsWith('#')))
        );
      },
      replacement: function(content, node) {
        // Get the href target
        const href = node.getAttribute('href');
        if (href && href.startsWith('#')) {
          // Preserve the link with the original ID reference
          return `<a href="${href}">${content}</a>`;
        }
        return content;
      }
    });
    
    // Add custom rule for footnotes
    turndownService.addRule('footnote', {
      filter: function(node) {
        // Match elements with class 'footnote' or role 'doc-footnote'
        return (
          node.classList && 
          (node.classList.contains('footnote') || 
           node.getAttribute('role') === 'doc-footnote')
        );
      },
      replacement: function(content, node) {
        // Preserve the ID for footnote targets
        if (node.id) {
          // Extract the footnote number from the ID or content
          const idMatch = node.id.match(/\d+$/);
          const number = idMatch ? idMatch[0] : '';
          
          // Look for backref links in the footnote content
          const $ = cheerio.load(`<div>${content}</div>`);
          const backref = $('a.footnote-backref, a[rev="footnote"]').first();
          
          if (backref.length && backref.attr('href')) {
            const href = backref.attr('href');
            // Keep the backref link in the content
            return `<div id="${node.id}">${content} <a href="${href}">↩</a></div>`;
          } else {
            // If no backref found, try to create one based on common patterns
            const refId = `fnref${number}` || `footnote-ref-${node.id}`;
            return `<div id="${node.id}">${content} <a href="#${refId}">↩</a></div>`;
          }
        }
        return content;
      }
    });
    

    const markdown = turndownService.turndown($.html());

    // Create YAML front matter
    const yamlHeader = [
      "---",
      `title: "${title}"`,
      `description: "${firstParagraph}"`,
      firstImagePath ? `image: "${firstImagePath}"` : "",
      `tags: [${tags.map((tag) => `"${tag}"`).join(", ")}]`,
      `created: ${metaCreated}`,
      `modified: ${metaModified}`,
      "---",
      "",
      markdown,
    ].join("\n");

    // Generate slugified output filename
    const baseName = path.basename(htmlFilePath, path.extname(htmlFilePath));
    const slugifiedName = slugify(baseName);
    const outputFilePath = path.join(outputDir, `${slugifiedName}.md`);

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
