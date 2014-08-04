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
      log: 'trace'
    })

    done();

  });


  it("curl-create an index, even if it already exists exists", function(done) {

    var res

    co(function*() {

      // Make sure it is deleted
      res = yield client.x.curlDeletePath('/test_index')

      res = yield client.x.curlPutPath('/test_index')
      res.should.have.property("status", 'success')

      res = yield client.x.curlPutPath('/test_index')
      res.should.have.property("status")
      res.status.should.not.equal('error')

      done()
    })()

  })

  it("curl-test that an index exists", function(done) {

    var res

    co(function*() {

      res = yield client.x.curlExistsPath('/test_index')
      res.should.be.true

      done()
    })()
  })

  it("curl-delete an index, even if it doesn't exists", function(done) {

    var res

    co(function*() {

      res = yield client.x.curlDeletePath('/test_index')
      res.should.have.property("status", 'success')


      res = yield client.x.curlDeletePath('/test_index')
      res.should.have.property("status")
      res.status.should.not.equal('error')

      done()
    })()

  })

  it("curl-test that an index does not exists", function(done) {

    var res

    co(function*() {

      res = yield client.x.curlExistsPath('/test_index')
      res.should.be.false

      done()
    })()
  })

  it("curl-delete path 'index/type', even if it does not exists", function(done) {

    var res

    co(function*() {

      res = yield client.x.curlDeletePath('/test_index/test_type')
      res.should.have.property("status")
      res.status.should.not.equal('error')

      done()
    })()
  })

  it("curl-create a type mapping", function(done) {

    var res

    co(function*() {

      res = yield client.x.curlPutPath('/test_index/', {
        mappings : {
          properties: {
            test_type: {
              email: {type: 'string'}
            }
          }
        }
      })
      res.should.have.property("status", 'success')

      done()
    })()
  })

})