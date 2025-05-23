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
  IGNORE_TAGS,
  INPUT_FOLDER,
  OUTPUT_FOLDER,
  IMAGE_FOLDER,
  RELATIVE_LINK_PATH,
  RELATIVE_IMAGE_PATH,
  UNNEST_TAGS,
  IGNORE_META,
  ITALICS_TO_ALT,
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

    // Parse the IGNORE_META list
    const ignoreMetaList = IGNORE_META
      ? IGNORE_META.split(",").map((item) => item.trim().toLowerCase())
      : [];

    // Extract all meta tags and create a metadata object
    const metadata = {};

    // Process all meta tags with 'name' attribute
    $("meta[name]").each((i, elem) => {
      const name = $(elem).attr("name").toLowerCase();
      const content = $(elem).attr("content");

      // Skip meta tags in the ignore list
      if (ignoreMetaList.includes(name)) {
        return;
      }

      // If a metatag appears twice, use the second one
      metadata[name] = content;
    });

    // Ensure we have the basic required metadata
    if (!metadata.created) {
      metadata.created = new Date().toISOString();
    }

    if (!metadata.modified) {
      metadata.modified = new Date().toISOString();
    }

    // Get title from meta or title tag
    const title = metadata.title || $("title").text().trim() || "Untitled";

    // Extract the first paragraph for description if not in metadata
    const description =
      metadata.description || $("p").first().text().trim() || "";

    // Extract the first image if available
    let firstImagePath = "";
    const firstImg = $("img").first();
    if (firstImg.length) {
      const srcPath = firstImg.attr("src");
      if (
        srcPath &&
        !srcPath.startsWith("http") &&
        !srcPath.startsWith("data:")
      ) {
        firstImagePath = RELATIVE_IMAGE_PATH + path.basename(srcPath);
      }
    }

    // Remove the head element so it's not in the markdown output
    $("head").remove();

    // Parse the IGNORE_TAGS list at the beginning
    const ignoreTagsList = IGNORE_TAGS
      ? IGNORE_TAGS.split(",").map((item) => item.trim().toLowerCase())
      : [];

    // Extract hashtags from .hashtag spans
    const tags = [];
    $(".hashtag").each((i, elem) => {
      const tag = $(elem).text().trim();
      // Remove # if present and add to tags array
      if (tag) {
        let cleanTag = tag.startsWith("#") ? tag.substring(1) : tag;

        // If UNNEST_TAGS is true and the tag has a parent/child format,
        // only use the child part
        if (UNNEST_TAGS === "true" && cleanTag.includes("/")) {
          cleanTag = cleanTag.split("/").pop();
        }

        // Ignore tags in the IGNORE_TAGS list
        if (!ignoreTagsList.includes(cleanTag.toLowerCase())) {
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

    // If ITALICS_TO_ALT is true, find images followed by italic text and use the italic text as alt text

    if (ITALICS_TO_ALT === "true") {
      $("img").each((i, elem) => {
        const img = $(elem);

        // Find the next element that could be italic, looking past any br elements
        let currentNode = img[0].nextSibling;
        let nextItalic = null;

        // Loop through siblings until we find an italic element or a non-whitespace, non-br element
        while (currentNode) {
          // Skip text nodes that are just whitespace
          if (currentNode.nodeType === 3 && currentNode.nodeValue.trim() === '') {
            currentNode = currentNode.nextSibling;
            continue;
          }
          
          // If it's a br element, move to the next sibling
          if (currentNode.tagName === "br") {
            currentNode = currentNode.nextSibling;
            continue;
          }

          // Check if it's an italic element
          if (
            currentNode.tagName === "i" ||
            currentNode.tagName === "em" ||
            (currentNode.nodeType === 1 &&
              ($(currentNode).is("i") || $(currentNode).is("em")))
          ) {
            nextItalic = $(currentNode);
            break;
          }

          // If we found a non-whitespace, non-br, non-italic element, stop looking
          break;
        }

        if (nextItalic) {
          // Use the italic text as alt text for the image
          const italicText = nextItalic.text().trim();
          if (italicText) {
            img.attr("alt", italicText);
            // Remove the italic element
            nextItalic.remove();

            // Also remove any br elements and whitespace between the image and the italic text
            let brNode = img[0].nextSibling;
            while (
              brNode &&
              (brNode.tagName === "br" ||
                (brNode.nodeType === 1 && $(brNode).is("br")) ||
                (brNode.nodeType === 3 && brNode.nodeValue.trim() === ''))
            ) {
              const nextBr = brNode.nextSibling;
              $(brNode).remove();
              brNode = nextBr;
            }
          }
        }
      });
    }

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

    // Add custom rule for images to preserve alt text
    turndownService.addRule("image", {
      filter: "img",
      replacement: function (content, node) {
        const alt = node.getAttribute("alt") || "";
        const src = node.getAttribute("src") || "";
        const title = node.getAttribute("title") || "";
        const titlePart = title ? ` "${title}"` : "";
        return src ? `![${alt}](${src}${titlePart})` : "";
      },
    });

    // Add custom rule for iframes and embedded content
    turndownService.addRule("iframe", {
      filter: ["iframe", "embed", "object"],
      replacement: function (content, node) {
        const src = node.getAttribute("src") || "";
        const width = node.getAttribute("width") || "";
        const height = node.getAttribute("height") || "";
        const title = node.getAttribute("title") || "";

        let attributes = [];
        if (width) attributes.push(`width="${width}"`);
        if (height) attributes.push(`height="${height}"`);
        if (title) attributes.push(`title="${title}"`);

        const attributeString =
          attributes.length > 0 ? " " + attributes.join(" ") : "";

        // Return raw HTML to be preserved in the markdown
        return (
          "\n\n" + `<iframe src="${src}"${attributeString}></iframe>` + "\n\n"
        );
      },
    });

    const markdown = turndownService.turndown($.html());

    // Create YAML front matter
    let yamlLines = ["---"];

    // Add title and description first
    yamlLines.push(`title: "${title}"`);
    yamlLines.push(`description: "${description}"`);

    // Add image if available
    if (firstImagePath) {
      yamlLines.push(`image: "${firstImagePath}"`);
    }

    // Add tags
    yamlLines.push(`tags: [${tags.map((tag) => `"${tag}"`).join(", ")}]`);

    // Add all other metadata from meta tags
    for (const [key, value] of Object.entries(metadata)) {
      // Skip title, description, and tags as they're already added or will be added separately
      if (key !== "title" && key !== "description" && key !== "tags") {
        yamlLines.push(`${key}: ${value}`);
      }
    }

    yamlLines.push("---");
    yamlLines.push("");

    const yamlHeader = yamlLines.join("\n") + markdown;

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
