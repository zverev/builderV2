var through2 = require('through2');
var semver = require('semver');
var path = require('path');
var fs = require('fs');

module.exports = function(br, opts) {
    // Go through all deps, determine the greatest libraries
    // versions and set pkgPaths hash.
    // ('package' event is emitted by browserify at deps phase)

    // Hash with package name as a key and package's package.json contents as a value.
    // If a package has less version, it will be replaced by the greater one.
    var topPkgs = {};
    // { <package_name>: '<entry_file_path>' }
    var topPkgsEntries = {};
    // Packages of libraries, that have less version
    var dropped = [];
    // {<package_dir>: <package_name>}
    var pkgsDirs = {};
    br.pipeline.on('package', function(pkg) {
        pkgsDirs[pkg.__dirname] = pkg.name;
        // replace if greater
        var ePkg = topPkgs[pkg.name];
        if (!ePkg) {
            topPkgs[pkg.name] = pkg;
            topPkgsEntries[pkg.name] = getEntryFilePath(pkg);
        } else if (semver.gt(pkg.version, ePkg.version)) {
            dropped.push(ePkg);
            topPkgs[pkg.name] = pkg;
            topPkgsEntries[pkg.name] = getEntryFilePath(pkg);
        }
    });

    var rows = [];
    br.pipeline.get('deps').push(through2.obj(function(row, enc, next) {
        // pushing row immediately will cause an error
        // (?)
        rows.push(row);
        next();
    }, function(cb) {
        rows.map(row => {
            // replace library dependencies by the greatest ones
            Object.keys(row.deps).map(function(dep) {
                if (topPkgsEntries[dep]) {
                    //debugger;
                    if (topPkgsEntries[dep] !== row.deps[dep]) {
                        row.deps[dep] = topPkgsEntries[dep];
                    }
                }
            });

            // Browserify will remove unused dependencies

            // if a file is from dropped library, remove it's source
            // dropped.map(d => {
            //     if (row.file.indexOf(d.__dirname) > -1) {
            //         row.source = '/* DROPPED */'
            //     }
            // });

            this.push(row);
        });
        cb();
    }));
};

function getEntryFilePath(pkg) {
    return path.join(pkg.__dirname, pkg.main || 'index.js');
}
