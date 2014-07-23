var debug = require('debug')('paswordless:es-mw');
var UserError = require('usererror');
var assert = require('assert');
var crypto = require('crypto');
var genify = require('thunkify-wrap').genify;


/*
// APP
curl -X POST 'http://localhost:3000/register' -d '{ "email": "gnimmelf@gmail.com" }'
curl -X POST 'http://localhost:3000/token' -d '{ "email": "gnimmelf@gmail.com" }'

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

exports.setReqIndex = function(client, hostname) {

  genifyClient(client)
  var index = 'shoplet'
  var type = 'entity'

  return function*register(next) {

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

    this.request.index = getGenHits(res, 0)._id

    debug('setReqIndex', this.request.index)

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
      index: this.request.index,
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
      index: this.request.index,
      type: type,
      id: id,
      body: body
    })

    this.body = 'Registred'

    debug('register', 'done', response);
    yield next;
  }
}

exports.getLoginToken = function(client) {

  genifyClient(client)
  var type = 'user'

  return function *getLoginToken(next) {

    var body = this.request.body

    debug('getLoginToken', 'body', body)

    assert(body.email == 'gnimmelf@gmail.com', 'Invalid email: '+body.email)

    var id = getDigest(body.email)

    var res = yield *client.get({
      index: this.request.index,
      type: type,
      id: id,
      ignore: [404]
    })

    if (!res[0].found) {
      debug('getLoginToken', 'fail', 'Email not found')
      throw new UserError('Email not found')
    }

    this.body = 'Token delivered to '+body.email
  }
}

exports.login = function(client) {
  genifyClient(client)
  var type = 'user'

  return function*login(next) {

    yield next
  }
}

exports.logout = function() {

  genifyClient(client)
  var type = 'user'

  return function*logout(next) {

    yield next
  }
}


