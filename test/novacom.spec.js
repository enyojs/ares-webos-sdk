#!/usr/bin/env node_modules/.bin/mocha

/**********************************************************************/

var path = require('path'),
    fs = require('fs'),
    util = require('util'),
    log = require('npmlog'),
    nopt = require('nopt'),
    async = require('async'),
    should = require('should'),
    streamBuffers = require("stream-buffers"),
    novacom = require('./../lib/novacom');

var knownOpts = {
	"level": ['silly', 'verbose', 'info', 'http', 'warn', 'error']
};
var argv = nopt(knownOpts, null /*shortHands*/, process.argv, 1 /*drop 'node'*/);

if (argv.help) {
	console.log("Usage: mocha novacom.spec.js [--level=LEVEL]\n" +
		    "\tLEVEL is one of 'silly', 'verbose', 'info', 'http', 'warn', 'error'");
	process.exit(0);
}

log.heading = 'novacom.spec';
log.level = argv.level || 'warn';
novacom.log.level = log.level;

var session;

function openSession(done) {
	log.verbose("openSession");
	// create session & wait for it to be established (done)
	session = new novacom.Session(undefined, done);
}

function closeSession(done) {
	log.verbose("closeSession");
	session.end();
	session = undefined;
	done();
}

var tmps = [];

function initTmp(done) {
	log.verbose("initTmp");
	tmps = [];
	done();
}

function cleanTmp(done) {
	log.verbose("cleanTmp");
	tmps.forEach(function(tmp) {
		log.verbose("cleanTmp", "removing " + tmp);
		fs.unlinkSync(tmp);
	});
	tmps = [];
	done();
}

function mkReadableStream(data, count) {
	var is = new streamBuffers.ReadableStreamBuffer({
		frequency: 10,       // in milliseconds.
		chunkSize: 2048     // in bytes.
	});
	is.pause();
	count = count || 1;
	while(count --) {
		is.put(data);
	}
	return is;
}

function mkWritableStream() {
	return new streamBuffers.WritableStreamBuffer({
		initialSize: (100 * 1024),      // start as 100 kilobytes.
		incrementAmount: (10 * 1024)    // grow by 10 kilobytes each time buffer overflows.
	});
}

describe("novacom", function() {
	this.timeout(3000);

	var sampleText = "This is a sample text.";

	var deviceTmp = '/tmp/mocha' + process.pid;

	describe("#put", function() {

		beforeEach(initTmp);
		afterEach(cleanTmp);

		beforeEach(openSession);
		afterEach(closeSession);

		it("should write a (small) file on the device", function(done) {
			var is = mkReadableStream(sampleText);
			session.put(deviceTmp, is, function(err) {
				should.not.exist(err);
				done();
			});
		});
		
		it("should fail to write a file in a non-existing device folder", function(done) {
			var is = mkReadableStream(sampleText, 10000);
			var deviceTmp = '/dev/null/mocha' + process.pid;
			session.put(deviceTmp, is, function(err) {
				should.exist(err);
				err.should.be.an.instanceOf(Error);
				should.exist(err.code);
				err.code.should.equal(1);
				done();
			});
		});
		
	});

	describe("#get", function() {
		beforeEach(initTmp);
		afterEach(cleanTmp);

		beforeEach(openSession);
		afterEach(closeSession);

		it("should write then read the same file from the device", function(done) {
			var is = mkReadableStream(sampleText);
			session.put(deviceTmp, is, function(err) {
				log.verbose("put()", "done");
				should.not.exist(err);
				
				var os = mkWritableStream();
				session.get(deviceTmp, os, function(err) {
					log.verbose("get()", "done");
					os.end();
					should.not.exist(err);
					var str = os.getContents().toString();
					str.should.equal(sampleText);
					done();
				});
			});
		});
	});

	describe("#run", function() {
		beforeEach(initTmp);
		afterEach(cleanTmp);

		beforeEach(openSession);
		afterEach(closeSession);

		it("should fail to run with an invalid stdout", function(done) {
			var es = mkWritableStream();
			session.run('/bin/ls /', null /*stdin*/, new Error('fake stdout'), es /*stderr*/, function(err) {
				es.end();
				log.verbose("run()", "done err=" + err);
				should.exist(err);
				done();
			});
		});

		it("should fail to run with an invalid stderr", function(done) {
			var os = mkWritableStream();
			session.run('/bin/ls /', null /*stdin*/, os /*stdout*/, new Error('fake stdout'), function(err) {
				os.end();
				log.verbose("run()", "done err=" + err);
				should.exist(err);
				done();
			});
		});

		it("should fail to run a non-existing command", function(done) {
			var os = mkWritableStream();
			var es = mkWritableStream();
			session.run('/dev/null/toto', null /*stdin*/, os /*stdout*/, es /*stderr*/, function(err) {
				os.end();
				es.end();
				log.verbose("run()", "done err=" + err);
				should.exist(err);
				done();
			});
		});

		it("should write a (large) file on the device and find its size using 'ls -l'", function(done) {
			this.timeout(15000);
			var count = 100000;
			var is = mkReadableStream(sampleText, count);
			var os = mkWritableStream();
			var es = mkWritableStream();
			is.pause();
			async.series([
				session.put.bind(session, deviceTmp, is),
				session.run.bind(session, '/bin/ls -l ' + deviceTmp, null, os, es),
				function(next) {
					os.end();
					es.end();
					var str = os.getContents().toString();
					var length = str.split(/[ \t]+/)[4];
					should.exist(length);
					length.should.equal((sampleText.length * count).toString(), "length of '" + sampleText + "'");
					next();
				},
				session.run.bind(session, '/bin/rm ' + deviceTmp, null, null, null)
			], function(err) {
				should.not.exist(err);
				done();
			});
		});

		it("should fail to 'ls' a non-existing file", function(done) {
			var os = mkWritableStream();
			var es = mkWritableStream();
			session.run('/bin/ls -l /dev/null/toto', null /*stdin*/, os /*stdout*/, es /*stderr*/, function(err) {
				os.end();
				es.end();
				log.verbose("run()", "done err=" + err);
				should.exist(err);
				done();
			});
		});

		it("should support 'Function' stdout", function(done) {
			var is = mkReadableStream(sampleText);
			session.run('/bin/cat', /*stdin*/ is, /*stdout*/ function(data) {
				log.verbose("run()", "stdout data=" + data.toString());
				should.exist(data);
				data.should.be.instanceOf(Buffer);
				var str = data.toString();
				str.should.equal(sampleText);
			}, /*stderr*/ null, /*next*/ function(err) {
				log.verbose("run()", "next err=" + err);
				should.not.exist(err);
				done();
			});
		});
	});
});