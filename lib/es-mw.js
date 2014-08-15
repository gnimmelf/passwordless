var debug = require('debug')('passwordless:es-mw')
var UserError = require('usererror')
var assert = require('assert')
var crypto = require('crypto')
var moment = require('moment')

var extend = require('util')._extend;
var utils = require('./utils')


/**
 * HELPERS
 */

function getDigest(string) {
  return crypto.createHash('md5').update(string).digest('hex')
}

function getHits(res, hit_index) {
  // Results from a genified method is returned as an array
  var hits = res.data.hits.hits

  if (hit_index !== undefined) {
    return hits[hit_index]
  }

  return hits
}

function *getUserData(client, user_email) {
  // Get associated user (tokens are stored on the user)
  var index = 'entity'
  var type = 'user'
  var hit
  var user_data

  // Refresh
  res = yield client.indices.refresh()

  res = yield client.search({
    index: index,
    type: type,
    q: 'email='+user_email,
    size: 1
  })

  hit = getHits(res, 0)
  if (hit) {
    user_data = extend({}, hit._source)
    user_data.id = hit._id
  }

  debug('getUserData', 'user_data', res)

  return user_data
}

function *updateUserData(client, user_data, update_data) {
  var index = 'entity'
  var type = 'user'

  debug('updateUserData', user_data.id, update_data)

  var res = yield client.update({
    index: index,
    type: type,
    id: user_data.id,
    body: {
      doc: update_data
    }
  })

  debug('updateUserData', 'updated', res)

  // Extend the `user_data` object with the `update_data`
  extend(user_data, update_data)

  return res
}

/**
 * PASSWORDLESS
 */

exports.setCtxMerchantData = function(client, hostname) {
  // Get `ctx.request.hostname`
  // Set `ctx.merchant_data`

  var index = 'entity'
  var type = 'merchant'

  return function*setCtxMerchantData(next) {
    var res
    var hit

    hostname = hostname || this.request.hostname

    if (!hostname || hostname === 'localhost') {
      debug('setCtxMerchantData', 'Invalid hostname', hostname)
      throw new UserError('Invalid hostname')
    }

    res = yield client.search({
      index: index,
      type: type,
      q: 'hostname:'+hostname,
      size: 1,
      ignore: [404]
    })

    hit = getHits(res, 0)
    assert(hit, "could not find merchant by hostname: "+hostname)

    // Set data on context
    this.merchant_data = hit._source
    this.merchant_data.id = hit._id

    debug('setCtxMerchantData', this.merchant_data)

    yield next
  }

}

exports.registerUser = function(client) {
  // Get `ctx.request.body.email`
  // Insert new user
  // Set `ctx.user_data`

  var index = 'entity'
  var type = 'user'

  return function*registerUser(next) {
    var res
    var user_data
    var body = this.request.body

    assert(utils.validateEmail(body.email), 'Invalid email: '+body.email)

    // Refresh
    res = yield client.indices.refresh()

    // Check that email does not allready exists
    res = yield client.x.unique.exists('email', body.email)

    if (res) {
      debug('register', 'fail', 'Email already exists')
      throw new UserError('Email already exists')
    }

    // Create new `user_data`
    user_data = {
      email: body.email,
      created_at: moment().valueOf()
    }

    // reserve email by inserting as unique key
    yield client.x.unique.create('email', body.email)

    // Insert new `user_data`
    res = yield client.index({
      index: index,
      type: type,
      body: user_data
    })

    // Set data on context
    user_data.id = res.data._id
    this.user_data = user_data

    debug('registerUser', 'new user_data', user_data)

    yield next
  }
}

exports.setCtxTokenData = function(token_type) {
  // Decode and vaildate `ctx.request.body.token`
  // Set `ctx.req_token_data`

  var token_name = {
    'authenticate_token': 'Authenticate-token',
    'authorize_token': 'Authorize-token',
  }[token_type]

  assert(token_name, 'setCtxTokenData: unknown token_type: '+token_type)

  return function*setCtxTokenData(next) {
    var res
    var token_data

    var body = this.request.body
    try {
      token_data = utils.decodeJwtToken(body.token)
    } catch(err) {
      throw new UserError('Could not decode '+token_name+': '+body.token)
    }

    if(token_type == 'authenticate_token') {
      assert(token_data && token_data.merchant_id === this.merchant_data.id, 'Invalid '+token_name+' merchant-id')
    }
    assert(!utils.isExpired(token_data), token_name+' has expired. Please request a new token')

    // Set data on context
    this.req_token_data = token_data

    yield next
  }
}

exports.setCtxUserRec = function(client) {
  // Get user email from `ctx.reg_token` or `ctx.body.email`
  // Set `ctx.user_data`

  return function*setCtxUserRec(next) {
    var res
    var user_email
    var user_data

    if (this.req_token_data) {
      user_email = this.req_token_data.email
    }
    else if (this.request.body.email) {
      user_email = this.request.body.email
    }
    else {
      throw new UserError('Email is missing!')
    }

    // Assert valid email
    assert(utils.validateEmail(user_email), 'Invalid email: '+user_email)

    // Get user, all token data is stored on user
    user_data = yield getUserData(client, user_email)

    if (!user_data) {
      debug('setCtxUserRec', 'fail', 'User email not found')
      throw new UserError('User email not found')
    }

    // Set data on context
    this.user_data = user_data

    yield next
  }
}

exports.makeAuthenticateToken = function(client, expires_after) {
  // Make an `authenticate_token` to exchange for a `authorize_token`

  return function *makeAuthenticateToken(next) {
    var res
    var authenticate_token_data

    assert(this.user_data && this.user_data.id, 'ctx.user_data is missing! Make sure it gets set upstream!')

    // Make `authenticate_token_data`
    authenticate_token_data = utils.makeTokenData({
      email: this.user_data.email,
      merchant_id: this.merchant_data.id
    }, expires_after)

    // Make sure `authenticate_token_data.used_at` is null!
    authenticate_token_data.used_at = null

    // Update user: add `authenticate_token`
    res = yield updateUserData(client, this.user_data, {
      authenticate_token: authenticate_token_data
    })

    yield next
  }
}

exports.makeAuthorizeToken = function(client, expires_after) {
  // Make `authorize_token` in exchange for an `authenticate_token`

  return function*makeAuthorizeToken(next) {
    var res
    var authorize_token_data

    assert(this.req_token_data, 'ctx.req_token_data is missing! Make sure it gets set upstream!')
    assert(this.user_data, 'ctx.user_data is missing! Make sure it gets set upstream!')

    // Make sure `authenticate_token` is not used!
    assert(!this.user_data.authenticate_token.used_at, 'Authenticate-token is used. Please request a new token')

    // Make `authorize_token_data`
    authorize_token_data = utils.makeTokenData({
      email: this.user_data.email,
      merchant_id: this.merchant_data.id
    }, expires_after)

    // Make sure `authorize_token_data.revoked_at` is NULL
    authorize_token_data.revoked_at = null

    // Update user: invalidate `authenticate_token`, add `authorize_token`
    res = yield updateUserData(client, this.user_data, {
      authenticate_token: { used_at: moment().valueOf() },
      authorize_token: authorize_token_data
    })

    yield next
  }
}

exports.authorizeUser = function(client) {

  return function*authorizeUser(next) {

    assert(this.req_token_data, 'ctx.req_token_data is missing! Make sure it get set upstream!')
    assert(this.user_data, 'ctx.user_data is missing! Make sure it get set upstream!')

    assert(this.user_data.authorize_token, 'No Authorization Token for user. Please request a new token')
    assert(!this.user_data.authorize_token.revoked_at, 'Authorization Token is revoked. Please request a new token')

    yield next
  }
}

exports.revokeAuthorizeToken = function(client) {

  return function*revokeAuthorizeToken(next) {

    // TODO! revoke auth_token

    yield next
  }
}

/**
 * DATA GETTERS - Move!
 */

exports.returnPages = function(client) {

  var type = 'page'

  return function*returnPages(next) {

    var res = yield client.search({
      index: this.merchant_data.id,
      type: type,
      size: 500,
      ignore: [404]
    })

    this.body = {}

    getHits(res).map(function(hit) {
      this.body[hit._id] = hit._source
    }.bind(this))

    yield next
  }
}

exports.returnProducts = function(client) {

  var type = 'product'

  return function*returnProducts(next) {

    var res = yield client.search({
      index: this.merchant_data.id,
      type: type,
      size: 500,
      ignore: [404]
    })

    this.body = {}

    getHits(res).map(function(hit) {
      this.body[hit._id] = hit._source
    }.bind(this))

    yield next
  }
}
