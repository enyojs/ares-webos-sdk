#!/usr/bin/env node_modules/.bin/mocha

var path = require('path'),
    fs = require('fs'),
    util = require('util'),
    temp = require("temp"),
    log = require('npmlog'),
    nopt = require('nopt'),
    should = require('should'),
    novacom = require(path.join(__dirname, '..', 'lib', 'novacom'));

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
	// create session & wait for it to be established
	session = new novacom.Session();
	session.addJob(null, function() {
		done();
	});
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

function mkReadableStream(data) {
	var buf;
	if (Buffer.isBuffer(data)) {
		buf = data;
	} else {
		buf = new Buffer(data);
	}
	var tmp = temp.path({prefix: 'mocha-novacom.'});
	log.verbose("mkReadableStream", "creating " + tmp);
	var os = fs.createWriteStream(tmp);
	os.write(buf);
	os.end();
	tmps.push(tmp);
	var is = fs.createReadStream(tmp);
	is.pause();
	return is;
}

describe("novacom", function() {
	this.timeout(5000);

	var sampleText = "This is a sample text.";

	var deviceTmp = '/tmp/mocha' + process.pid;

	describe("#put", function() {

		beforeEach(initTmp);
		afterEach(cleanTmp);

		beforeEach(openSession);
		afterEach(closeSession);

		it("should write a file on the device", function(done) {
			var is = mkReadableStream(sampleText);
			session.put(deviceTmp, is, function(err) {
				should.not.exist(err);
				is.destroy();
				done();
			});
		});

		it("should fail to write a file in a non-existing device folder", function(done) {
			var is = mkReadableStream(sampleText);
			var deviceTmp = '/dev/null/mocha' + process.pid;
			session.put(deviceTmp, is, function(err) {
				is.destroy();
				should.exist(err);
				err.should.be.an.instanceof(Error);
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
			log.verbose("put()", "...");
			session.put(deviceTmp, is, function(err) {
				log.verbose("put()", "done");
				should.not.exist(err);
				is.destroy();
				
				var hostTmp = temp.path({prefix: 'mocha-novacom.'});
				var os = fs.createWriteStream(hostTmp);
				log.verbose("get()", "...");
				session.get(deviceTmp, os, function(err) {
					log.verbose("get()", "done");
					should.not.exist(err);
					os.end();
					log.verbose("readFile()", "...");
					fs.readFile(hostTmp, function(err, buf) {
						log.verbose("readFile()", "done");
						should.not.exist(err);
						should.exist(buf);
						buf.should.be.an.instanceof(Buffer);
						var str = buf.toString();
						str.should.equal(sampleText);
						done();
					});
				});
			});
		});
	});

});