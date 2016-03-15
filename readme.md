# Builder V2

## Configuration API

Gmx Builder exposes a function that acceps two arguments: a gulp instance and config object.

The only key, that config object contains is a hash of bundles, that we want to create. Every key of this hash is a bundle dist file, corresponding value is an entry file.

**example:**

```javascript
// gulpfile.js
require('gmx-builder')(require('gulp'), {
    bundles: {
        'dist/bundle.js': 'index.js'
    }
})
```

## Tasks

- `gulp compile` - compile project
- `gulp watch` - compile project and watch
- `gulp cleandist` - clean all produced dist files
