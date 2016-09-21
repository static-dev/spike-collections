const Util = require('spike-util')
const glob = require('glob')
const path = require('path')
const fs = require('fs')
const loader = require('reshape-loader')
const reshape = require('reshape')
const keys = require('when/keys')
const File = require('filewrap')
const mm = require('micromatch')
const Joi = require('joi')
const yaml = require('js-yaml')

module.exports = class SpikeCollections {
  constructor (opts) {
    Object.assign(this, this.validate(opts))
    this._pagination = {}
  }

  validate (opts) {
    const schema = Joi.object().keys({
      // this needs to change to collections and we need to loop everything
      posts: Joi.string().default('posts/**'),
      drafts: Joi.string().default('drafts/**'),
      addDataTo: Joi.object().default({}),
      permalink: Joi.func(),
      paginate: Joi.object().keys({
        template: Joi.string().required(),
        perPage: Joi.number().default(10),
        output: Joi.func().default(x => `posts/p${x}.html`)
      })
    })
    const v = Joi.validate(opts, schema)
    if (v.error) throw v.error
    return v.value
  }

  apply (compiler) {
    this.util = new Util(compiler.options)

    // scan to get all the files from posts folder
    this.files = glob.sync(this.posts, { cwd: compiler.options.context, nodir: true, realpath: true, ignore: compiler.options.spike.ignore })

    // add each of the files to webpack's pipeline
    compiler.plugin('make', this.addCollectionFiles.bind(this, compiler))

    compiler.plugin('compilation', (compilation) => {
      // split posts into pages, resolve options/locals for each page
      compilation.plugin('normal-module-loader', (loaderContext) => {
        if (this.paginate) return this.handlePagination(compiler, loaderContext)
      })

      // remove assets from webpack's pipeline after being processed
      compilation.plugin('optimize-chunk-assets', (chunks, done) => {
        this.util.removeAssets(compilation, this.files, chunks)
        done()
      })
    })

    // write the pagination pages if necessary
    compiler.plugin('emit', (compilation, cb) => {
      this.paginate ? this.writePageFiles(compiler, compilation, cb) : cb()
    })
  }

  addCollectionFiles (compiler, compilation, done) {
    // add each collection file to the pipeline
    const fileAdd = this.util.addFilesAsWebpackEntries(compilation, this.files)

    // add loader alias so that frontmatter loader can be resolved
    const resolveLoader = compiler.options.resolveLoader
    if (!resolveLoader.alias) resolveLoader.alias = {}
    resolveLoader.alias.frontmatter = path.join(__dirname, 'frontmatter_loader.js')

    // add frontmatter loader with pattern converted to regex
    compiler.options.module.loaders.push({
      test: mm.makeRe(`${compiler.options.context}/${this.posts}`),
      loader: 'reshape!frontmatter', // TODO: this could be configured
      extension: 'html'
    })

    // We need to read the front matter out of each of these files so that it
    // can be made available to any other view.
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n?---\s*\n?(.*)/
    const postsWithFrontmatter = this.files.sort(this.order).map((p) => {
      const src = fs.readFileSync(p, 'utf8') // TODO: async this
      const fm = yaml.safeLoad(frontmatterRegex.exec(src)[1])
      return Object.assign(fm, { _path: this.util.getOutputPath(p).relative })
    })

    // Add all posts' data to locals
    this.addDataTo._posts = postsWithFrontmatter

    // and return
    fileAdd.done(() => done(), done)
  }

  handlePagination (compiler, loaderContext) {
    // Split the posts into a pages object, which groups them into pages based
    // on options.perPage
    let currentPage = 1
    const pages = this.addDataTo._posts.reduce((m, p) => {
      let current = m[currentPage - 1]
      if (current.posts.length === this.paginate.perPage) {
        currentPage++
        current = {
          page: currentPage,
          path: this.paginate.output(currentPage),
          posts: []
        }
        m.push(current)
      }
      current.posts.push(p)
      return m
    }, [{
      page: currentPage,
      path: this.paginate.output(currentPage),
      posts: []
    }])

    // add the pages to locals
    this.addDataTo._pages = pages

    // Now we can get the options for page compilation since we have the
    // loader context in this plugin hook. But this plugin hook is not async,
    // so we can't write those files yet. We'll come back in the 'emit' hook,
    // recover these options, then write the page files.
    pages.map((p, i) => {
      const locals = Object.assign({}, this.addDataTo, {
        _currentPage: p,
        next: pages[i + 1],
        prev: pages[i - 1]
      })
      this._pagination[p.path] = { loaderContext, locals }
    })
  }

  writePageFiles (compiler, compilation, done) {
    // First load up the template for pagination pages
    const tpl = fs.readFileSync(path.join(compiler.options.context, this.paginate.template), 'utf8')

    // Go through each of the pagination pages and write it out
    keys.map(this._pagination, (opts, p) => {
      const reshapeOpts = loader.parseOptions.call(opts.loaderContext, compiler.options.reshape, {})
      return reshape(reshapeOpts)
        .process(tpl)
        .then(((locals, res) => {
          const outPath = this.util.getOutputPath(p)
          const src = res.output(locals)
          compilation.assets[outPath.relative] = {
            source: () => src,
            size: () => src.length
          }
        }).bind(null, opts.locals)) // getting around the async loop issue
    }).done(() => { done() }, done)
  }

  // grabs front matter for the given file and merges it into the locals
  locals (ctx, locals = {}) {
    if (ctx.options.__frontmatter) {
      const f = new File(ctx.options.context, ctx.resourcePath)
      return Object.assign(locals, ctx.options.__frontmatter[f.relative])
    } else {
      return locals
    }
  }

  defaultSort (a, b) {
    return a
  }
}
