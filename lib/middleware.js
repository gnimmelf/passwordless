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
    //console.log(this)
    yield next
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

exports.returnRegisterData = function() {

  return function*returnRegisterData(next) {

    if (process.env.NODE_ENV == 'test') {
      this.setMeta('authenticate_token', this.user_data.authenticate_token.token)
    }

    this.body = {
      message: 'Registered. Authenticate-token created. Authenticate-mail sent',
      email: this.user_data.email,
    }

    yield next
  }
}

exports.returnAuthenticateData = function() {

  return function*returnAuthenticateData(next) {

    if ( process.env.NODE_ENV == 'test' ) {
      // Only pass this token on test; normally it should ONLY be mailed to the user email
      this.setMeta('authenticate_token', this.user_data.authenticate_token.token)
    }

    this.body = {
      message: 'Authenticate-token created. Authenticate-mail sent',
      email: this.user_data.email,
    }

    yield next
  }
}

exports.returnLoginData = function() {

  return function*returnLoginData(next) {

    this.body = {
      token: this.user_data.authorize_token.token,
      message: 'Authorization-token created. Authorization-mail sent. Authorization-token returned',
      email: this.user_data.email
    }

    yield next
  }
}

exports.returnAuthorizeData = function() {

  return function*returnAuthorizeData(next) {

    this.body = {
      message: 'User was authorized',
      email: this.user_data.email
    }

    yield next
  }
}

exports.returnRevokeAuthorizeToken = function() {

  return function*returnRevokeAuthorizeToken(next) {

    this.body = {
      // TODO! What to return?
    }

    yield next
  }
}

exports.returnMerchantData = function() {

  return function*returnMerchantData(next) {

    debug('returnMerchantData', this.merchant_data)

    this.body = this.merchant_data

    yield next
  }
}