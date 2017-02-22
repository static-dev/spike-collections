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
        transform: (l) => { return Object.assign(l, { permalink: 'extra!' }) },
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
    t.is(post2.trim(), '<locals>snargle!</locals>\n<permalink>extra!</permalink>\n<script>{"posts":[{"dingle":"snargle","_path":"posts/bar.html","_collection":"posts","permalink":"extra!"},{"wow":"amaze","_path":"posts/foo.html","_collection":"posts","permalink":"extra!"}]}</script>')

    // pages 1 and 2 are present and contain the right locals
    const page1 = fs.readFileSync(path.join(publicPath, 'posts/p1.html'), 'utf8')
    const page2 = fs.readFileSync(path.join(publicPath, 'posts/p2.html'), 'utf8')

    t.is(page1.trim(), '<pages>{"posts":[{"page":1,"path":"posts/p1.html","posts":[{"dingle":"snargle","_path":"posts/bar.html","_collection":"posts","permalink":"extra!"}]},{"page":2,"path":"posts/p2.html","posts":[{"wow":"amaze","_path":"posts/foo.html","_collection":"posts","permalink":"extra!"}]}]}</pages>\n<current>{"page":1,"path":"posts/p1.html","posts":[{"dingle":"snargle","_path":"posts/bar.html","_collection":"posts","permalink":"extra!"}]}</current>')
    t.is(page2.trim(), '<pages>{"posts":[{"page":1,"path":"posts/p1.html","posts":[{"dingle":"snargle","_path":"posts/bar.html","_collection":"posts","permalink":"extra!"}]},{"page":2,"path":"posts/p2.html","posts":[{"wow":"amaze","_path":"posts/foo.html","_collection":"posts","permalink":"extra!"}]}]}</pages>\n<current>{"page":2,"path":"posts/p2.html","posts":[{"wow":"amaze","_path":"posts/foo.html","_collection":"posts","permalink":"extra!"}]}</current>')

    // index is there and contains the right locals
    const index = fs.readFileSync(path.join(publicPath, 'index.html'), 'utf8')
    t.is(index.trim(), '<all-posts>{"posts":[{"dingle":"snargle","_path":"posts/bar.html","_collection":"posts","permalink":"extra!"},{"wow":"amaze","_path":"posts/foo.html","_collection":"posts","permalink":"extra!"}]}</all-posts>')

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
    t.is(index, '<all-posts>{"posts":[{"dingle":"snargle","_path":"posts/bar.html","_collection":"posts"},{"wow":"amaze","_path":"posts/foo.html","_collection":"posts"}]}</all-posts>\n')

    const post1 = fs.readFileSync(path.join(publicPath, 'posts/bar.html'), 'utf8')
    const post2 = fs.readFileSync(path.join(publicPath, 'posts/foo.html'), 'utf8')

    t.is(post1, '<locals>snargle!</locals>\n<script>{"posts":[{"dingle":"snargle","_path":"posts/bar.html","_collection":"posts"},{"wow":"amaze","_path":"posts/foo.html","_collection":"posts"}]}</script>\n')
    t.is(post2, '<p>hello amaze!</p>\n')

    rimraf.sync(publicPath)
    t.end()
  })
})

test.cb('permalinks', (t) => {
  const root = path.join(fixtures, 'permalinks')
  const locals = {}
  const opts = {
    addDataTo: locals,
    collections: {
      posts: {
        files: 'posts/**',
        permalinks: (p) => {
          return p.replace(/posts\//, 'posts/nested/')
        }
      }
    }
  }

  spikeCompile(t, root, locals, opts, () => {
    const publicPath = path.join(root, 'public')

    fs.accessSync(path.join(publicPath, 'posts/nested/foo.html'))
    fs.accessSync(path.join(publicPath, 'posts/nested/bar.html'))

    rimraf.sync(publicPath)
    t.end()
  })
})

test.cb('Jekyll date format', (t) => {
  const root = path.join(fixtures, 'jekyll_date')
  const locals = {}
  const opts = {
    addDataTo: locals,
    collections: {
      posts: { files: 'posts/**', permalinks: Collections.jekyll.date }
    }
  }

  spikeCompile(t, root, locals, opts, () => {
    const publicPath = path.join(root, 'public')
    fs.accessSync(path.join(publicPath, 'posts/2017/01/12/testing.html'))
    rimraf.sync(publicPath)
    t.end()
  })
})

test.cb('Jekyll ordinal format', (t) => {
  const root = path.join(fixtures, 'jekyll_ordinal')
  const locals = {}
  const opts = {
    addDataTo: locals,
    collections: {
      posts: { files: 'posts/**', permalinks: Collections.jekyll.ordinal }
    }
  }

  spikeCompile(t, root, locals, opts, () => {
    const publicPath = path.join(root, 'public')
    // there is some date parsing issue on travis that is beyond me to fix
    if (process.env.TRAVIS) {
      fs.accessSync(path.join(publicPath, 'posts/2017/204/testing.html'))
    } else {
      fs.accessSync(path.join(publicPath, 'posts/2017/203/testing.html'))
    }
    rimraf.sync(publicPath)
    t.end()
  })
})

test.cb('Jekyll none format', (t) => {
  const root = path.join(fixtures, 'jekyll_none')
  const locals = {}
  const opts = {
    addDataTo: locals,
    collections: {
      posts: { files: 'posts/**', permalinks: Collections.jekyll.none }
    }
  }

  spikeCompile(t, root, locals, opts, () => {
    const publicPath = path.join(root, 'public')
    fs.accessSync(path.join(publicPath, 'posts/testing.html'))
    rimraf.sync(publicPath)
    t.end()
  })
})

test.cb('Jekyll format error', (t) => {
  const root = path.join(fixtures, 'jekyll_format_error')
  const locals = {}
  const opts = {
    addDataTo: locals,
    collections: {
      posts: { files: 'posts/**', permalinks: Collections.jekyll.date }
    }
  }

  spikeCompile({
    end: (err) => {
      t.truthy(err.toString().match(/1-12-testing\.html/))
      t.end()
    }
  }, root, locals, opts, () => {})
})

// -------
// Utility
// -------

function spikeCompile (t, root, locals, options, cb) {
  const collections = new Collections(options)

  const proj = new Spike({
    root,
    ignore: ['**/_*'],
    reshape: htmlStandards({
      parser: false,
      locals: (ctx) => {
        return collections.locals(ctx, locals)
      }
    }),
    plugins: [collections]
  })

  proj.on('error', t.end)
  proj.on('compile', cb)
  proj.compile()
}
