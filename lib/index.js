const Util = require('spike-util')
const glob = require('glob')
const path = require('path')
const fs = require('fs')
const loader = require('reshape-loader')
const reshape = require('reshape')
const mkdirp = require('mkdirp')
const W = require('when')
const node = require('when/node')
const File = require('filewrap')
const mm = require('micromatch')

module.exports = class SpikeCollections {
  constructor (opts) {
    this.posts = opts.posts || 'posts/**'
    this.drafts = opts.drafts || 'drafts/**'
    this.addDataTo = opts.addDataTo
    this.paginate = opts.paginate
    this.permalink = opts.permalink
    this.order = opts.order || this.defaultSort
  }

  apply (compiler) {
    // - first we scan to get all the files from posts
    this.files = glob.sync(this.posts, { cwd: compiler.options.context, nodir: true, realpath: true })

    this.util = new Util(compiler.options)
    compiler.plugin('make', this.run.bind(this, compiler))

    compiler.plugin('compilation', (compilation) => {
      compilation.plugin('optimize-chunk-assets', (chunks, done) => {
        this.util.removeAssets(compilation, this.files, chunks)
        done()
      })
    })
  }

  run (compiler, compilation, done) {
    // - then we add each one to the pipeline
    const fileAdd = this.util.addFilesAsWebpackEntries(compilation, this.files)

    // - add loader alias so that frontmatter loader can be resolved
    const resolveLoader = compiler.options.resolveLoader
    if (!resolveLoader.alias) resolveLoader.alias = {}
    resolveLoader.alias.frontmatter = path.join(__dirname, 'frontmatter_loader.js')

    // - add frontmatter loader with pattern converted to regex
    compiler.options.module.loaders.push({
      test: mm.makeRe(`${compiler.options.context}/${this.posts}`),
      loader: 'reshape!frontmatter',
      extension: 'html'
    })

    fileAdd.done(() => done(), done)

    // TODO: implement this
    // - now we also need to handle pagination
    if (this.paginate) {
      // - so for this we sort the posts to ensure date order
      const sortedPosts = this.files.sort(this.order)
      // - then we grab the output path and map back through the array
      const outPaths = sortedPosts.map((p) => this.util.getOutputPath(p))
      // - then we split the array by number and reduce into an object
      //   number, the result of the paginate function called with the number,
      //   and the posts
      let currentPage = 1
      const pages = outPaths.reduce((m, p) => {
        let current = m[currentPage - 1]
        if (current.length === this.paginate.perPage) {
          currentPage++
          current = {
            page: currentPage,
            path: this.paginate.output(currentPage),
            posts: []
          }
          m.push(current)
        }
        current.posts.push(p)
      }, [{
        page: currentPage,
        path: this.paginate.output(currentPage),
        posts: []
      }])

      // - then we need to go through that array and run the template once for
      //   each item
      const tpl = fs.readFileSync(path.join(compiler.options.context, this.paginate.template), 'utf8')

      W.map(pages, (p) => {
        const mockContext = { resourcePath: p.path, addDependency: (x) => x }
        const options = loader.parseOptions.call(mockContext, compiler.options.reshape, {})

        return reshape(options)
          .process(tpl)
          .then(((locals, res) => {
            const rendered = res.output(locals)
            mkdirp.sync(path.dirname(p.path))
            return node.call(fs.writeFile.bind(fs), p.path, rendered)
          }).bind(null, Object.assign({}, options.locals, { _currentPage: p })))
          // TODO: also add next/prev
      }).done(() => { done() }, done)
    }
  }

  // grabs front matter for the given file and merges it into the locals
  locals (ctx, locals = {}) {
    const f = new File(ctx.options.context, ctx.resourcePath)
    return Object.assign(locals, ctx.options.__frontmatter[f.relative])
  }

  defaultSort (a, b) {
    return a
  }
}
