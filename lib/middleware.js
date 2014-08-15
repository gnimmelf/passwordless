var debug = require('debug')('passwordless:middleware')

var assert = require('assert')
var UserError = require('usererror')
var parseBody = require('co-body')

var STATUS_CODES = require('http').STATUS_CODES

var utils = require('./utils')

exports.emailer = function() {

}

exports.jSendWrapper = function() {
  // jSend: http://labs.omniti.com/labs/jsend
  return function *jSendWrapper(next) {
    var jSend = {
      data: null,
      status: 'success',
      meta: null
    }

    // For debugging and other stuff
    this.meta = {}
    this.setMeta = function(k, v) {
      this.meta[k] = v
    }

    try {
      yield next

      if (this.status !== 200) {
        jSend.status = 'fail'
        jSend.data = this.status + ' ' + STATUS_CODES[this.status]
      }
      else {
        jSend.data = this.body
      }

    } catch(e) {
      if (e.name == 'UserError' || e.name == 'AssertionError') {
        jSend.status = 'fail'
      } else {
        jSend.status = 'error'
        this.app.emit('error', e, this)
        console.log(e.stack)
      }
      try {
        jSend.data = JSON.parse(e.message)
      } catch(e2) {
        jSend.data = e.message || this.status + ' ' + STATUS_CODES[this.status||500]
      }
    }
    jSend.meta = this.meta
    this.body = jSend
  }
}

exports.setHeaders = function() {
  return function *setHeaders(next) {
    this.set('x-powered-by', 'fireshop')
    // CORS http://stackoverflow.com/questions/7067966/how-to-allow-cors-in-express-nodejs
    this.set('Access-Control-Allow-Origin', '*')
    this.set('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE')
    this.set('Access-Control-Allow-Headers', 'Content-Type')

    if (this.method == 'OPTIONS') {
      this.body = 'OPTIONS-request acknowledged.'
      this.status = 200
    }
    else {
      yield next
    }
  }
}

exports.logger = function(format) {
  format = format || ':method ":url"'

  return function *logger(next){
    var str = format
      .replace(':method', this.method)
      .replace(':url', this.url)

    console.log(str)

    yield next
  }
}

exports.errorHandler = function() {
  return function*errorHandler(next) {
    try {
      yield next
    } catch (e) {
      this.status = e.status || 500
      this.body = e.message || require('http').STATUS_CODES[this.status]
      this.app.emit('error', e, this)
    }
  }
}

exports.jsonReqBodyParser = function(limit) {
  return function*jsonReqBodyParser(next) {
    if (this.method == 'POST') {
      this.request.body = yield parseBody.json(this, {limit: limit || '10kb'})
    }
    yield next
  }
}

exports.mailAuthenticateToken = function() {
  return function*mailAuthenticateToken(next) {

    // TODO! Make a mailer and mail authenticate_token to user_data.email

    yield next
  }
}

exports.mailAuthorizeToken = function() {
  return function*mailAuthorizeToken(next) {

    // TODO! Make a mailer and mail authorize_token to user_data.email

    yield next
  }
}

exports.registerReturnHandler = function() {

  return function*registerReturnHandler(next) {

    if ( process.env.NODE_ENV == 'test' ) {
      // Only pass this token on test; normally it should ONLY be mailed to the user email
      this.setMeta('authenticate_token', this.user_data.tokens.authenticate_token.token)
    }

    this.body = {
      message: 'Registered. Authenticate-token created. Authenticate-mail sent',
      email: this.user_data.email,
    }

    yield next
  }
}

exports.loginReturnHandler = function() {

  return function*loginReturnHandler(next) {

    if ( process.env.NODE_ENV == 'test' ) {
      // Only pass this token on test; normally it should ONLY be mailed to the user email
      this.setMeta('authenticate_token', this.user_data.tokens.authenticate_token.token)
    }

    this.body = {
      message: 'Authenticate-token created. Authenticate-mail sent',
      email: this.user_data.email,
    }

    yield next
  }
}

exports.authenticateReturnHandler = function() {

  return function*authenticateReturnHandler(next) {

    this.body = {
      tokens: this.user_data.tokens.authorize_tokens.map(function(token_data) {
        return token_data.token
      }),
      message: 'Authorization-token created. Authorization-mail sent. Authorization-token returned',
      email: this.user_data.email
    }

    yield next
  }
}

exports.authorizeReturnHandler = function() {

  return function*authorizeReturnHandler(next) {

    this.body = {
      message: 'User was authorized',
      email: this.user_data.email
    }

    yield next
  }
}

exports.revokeReturnHandler = function() {

  return function*returnRevokeAuthorizeToken(next) {

    this.body = {
      // TODO! What to return?
    }

    yield next
  }
}

exports.merchantReturnHandler = function() {

  return function*merchantReturnHandler(next) {

    debug('merchantReturnHandler', this.merchant_data)

    this.body = this.merchant_data

    yield next
  }
}