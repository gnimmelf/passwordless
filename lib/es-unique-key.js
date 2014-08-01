var debug = require('debug')('passwordless:es-unique-key')

module.exports = function(client, index) {
  return new Unique(client, index)
}

function Unique(client, index) {
  this.client = client
  this.index = (index || 'unique_key')
}

var proto = Unique.prototype;

proto.create = function*(type, key) {
  res = yield this.client.index({
    index: this.index,
    type: type,
    id: key,
    body: {}
  })
  return getEsRes(res)
}

proto.delete = function*(type, key) {
  res = yield this.client.delete({
    index: this.index,
    type: type,
    id: key
  })
  return getEsRes(res)
}

proto.exists = function*(type, key) {
  res = yield this.client.exists({
    index: this.index,
    type: type,
    id: key
  })
}

proto.update = function*(type, old_key, new_key) {
  res = yield this.create(type, new_key)
  res = yield this.delete(type, old_key)
  return res
}

function getEsRes(es_res) {
  // Results from a genified method is returned as an array
  return es_res[0]
}
