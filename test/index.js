const path = require('path')
const fs = require('fs')
const webpack = require('webpack')
const test = require('ava')
const Spike = require('spike-core')
const rimraf = require('rimraf')
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

test.cb('pagination', (t) => {
  const root = path.join(fixtures, 'spike')
  const locals = {}
  const opts = {
    addDataTo: locals,
    collections: {
      posts: {
        files: 'posts/**',
        transform: (p) => { return { permalink: 'extra!' } },
        paginate: {
          template: 'posts/_template.html',
          perPage: 1,
          output: (i) => `posts/p${i}.html`
        }
      }
    }
  }

  spikeCompile(t, root, locals, opts, () => {
    const publicPath = path.join(root, 'public')

    // both posts are compiled in the posts folder
    const post1 = fs.readFileSync(path.join(publicPath, 'posts/foo.html'), 'utf8')
    const post2 = fs.readFileSync(path.join(publicPath, 'posts/bar.html'), 'utf8')
    t.is(post1.trim(), '<p>hello amaze!</p>')
    t.is(post2.trim(), '<locals>snargle!</locals>\n<permalink>extra!</permalink>\n<script>{"posts":[{"dingle":"snargle","permalink":"extra!","_path":"posts/bar.html"},{"wow":"amaze","permalink":"extra!","_path":"posts/foo.html"}]}</script>')

    // pages 1 and 2 are present and contain the right locals
    const page1 = fs.readFileSync(path.join(publicPath, 'posts/p1.html'), 'utf8')
    const page2 = fs.readFileSync(path.join(publicPath, 'posts/p2.html'), 'utf8')

    t.is(page1.trim(), '<pages>{"posts":[{"page":1,"path":"posts/p1.html","posts":[{"dingle":"snargle","permalink":"extra!","_path":"posts/bar.html"}]},{"page":2,"path":"posts/p2.html","posts":[{"wow":"amaze","permalink":"extra!","_path":"posts/foo.html"}]}]}</pages>\n<current>{"page":1,"path":"posts/p1.html","posts":[{"dingle":"snargle","permalink":"extra!","_path":"posts/bar.html"}]}</current>')
    t.is(page2.trim(), '<pages>{"posts":[{"page":1,"path":"posts/p1.html","posts":[{"dingle":"snargle","permalink":"extra!","_path":"posts/bar.html"}]},{"page":2,"path":"posts/p2.html","posts":[{"wow":"amaze","permalink":"extra!","_path":"posts/foo.html"}]}]}</pages>\n<current>{"page":2,"path":"posts/p2.html","posts":[{"wow":"amaze","permalink":"extra!","_path":"posts/foo.html"}]}</current>')

    // index is there and contains the right locals
    const index = fs.readFileSync(path.join(publicPath, 'index.html'), 'utf8')
    t.is(index.trim(), '<all-posts>{"posts":[{"dingle":"snargle","permalink":"extra!","_path":"posts/bar.html"},{"wow":"amaze","permalink":"extra!","_path":"posts/foo.html"}]}</all-posts>')

    rimraf.sync(publicPath)
    t.end()
  })
})

test.cb('collection without pagination', (t) => {
  const root = path.join(fixtures, 'no_pagination')
  const locals = {}
  const opts = {
    addDataTo: locals,
    collections: { posts: { files: 'posts/**' } }
  }

  spikeCompile(t, root, locals, opts, () => {
    const publicPath = path.join(root, 'public')

    const index = fs.readFileSync(path.join(publicPath, 'index.html'), 'utf8')
    t.is(index, '<all-posts>{"posts":[{"dingle":"snargle","_path":"posts/bar.html"},{"wow":"amaze","_path":"posts/foo.html"}]}</all-posts>\n')

    const post1 = fs.readFileSync(path.join(publicPath, 'posts/bar.html'), 'utf8')
    const post2 = fs.readFileSync(path.join(publicPath, 'posts/foo.html'), 'utf8')

    t.is(post1, '<locals>snargle!</locals>\n<script>{"posts":[{"dingle":"snargle","_path":"posts/bar.html"},{"wow":"amaze","_path":"posts/foo.html"}]}</script>\n')
    t.is(post2, '<p>hello amaze!</p>\n')

    rimraf.sync(publicPath)
    t.end()
  })
})

// -------
// Utility
// -------

function spikeCompile (t, root, locals, options, cb) {
  const collections = new Collections(options)

  const proj = new Spike({
    root,
    ignore: ['**/_*'],
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
  proj.on('compile', cb)
  proj.compile()
}
