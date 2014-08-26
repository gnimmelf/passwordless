var debug = require('debug')('passwordless:utils')

var assert = require('assert')
var util = require('util')
var jwt = require('jwt-simple')
var moment = require('moment')

// https://github.com/dreamerslab/node.extend
var extend = require('node.extend');

var SECRET = require('upquire')('/credentials/jwt').secret
var AUTHORIZE_TOKEN_TYPE = require('./constants').AUTHORIZE_TOKEN_TYPE
var AUTHENTICATE_TOKEN_TYPE = require('./constants').AUTHENTICATE_TOKEN_TYPE

// Export format
var format = util.format
exports.format = format

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

exports.assertTokenType = function(token_data, expected_type) {
  // Make sure `token_data` is `string` or `object`
  assert(typeof token_data == 'string' || typeof token_data == 'object', 'Invalid `token_data`: '+token_data)

  // Get the `token_type`
  var token_type = (typeof token_data == 'string' ? token_data : token_data.type)

  if (expected_type) {
    // Make sure the passed `token_type` equals `expected_type`
    assert(token_type == expected_type, format('Wrong token-type. Expected `%s`, got `%s`', expected_type, token_type))
  }
  else {
    // Make sure the passed `token_type` is a valid type
    assert([AUTHENTICATE_TOKEN_TYPE, AUTHORIZE_TOKEN_TYPE].indexOf(token_type) > -1, 'Invalid token-type: '+token_type)
  }

}

exports.makeTokenData = function(token_type, token_data, expires_after) {

  exports.assertTokenType(token_type)

  var token_data = extend({}, token_data)

  var now = moment()

  token_data.created_at = now.valueOf()

  Object.keys(expires_after).map(function(time_unit) {
    now.add(expires_after[time_unit], time_unit)
  })

  token_data.expires_at = now.valueOf()
  token_data.type = token_type

  token_data.token = jwt.encode(token_data, SECRET)

  try {
    var decoded = jwt.decode(token_data.token, SECRET)
    console.log('Token is decodable:', token_data.token)
  }
  catch(err) {
    console.error(err)
    throw err
  }

  return token_data
}

exports.decodeJwtToken = function(jwt_token) {
  if(typeof jwt_token != 'string') {
    throw new Error('jwt_token MUST be a string')
  }

  return jwt.decode(jwt_token, SECRET)
}

exports.filterVaildAutorizeTokens = function(token_list) {
  return token_list.filter(function(token_data) {
    return (token_data.type == AUTHORIZE_TOKEN_TYPE && !token_data.revoked_at && !exports.isExpired(token_data))
  })
}

exports.filterVaildAutorizeTokensResponse = function(token_list) {
  // Map prop to return as JSON response
  return exports.filterVaildAutorizeTokens(token_list).map(function(token_data) {
    return {
      token: token_data.token,
      expires_at: token_data.expires_at,
      created_at: token_data.created_at,
      type: token_data.type
    }
  })
}