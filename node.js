Error.stackTraceLimit = 10;

// https://github.com/koajs/koa/blob/master/docs/guide.md
var koa = require('koa');
var route = require('koa-route');
var compose = require('koa-compose');

var elasticsearch = require('elasticsearch');

var mv = require('./lib/middleware')
var db = require('./lib/es-mw')

var app = koa();
if ( !process.env.NODE_ENV || (process.env.NODE_ENV && process.env.NODE_ENV.substr(0, 4) != 'prod') ) {
  app.use( require('koa-favi')() );
  app.use( require('koa-json')() );
}

var client = new elasticsearch.Client({
  host: 'localhost:9200',
  apiVersion: '1.2',
  //log: 'trace'
});

// Default middleware stack
app.use(compose([
  mv.setHeaders(),
  mv.logger(':method :url'),
  mv.errorHandler(),
  mv.jSendWrapper(),
  mv.jsonReqBodyParser(),
  db.setReqEntity(client, 'abareness.no')
]));

var auth_stack = [db.setAuthToken(client), mv.mailAuthToken()]

// Routes
app.use(route.post('/register', compose([db.register(client)].concat(auth_stack))));
app.use(route.post('/auth', compose(auth_stack)));
app.use(route.post('/login', db.getLoginToken(client)));
app.use(route.post('/revoke', db.revokeLoginToken(client)));
app.use(route.post('/verify', mv.verifyLoginToken(client)));

app.use(route.get('/entity', db.setEntity(client)));
app.use(route.get('/pages', db.setPages(client)));
app.use(route.get('/products', db.setProducts(client)));

// Run
if (!module.parent) {
  var port = process.env.PORT || 3000;
  app.listen(port);
  console.log('listening on port '+port);
}

module.exports = app