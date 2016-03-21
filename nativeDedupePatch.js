var through2 = require('through2');

module.exports = function(b, options) {
    b.pipeline.get('dedupe').splice(0, 1, through2.obj(function(row, enc, next) {
        if (!row.dedupeIndex && row.dedupe) {
            row.source = 'module.exports = require(\'' + row.dedupe + '\'); // DUPLICATE';
            row.nomap = true;
        } else if (row.dedupeIndex) {
            row.source = 'module.exports = require(\'' + row.dedupeIndex + '\');  // DUPLICATE';
            row.nomap = true;
        }
        if (row.dedupeIndex && row.indexDeps) {
            row.indexDeps.dup = row.dedupeIndex;
        }
        this.push(row);
        next();
    }));
};
