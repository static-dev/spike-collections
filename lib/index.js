const Util = require('spike-util')
const glob = require('glob')
const path = require('path')
const fs = require('fs')
const loader = require('reshape-loader')
const reshape = require('reshape')
const keys = require('when/keys')
const File = require('filewrap')
const Joi = require('joi')
const yaml = require('js-yaml')
const bindAll = require('es6bindall')
const {map, reduce} = require('objectfn')

module.exports = class SpikeCollections {
  constructor (opts) {
    Object.assign(this, this.validate(opts))
    this._pagination = {}
    this._transformLocals = {}
    bindAll(this, ['apply', 'locals'])
  }

  validate (opts) {
    const schema = Joi.object().keys({
      addDataTo: Joi.object().default({}),
      collections: Joi.object().pattern(/.*/, Joi.object().keys({
        files: Joi.string(),
        transform: Joi.func(),
        paginate: Joi.object().keys({
          template: Joi.string().required(),
          output: Joi.func().required(),
          perPage: Joi.number().default(10)
        })
      }).default({ posts: { files: 'posts/**' } }))
    })
    const v = Joi.validate(opts, schema)
    if (v.error) throw v.error
    return v.value
  }

  apply (compiler) {
    this.util = new Util(compiler.options)

    // scan to get all the files from posts folders
    this.files = map(this.collections, (v) => {
      return glob.sync(v.files, {
        cwd: compiler.options.context,
        nodir: true,
        realpath: true,
        ignore: compiler.options.spike.ignore
      })
    })

    // add each of the files to webpack's pipeline
    compiler.plugin('make', this.addCollectionFiles.bind(this, compiler))

    compiler.plugin('compilation', (compilation) => {
      // split posts into pages, resolve options/locals for each page
      compilation.plugin('normal-module-loader', (loaderContext) => {
        this.handlePagination(compiler, loaderContext)
      })

      // remove assets from webpack's pipeline after being processed
      compilation.plugin('optimize-chunk-assets', (chunks, done) => {
        map(this.files, (v) => {
          this.util.removeAssets(compilation, v, chunks)
        })
        done()
      })
    })

    // write the pagination pages if necessary
    compiler.plugin('emit', (compilation, cb) => {
      this.writePageFiles(compiler, compilation, cb)
    })
  }

  addCollectionFiles (compiler, compilation, done) {
    // add each collection file to the pipeline
    const allFiles = reduce(this.files, (m, v) => m.push(...v) && m, [])
    const fileAdd = this.util.addFilesAsWebpackEntries(compilation, allFiles)

    // add loader alias so that frontmatter loader can be resolved
    const resolveLoader = compiler.options.resolveLoader
    if (!resolveLoader.alias) resolveLoader.alias = {}
    resolveLoader.alias.frontmatter = path.join(__dirname, 'frontmatter_loader.js')

    // add frontmatter loader with pattern converted to regex
    compiler.options.module.loaders.push({
      test: this.util.pathsToRegex(allFiles),
      loader: 'frontmatter', // NOTE: this *could* be configurable
      extension: 'html'
    })

    // We need to read the front matter out of each of these files so that it
    // can be made available to any other view.
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n?---\s*\n?([\s\S]*)/
    const postsWithFrontmatter = map(this.files, (v, k) => {
      return v.sort(this.order).map((p) => {
        // get the front matter
        const src = fs.readFileSync(p, 'utf8') // TODO: async this
        const fm = yaml.safeLoad(frontmatterRegex.exec(src)[1])

        // run the transform function and get those locals (if applicable)
        // save them to `this`, bc they are accessed by the locals fn later
        const transformFn = this.collections[k].transform
        const transformLocals = transformFn ? transformFn(path.basename(p)) : {}
        const relativePath = this.util.getOutputPath(p).relative
        this._transformLocals[relativePath] = transformLocals

        // Run permalinks function to get output path (if applicable)
        // TODO

        // merge all the locals, add the path, and return
        return Object.assign(fm, transformLocals, { _path: relativePath })
      })
    })

    // Add all posts' data to locals
    this.addDataTo._collections = postsWithFrontmatter

    // and return
    fileAdd.done(() => done(), done)
  }

  handlePagination (compiler, loaderContext) {
    // Grab any collections which require pagination
    const paginated = reduce(this.addDataTo._collections, (m, v, k) => {
      if (this.collections[k].paginate) m[k] = v
      return m
    }, {})

    // if there are none, we're done here
    if (paginated.length === 0) return

    // Split the posts into a pages object, which groups them into pages based
    // on options.perPage
    let currentPage = 1
    const pages = map(paginated, (v, k) => {
      const paginateSettings = this.collections[k].paginate

      return v.reduce((m, p) => {
        let current = m[currentPage - 1]
        if (current.posts.length === paginateSettings.perPage) {
          currentPage++
          current = {
            page: currentPage,
            path: paginateSettings.output(currentPage),
            posts: []
          }
          m.push(current)
        }
        current.posts.push(p)
        return m
      }, [{
        page: currentPage,
        path: paginateSettings.output(currentPage),
        posts: []
      }])
    })

    // add the pages to locals
    this.addDataTo._pages = pages

    // Now we can get the options for page compilation since we have the
    // loader context in this plugin hook. But this plugin hook is not async,
    // so we can't write those files yet. We'll come back in the 'emit' hook,
    // recover these options, then write the page files.
    map(pages, (postData, k, i) => {
      this._pagination[k] = {}
      postData.map((p, i) => {
        const locals = Object.assign({}, this.addDataTo, {
          _currentPage: p,
          next: pages[i + 1],
          prev: pages[i - 1]
        })
        this._pagination[k][p.path] = { loaderContext, locals }
      })
    })
  }

  writePageFiles (compiler, compilation, done) {
    keys.map(this.collections, (v, k) => {
      // Skip if there's no pagination
      if (!v.paginate) return

      // First load up the template for pagination pages
      const tpl = fs.readFileSync(path.join(compiler.options.context, v.paginate.template), 'utf8')

      // Go through each of the pagination pages and write it out
      return keys.map(this._pagination, (pages, _) => {
        return keys.map(pages, (opts, p) => {
          const reshapeOpts = loader.parseOptions.call(opts.loaderContext, compiler.options.reshape, {})
          return reshape(reshapeOpts)
            .process(tpl)
            .then(((locals, res) => {
              // TODO: this should pull from _path prop
              const outPath = this.util.getOutputPath(p)
              const src = res.output(locals)
              compilation.assets[outPath.relative] = {
                source: () => src,
                size: () => src.length
              }
            }).bind(null, opts.locals)) // getting around the async loop issue
        })
      })
    }).done(() => { done() }, done)
  }

  // grabs front matter for the given file and merges it into the locals
  locals (ctx, locals = {}) {
    if (ctx.options.__frontmatter) {
      const f = new File(ctx.options.context, ctx.resourcePath)
      const permalinkLocals = this._transformLocals[f.relative]
      const frontmatterLocals = ctx.options.__frontmatter[f.relative]
      return Object.assign(locals, permalinkLocals, frontmatterLocals)
    } else {
      return locals
    }
  }
}
