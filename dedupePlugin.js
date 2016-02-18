var through2 = require('through2');
var semver = require('semver');
var path = require('path');
var fs = require('fs');

module.exports = function(br, opts) {
    // 1. Go through all deps and determine the greatest libraries
    // versions and set pkgPaths hash.
    // ('package' event is emitted by browserify at deps phase)

    // Hash with package name as a key and package's package.json contents as a value.
    // If a package has less version, it will be replaced by the greater one.
    var topPkgs = {};
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
        } else if (semver.gt(pkg.version, ePkg.version)) {
            dropped.push(ePkg);
            topPkgs[pkg.name] = pkg;
        }
    });


    // Rows buffer to push them to further streams
    var rows = [];
    // Key = component id, value = components, that depend on it.
    // {'./foo': ['./bar', './baz']}
    var dependents = {};
    br.pipeline.get('deps').push(through2.obj(function(row, enc, next) {
        rows.push(row);
        next();
    }, function() {
        var dependents = getDependents(rows, pkgsDirs);
        console.log(dependents)

        // flush rows
        var stream = this;
        rows.map(function(row) {
            stream.push(row);
        })
    }));
};

function getDependents(rows, pkgsDirs) {
    var gli = getLibId;
    var dependents = {};
    rows.map(function(row) {
        Object.keys(row.deps).map(function(reqBody) {
            var id = row.deps[reqBody];
            // var id = getLib Id(path, pkgsDirs);
            if (!dependents[id]) {
                dependents[id] = [];
            }
            dependents[id].push(row.id);
        });
    });
    return dependents;
}

function getLibId(pth, pkgsDirs) {
    return pkgsDirs[Object.keys(pkgsDirs).find(function(pkgDir) {
        return path.dirname(pth) === pkgDir;
    })];
}
