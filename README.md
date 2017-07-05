# Spike Collections

[![npm](https://img.shields.io/npm/v/spike-collections.svg?style=flat-square)](https://npmjs.com/package/spike-collections)
[![tests](https://img.shields.io/travis/static-dev/spike-collections.svg?style=flat-square)](https://travis-ci.org/static-dev/spike-collections?branch=master)
[![dependencies](https://img.shields.io/david/static-dev/spike-collections.svg?style=flat-square)](https://david-dm.org/static-dev/spike-collections)
[![coverage](https://img.shields.io/coveralls/static-dev/spike-collections.svg?style=flat-square)](https://coveralls.io/r/static-dev/spike-collections?branch=master)

Some jekyll-esque features for spike

> **Note:** This project is in early development, and versioning is a little different. [Read this](http://markup.im/#q4_cRZ1Q) for more details.

### Why should you care?

Hi there! Coming from jekyll to check this out? You've found your happy place. This plugin adds more or less all the essential features from jekyll to spike, giving you the capability to use front matter, date format posts, and paginate. If you are working on a small blog, this is a great plugin for you. And if you're working on a large blog, it's still great because you can use hard-source cacheing to produce incremental builds and still have lightning fast compile times.

### Installation

Install with: `npm install spike-collections -S`

> **Note:** This project is compatible with node v6+ only

Add to your spike project as such:

```js
const Collections = require('spike-collections')
const htmlStandards = require('reshape-standard')

const locals = {}
const collections = new Collections({ addDataTo: locals })

module.exports = {
  // your config here...
  reshape: htmlStandards({
    locals: (ctx) => collections.locals(ctx, locals)
  }),
  plugins: [collections]
}
```

> **NOTE:** Because of [an unfortunate webpack issue](https://github.com/webpack/webpack/issues/2515), you cannot use the globally installed spike CLI with this plugin. Instead, you must install spike locally (`npm i spike -S`), then execute that version. Typically adding an npm script that runs `spike watch` is the best approach.

This default configuration will look for a folder called `posts` and compile all the content into that folder in the same way that jekyll does. You can also customize your collections. For example, the default config really resolves to this:

```js
const collections = new Collections({
  addDataTo: locals,
  collections: {
    posts: { files: 'posts/**' }
  }
})
```

So you can rename your collection, put it in a different folder, add multiple other collections, etc. Just add the name of the collection as the key, and a globstar string as the value.

Note that this plugin interacts with your locals in two separate places. First, it takes the entire object in the `addDataTo` param, through which it adds all your posts to be accessible to any page in your app. Second, it uses the `collections.locals` function inside the reshape configuration in order to be able to add local variables which vary per-post, like those in the frontmatter, the date, etc.

See [options](#options) for more detail on further configuring spike-collections.

### Usage

To get started, just make a `posts` folder (or another name, but adjust the `collections` option), and put a file in there. So for example:

```
.
└── posts
    ├── hello-world.sgr
    └── second-post.sgr
```

Within each file, you can use yaml front matter to designate metadata, as such:

```jade
---
title: 'Intro Post'
author: 'Jeff'
---

extends(src='_post_layout.sgr')
block(name='content')
  # Hello world!

  This is my first post. What a **cool** post!
```

In this example, we assume that a layout has been configured for the post. Posts are written in reshape syntax because it makes them much more powerful. Instead of having no power to add arbitrary html or define different sections of the page, as it would be with pure markdown, with reshape, you can modify anything you need. Here's how the layout may look:

```jade
doctype html
html
  head
    title {{ title }}
  body
    h1 {{ title }}
    h3.author by {{ author }}
    .content(md)
      block(name='content')
```

All of your views will have get a `_collections` variable as well, which holds information on all of your collections. Each collection will be scoped as the name you gave it under `_collections`. So `{{ _collections.posts }}` would return the default posts folder. You can use this for building an index page as such:

```jade
extends(src='layout.sgr')
block(name='content')
  h1 My Cool Blog
  ul
    each(loop='post of _collections.posts')
      li: a(href='{{ post._path }}') {{ post.title }}
```

With this in place, you've got a basic blog structure going!

#### Special Variables

Spike collections will add a few special variables to each post for developer convenience:

- `_path`: the full output path to the current post
- `_collection`: the name of the collection of the current post

#### Transform

This is not a feature that jekyll includes as far as I know, but can be incredibly useful and powerful when used correctly. Adding a `transform` function allows you to make a transformation of your choice to the locals of each post in each of your collections. That is to say, before rendering the page, each page's locals are run through the function you provide to `transform`, and you are given the chance to modify them as you wish.

This could be used to pick out specific posts or all posts from specific collections and make changes to their frontmatter, to add defaults across the board to all posts or specific collections, etc. The function can also be asynchronous and return a promise, although this could greatly slow down your compile time if you have many posts so be careful. For example, here's how to add a default variable (`reaction`, as `wow`) across all posts in a collection called `doges`:

```js
const collections = new Collections({
  addDataTo: locals,
  collections: {
    doges: {
      files: 'doges/**',
      transform: (data) => {
        console.log(data)
        data.reaction = 'wow'
        return data
      }
    }
  }
})
```

In this case, every post in `doges` will have the same `reaction` without you having to repeat it in all the frontmatter. This is a very simple example, and there are much more powerful things you can do if you want, so feel free to experiment! Just return an object or promise for an object containing the frontmatter and you're set.

#### Permalinks

The permalinks function is specifically for modifying the output path of your posts, much like the equivalent function in jekyll, although spike-collections' version has a bit more power because it's a full function rather than a template string.

The `permalinks` function will receive the file's path as the first argument, and the full frontmatter locals as an optional second argument, from these two you can build your ideal output url and return it. By default, the output url will be the same as the url specified in the source.

An example of an implementation of jekyll's default `date` output format:

```js
const collections = new Collections({
  addDataTo: locals,
  collections: {
    posts: {
      files: 'posts/**',
      permalink: (p) => {
        // matches: [1] collection, [2] year, [3] month, [4] day, [5] title
        const m = p.match(/^([A-Za-z-_])+\/(\d+)-(\d+)-(\d+)-([A-Za-z-_]+)\./)
        if (!m || !m[1] || !m[2] || !m[3] || !m[4]) {
          throw new Error(`incorrect title formatting for post: ${path}`)
        }
        return `${m[0]}/${m[1]}/${m[2]}/${m[3]}/${m[4]}.html`
      }
    }
  }
})
```

Note that slashes in the output are translated to folders as expected.

While this may look verbose, it is left up to the developer to add more flexibility to path parsing if desired. This means it's not required that the date come first, or even that hyphens are used to separate pieces. That being said, functions that exactly match jekyll's default formats (minus `pretty`, which is easily implemented through netlify or nginx) can be accessed by pulling them off the `Collections` class as such:

```js
console.log(Collections.jekyll)
// => `date`, `ordinal`, and `none` functions can be used
// => also can use `regex` to get our jekyll format parser
```

So a much shorter way to implement the previous example would be:

```js
const collections = new Collections({
  addDataTo: locals,
  collections: {
    posts: {
      files: 'posts/**',
      permalink: Collections.jekyll.date
    }
  }
})
```

#### Pagination

The `pagination` option allows posts to be paginated in a relatively flexible manner. When pagination is turned on, a couple things happen:

Your locals, if provided through `addDataTo`, get an additional `_pages` variable, which is an array of objects like this:

```js
[
  {
    page: 1,
    path: 'posts/page/1.html',
    posts: ['posts/welcome.html', 'posts/another.html']
  }, {
    page: 2,
    path: 'posts/page/2.html',
    posts: ['posts/more.html', 'posts/wowsuchpost.html']
  }
]
```

Also, while your individual posts stay the same, a number of additional templates are rendered out according to the `pagination.template` option, which is a path to a template relative to the root. These templates will display subsequent pages of posts.

Within the template, you will have access to a `_pages` variable as a local, which lists all pages. They also get `_currentPage` which is just the object according to the page being rendered, and a `_next` and `_previous` variable, which are the URLs to the next and previous pages.

Each individual post gets a `_page` variable added to their rendered front matter, which is a number - the page that post is on.

Also note that you can pass a `perPage` option to the `pagination` object to define the number of posts you want to be rendered to each page.

Here's an example of how a collection with pagination enabled might look in your configuration:

```js
new Collections({
  addDataTo: locals,
  collections: {
    posts: {
      files: 'posts/**',
      paginate: {
        template: 'posts/_template.sgr',
        perPage: 5,
        output: (i) => `posts/page${i}.html`
      }
    }
  }
})
```

More information on pagination options can be found below.

### Options

| Name | Description | Default |
| ---- | ----------- | ------- |
| **addDataTo** | An object that will have collections' data appended to it | |
| **collections** | An object with the keys being the name of your collection, and values as listed below | `{ posts: { files: posts/** } }` |
| **collections.[name].files** |  A [globstar](http://globtester.com) string relative to the project root matching any files to be processed as posts | |
| **collections.[name].permalinks** | A function that accepts the relative path to a given file and returns a desired output path. | |
| **collections.[name].transform** | A function that accepts the full locals for each post and returns a modified locals object. | |
| **collections.[name].paginate** | Object with keys as described below | |
| **collections.[name].paginate.perPage** | Integer representing the number of posts per page. | `10` |
| **collections.[name].paginate.template** | _(required if paginate is provided)_ Path (relative to the project root) to a template to render additional pages into. | |
| **collections.[name].paginate.output** | _(required if paginate is provided)_ A function that takes a page number and must output a relative destination path for the page | |

### What About Drafts?

Drafts are just a folder of content that is ignored and not compiled. It's easy in spike to replicate this functionality using the `ignores` configuration. To create a drafts folder, you can do something like this:

```js
module.exports = {
  // ...other config..
  ignores: ['drafts/**']
}
```

This will ensure that none of your draft posts are published. To have your drafts compiled, simply remove it from the array, and add the same pattern as a collection.

### A Note on Speed

This is not a fast plugin. It does a lot of reading, writing, and transforming of files. If you are planning on running a large blog with hundreds or thousands of posts, you will probably see the compile time start to suffer. If this is this case, we'd recommend getting your data out of flat files and into a database. Whenever you are dealing with a large volume of data, a database is usually a better bet anyway. Build a light API, hook it up to your database, and pull it in to spike using [spike-records](https://github.com/static-dev/spike-records) instead!

### License & Contributing

- Details on the license [can be found here](LICENSE.md)
- Details on running tests and contributing [can be found here](contributing.md)
