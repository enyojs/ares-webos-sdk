#!/usr/bin/env node_modules/.bin/mocha

var path = require('path'),
    fs = require('fs'),
    temp = require("temp"),
    winston = require('winston'),
    should = require('should'),
    novacom = require(path.join(__dirname, '..', 'lib', 'novacom'));

var logger = new (winston.Logger)({
	transports: [
		new (winston.transports.Console)({ level: 'debug' })
		]
});

var session;

function openSession(done) {
	logger.debug("beforeEach");
	// create session & wait for it to be established
	session = new novacom.Session();
	session.jobs.push(function() {
		done();
	});
}

function closeSession(done) {
	logger.debug("afterEach");
	session.end();
	session = undefined;
	done();
}

var tmps = [];

function initTmp(done) {
	tmps = [];
	done();
}

function cleanTmp(done) {
	logger.debug("after");
	tmps.forEach(function(tmp) {
		logger.debug("removing " + tmp);
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
	logger.debug("creating " + tmp);
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

	describe("#put", function() {
		before(initTmp);
		beforeEach(openSession);
		afterEach(closeSession);
		after(cleanTmp);

		it("should write a file on the device", function(done) {
			var is = mkReadableStream(sampleText);
			var deviceTmp = '/tmp/mocha' + process.pid;
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
});