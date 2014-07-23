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

// Default middleware
app.use(compose([
  mv.setHeaders(),
  mv.logger(':method :url'),
  mv.errorHandler(),
  mv.jSendWrapper(),
  mv.jsonReqBodyParser(),
  db.setReqIndex(client, 'abareness.no')
]));

// Routes
app.use(route.post('/register', compose([db.register(client), db.getLoginToken(client)])));
app.use(route.post('/token', db.getLoginToken(client)));
app.use(route.post('/login', db.login(client)));

app.verifyAccess = function(token) {
  db.verifyToken()
}

// Run
if (!module.parent) {
  var port = process.env.PORT || 3000;
  app.listen(port);
  console.log('listening on port '+port);
}

module.exports = app