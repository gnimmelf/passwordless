var debug = require('debug')('passwordless:es-gen-client-x')
var util = require('util')
var elasticsearch = require('elasticsearch')
var genify = require('thunkify-wrap').genify
var exec = require('child_process').exec;
var uniqueKey = require('./es-unique-key')
var utils = require('./utils')

var STATUS_CODES = require('http').STATUS_CODES

exec = genify(exec)

module.exports = function(client_params, x_options) {

  x_options = x_options || {}

  var client = new elasticsearch.Client(client_params)

  debug(client_params)

  genifyClient(client)

  // Add 'extras'
  client.x = {}

  client.x.curlGetPath = function*(path) {
    var res = yield curlCmd('-X GET', client_params.host, path)
    return {
      data: res[0],
      status: res[1]
    }
  }

  client.x.curlPostPath = function*(path, data) {
    var res = yield curlCmd('-X POST', client_params.host, path, data)
    return {
      data: res[0],
      status: res[1]
    }
  }

  client.x.curlPutPath = function*(path, data) {
    var res = yield curlCmd('-X PUT', client_params.host, path)
    return {
      data: res[0],
      status: res[1]
    }
  }

  client.x.curlDeletePath = function*(path) {
    var res = yield curlCmd('-X DELETE', client_params.host, path)
    return {
      data: res[0],
      status: res[1]
    }
  }

  client.x.curlExistsPath = function*(path) {
    // http://superuser.com/questions/272265/getting-curl-to-output-http-status-code
    var res = yield curlCmd('-s -o /dev/null -I -w "%{http_code}"', client_params.host, path)
    return {
      data: (res == 200 ? true : false),
      status: res
    }
  }

  // Unique-index wrapper
  client.x.unique = uniqueKey(client, x_options['unique_index_name'])

  return client
}

function genifyClient(client, methods) {
  methods = [
    'bulk',
    'count',
    'create',
    'delete',
    'get',
    'index',
    'search',
    'update',
    ['indices', 'create'],
    ['indices', 'delete'],
    ['indices', 'getMapping'],
    ['indices', 'putMapping']
  ].concat(methods || [])

  methods.map(function(key) {
    if (typeof client[key] == 'function') {
      client[key] = wrap_client_method(client, client[key], key)
    }
    else if (util.isArray(key)) {
      client[key[0]][key[1]] = wrap_client_method(client, client[key[0]][key[1]], key.join('.'))
    }
  })
}

function wrap_client_method(client, method, key_str) {

  debug('genify', key_str)

  var gen_method = genify(method, client)

  function* wrap() {
    var res = yield gen_method.apply(client, arguments);
    res = {
      data: res[0],
      status: res[1]
    }
    debug('method '+key_str+':', res)
    return res
  }

  return wrap
}

function *curlCmd(options_str, host, path, data) {

  data = (data ? JSON.stringify(data) : false)

  cmd_str = ["curl", options_str, "'http://localhost:9200"+path+"'", (data ? "-d'"+data+"'" : '')].join(' ')

  res = yield *exec(cmd_str)

  try {
    var data = JSON.parse(res[0])
  } catch(err) {
    debug('curlCmd ERROR on:', cmd_str, res[0])
    var data = [{
      data: 'result is not a JSON-string: "'+res[0]+'"',
      meta: 'curlCmd: '+cmd_str,
      status: 'error',
    }, 500]
  }
  debug('curlCmd:', cmd_str+': ', data)
  return data
}

