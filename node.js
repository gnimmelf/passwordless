Error.stackTraceLimit = 50

// https://github.com/koajs/koa/blob/master/docs/guide.md
var koa = require('koa')
var route = require('koa-route')
var compose = require('koa-compose')

var esGenClientX = require('./lib/es-gen-client-x')

var mv = require('./lib/middleware')
var db = require('./lib/es-mw')

var app = koa()
if ( !process.env.NODE_ENV || (process.env.NODE_ENV && process.env.NODE_ENV.substr(0, 4) != 'prod') ) {
  app.use( require('koa-favi')() )
  app.use( require('koa-json')() )
}

var client = esGenClientX({
  host: 'localhost:9200',
  apiVersion: '1.2',
  //log: 'trace'
})

// Default middleware stack
app.use(compose([
  mv.setHeaders(),
  mv.logger(':method :url'),
  mv.errorHandler(),
  mv.jSendWrapper(),
  mv.jsonReqBodyParser(),
  db.setCtxMerchantData(client, 'abareness.no')
]))

var handler_stacks = {
  register: [
    db.registerUser(client),
    db.makeAuthenticateToken(client, {hours: 1}),
    mv.mailAuthenticateToken(),
    mv.returnRegisterData(),
  ],
  authenticate: [
    db.setCtxUserRec(client),
    db.makeAuthenticateToken(client, {hours: 1}),
    mv.mailAuthenticateToken(),
    mv.returnAuthenticateData(),
  ],
  login: [
    db.setCtxTokenData('authenticate_token'),
    db.setCtxUserRec(client),
    db.makeAuthorizeToken(client, {months: 3}),
    mv.mailAuthorizeToken(),
    mv.returnLoginData(),
  ],
  authorize: [
    db.setCtxTokenData('authorize_token'),
    db.setCtxUserRec(client),
    db.authorizeUser(client),
    mv.returnAuthorizeData(),
  ],
  revoke: [
    db.setCtxTokenData('authorize_token'),
    db.setCtxUserRec(client),
    db.revokeAuthorizeToken(client),
    mv.returnRevokeAuthorizeToken(),
  ]
}

// Routes
app.use(route.post('/register', compose(handler_stacks.register)))
app.use(route.post('/authenticate', compose(handler_stacks.authenticate)))
app.use(route.post('/login', compose(handler_stacks.login)))
app.use(route.post('/authorize', compose(handler_stacks.authorize)))
app.use(route.post('/revoke', compose(handler_stacks.revoke)))


app.use(route.get('/merchant', mv.returnMerchantData()))
app.use(route.get('/pages', db.returnPages(client)))
app.use(route.get('/products', db.returnProducts(client)))

// Run
if (!module.parent) {
  var port = process.env.PORT || 3000
  app.listen(port)
  console.log('listening on port '+port)
}

module.exports = app