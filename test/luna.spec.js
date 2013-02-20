#!/usr/bin/env node_modules/.bin/mocha

/**********************************************************************/

var path = require('path'),
    util = require('util'),
    log = require('npmlog'),
    nopt = require('nopt'),
    should = require('should'),
    novacom = require('./../lib/novacom'),
    luna = require('./../lib/luna');

/**********************************************************************/

var knownOpts = {
	"level": ['silly', 'verbose', 'info', 'http', 'warn', 'error']
};
var argv = nopt(knownOpts, null /*shortHands*/, process.argv, 1 /*drop 'node'*/);

if (argv.help) {
	console.log("Usage: mocha luna.spec.js [--level=LEVEL]\n" +
		    "\tLEVEL is one of 'silly', 'verbose', 'info', 'http', 'warn', 'error'");
	process.exit(0);
}

/**********************************************************************/

log.heading = 'install.spec';
log.level = argv.level || 'warn';

/**********************************************************************/

describe ("luna", function() {
	this.timeout(5000);
	
	var session;
	before(function(done) {
 		session = new novacom.Session(null, done);
	});
	after(function(done) {
		session.end();
		session = null;
		done();
	});

	describe ("#send", function() {
		it ("should fail to invoke non-existing service", function(done) {
			luna.send({
				// luna options
				session: session
			}, {
				// luna addr
				service: 'com.ibm',
				method: 'getShares'
			}, {
				// luna param
			}, function(obj, next) {
				// onResponse
				next();
			}, function(err) {
				// next
				should.exist(err);
				err.should.be.an.instanceOf(Error);
				done();
			});
		});
		it ("should list luna statistics", function(done) {
			// This is a funky service: Although it
			// provides a single answer, the caller needs
			// to call it in interactive mode, with
			// subscription turned on...
			luna.send({
				session: session,
				nReplies: 0
			}, {
				service: 'com.palm.lunastats',
				method: 'getStats'
			}, {
				// luna param
				subscribe: true
			}, function(obj, next) {
				log.verbose('luna#send.onResponse', obj);
				should.exist(obj);
				should.exist(obj.documents);
				next(null, obj);
			}, function(err, obj) {
				log.verbose('luna#send.next', obj);
				should.exist(obj);
				should.exist(obj.documents);
				done(err);
			});
		});
	});
});

