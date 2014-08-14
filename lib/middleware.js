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
    try {
      this.request.body = yield parseBody.json(this, {limit: limit || '10kb'})
    } catch(err) {
      this.request.body = {}
    }
    yield next
  }
}

exports.mailLoginToken = function() {
  return function*mailLoginToken(next) {

    if (process.env.NODE_ENV == 'test') {
      this.setMeta('login_token', this.user_data.login_token.token)
    }

    this.body = 'Login Token mailed to '+ this.user_data.email

    yield next
  }
}

exports.mailAuthToken = function() {
  return function*mailAuthToken(next) {

    if (process.env.NODE_ENV == 'test') {
      this.setMeta('auth_token', this.user_data.auth_token.token)
    }

    this.body = 'Auth Token mailed to '+ this.user_data.email

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