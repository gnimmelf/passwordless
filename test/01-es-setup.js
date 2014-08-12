/*
$> DEBUG=mongrove* NODE_ENV=test npm test
*/

var should = require("should");
var mocha = require('mocha');
var request = require('supertest');
var koa = require('koa');
var co = require('co');
var exec = require('child_process').exec;
var fs = require('fs')

var esGenClientX = require('../lib/es-gen-client-x.js');

console.log("-----------------------------")
console.log('NODE_ENV: '+process.env.NODE_ENV);

if ( process.env.NODE_ENV !== 'test' ) {
    console.log("Woops, you want NODE_ENV=test before you try this again!");
    process.exit(1);
}

function readFile(file) {
  return function(fn){
    fs.readFile(file, 'utf8', fn);
  }
}

describe('esGenClientX', function() {

  var client

  before(function(done){

    client = esGenClientX({
      host: 'localhost:9200',
      apiVersion: '1.3',
      //log: 'trace'
    })

    done();

  });

  it("checked that index `unique_key` exists", function(done) {

    var res

    co(function*() {

      res = yield client.x.curlExistsPath('/unique_key')
      res.should.be.true

      done()
    })()

  })

  it("deleted index `entity`", function(done) {

    var res

    co(function*() {

      res = yield client.indices.delete({
        index: 'entity',
        ignore: [404]
      })

      done()
    })()

  })


  it("created index `entity`", function(done) {

    var res

    co(function*() {

      res = yield client.indices.create({
        index: 'entity'
      })

      done()
    })()

  })

  it("mapped type `entity/user`", function(done) {

    var res

    co(function*() {

      res = yield client.indices.putMapping({
        index: 'entity',
        type: 'user',
        body: {
          'user': {
            properties : {
              email: {type : "string", index : "not_analyzed"}
            }
          }
        }
      })

      done()
    })()

  })


  it("mapped type `entity/merchant`", function(done) {

    var res

    co(function*() {

      res = yield client.indices.putMapping({
        index: 'entity',
        type: 'merchant',
        body: {
          'merchant': {
            properties : {
              hostname: {type : "string", index : "not_analyzed"},
              image_base_url: {type : "string", index : "not_analyzed"}
            }
          }
        }
      })

      done()
    })()

  })

  it("created `entity/merchant/abareness` ", function(done) {

    var res

    co(function*() {

      res = yield client.create({
        index: 'entity',
        type: 'merchant',
        id: 'abareness',
        body: {
          "hostname":"abareness.no",
          "image_base_url": "https://s3-eu-west-1.amazonaws.com/fireshop/abareness"
        }
      })

      // http://www.elasticsearch.org/guide/en/elasticsearch/client/javascript-api/current/api-reference.html#api-indices-refresh
      res = yield client.indices.refresh()

      done()
    })()

  })

  it("created `abareness/pages` ", function(done) {

    var res

    co(function*() {

      console.log('Current directory: ' + process.cwd());

      var data = yield readFile('./data/pages.json.txt');
      data = JSON.parse(data)

      var bulk_request = client.x.make_bulk_request(data, 'abareness', 'page')
      var res = yield client.bulk({
        body: bulk_request
      })

      // http://www.elasticsearch.org/guide/en/elasticsearch/client/javascript-api/current/api-reference.html#api-indices-refresh
      res = yield client.indices.refresh()

      done()
    })()

  })

})