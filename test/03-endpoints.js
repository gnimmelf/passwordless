/*
$> DEBUG=mongrove* NODE_ENV=test npm test
*/

var should = require("should");
var mocha = require('mocha');
var request = require('supertest');
var koa = require('koa');
var co = require('co');
var exec = require('child_process').exec;
var assert = require('assert')

var esGenClientX = require('../lib/es-gen-client-x.js');

console.log("-----------------------------")
console.log('NODE_ENV: '+process.env.NODE_ENV);

if ( process.env.NODE_ENV !== 'test' ) {
    console.log("Woops, you want NODE_ENV=test before you try this again!");
    process.exit(1);
}

describe('esGenClientX: indexes and types:', function() {

  var client;

  before(function(done){

    client = esGenClientX({
      host: 'localhost:9200',
      apiVersion: '1.3',
      //log: 'trace'
    })

    done();

  });


  it("deleted `entity` index", function(done) {

    var res

    co(function*() {

      res = yield client.indices.delete({
        index: 'entity',
        ignore: [404]
      })

      done()
    })()

  })


  it("created `entity` index", function(done) {

    var res

    co(function*() {

      res = yield client.indices.create({
        index: 'entity'
      })

      done()
    })()

  })

  it("mapped tyep `entity/user`", function(done) {

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

      done()
    })()

  })

})