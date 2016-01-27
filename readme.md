# Builder V2

### Multiple bundles application

Suppose we have an application with a separate help page. Sometimes this application operates with heavy data, but most time we don't need it, so we want to load it dynamically.

In this case configuration file may look like this:

```javascript
{
    cwd: __dirname,
    bundles: {
        'dist/common.js': '__common_bundle',
        'dist/app.js': 'src/app/index.js',
        'dist/help.js': 'src/help/index.js'
    }
}
```

Each key in bundles hash represents a separate output bundle, value is the source file. Key with special value `__common_bundle` corresponds bundle containing common libraries.
