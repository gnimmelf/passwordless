var debug = require('debug')('passwordless:es-gen-client-x')
var elasticsearch = require('elasticsearch')
var genify = require('thunkify-wrap').genify
var exec = require('child_process').exec;
var uniqueKey = require('./es-unique-key')

exec = genify(exec)

module.exports = function(client_params, x_options) {

  x_options = x_options || {}

  var client = new elasticsearch.Client(client_params)

  debug(client_params)

  genifyClient(client)

  // Add 'extras'
  client.x = {}
  client.x.unique = uniqueKey(client, x_options.unique)

  client.x.curlGetPath = function*(path) {
    var res = yield curlCmd('-X GET', client_params.host, path)
    return jSendRes(res)
  }

  client.x.curlPostPath = function*(path, data) {
    var res = yield curlCmd('-X POST', client_params.host, path, data)
    return jSendRes(res)
  }

  client.x.curlPutPath = function*(path, data) {
    var res = yield curlCmd('-X PUT', client_params.host, path)
    return jSendRes(res)
  }

  client.x.curlDeletePath = function*(path) {
    var res = yield curlCmd('-X DELETE', client_params.host, path)
    return jSendRes(res)
  }

  client.x.curlExistsPath = function*(path) {
    // http://superuser.com/questions/272265/getting-curl-to-output-http-status-code
    var res = yield curlCmd('-s -o /dev/null -I -w "%{http_code}"', client_params.host, path)
    return (res == 200 ? true : false)
  }

  client.x.jSendRes = jSendRes

  return client
}

function genifyClient(client, methods) {
  methods = [
    'count',
    'create',
    'delete',
    'get',
    'index',
    'search',
    'update',
    'putMapping',
  ].concat(methods || [])

  methods.map(function(key) {
    if (typeof client[key] == 'function') {
      debug('genify', key)
      client[key] = genify(client[key])
    }
  })
}

function getGenRes(es_res) {
  // Results from a genified method is returned as an array
  return es_res[0]
}

function jSendRes(res) {
  var jSend = {}
  if (res.status !== undefined) {
    if (res.status == 200) {
      jSend.data = res
      jSend.status = 'success'
    }
    else {
      jSend.data = res.error
      jSend.status = 'fail'
      jSend.code = res.status
    }
  }
  else if (res.acknowledged !== undefined) {
    jSend.status = (res.acknowledged ? 'success' : 'fail')
    jSend.data = (res.acknowledged ? 'acknowledged' : 'not acknowledged')
  }
  else {
    throw new Error('Unhandled jSendRes: '+JSON.stringify(res))
  }
  return jSend
}

function *curlCmd(options_str, host, path, data) {

  data = (data ? JSON.stringify(data) : false)

  cmd_str = ["curl", options_str, "'http://localhost:9200"+path+"'", (data ? "-d'"+data+"'" : '')].join(' ')

  res = yield *exec(cmd_str)

  debug('curlCmd', cmd_str, res[0])
  return JSON.parse(res[0])
}

