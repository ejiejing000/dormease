process.env.JWT_SECRET = 'collection-check-secret';
process.env.NODE_ENV = 'development';
const expressListRoutes = require('express');
const app = require('../src/app');

const paths = [];
const walk = (router, prefix) => {
  router.stack.forEach((layer) => {
    if (layer.route) {
      Object.keys(layer.route.methods).forEach((m) => paths.push(`${m.toUpperCase()} ${prefix}${layer.route.path}`));
    } else if (layer.name === 'router' && layer.handle.stack) {
      const src = layer.regexp.source
        .replace('^\\/?', '/')
        .replace('\\/?(?=\\/|$)', '')
        .replace(/\\\//g, '/')
        .replace(/\$$/, '')
        .replace(/\(\?:\(\[\^\/\]\?\*\}\\\/\)\)\?/, '')
        .replace(/\^/, '')
        .replace(/\/\?\$$/, '/');
      walk(layer.handle, prefix + src.replace(/\/$/, ''));
    }
  });
};
walk(app.use ? app._router || app.router : expressListRoutes._router, '');
console.log(paths.sort().join('\n'));
console.log('total', paths.length);
