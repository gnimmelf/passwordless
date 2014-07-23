var debug = require('debug')('paswordless:es-mw');
var parseBody = require('co-body');
var UserError = require('usererror');
var assert = require('assert');
var crypto = require('crypto');
var genify = require('thunkify-wrap').genify;


/*
// APP
curl -X POST 'http://localhost:3000/register' -d '{ "email": "gnimmelf@gmail.com" }'

// ES
curl -XDELETE 'http://localhost:9200/abareness'
curl -X GET 'http://localhost:9200/abareness/user/_search?pretty'
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

exports.register = function(client, index) {

  genifyClient(client)
  var type = 'user'

  return function*register(next) {

    var body = this.request.body = (yield parseBody.json(this, {limit: '1kb'}))

    debug('register', 'body', body)

    assert(body.email == 'gnimmelf@gmail.com', 'Invalid email: '+body.email)

    var id = getDigest(body.email)

    var res = yield *client.get({
      index: index,
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
      index: index,
      type: type,
      id: id,
      body: body
    })

    this.body = 'Registred'

    debug('register', 'done', response);
    yield next;
  }
}

exports.getLoginToken = function(client, index) {

  genifyClient(client)
  var type = 'user'

  return function *getLoginToken(next) {

    var body = this.request.body = (yield parseBody.json(this, {limit: '1kb'}))

    debug('getLoginToken', 'body', body)

    assert(body.email == 'gnimmelf@gmail.com', 'Invalid email: '+body.email)

    var id = getDigest(body.email)

    var res = yield *client.get({
      index: index,
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

exports.login = function() {

}

exports.logout = function() {

}


