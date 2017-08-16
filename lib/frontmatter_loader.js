const yaml = require('js-yaml')
const File = require('filewrap')
const path = require('path')
const fs = require('fs')
const MarkdownIt = require('markdown-it')
const { map } = require('objectfn')
const md = new MarkdownIt()

// this loader will put out front matter, adding the props to the loader context for plugin to grab later
module.exports = function frontmatterLoader(source) {
  this.cacheable && this.cacheable()
  if (!this.options.__frontmatter) this.options.__frontmatter = {}

  // TODO: this regex doesn't handle \r\n line breaks
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n?---\s*\n?([\s\S]*)/

  // Let's find out if we need to render markdown into a layout
  // Basically, if the post is in a collection that has markdownLayout...
  let markdownLayout
  map(this.options._collectionsLayoutMap, (v, k) => {
    if (v.indexOf(this.resourcePath) > -1) markdownLayout = k
  })

  // ...and it has a markdown extension, then we need to do some extra work
  // below
  const mdExtension =
    ['.md', '.markdown', '.mdown'].indexOf(path.extname(this.resourcePath)) > -1

  // pull front matter, add to options, return just the body
  return source.replace(frontmatterRegex, (match, fm, body) => {
    const f = new File(this.options.context, this.resourcePath)
    this.options.__frontmatter[f.relative] = yaml.safeLoad(fm)

    // first, we compile the markdown and add it as _content to the front matter
    if (markdownLayout && mdExtension) {
      this.options.__frontmatter[f.relative]._content = md.render(body)
      // then we pull the source for the layout and return that instead
      // TODO: cache it
      return fs.readFileSync(markdownLayout, 'utf8')
    }
    return body
  })
}
