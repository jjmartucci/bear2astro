# Bear2Astro

I use [Bear](https://bear.app) as a note taking app, and I use [Astro](https://astro.build) to generate my website. When working on a "digital garden" I wanted to be able to export from Bear to my Astro markdown folder without storing YAML frontmatter in the notes themselves, which I find cumbersome and annoying. So this script takes Bear notes that have been exported as HTML files and converts them to YAML with frontmatter with these conventions:

```
---
title: The title of your Bear note
description: The first paragraph from the note.
tags: An array of tags appended to the Bear note which will be removed from the final output of the Markdown.
image: If the note has images, this will put the path to the final output destiniation of the first image here. Great for post previews.
created: Note created date.
modified: Note modified date.
---
```

**NOTE!**
Any metadata you _do_ add in your Bear note will also be included in the YAML, so if there's something that isn't easily captured by the above, you can add it.

## How to use this
1. Rename `.env.sample` to `.env`. It's heavily commented, update the variables as necessary.
2. Take the notes in Bear that you want to use on your website and export them as HTML with "Export attachments" and "Convert note links to HTML links" selected.
3. Run `npm run convert`


## Notes
"Hey, can't I just export from Bear to Markdown?"
You _can_, what this script does is avoids having to append YAML to your files for a lot of fields that can be derived from the note content itself.
