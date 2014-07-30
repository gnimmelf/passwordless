var debug = require('debug')('paswordless:es-mw');
var UserError = require('usererror');
var assert = require('assert');
var crypto = require('crypto');
var genify = require('thunkify-wrap').genify;
var moment = require('moment');

var utils = require('./utils');

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

/**
 * HELPERS
 */

function genifyClient(client) {
  if (!client.__genified) {
    client.search = genify(client.search);
    client.get = genify(client.get);
    client.index = genify(client.index);
    client.update = genify(client.update);
  }
  return client;
}

function getDigest(string) {
  return crypto.createHash('md5').update(string).digest('hex');
}

function getGenHits(gen_res, hit_index) {
  // Results from a genified method is returned as an array
  var hits = gen_res[0].hits.hits;

  if (hit_index !== undefined) {
    return hits[hit_index];
  }

  return hits;
}

function *getUser(client, user_email) {
  // Get associated user (tokens are stored on the user)
  var index = 'shoplet'
  var type = 'entity'

  var id = getDigest(user_email);

  var res = yield client.get({
    index: index,
    type: type,
    id: id,
    ignore: [404]
  });

  debug('getUser', user_email, res)

  return res[0];
}

function *updateUser(client, user_email, body_doc) {
  var index = 'shoplet'
  var type = 'entity'

  var id = getDigest(user_email);

  var res = yield client.update({
    index: index,
    type: type,
    id: id,
    body: {
      doc: body_doc
    }
  })

  return res
}

/**
 * PASSWORDLESS
 */

exports.setCtxEntity = function(client, hostname) {
  // Get `ctx.request.hostname`
  // Set `ctx.entity`

  genifyClient(client)
  var index = 'shoplet'
  var type = 'entity'

  return function*setCtxEntity(next) {

    hostname = hostname || this.request.hostname

    if (!hostname || hostname === 'localhost') {
      debug('setCtxIndex', 'Invalid hostname', hostname)
      throw new UserError('Invalid hostname')
    }

    var res = yield client.search({
      index: index,
      type: type,
      q: 'hostname:'+hostname,
      size: 1,
      ignore: [404]
    })

    this.entity = getGenHits(res, 0);

    debug('setCtxIndex', this.entity._id);

    yield next;
  }

}

exports.registerUser = function(client) {
  // Get `ctx.request.body.email`
  // Insert new user
  // Set `ctx.user_rec`

  genifyClient(client)
  var index = 'shoplet'
  var type = 'user'

  return function*registerUser(next) {

    var body = this.request.body
    assert(utils.validateEmail(body.email), 'Invalid email: '+body.email)

    var user_rec = yield getUser(client, body.email)

    if (user_rec.found) {
      debug('register', 'fail', 'Email already exists')
      throw new UserError('Email already exists')
    }

    // Create new user
    user_rec = {
      email: body.email,
      created_at: moment.valueOf()
    }

    // Insert new user
    yield client.index({
      index: index,
      type: type,
      body: user_rec
    })

    // Set data on context
    this.user_rec = user_rec

    // Set response
    this.body = 'Registred'

    yield next;
  }
}

exports.setCtxTokenData = function(token_type) {
  // Decode and vaildate `ctx.request.body.token`
  // Set `ctx.req_token_data`

  var token_name = {
    'auth_token': 'Auth-token',
    'login_token': 'Login-token'
  }[token_type];

  assert(token_name, 'setCtxTokenData: unknown token_type: '+token_type)

  return function*setCtxTokenData(next) {

    var body = this.request.body
    var token_data;
    try {
      token_data = utils.decodeJwtToken(body.token)
    } catch(err) {
      throw new UserError('Could not decode '+token_name+': '+body.token)
    }

    if('auth_token' == token_type) {
      assert(token_data && token_data.entity_id === this.entity._id, 'Invalid '+token_name+' entity')
    }
    assert(!utils.isExpired(token_data), token_name+' has expired. Please request a new token')

    // Set data on context
    this.req_token_data = token_data

    yield next
  }
}

exports.setCtxUserRec = function(client) {
  // Get user email from `ctx.reg_token` or `ctx.body.email`
  // Set `ctx.user_rec`

  genifyClient(client)

  return function*setCtxUserRec(next) {

    var user_email;
    if (this.req_token_data) {
      user_email = this.req_token_data.email
    }
    else if (this.request.body.email) {
      user_email = this.request.body.email;
    }
    else {
      throw new UserError('Email is missing!')
    }

    // Assert valid email
    assert(utils.validateEmail(user_email), 'Invalid email: '+user_email)

    // Get user, all token data is stored on user
    var user_rec = yield getUser(client, user_email)

    if (!user_rec.found) {
      debug('setUserToken', 'fail', 'User email not found')
      throw new UserError('User email not found')
    }

    // Set data on context
    this.user_rec = user_rec

    yield next
  }
}

exports.makeLoginToken = function(client, expires_after) {

  genifyClient(client)

  return function *makeLoginToken(next) {

    assert(this.user_rec, 'ctx.user_rec is missing! Make sure it get set upstream!')

    // Make `login_token_data`
    var login_token_data = utils.makeTokenData({
      email: this.user_rec._source.email,
      entity_id: this.entity._id
    }, expires_after)

    // Make sure `login_token_data.used_at` is null!
    login_token_data.used_at = null

    // Update user: add `login_token`
    yield updateUser(client, {
      login_token: login_token_data
    })

    debug('makeLoginToken', 'login_token_data', login_token_data)

    // Set `login_token_data` on context for downstream use
    this.login_token_data = login_token_data

    // Return token
    this.body = login_token_data.token

    yield next
  }
}

exports.makeAuthToken = function(client, expires_after) {

  genifyClient(client)

  return function*makeAuthToken(next) {

    assert(this.req_token_data, 'ctx.req_token_data is missing! Make sure it get set upstream!')
    assert(this.user_rec, 'ctx.user_rec is missing! Make sure it get set upstream!')

    // Make sure `login_token` is not used!
    assert(!this.user_rec._source.login_token.used_at, 'Login token is used. Please request a new token')

    // Make `auth_token_data`
    var auth_token_data = utils.makeTokenData({
      email: this.user_rec._source.email
    }, expires_after)

    // Make sure auth_token_data.revoked_at is NULL
    auth_token_data.revoked_at = null

    // Update user: invalidate `login_token`, add `auth_token`
    yield updateUser(client, {
      login_token: { used_at: moment().valueOf() },
      auth_token: auth_token_data
    })

    // Set `auth_token_data` on context for downstream use
    this.auth_token_data = auth_token_data

    this.body = this.auth_token_data.token

    yield next
  }
}

exports.authorizeUser = function(client) {

  genifyClient(client)

  return function*authorizeUser(next) {

    assert(this.req_token_data, 'ctx.req_token_data is missing! Make sure it get set upstream!')
    assert(this.user_rec, 'ctx.user_rec is missing! Make sure it get set upstream!')

    assert(!this.user_rec._source.login_token.revoked_at, 'Token is revoked. Please request a new token')

    this.body = 'Token is valid'

    yield next
  }
}

exports.revokeLoginToken = function(client) {

  genifyClient(client)

  return function*revokeLoginToken(next) {

    this.body = 'Token revoked'

    yield next
  }
}

/**
 * DATA GETTERS - Move!
 */

exports.returnEntity = function(client) {

  genifyClient(client)

  return function*returnEntity(next) {

    this.body = {
      id: this.entity._id,
      settings: this.entity._source
    }

    yield next
  }
}

exports.returnPages = function(client) {

  genifyClient(client)
  var type = 'page'

  return function*returnPages(next) {

    var res = yield client.search({
      index: this.entity._id,
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

exports.returnProducts = function(client) {

  genifyClient(client)
  var type = 'product'

  return function*returnProducts(next) {

    var res = yield client.search({
      index: this.entity._id,
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
