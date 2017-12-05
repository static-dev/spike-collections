const Util = require('spike-util')
const glob = require('glob')
const path = require('path')
const fs = require('fs')
const File = require('filewrap')
const Joi = require('joi')
const yaml = require('js-yaml')
const bindAllClass = require('es6bindall')
const bindAll = require('lodash.bindall')
const { map, reduce, filter } = require('objectfn')
const MarkdownIt = require('markdown-it')
const md = new MarkdownIt()

class SpikeCollections {
  constructor(opts) {
    Object.assign(this, this.validate(opts))
    this._pagination = {}
    this._locals = {}
    this._modifiedOutputs = []
    bindAllClass(this, ['apply', 'locals'])
  }

  validate(opts) {
    const schema = Joi.object().keys({
      addDataTo: Joi.object().default({}),
      collections: Joi.object()
        .pattern(
          /.*/,
          Joi.object().keys({
            files: Joi.string(),
            transform: Joi.func(),
            permalinks: Joi.func(),
            markdownLayout: Joi.string(),
            paginate: Joi.object().keys({
              template: Joi.string().required(),
              output: Joi.func().required(),
              perPage: Joi.number().default(10)
            })
          })
        )
        .default({ posts: { files: 'posts/**' } })
    })
    const v = Joi.validate(opts, schema)
    if (v.error) throw v.error
    return v.value
  }

  apply(compiler) {
    this.util = new Util(compiler.options)

    // scan to get all the files from posts folders
    this.files = map(this.collections, v => {
      return glob.sync(v.files, {
        cwd: compiler.options.context,
        nodir: true,
        realpath: true,
        ignore: this.util.getSpikeOptions().ignore
      })
    })

    // warn for empty collections
    map(this.files, (v, k) => {
      if (v.length < 1) {
        console.warn(
          `Warning: Emtpy collection at path "${this.collections[k].files}"`
        )
        delete this.files[k]
      }
    })

    // all files as a straight array, no categories
    this.allFiles = reduce(
      this.files,
      (m, v) => {
        m.push(...v)
        return m
      },
      []
    )

    // If there are no files in collections, we have nothing to do
    if (this.allFiles.length < 1) return

    // add loader alias so that frontmatter loader can be resolved
    const resolveLoader = compiler.options.resolveLoader
    if (!resolveLoader.alias) resolveLoader.alias = {}
    resolveLoader.alias.frontmatter = path.join(
      __dirname,
      'frontmatter_loader.js'
    )

    // add frontmatter loader with pattern converted to regex
    compiler.options.module.rules.push({
      test: this.util.pathsToRegex(this.allFiles),
      use: [
        {
          loader: 'frontmatter',
          options: { _spikeExtension: 'html' } // NOTE: this *could* be configurable
        }
      ]
    })

    // build utility object used for handling markdownLayout option
    const layoutMap = reduce(
      this.collections,
      (m, v, k) => {
        if (v.markdownLayout)
          m[path.resolve(compiler.context, v.markdownLayout)] = this.files[k]
        return m
      },
      {}
    )
    compiler.options._collectionsLayoutMap = layoutMap

    // modify matcher to accommodate markdown files
    // this will only trigger for simple matcher situations, anything more
    // complex and you will have to do it yourself
    const spikeOpts = this.util.getSpikeOptions()
    const re = /\.(\w+)$/
    if (spikeOpts.matchers.html.match(re)) {
      spikeOpts.matchers.html = spikeOpts.matchers.html.replace(re, '.($1|md)')
    }

    // add process the front matter in each file, make available everywhere
    compiler.plugin('make', this.processCollectionFiles.bind(this, compiler))

    // write the pagination pages if necessary
    compiler.plugin(
      'before-loader-process',
      this.configurePaginationFiles.bind(this, compiler)
    )

    compiler.plugin('emit', (compilation, cb) => {
      // modify output if permalinks dictates
      this.util.getSpikeOptions().files.process.map(f => {
        const matchedFile = this._modifiedOutputs.find(x => x.path === f.path)
        if (matchedFile) {
          this.util.modifyOutputPath(f.path, matchedFile.out)
        }
      })
      // that's all!
      cb()
    })
  }

  processCollectionFiles(compiler, compilation, done) {
    // We need to read the front matter out of each of these files so that it
    // can be made available to any other view.
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n?---\s*\n?([\s\S]*)/
    const postsWithFrontmatter = map(this.files, (v, k) => {
      return v.map(p => {
        const relativePath = this.util.getOutputPath(p).relative

        // get the front matter
        const src = fs.readFileSync(p, 'utf8') // TODO: async this
        const fmMatch = frontmatterRegex.exec(src)
        let locals
        if (!fmMatch) {
          locals = {}
        } else {
          locals = yaml.safeLoad(fmMatch[1])
        }

        // add _path and _collection special vars
        Object.assign(locals, {
          _path: relativePath.replace(/(.*)?(\..+?$)/, `$1.html`),
          _collection: k
        })

        // Add _content special vars
        const mdExtensions = ['md', 'markdown', 'mdown'];
        if (mdExtensions.indexOf(p.split('.').pop()) > -1) {
          Object.assign(locals, {
            _content: md.render(fmMatch[2]) || null
          })
        }

        // run the transform function to replace frontmatter if it exists
        const transformFn = this.collections[k].transform
        if (transformFn) {
          locals = transformFn(locals)
        } // TODO async/promise

        // Run permalinks function to get output path (if applicable)
        const permalinksFn = this.collections[k].permalinks
        if (permalinksFn) {
          let outPath
          try {
            outPath = permalinksFn(p, locals)
          } catch (err) {
            done(err)
          }
          if (outPath) {
            locals._path = outPath.replace(/(.*)?(\..+?$)/, `$1.html`)
          }
          this._modifiedOutputs.push({ path: p, out: outPath })
        }

        // save locals to `this` so they can be accessed by locals fn later
        this._locals[relativePath] = locals

        return locals
      })
    })

    // Add all posts' data to locals
    this.addDataTo._collections = postsWithFrontmatter

    // and return
    done()
  }

  configurePaginationFiles(compiler, compilation, options) {
    // match template to its config
    let conf = filter(this.collections, v => {
      if (!v.paginate) return false
      const tplPath = path.join(compiler.options.context, v.paginate.template)
      return tplPath === options.filename
    })

    // if it's not a template, return
    const key = Object.keys(conf)[0]
    if (!key) return options

    // get any posts in the current template's collection
    conf = conf[key]
    const postsInCollection = this.addDataTo._collections[key]

    // if it is a template, we split the posts into a pages object, which
    // groups them into pages based on options.perPage
    let currentPage = 1
    const pages = postsInCollection.reduce(
      (m, p) => {
        let current = m[currentPage - 1]
        if (current.posts.length === conf.paginate.perPage) {
          currentPage++
          current = {
            page: currentPage,
            path: conf.paginate.output(currentPage),
            posts: []
          }
          m.push(current)
        }
        current.posts.push(p)
        return m
      },
      [
        {
          page: currentPage,
          path: conf.paginate.output(currentPage),
          posts: []
        }
      ]
    )

    // add the pages to locals
    if (!this.addDataTo._pages) this.addDataTo._pages = {}
    this.addDataTo._pages[key] = pages

    // finally add the custom pagination locals to the template
    options.multi = []
    pages.map((page, i) => {
      options.multi.push({
        name: page.path,
        locals: Object.assign({}, this.addDataTo, {
          _currentPage: page,
          next: pages[i + 1],
          prev: pages[i - 1]
        })
      })
    })

    return options
  }

  // grabs front matter for the given file and merges it into the locals
  locals(ctx, locals = {}) {
    if (ctx.options.__frontmatter) {
      const f = new File(ctx.options.context, ctx.resourcePath)
      const permalinkLocals = this._locals[f.relative]
      const frontmatterLocals = ctx.options.__frontmatter[f.relative]
      return Object.assign(locals, permalinkLocals, frontmatterLocals)
    } else {
      return locals
    }
  }
}

const jekyll = {
  regex: /([A-Za-z-_]+)\/(\d+)-(\d+)-(\d+)-([A-Za-z-_]+)\.(\w+)$/,
  date: function(p) {
    const m = this._checkFormat(p)
    return `${m[1]}/${m[2]}/${m[3]}/${m[4]}/${m[5]}.${m[6]}`
  },
  ordinal: function(p) {
    const m = this._checkFormat(p)
    const doy = getDOY(new Date(`${m[2]}-${m[3]}-${m[4]}`))
    return `${m[1]}/${m[2]}/${doy}/${m[5]}.${m[6]}`
  },
  none: function(p) {
    const m = this._checkFormat(p)
    return `${m[1]}/${m[5]}.${m[6]}`
  },
  _checkFormat: function(p) {
    const m = p.match(this.regex)
    if (!m || !m[1] || !m[2] || !m[3] || !m[4]) {
      throw new Error(`incorrect title formatting for post: ${p}`)
    }
    return m
  }
}

// Date utilities for the ordinal function
function isLeapYear(d) {
  const year = d.getFullYear()
  if ((year & 3) !== 0) return false
  return year % 100 !== 0 || year % 400 === 0
}

function getDOY(d) {
  var dayCount = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
  var mn = d.getMonth()
  var dn = d.getDate()
  var dayOfYear = dayCount[mn] + dn
  if (mn > 1 && isLeapYear(d)) dayOfYear++
  return dayOfYear
}

module.exports = SpikeCollections
module.exports.jekyll = bindAll(jekyll, ['date', 'ordinal', 'none'])
