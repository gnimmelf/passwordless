var debug = require('debug')('passwordless:es-gen-client-x')
var util = require('util')
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
    ['indices', 'create'],
    ['indices', 'delete'],
    ['indices', 'getMapping']
    ['indices', 'putMapping']
  ].concat(methods || [])

  methods.map(function(key) {
    if (typeof client[key] == 'function') {
      debug('genify', key)
      client[key] = genify(client[key])
    } else if (util.isArray(key)) {
      client[key[0]][key[1]] = genify(client[key[0]][key[1]])
    }
  })
}

function getGenRes(es_res) {
  // Results from a genified method is returned as an array
  return es_res[0]
}

function jSendRes(res) {

  if (res && res.status == 'error') {
    // Error from `curlCmd`
    return res
  }

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
    // Figure out how to handle various responses
    var status_props = ['acknowledged', 'created']
    var is_handled = false

    // Assume status 200
    jSend.code = 200

    for (var i=0, ii=status_props.length; i<ii; i++) {
      var status_prop = status_props[i]
      debug(status_prop, res[status_prop], typeof res[status_prop])
      if (typeof res[status_prop] == 'boolean') {
        jSend.status = (res[status_prop] ? 'success' : 'fail')
        jSend.data = (res[status_prop] ? status_prop : 'not '+status_prop)
        is_handled = true
        break
      }
    }

    if (!is_handled) {
      throw new Error('No status_prop set for '+JSON.stringify(res))
    }

  }
  return jSend
}

function *curlCmd(options_str, host, path, data) {

  data = (data ? JSON.stringify(data) : false)

  cmd_str = ["curl", options_str, "'http://localhost:9200"+path+"'", (data ? "-d'"+data+"'" : '')].join(' ')

  res = yield *exec(cmd_str)

  debug('curlCmd', cmd_str, res[0])

  try {
    return JSON.parse(res[0])
  } catch(err) {
    return {
      data: 'curlCmd: result is not a JSON-string: "'+res[0]+'"',
      status: 'error',
      code: 500
    }
  }
}

