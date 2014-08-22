var debug = require('debug')('passwordless:es-mw')
var UserError = require('usererror')
var assert = require('assert')
var crypto = require('crypto')
var moment = require('moment')

var extend = require('util')._extend;
var utils = require('./utils')

var AUTHORIZE_TOKEN_TYPE = require('./constants').AUTHORIZE_TOKEN_TYPE
var AUTHENTICATE_TOKEN_TYPE = require('./constants').AUTHENTICATE_TOKEN_TYPE

/**
 * HELPERS
 */

function get_digest(string) {
  return crypto.createHash('md5').update(string).digest('hex')
}

function get_hits(res, hit_index) {
  // Results from a genified method is returned as an array
  var hits = res.data.hits.hits

  if (hit_index !== undefined) {
    return hits[hit_index]
  }

  return hits
}

function *get_user_data(client, user_email) {
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

  hit = get_hits(res, 0)
  if (hit) {
    user_data = extend({}, hit._source)
    user_data.id = hit._id
  }

  debug('get_user_data', 'res', res)
  debug('get_user_data', 'user_data', user_data)

  return user_data
}

function *update_user_data(client, user_data, update_data) {
  var index = 'entity'
  var type = 'user'

  debug('update_user_data', user_data.id, update_data)

  var res = yield client.update({
    index: index,
    type: type,
    id: user_data.id,
    body: {
      doc: update_data
    }
  })

  debug('update_user_data', 'updated', res)

  // Deep extend the `user_data` object with the `update_data`
  utils.extend.deep(user_data, update_data)

  return res
}

function make_authorize_token_data(ctx, expires_after, data) {
  // Merge data
  data = utils.extend(data || {}, {
    type: AUTHORIZE_TOKEN_TYPE,
    email: ctx.user_data.email,
    merchant_id: ctx.merchant_data.id,
  })

  // Make new `authorize_token_data`
  var authorize_token_data = utils.makeTokenData(AUTHORIZE_TOKEN_TYPE, data, expires_after)

  // Make sure `authorize_token_data.revoked_at` is NULL
  authorize_token_data.revoked_at = null

  return authorize_token_data
}

/**
 * PASSWORDLESS
 */


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
      created_at: moment().valueOf(),
      tokens: {
        authenticate_token: null,
        authorize_tokens: [],
      }
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

    hit = get_hits(res, 0)
    assert(hit, "could not find merchant by hostname: "+hostname)

    // Set data on context
    this.merchant_data = hit._source
    this.merchant_data.id = hit._id

    debug('setCtxMerchantData', this.merchant_data)

    yield next
  }

}

exports.setCtxTokenData = function(expected_token_type) {
  // Decode and vaildate `ctx.request.body.token`
  // Set `ctx.req_token_data`

  if (expected_token_type) {
    utils.assertTokenType(expected_token_type)
  }

  return function*setCtxTokenData(next) {
    var res
    var token_data

    var body = this.request.body
    try {

      token_data = utils.decodeJwtToken(body.token)

      debug('setCtxTokenData', 'body.token', token_data)

    } catch(err) {
      throw new UserError('Could not decode token')
    }

    utils.assertTokenType(token_data)

    if (expected_token_type) {
      utils.assertTokenType(token_data, expected_token_type)
    }

    if (token_data.type != AUTHORIZE_TOKEN_TYPE) {
      // NOTE! Don't check for `merchant` on `AUTHORIZE_TOKEN_TYPE`; allows using same token for multiple merchant sites(?)
      assert(token_data && token_data.merchant_id === this.merchant_data.id,
            utils.format('Invalid %s merchant-id', token_data.type))
    }
    assert(!utils.isExpired(token_data), utils.format('%s has expired. Please request a new token', token_data.type))

    // Set data on context
    token_data.token = body.token
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
    user_data = yield get_user_data(client, user_email)

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
    authenticate_token_data = utils.makeTokenData(AUTHENTICATE_TOKEN_TYPE, {
      email: this.user_data.email,
      merchant_id: this.merchant_data.id
    }, expires_after)

    // Make sure `authenticate_token_data.used_at` is null!
    authenticate_token_data.used_at = null

    // Update user: add `authenticate_token`
    res = yield update_user_data(client, this.user_data, {
      tokens: {
        authenticate_token: authenticate_token_data
      }
    })

    yield next
  }
}

exports.makeAuthorizeToken = function(client, expires_after) {
  // Make an `authorize_token` and add it to the `user_data`

  return function*makeAuthorizeToken(next) {
    var res
    var tokens_update = {}
    var authorize_token_data
    var authorize_tokens

    // Make a new `authorize_token_data`
    authorize_token_data = yield make_authorize_token_data(this, expires_after)

    // Add new token to list of `authorize_tokens`
    authorize_tokens = this.user_data.tokens.authorize_tokens.concat(authorize_token_data)

    // Add update: add new `authorize_token`
    tokens_update.authorize_tokens = authorize_tokens

    // Update user's tokens
    res = yield update_user_data(client, this.user_data, {
      tokens: tokens_update
    })

    yield next
  }
}

exports.ensureUserAuthorizeToken = function(client, expires_after) {
  // Ensure `authorize_tokens` in exchange for an `authenticate_token`

  return function*ensureUserAuthorizeToken(next) {
    var res
    var tokens_update = {}
    var authorize_token_data
    var authorize_tokens
    var valid_authorize_tokens

    assert(this.req_token_data, 'ctx.req_token_data is missing! Make sure it gets set upstream!')
    assert(this.user_data, 'ctx.user_data is missing! Make sure it gets set upstream!')

    // Make sure the passed `autenticate_token` is of correct type
    utils.assertTokenType(this.req_token_data, AUTHENTICATE_TOKEN_TYPE)

    // Make sure the passed `autenticate_token` is the same as the `user_data.tokens.authenticate_token`
    assert(this.req_token_data.token == this.user_data.tokens.authenticate_token.token,
          utils.format('%s not found. Please request a new token', AUTHENTICATE_TOKEN_TYPE))

    // Make sure `authenticate_token` is not used!
    assert(!this.user_data.tokens.authenticate_token.used_at,
          utils.format('%s is used. Please request a new token', AUTHENTICATE_TOKEN_TYPE))

    // Get list of `authorize_tokens`
    authorize_tokens = this.user_data.tokens.authorize_tokens

    // Get all valid `authorize_token`s
    valid_authorize_tokens = authorize_tokens.filter(function(token_data) {
      return !(utils.isExpired(token_data) || token_data.revoked_at)
    })

    if (!valid_authorize_tokens.length) {
      // Make a new `authorize_token_data`
      authorize_token_data = yield make_authorize_token_data(this, expires_after)

      // Add new token to list of `authorize_tokens` and add to `tokens_update`
      tokens_update.authorize_tokens = this.user_data.tokens.authorize_tokens.concat(authorize_token_data)
    }

    // Invalidate `authenticate_token`
    tokens_update.authenticate_token = { used_at: moment().valueOf() }

    // Update user's tokens
    res = yield update_user_data(client, this.user_data, {
      tokens: tokens_update
    })

    yield next
  }
}

exports.validateAuthorizeToken = function(client) {

  return function*validateAuthorizeToken(next) {

    var req_token
    var authorize_token_data

    assert(this.req_token_data, 'ctx.req_token_data is missing! Make sure it get set upstream!')
    assert(this.user_data, 'ctx.user_data is missing! Make sure it get set upstream!')

    // Get the `authorize_token_data` matching the `this.req_token_data`
    req_token = this.req_token_data.token
    for (var i=0, ii=this.user_data.tokens.authorize_tokens.length; i<ii; i++) {

      authorize_token_data = this.user_data.tokens.authorize_tokens[i]
      if (req_token == authorize_token_data.token) break

    }

    assert(authorize_token_data, 'No Authorization Token for user. Please request a new token')
    assert(!authorize_token_data.revoked_at, 'Authorization Token is revoked. Please request a new token')

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

    get_hits(res).map(function(hit) {
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

    get_hits(res).map(function(hit) {
      this.body[hit._id] = hit._source
    }.bind(this))

    yield next
  }
}
