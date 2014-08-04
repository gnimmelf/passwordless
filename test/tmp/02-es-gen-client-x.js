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


  it("deleted an index", function(done) {

    var res

    co(function*() {

      res = yield client.indices.delete({
        index: 'test_index',
        ignore: [404]
      })

      done()
    })()

  })


  it("created an index", function(done) {

    var res

    co(function*() {

      res = yield client.indices.create({
        index: 'test_index'
      })

      done()
    })()

  })

  it("created a type mapping", function(done) {

    var res

    co(function*() {

      res = yield client.indices.putMapping({
        index: 'test_index',
        type: 'test_type',
        body: {
          test_type: {
            properties : {
              email: {type : "string", index : "not_analyzed"}
            }
          }
        }
      })

      done()
    })()

  })


})