var debug = require('debug')('passwordless:middleware')

var assert = require('assert')
var UserError = require('usererror')
var parseBody = require('co-body')

var STATUS_CODES = require('http').STATUS_CODES

var AUTHORIZE_TOKEN_TYPE = require('./constants').AUTHORIZE_TOKEN_TYPE
var AUTHENTICATE_TOKEN_TYPE = require('./constants').AUTHENTICATE_TOKEN_TYPE

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
      // Acknowledge and return
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

exports.mailAuthenticateToken = function(sendTokenMail) {
  return function*mailAuthenticateToken(next) {

    var sender_name = this.merchant_data.id
    var subject_str = this.merchant_data.hostname+': Temporary Authentication Token'
    var reciever_email = this.user_data.email
    var body = this.user_data.tokens.authenticate_token.token

    // body, reciever_email, sender_name, subject_str
    sendTokenMail(sender_name, reciever_email, subject_str, body)

    yield next
  }
}

exports.mailAuthorizeTokens = function(sendTokenMail) {
  return function*mailAuthorizeToken(next) {


    var sender_name = this.merchant_data.id
    var subject_str = this.merchant_data.hostname+': Your active Authorization Tokens'
    var reciever_email = this.user_data.email

    var body = this.user_data.tokens.authorize_tokens.map(function(token_data) {
      return token_data.token
    }).join('\n')

        // body, reciever_email, sender_name, subject_str
    sendTokenMail(sender_name, reciever_email, subject_str, body)

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

exports.validateReturnHandler = function() {

  return function*validateReturnHandler(next) {

    var user_token_data

    assert(this.req_token_data, 'ctx.req_token_data is missing! Make sure it gets set upstream!')
    assert(this.user_data, 'ctx.user_data is missing! Make sure it gets set upstream!')

    // Make sure th epassed token is not expired!
    assert(!utils.isExpired(this.req_token_data),
        utils.format('%s is expired. Please request a new token', AUTHENTICATE_TOKEN_TYPE))

    if (this.req_token_data.type == AUTHENTICATE_TOKEN_TYPE) {

      // Set the token-data to work with
      user_token_data = this.user_data.tokens.authenticate_token

      // Make sure the passed `request_token_data` is the same as the `user_token_data`
      assert(this.req_token_data.token == user_token_data.token,
            utils.format('%s not found. Please request a new token', AUTHENTICATE_TOKEN_TYPE))

      // Make sure `user_token_data` is not used!
      assert(!user_token_data.used_at,
          utils.format('%s is used. Please request a new token', AUTHENTICATE_TOKEN_TYPE))

    }
    else if (this.req_token_data.type == AUTHORIZE_TOKEN_TYPE) {

      // Find the token-data matching the `request_token`
      for (var i=0, ii=this.user_data.tokens.authorize_tokens.length; i<ii; i++) {
        if (this.req_token_data.token == this.user_data.tokens.authorize_tokens[i].token) {
          user_token_data = this.user_data.tokens.authorize_tokens[i]
          break
        }
      }

      if (!user_token_data) {
        throw new UserError('Token not found')
      }

      // Make sure `authenticate_token` is not revoked!
      assert(!this.user_data.tokens.authenticate_token.revoked_at,
          utils.format('%s is revoked. Please request a new token', AUTHENTICATE_TOKEN_TYPE))

    }

    this.body = {
      type: user_token_data.type,
      email: this.user_data.email
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