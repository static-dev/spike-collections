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
const locals = {}

module.exports = {
  // your config here...
  plugins: [
    new SpikeCollections({
      addDataTo: locals,
      posts: 'posts/**',
      drafts: 'drafts/**'
    })
  ]
}
```

See [options](#options) for more detail on further configuring spike-collections.

### Usage

To get started, just make a `posts` folder (or another name, but adjust the `posts` option), and put a file in there with the following formatting: `YEAR-MONTH-DAY-title.MARKUP`. So for example:

```
.
└── posts
    ├── 2016-07-14-hello-world.sgr
    └── 2016-07-16-second-post.sgr
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
    title {{ post.title }}
  body
    h1 {{ post.title }}
    h3.author by {{ post.author }}
    h3.date on {{ post.date }}
    .content(md)
      block(name='content')
```

With this in place, you've got a basic blog structure going!

#### Permalinks

By default, the expected date format for posts is `YEAR-MONTH-DAY-title.MARKUP`. However, if you'd like to change this, you can do so using the `permalinks` option. This option expects a function which takes a single parameter, which is the relative path to each post, as a string. It's expected to return an object which will be merged into the locals for that single post.

So, for example, the default permalink function looks something like this:

```js
function permalink (path) {
  const matches = path.match(/(.*)-(.*)-(.*)-(.*)/)
  const year = matches[1]
  const month = matches[2]
  const day = matches[3]

  if (!matches || !year || !month || !day) {
    throw new Error(`incorrect date formatting for post: ${path}`)
  }

  return { date: `${year}-${month}-${day}`}
}
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

### Options

| Name | Description | Default |
| ---- | ----------- | ------- |
| **posts** | a [globstar](http://globtester.com) string relative to the project root matching any files to be processed as posts | `posts/**` |
| **drafts** | a [globstar](http://globtester.com) string relative to the project root matching any files to be processed as drafts | `drafts/**` |
| **addDataTo** | object that will have collections data appended to it | |
| **permalinks** | a function that accepts the relative path to a given file and returns an object to be added to the front matter. | `YEAR-MONTH-DAY-title` |
| **paginate** | object with `per_page` (an integer representing the number of posts per page), `template` (relative path to a template to render additional pages into), and `output` (a function that takes a page number and must output a relative destination path for the page) keys. If any single key is given, others default as such: | `{ per_page: 10, output: (n) => 'posts/pages/${n}.html' }` |


### License & Contributing

- Details on the license [can be found here](LICENSE.md)
- Details on running tests and contributing [can be found here](contributing.md)
