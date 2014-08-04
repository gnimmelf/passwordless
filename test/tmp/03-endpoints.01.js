/*
$> DEBUG=mongrove* NODE_ENV=test npm test
*/

var should = require("should")
var mocha = require('mocha')
var request = require('supertest')
var koa = require('koa')
var co = require('co')

var esGenClientX = require('../lib/es-gen-client-x.js');

console.log("-----------------------------")
console.log('NODE_ENV: '+process.env.NODE_ENV)

if ( process.env.NODE_ENV !== 'test' ) {
    console.log("Woops, you want NODE_ENV=test before you try this again!")
    process.exit(1)
}

var server
var client


describe('Passwordless endpoints:', function() {

  before(function(done){

    var app = require('../node.js')
    server = app.listen()

    client = esGenClientX({
      host: 'localhost:9200',
      apiVersion: '1.3',
      //log: 'trace'
    })

    done()

  })

  it('deleted `entity` index', function(done) {
    co(function*() {

      res = yield client.indices.delete({
        index: 'entity',
        ignore: [404]
      })

      done()
    })
  })

  it('deleted `unique_key` index', function(done) {
    co(function*() {

      res = yield client.indices.delete({
        index: 'unique_key',
        ignore: [404]
      })

      done()
    })
  })

  it('created `entity/merchant` type', function(done) {
    co(function*() {

      yield putMapping('entity', 'merchant', {
        hostname: {type : "string", index : "not_analyzed"},
        image_base_url: {type : "string", index : "not_analyzed"}
      })

      done()
    })
  })

  it('has merchant data', function(done) {
    request(server)
      .get('/merchant')
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect(function(res) {
        //console.log(res.body)
        res.body.should.have.property('status', 'success')
        res.body.should.have.property('data')
        res.body.data.should.have.properties('id', 'hostname', 'image_base_url')
      })
      .end(done)
  })

  it('registered a user by email', function(done) {
    request(server)
      .post('/register')
      .send({email: 'gnimmelf@gmail.com'})
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect(function(res) {
        res.body.should.have.property("status", "success")
      })
      .end(function() {
        setTimeout(done, 1000)
      })
  })

  it('could not register a user by an existing email', function(done) {
    request(server)
      .post('/register')
      .send({email: 'gnimmelf@gmail.com'})
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect(function(res) {
        res.body.should.have.property("status", "fail")
        res.body.should.have.property("data", "Email already exists")
      })
      .end(done)
  })
})