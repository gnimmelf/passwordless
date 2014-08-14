var debug = require('debug')('passwordless:es-unique-key')

var co = require('co')

module.exports = function(client) {
  return new Unique(client)
}

function Unique(client) {
  this.client = client
  this.index = 'unique_key'

  debug('Setting up Unique index `'+this.index+'`')
}

var proto = Unique.prototype;

proto.create = function*(type, key, doc_id) {

  var body_doc = (doc_id ? {id: doc_id} : {})

  res = yield this.client.index({
    index: this.index,
    type: type,
    id: key,
    body: body_doc
  })
  return res
}

proto.delete = function*(type, key) {
  res = yield this.client.delete({
    index: this.index,
    type: type,
    id: key
  })
  return res
}

proto.exists = function*(type, key) {
  res = yield this.client.exists({
    index: this.index,
    type: type,
    id: key
  })
  return res
}

proto.setDocId = function*(type, key, doc_id) {
  res = yield this.client.update({
    index: this.index,
    type: type,
    id: key,
    body: {
      doc: {id: doc_id}
    }
  })
  return res
}

proto.get = function*(type, key) {
  res = yield this.client.get({
    index: this.index,
    type: type,
    id: key
  })
  return res
}

proto.update = function*(type, old_key, new_key) {

  // TODO! Perserve the body_doc

  res = yield this.create(type, new_key)
  res = yield this.delete(type, old_key)
  return res
}

