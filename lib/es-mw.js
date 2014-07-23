var debug = require('debug')('paswordless:es-mw');
var UserError = require('usererror');
var assert = require('assert');
var crypto = require('crypto');
var genify = require('thunkify-wrap').genify;
var jwt = require('jwt-simple');

var secret = 'This is not my secret'

/*
// APP
curl -X POST 'http://localhost:3000/register' -d '{ "email": "gnimmelf@gmail.com" }'
curl -X POST 'http://localhost:3000/token' -d '{ "email": "gnimmelf@gmail.com" }'
curl -X POST 'http://localhost:3000/login' -d '{ "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJjcmVhdGVkX2F0IjoiMjAxNC0wNy0yM1QxOTo0NjozNC40NzdaIiwiZXhwaXJlc19hZnRlciI6IjRoIiwiZW50aXR5IjoiYWJhcmVuZXNzIiwidXNlcl9lbWFpbCI6ImduaW1tZWxmQGdtYWlsLmNvbSIsInVzZWRfYXQiOm51bGx9.d8FBTh2UVZJ7YcDhSlzoXdMvoQ0HkxkqqHj5By-k0zc" }'

// ES
curl -X POST 'http://localhost:9200/shoplet/entity/abareness' -d '{ "hostname":"abareness.no" }'
curl -X GET 'http://localhost:9200/abareness/user/_search?pretty'
curl -XDELETE 'http://localhost:9200/abareness'
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

function isNotExpired(token) {
  return true
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

    var res = yield *client.search({
      index: index,
      type: type,
      q: 'hostname:'+hostname,
      size: 1,
      ignore: [404]
    })

    this.request.entity = getGenHits(res, 0)._id

    debug('setReqIndex', this.request.entity)

    yield next
  }

}

exports.register = function(client) {

  genifyClient(client)
  var type = 'user'

  return function*register(next) {

    var body = this.request.body

    debug('register', 'body', body)

    assert(body.email == 'gnimmelf@gmail.com', 'Invalid email: '+body.email)

    var id = getDigest(body.email)

    var res = yield *client.get({
      index: this.request.entity,
      type: type,
      id: id,
      ignore: [404]
    })

    if (res[0].found) {
      debug('register', 'fail', 'Email already exists')
      throw new UserError('Email already exists')
    }

    body.created_at = new Date().toISOString();

    var response = yield *client.index({
      index: this.request.entity,
      type: type,
      id: id,
      body: body
    })

    this.body = 'Registred'

    debug('register', 'done', response);
    yield next;
  }
}

exports.setAuthToken = function(client) {

  genifyClient(client)
  var type = 'user'

  return function *setAuthToken(next) {

    var body = this.request.body

    debug('setAuthToken', 'body', body)

    // TODO!
    assert(body.email == 'gnimmelf@gmail.com', 'Invalid email: '+body.email)

    var id = getDigest(body.email)

    var res = yield *client.get({
      index: this.request.entity,
      type: type,
      id: id,
      ignore: [404]
    })

    if (!res[0].found) {
      debug('setAuthToken', 'fail', 'Email not found')
      throw new UserError('Email not found')
    }

    this.auth_token = {
      created_at: new Date().toISOString(),
      expires_after: '4h',
      entity: this.request.entity,
      user_email: body.email,
      used_at: null
    }
    this.auth_token.token = jwt.encode(this.auth_token, secret)

    var res = yield *client.update({
      index: this.request.entity,
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

exports.setLoginToken = function(client) {
  genifyClient(client)
  var type = 'user'

  return function*setLoginToken(next) {

    var body = this.request.body

    debug('setLoginToken', 'body', body)

    // Decode and validate body auth_token
    var auth_token = jwt.decode(body.token, secret)
    assert(auth_token && auth_token.entity === this.request.entity, 'Invalid token')
    assert(isNotExpired(auth_token), 'Token expired')

    // Get associated user
    var id = getDigest(auth_token.user_email)
    var res = yield *client.get({
      index: this.request.entity,
      type: type,
      id: id,
      ignore: [404]
    })

    var user = res[0]

    if (!user.found) {
      debug('setLoginToken', 'fail', 'Email not found')
      throw new UserError('Email not found')
    }

    assert(!user._source.auth_token.used_at, 'Token is used')

    this.login_token = {
      created_at: new Date().toISOString(),
      expires_after: '1m',
      entity: this.request.entity,
      user_email: body.email
    }
    this.login_token.token = jwt.encode(this.login_token, secret)

    var res = yield *client.update({
      index: this.request.entity,
      type: type,
      id: id,
      body: {
        doc: {
          auth_token: { used_at: new Date().toISOString() },
          login_token: this.login_token
        }
      }
    })

    debug('setLoginToken', 'token', this.login_token.token)

    this.body = {
      token: this.login_token,
      expires_after: this.login_token.expires_after
    }

    yield next
  }
}

exports.revokeLoginToken = function(client) {

  genifyClient(client)
  var type = 'user'

  return function*revokeLoginToken(next) {

    yield next
  }
}


