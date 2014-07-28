var debug = require('debug')('paswordless:utils');

var util = require('util')

// https://github.com/JerrySievert/date-utils
require('date-utils')

var jwt = require('jwt-simple');

var secret = 'This is not my secret'

exports.isNotExpired = function(token) {
  var expired = false
  var now = new Date()
  if (now >= token.expires_at) {
    expired = true
  }
  return !expired
}

exports.makeTokenData = function(user_data, expires_after) {

  var token_data = util._extend({}, user_data);

  var ts_created_at = new Date()
  var ts_expires_at = ts_created_at.add(expires_after)

  token_data.created_at = ts_created_at
  token_data.expires_at = ts_expires_at

  token_data.token = jwt.encode(token_data, secret)

  return token_data
}

exports.decodeJwtToken = function(jwt_token) {
  return jwt.decode(jwt_token.token, secret)
}