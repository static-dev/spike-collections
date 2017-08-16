const yaml = require('js-yaml')
const File = require('filewrap')

// this loader will put out front matter, adding the props to the loader context for plugin to grab later
module.exports = function frontmatterLoader(source) {
  this.cacheable && this.cacheable()
  if (!this.options.__frontmatter) this.options.__frontmatter = {}

  // TODO: this regex doesn't handle \r\n line breaks
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n?---\s*\n?([\s\S]*)/

  // pull front matter, add to options, return just the body
  return source.replace(frontmatterRegex, (match, fm, body) => {
    const f = new File(this.options.context, this.resourcePath)
    this.options.__frontmatter[f.relative] = yaml.safeLoad(fm)
    return body
  })
}
