var debug = require('debug')('paswordless:utils')

var assert = require('assert')
var jwt = require('jwt-simple')
var moment = require('moment')
// https://github.com/dreamerslab/node.extend
var extend = require('node.extend');

// TODO! This should not be here =)
var secret = 'This is not my secret'

// Export extend functions
exports.extend = extend
exports.extend.deep = extend.bind(null, true)


exports.validateEmail = function(email) {
  var re = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
  return re.test(email)
}

exports.isExpired = function(token_data) {
  var expired = false

  assert(moment(token_data.expires_at).isValid(), 'Invalid format: expires_at')

  if (token_data.expires_at <= Date.now()) {
    expired = true
  }
  return expired
}

exports.makeTokenData = function(token_data, expires_after) {

  var token_data = extend({}, token_data)

  var now = moment()

  token_data.created_at = now.valueOf()

  Object.keys(expires_after).map(function(time_unit) {
    now.add(expires_after[time_unit], time_unit)
  })

  token_data.expires_at = now.valueOf()

  token_data.token = jwt.encode(token_data, secret)

  return token_data
}

exports.decodeJwtToken = function(jwt_token) {
  if(typeof jwt_token != 'string') {
    throw new Error('jwt_token MUST be a string')
  }
  return jwt.decode(jwt_token, secret)
}

