const path = require('path')
const fs = require('fs')
const webpack = require('webpack')
const test = require('ava')
const Spike = require('spike-core')
const Collections = require('..')
const fixtures = path.join(__dirname, 'fixtures')
const htmlStandards = require('reshape-standard')

test.cb('frontmatter loader', (t) => {
  const root = path.join(fixtures, 'frontmatter-loader')
  webpack({
    context: root,
    entry: './index.js',
    output: { path: root, filename: 'build.js' },
    resolveLoader: {
      alias: {
        frontmatter: path.join(__dirname, '../lib/frontmatter_loader.js')
      }
    },
    module: {
      loaders: [{ test: /\.html$/, loader: 'source-loader!frontmatter' }]
    }
  }, (err, stats) => {
    if (err) return t.end(err)
    const comp = stats.compilation
    if (comp.errors.length) return t.end(comp.errors)
    if (comp.warnings.length) return t.end(comp.warnings)
    const mod = comp.modules.find((m) => m.rawRequest === './index.html')
    t.truthy(comp.options.__frontmatter['index.html'].foo === 'bar')
    t.is(String(mod._src).trim(), 'hello there!')
    t.end()
  })
})

test.cb('spike integration', (t) => {
  const root = path.join(fixtures, 'spike')
  const locals = {}
  const collections = new Collections({ addDataTo: locals })

  const proj = new Spike({
    root,
    reshape: (ctx) => {
      return htmlStandards({
        parser: false,
        webpack: ctx,
        locals: collections.locals(ctx, locals)
      })
    },
    plugins: [collections]
  })

  proj.on('error', t.end)
  proj.on('compile', () => {
    const post1 = fs.readFileSync(path.join(root, 'public/posts/foo.html'), 'utf8')
    t.is(post1.trim(), '<p>hello amaze!</p>')
    t.end()
  })

  proj.compile()
})
