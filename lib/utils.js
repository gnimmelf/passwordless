var debug = require('debug')('paswordless:utils');

var assert = require('assert');
var util = require('util')
var jwt = require('jwt-simple');
var moment = require('moment')

var secret = 'This is not my secret'

exports.isExpired = function(token_data) {
  var expired = false

  assert(moment(token_data.expires_at).isValid(), 'Invalid format: expires_at')

  if (token_data.expires_at <= Date.now()) {
    expired = true
  }
  return expired
}

exports.makeTokenData = function(token_data, expires_after) {

  var token_data = util._extend({}, token_data);

  var now = moment()

  token_data.created_at = now.valueOf()

  Object.keys(expires_after).map(function(time_unit) {
    now.add(time_unit, expires_after[time_unit])
  })

  token_data.expires_at = now.valueOf();

  token_data.token = jwt.encode(token_data, secret)

  return token_data
}

exports.decodeJwtToken = function(jwt_token) {
  if(typeof jwt_token != 'string') {
    throw new Error('jwt_token MUST be a string')
  }
  return jwt.decode(jwt_token, secret)
}