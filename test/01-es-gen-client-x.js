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

describe('TESTING: es-gen-client-x.js:', function() {

  var client;

  before(function(done){

    client = esGenClientX({
      host: 'localhost:9200',
      apiVersion: '1.3',
      log: 'trace'
    })

    done();

  });


  it("can create an index, even if it already exists exists", function(done) {

    var res

    co(function*() {

      res = yield client.x.curlPutPath('/unique_key')
      res.should.have.property("status")

      res = yield client.x.curlPutPath('/unique_key')
      res.should.have.property("status")

      done()
    })()

  })

  it("can test that an index exists", function(done) {

    var res

    co(function*() {

      res = yield client.x.curlExistsPath('/unique_key')
      res.should.be.true

      done()
    })()
  })

  it("can delete an index, even if it doesn't exists", function(done) {

    var res

    co(function*() {

      res = yield client.x.curlDeletePath('/unique_key')
      res.should.have.property("status")


      res = yield client.x.curlDeletePath('/unique_key')
      res.should.have.property("status")

      done()
    })()

  })

  it("can test that an index does not exists", function(done) {

    var res

    co(function*() {

      res = yield client.x.curlExistsPath('/unique_key')
      res.should.be.false

      done()
    })()
  })

})