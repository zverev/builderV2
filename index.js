'use strict';

var vinylSourceStream = require('vinyl-source-stream');
var factorBundle = require('factor-bundle')
var browserify = require('browserify');
var parcelMap = require('parcel-map');
var exorcist = require('exorcist');
var watchify = require('watchify');
var rimraf = require('rimraf');
var gutil = require('gulp-util');
var path = require('path');
var es = require('event-stream');
var fs = require('fs');
var _ = require('lodash');

var gulpFileAssets = require('gulp-file-assets');
var gulpReplace = require('gulp-replace');
var gulpRename = require('gulp-rename');
var gulpConcat = require('gulp-concat');
var gulp = require('gulp');

var dedupePlugin = require('./dedupePlugin.js');

var cwd = process.cwd();

function parseConfig(config) {
    var srcs = [];
    var dists = [];
    var commonBundle = 'dist/common.js';

    _.forOwn(config.bundles, function(value, key) {
        if (value === '__common_bundle') {
            commonBundle = key;
            return;
        }
        srcs.push(value);
        dists.push(key);
    });

    return {
        srcs: srcs,
        dists: dists,
        commonBundle: commonBundle,
        debug: !!config.debug
    }
}

function browserifyFactory(config) {
    var cfg = parseConfig(config);

    return browserify({
        entries: cfg.srcs.map(function (pth) {
            return path.join(process.cwd(), pth);
        }),
        debug: cfg.debug
    });
}

function browserifyBundle(br, config) {
    var cfg = parseConfig(config);

    br.plugin(dedupePlugin, {
        foo: 'bar'
    });

    br.on('log', gutil.log); // output build logs to terminal

    if (cfg.dists.length > 1) {
        br.plugin(factorBundle, {
            outputs: cfg.dists
        });

        br.on('update', bundle.bind(null, cfg.commonBundle));
        bundle(cfg.commonBundle);
    } else {
        br.on('update', bundle.bind(null, cfg.dists[0]));
        bundle(cfg.dists[0]);
    }

    return br;

    function bundle(distFile) {
        debugger;
        var bundleStream = br.bundle()
            .on('error', function(error) {
                debugger;
                gutil.log('error', error.text)
            });

        var pipeline = [
            vinylSourceStream(path.basename(distFile)),
            gulp.dest(path.dirname(distFile))
        ];

        if (cfg.debug) {
            pipeline.unshift(exorcist(path.join(process.cwd(), distFile + '.map')));
        }

        return pipeline.reduce(function (prev, next) {
            return prev.pipe(next);
        }, bundleStream)
    }
}

function browserifyCompile(config) {
    return browserifyBundle(browserifyFactory(config), config);
}

function browserifyWatch(config) {
    return browserifyBundle(watchify(browserifyFactory(config)), config);
}

function getCssAssets(brInstance, cb) {
    var opts = {
        keys: ['style'],
        defaults: {
            style: 'images/*.jpg'
        }
    };

    var ee = parcelMap(brInstance, opts);

    ee.on('done', function(graph) {
        var cssFilesPaths = [];
        for (var assetPath in graph.assets) {
            if (assetPath.match(/.css$/)) {
                cssFilesPaths.push(path.normalize(assetPath));
            }
        }
        cb(cssFilesPaths);
    });

    brInstance.bundle();
}

function createDistDirs(cfg) {
    return Promise.all(cfg.dists.map(function(pth) {
        return new Promise(function(resolve, reject) {
            var dirPath = path.dirname(pth);
            fs.stat(dirPath, function(err, stat) {
                if (err && err.code === 'ENOENT') {
                    makeDir()
                } else {
                    if (stat.isDirectory()) {
                        resolve();
                    } else {
                        makeDir();
                    }
                }

                function makeDir(dir) {
                    fs.mkdir(dirPath, function(err) {
                        if (err) {
                            err.code === 'EEXIST' ? resolve() : reject();
                        } else {
                            resolve();
                        }
                    })
                }
            })
        })
    }));
}

function dropCommonPath(pathA, pathB) {
    while (pathA.charAt(0) === pathB.charAt(0)) {
        pathA = pathA.slice(1);
        pathB = pathB.slice(1);
    }
    return pathA;
}

function getLibDistPath(filePath, cwd) {
    if (filePath.indexOf(cwd) === -1) {
        // library is outside of project directoy (possible symlink)
        return dropCommonPath(filePath, cwd);
    } else {
        return path.relative(cwd, filePath);
    }
}

// options.entries - browserify files
module.exports = function(gulp, options) {
    var cfg = parseConfig(options);

    gulp.task('compilejs', function () {
        return createDistDirs(cfg).then(function() {
            browserifyCompile(options);
        }, function() {
            gutil.log('error creating dist dirs');
        })
    });

    gulp.task('watchjs', function() {
        return createDistDirs(cfg).then(function() {
            browserifyWatch(options);
        }, function() {
            gutil.log('error creating dist dirs');
        })
    });

    gulp.task('compilecss', function(cb) {
        return Promise.all(cfg.srcs.map(function(src, i) {
            return new Promise(function(resolve, reject) {
                var srcFullPath = path.join(cwd, cfg.srcs[i]);
                var distFullPath = path.join(cwd, cfg.dists[i]);

                getCssAssets(browserifyFactory(options), function(cssFilesPaths) {
                    if (_.isEmpty(cssFilesPaths)) {
                        resolve();
                        return;
                    }
                    var urlsStreams = cssFilesPaths.map(function(cssFilePath) {
                        return gulp.src(cssFilePath)
                            .pipe(gulpFileAssets({
                                types: {
                                    js: ['js'],
                                    css: ['css'],
                                    page: ['html', 'tpl'],
                                    img: ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'],
                                    fonts: ['eot', 'woff', 'woff2', 'ttf']
                                }
                            }))
                            .pipe(gulpRename(function(pth) {
                                pth.dirname = getLibDistPath(path.join(path.dirname(
                                    cssFilePath), pth.dirname), cwd)
                            }))
                            .pipe(gulp.dest(path.dirname(distFullPath)));
                    });

                    var cssStreams = cssFilesPaths.map(function(cssFilePath) {
                        return gulp.src(cssFilePath)
                            .pipe(gulpReplace(/url\(['"]*([^\'\"\)]*)['"]*\)/ig, function(match, p1,
                                offset, str) {
                                var pth = getLibDistPath(path.join(path.dirname(cssFilePath),
                                    p1), cwd);
                                return 'url(\'' + pth.replace(/\\/ig, '/') + '\')';
                            }))
                    });

                    var cssStream = es.merge.apply(null, cssStreams)
                        .pipe(gulpConcat(path.basename(distFullPath, path.extname(distFullPath)) + '.css'))
                        .pipe(gulp.dest(path.dirname(distFullPath)));

                    es.merge.apply(null, [].concat(urlsStreams, cssStream))
                        .pipe(es.through(null, function() {
                            resolve();
                        }));
                });
            });
        }));
    });

    gulp.task('watchcss', ['compilecss'], function(cb) {
        getCssAssets(browserifyFactory(options), function(cssFilesPaths) {
            gulp.watch(cssFilesPaths, ['compilecss']);
            cb();
        });
    });

    gulp.task('cleandist', [], function() {
        return Promise.all(cfg.dists.map(function(distPath) {
            return new Promise(function(resolve, reject) {
                rimraf(path.dirname(distPath), function(err) {
                    if (err) {
                        reject();
                    } else {
                        resolve();
                    }
                });
            });
        }));
    });

    gulp.task('watch', ['watchjs', 'watchcss']);
    gulp.task('compile', ['compilejs', 'compilecss']);
    gulp.task('default', ['compile']);
}
