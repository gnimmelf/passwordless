Error.stackTraceLimit = 50

// https://github.com/koajs/koa/blob/master/docs/guide.md
var koa = require('koa')
var route = require('koa-route')
var compose = require('koa-compose')

var esGenClientX = require('./lib/es-gen-client-x')

var mv = require('./lib/middleware')
var db = require('./lib/es-mw')

var sendTokenMail = require('./lib/emailer').sendTokenEmail

var AUTHENTICATE_TOKEN_TYPE = require('./lib/constants').AUTHENTICATE_TOKEN_TYPE
var AUTHORIZE_TOKEN_TYPE = require('./lib/constants').AUTHORIZE_TOKEN_TYPE

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
    mv.mailAuthenticateToken(sendTokenMail),
    mv.registerReturnHandler(),
  ],
  login: [
    db.setCtxUserRec(client),
    db.makeAuthenticateToken(client, {hours: 1}),
    //mv.mailAuthenticateToken(sendTokenMail),
    mv.loginReturnHandler(),
  ],
  validate_token: [
    db.setCtxTokenData(),
    db.setCtxUserRec(client),
    mv.validateReturnHandler(),
  ],
  authenticate_token: [
    db.setCtxTokenData(AUTHENTICATE_TOKEN_TYPE),
    db.setCtxUserRec(client),
    db.ensureUserAuthorizeToken(client, {months: 3}),
    mv.authenticateReturnHandler(),
  ],
  authorize_token: [
    db.setCtxTokenData(AUTHORIZE_TOKEN_TYPE),
    db.setCtxUserRec(client),
    db.validateAuthorizeToken(client),
    mv.authorizeReturnHandler(),
  ],
  revoke_token: [
    db.setCtxTokenData(AUTHORIZE_TOKEN_TYPE),
    db.setCtxUserRec(client),
    db.revokeAuthorizeToken(client),
    mv.revokeReturnHandler(),
  ]
}

// Routes
app.use(route.post('/register', compose(handler_stacks.register)))
app.use(route.post('/login', compose(handler_stacks.login)))
app.use(route.post('/token/validate', compose(handler_stacks.validate_token)))
app.use(route.post('/token/authenticate', compose(handler_stacks.authenticate_token)))
app.use(route.post('/token/revoke', compose(handler_stacks.revoke_token)))

// TODO!
//app.use(route.post('/token/create', compose(handler_stacks.revoke_token)))

// TODO! How to hook this into client code
app.use(route.post('/token/authorize', compose(handler_stacks.authorize_token)))

app.use(route.get('/merchant', mv.merchantReturnHandler()))
app.use(route.get('/pages', db.returnPages(client)))
app.use(route.get('/products', db.returnProducts(client)))

// Run
if (!module.parent) {
  var port = process.env.PORT || 3000
  app.listen(port)
  console.log('listening on port '+port)
}

module.exports = app