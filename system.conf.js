(function() {
    System.config({
        meta: {
            'pouchdb/pouchdb': {
                format: 'global',
                exports: 'PouchDB',
            },
        },
        paths: {
            'loader/text': 'node_modules/systemjs-plugin-text/text.js',
            'chialab-*': 'node_modules/chialab-*',
            'object-path': 'node_modules/object-path/index.js',
            'pouchdb*': 'node_modules/pouchdb*'
        },
    });
}());
