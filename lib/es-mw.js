var debug = require('debug')('paswordless:es-mw');
var UserError = require('usererror');
var assert = require('assert');
var crypto = require('crypto');
var genify = require('thunkify-wrap').genify;
var moment = require('moment')

var utils = require('./utils')

/*
// APP
curl -X POST 'http://localhost:3000/register' -d '{ "email": "gnimmelf@gmail.com" }'
curl -X POST 'http://localhost:3000/auth' -d '{ "email": "gnimmelf@gmail.com" }'
curl -X POST 'http://localhost:3000/login' -d '{ "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJjcmVhdGVkX2F0IjoiMjAxNC0wNy0yM1QxOTo0NjozNC40NzdaIiwiZXhwaXJlc19hZnRlciI6IjRoIiwiZW50aXR5IjoiYWJhcmVuZXNzIiwidXNlcl9lbWFpbCI6ImduaW1tZWxmQGdtYWlsLmNvbSIsInVzZWRfYXQiOm51bGx9.d8FBTh2UVZJ7YcDhSlzoXdMvoQ0HkxkqqHj5By-k0zc" }'
curl -X GET 'http://localhost:3000/entity'

// ES
curl -X POST 'http://localhost:9200/shoplet/entity/abareness' -d '{
  "hostname":"abareness.no",
  "image_base_url": "https://s3-eu-west-1.amazonaws.com/fireshop/abareness"
}'
curl -X GET 'http://localhost:9200/abareness/user/_search?pretty'
curl -XDELETE 'http://localhost:9200/abareness/user'
curl -XDELETE 'http://localhost:9200/shoplet'
*/

function genifyClient(client) {
  if (!client.__genified) {
    client.search = genify(client.search)
    client.get = genify(client.get)
    client.index = genify(client.index)
    client.update = genify(client.update)
  }
  return client
}

function getDigest(string) {
  return crypto.createHash('md5').update(string).digest("hex")
}

function getGenHits(gen_res, hit_index) {
  var hits = gen_res[0].hits.hits

  if (hit_index !== undefined) {
    return hits[hit_index]
  }

  return hits
}

function validateEmail(email) {
  var re = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  return re.test(email);
}

exports.setReqEntity = function(client, hostname) {

  genifyClient(client)
  var index = 'shoplet'
  var type = 'entity'

  return function*setReqEntity(next) {

    hostname = hostname || this.request.hostname

    if (!hostname || hostname === 'localhost') {
      debug('setReqIndex', 'Invalid hostname', hostname)
      throw new UserError('Invalid hostname')
    }

    var res = yield client.search({
      index: index,
      type: type,
      q: 'hostname:'+hostname,
      size: 1,
      ignore: [404]
    })

    this.request.entity = getGenHits(res, 0)

    debug('setReqIndex', this.request.entity._id)

    yield next
  }

}

exports.register = function(client) {

  genifyClient(client)
  var index = 'shoplet'
  var type = 'user'

  return function*register(next) {

    var body = this.request.body

    debug('register', 'body', body)

    assert(validateEmail(body.email), 'Invalid email: '+body.email)

    // Get associated user (tokens are stored on the user)
    var id = getDigest(body.email)
    var res = yield client.get({
      index: index,
      type: type,
      id: id,
      ignore: [404]
    })

    if (res[0].found) {
      debug('register', 'fail', 'Email already exists')
      throw new UserError('Email already exists')
    }

    var response = yield client.index({
      index: index,
      type: type,
      id: id,
      body: {
        email: body.email,
        created_at: moment.valueOf()
      }
    })

    this.body = 'Registred'

    debug('register', 'done', response);
    yield next;
  }
}

exports.setAuthToken = function(client, expires_after) {

  genifyClient(client)
  var index = 'shoplet'
  var type = 'user'

  return function *setAuthToken(next) {

    var body = this.request.body

    debug('setAuthToken', 'body', body)

    assert(validateEmail(body.email), 'Invalid email: '+body.email)

    // Get associated user (tokens are stored on the user)
    var id = getDigest(body.email)
    var res = yield client.get({
      index: index,
      type: type,
      id: id,
      ignore: [404]
    })

    if (!res[0].found) {
      debug('setAuthToken', 'fail', 'Email not found')
      throw new UserError('Email not found')
    }

    // Set on this for mailing in downstream mv
    this.auth_token = utils.makeTokenData({
      email: body.email,
      entity_id: this.request.entity._id
    }, expires_after)

    // Make sure used_at is false for the client.update
    this.auth_token.used_at = null

    var res = yield client.update({
      index: index,
      type: type,
      id: id,
      body: {
        doc: {
          auth_token: this.auth_token
        }
      }
    })

    debug('setAuthToken', 'token', this.auth_token)

    this.body = this.auth_token.token

    yield next
  }
}

exports.getLoginToken = function(client, expires_after) {

  genifyClient(client)
  var index = 'shoplet'
  var type = 'user'

  return function*getLoginToken(next) {

    var body = this.request.body

    debug('getLoginToken', 'body', body)

    // Decode and validate body auth_token
    try {
      debug('typeof token', typeof body.token)
      var auth_token_data = utils.decodeJwtToken(body.token)
    } catch(err) {
      throw new UserError('Could not decode token: '+body.token)
    }

    assert(auth_token_data && auth_token_data.entity_id === this.request.entity._id, 'Invalid token')
    assert(!utils.isExpired(auth_token_data), 'Token expired. Please request a new token')

    // Get associated user (tokens are stored on the user)
    var id = getDigest(auth_token_data.email)
    var res = yield client.get({
      index: index,
      type: type,
      id: id,
      ignore: [404]
    })

    var user = res[0]

    if (!user.found) {
      debug('getLoginToken', 'fail', 'Email not found')
      throw new UserError('Email not found')
    }

    debug('user login_token', user)

    assert(!user._source.auth_token.used_at, 'Token is used. Please request a new token')

    // Make login_token
    this.login_token = utils.makeTokenData({
      email: user._source.email
    }, expires_after)

    // Make sure revoked_at is false for the client.update
    this.login_token.revoked_at = null

    // Add login_token to user; invalidate auth_token by setting used_at ts
    var res = yield client.update({
      index: index,
      type: type,
      id: id,
      body: {
        doc: {
          auth_token: { used_at: moment().valueOf() },
          login_token: this.login_token
        }
      }
    })

    debug('getLoginToken', 'token', this.login_token.token)

    this.body = this.login_token.token

    yield next
  }
}

exports.validateLoginToken = function(client) {

  genifyClient(client)
  var index = 'shoplet'
  var type = 'user'

  return function*validateLoginToken(next) {

    var body = this.request.body

    debug('validateLoginToken', 'body', body)

    // Decode and validate body login_token
    try {
      debug('typeof token', typeof body.token)
      var token_data = utils.decodeJwtToken(body.token)
    } catch(err) {
      throw new UserError('Could not decode token: '+body.token)
    }

    debug('decoded login_token', token_data)

    assert(!utils.isExpired(token_data), 'Token expired. Please request a new token')

    // Get associated user
    var id = getDigest(token_data.email)
    var res = yield client.get({
      index: index,
      type: type,
      id: id,
      ignore: [404]
    })

    var user = res[0]

    if (!user.found) {
      debug('validateLoginToken', 'fail', 'Email not found')
      throw new UserError('Email not found')
    }

    debug('user login_token', user)

    assert(!user._source.login_token.revoked_at, 'Token is revoked. Please request a new token')

    this.body = 'Token is valid'
  }
}

exports.revokeLoginToken = function(client) {

  genifyClient(client)
  var index = 'shoplet'
  var type = 'user'

  return function*revokeLoginToken(next) {

    var body = this.request.body

    debug('revokeLoginToken', 'body', body)

    // Decode and validate body login_token
    try {
      debug('typeof token', typeof body.token)
      var auth_token = utils.decodeJwtToken(body.token)
    } catch(err) {
      throw new UserError('Could not decode token: '+body.token)
    }

    var res = yield client.update({
      index: index,
      type: type,
      id: id,
      body: {
        doc: {
          login_token: { revoked_at: new Date() }
        }
      }
    })

    this.body = 'Token revoked'

    yield next
  }
}

exports.setEntity = function(client) {

  genifyClient(client)

  return function*setEntity(next) {

    this.body = {
      id: this.request.entity._id,
      settings: this.request.entity._source
    }

    yield next
  }
}

exports.setPages = function(client) {

  genifyClient(client)
  var type = 'page'

  return function*setPages(next) {

    var res = yield client.search({
      index: this.request.entity._id,
      type: type,
      size: 500,
      ignore: [404]
    })

    this.body = {}

    getGenHits(res).map(function(hit) {
      this.body[hit._id] = hit._source
    }.bind(this))

    yield next
  }
}

exports.setProducts = function(client) {

  genifyClient(client)
  var type = 'product'

  return function*setProducts(next) {

    var res = yield client.search({
      index: this.request.entity._id,
      type: type,
      size: 500,
      ignore: [404]
    })

    this.body = {}

    getGenHits(res).map(function(hit) {
      this.body[hit._id] = hit._source
    }.bind(this))

    yield next
  }
}
