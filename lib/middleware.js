var debug = require('debug')('paswordless:middleware');
var UserError = require('usererror');
var parseBody = require('co-body');

exports.emailer = function() {

}

exports.jSendWrapper = function() {
  // jSend: http://labs.omniti.com/labs/jsend
  return function *jSendWrapper(next) {
    var jSend = {
      data: null,
      status: 'success',
      meta: null
    }
    this.meta = {};

    try {
      yield next;
      jSend.data = this.body;
    } catch(e) {
      if (e.name == 'UserError' || e.name == 'AssertionError') {
        jSend.status = 'fail';
      } else {
        jSend.status = 'error';
        this.app.emit('error', e, this);
        console.log(e.stack);
      }
      try {
        jSend.data = JSON.parse(e.message);
      } catch(e2) {
        jSend.data = e.message || require('http').STATUS_CODES[this.status||500];
      }
    }
    jSend.meta = this.meta;
    this.body = jSend;
  }
}

exports.setHeaders = function() {
  return function *setHeaders(next) {
    this.set('x-powered-by', 'fireshop');
    //console.log(this);
    yield next;
  }
}

exports.logger = function(format) {
  format = format || ':method ":url"';

  return function *logger(next){
    var str = format
      .replace(':method', this.method)
      .replace(':url', this.url);

    console.log(str);

    yield next;
  }
}

exports.errorHandler = function() {
  return function*errorHandler(next) {
    try {
      yield next;
    } catch (e) {
      this.status = e.status || 500;
      this.body = e.message || require('http').STATUS_CODES[this.status];
      this.app.emit('error', e, this);
    }
  }
}

exports.jsonReqBodyParser = function(limit) {
  return function*(next) {
    this.request.body = (yield parseBody.json(this, {limit: limit || '1kb'}))
    yield next
  }
}