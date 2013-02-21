#!/usr/bin/env node_modules/.bin/mocha

/**********************************************************************/

var path = require('path'),
    util = require('util'),
    log = require('npmlog'),
    nopt = require('nopt'),
    async = require('async'),
    should = require('should'),
    packager = require('./../lib/packager'),
    installer = require('./../lib/installer');

/**********************************************************************/

var knownOpts = {
	"level": ['silly', 'verbose', 'info', 'http', 'warn', 'error']
};
var argv = nopt(knownOpts, null /*shortHands*/, process.argv, 1 /*drop 'node'*/);

if (argv.help) {
	console.log("Usage: mocha sdk.spec.js [--level=LEVEL]\n" +
		    "\tLEVEL is one of 'silly', 'verbose', 'info', 'http', 'warn', 'error'");
	process.exit(0);
}

/**********************************************************************/

log.heading = 'sdk.spec';
log.level = argv.level || 'warn';

/**********************************************************************/

describe ("installer", function() {
	
	// FIXME: rather use a package that comes from #generate
	var id = "com.ydm.tipcalc", pkg = "com.ydm.tipcalc_1.0.0_all.ipk";

	describe ("#install", function() {
		this.timeout(5000);

		it ("should install a package", function(done) {
			var pkgPath = path.resolve(process.env.HOME || process.env.USERPROFILE, pkg);
			installer.install(null, pkgPath, function(err, value) {
				log.verbose("installer#install", "err:", err);
				should.not.exist(err);
				done(err);
			});
		});

		it ("should fail to install a non-existing package", function(done) {
			installer.install(null, '/dev/null/toto', function(err, value) {
				log.verbose("installer#install", "err:", err);
				should.exist(err);
				done();
			});
		});
	});

	describe ("#list", function() {
		it ("should list installed packages", function(done) {
			installer.list(null, function(err, pkgs) {
				log.verbose("test installer#list", "err:", err);
				should.not.exist(err);
				log.info("test installer#list", "packages:", pkgs);
				should.exist(pkgs);
				var found = pkgs.filter(function(p) {
					return p && (p.id === id);
				})[0];
				log.info("test installer#list", "found:", found);
				should.exist(found);
				done();
			});
		});
	});

	describe ("#remove", function() {
		this.timeout(5000);

		it ("should remove a package", function(done) {
			async.waterfall([
				installer.remove.bind(null, null, id),
				function(result, next) {
					next();
				},
				installer.list.bind(null, null),
				function(pkgs, next) {
					log.verbose("test installer#remove", "pkgs:", pkgs);
					var found = pkgs.filter(function(p) {
						return p && (p.id === id);
					})[0];
					log.verbose("test installer#remove", "found:", found);
					should.not.exist(found, 'package is expected to be removed now');
					next();
				}
			], done);
		});

		it ("should fail to remove a non existing package", function(done) {
			installer.remove(null, 'com.apple.android', function(err) {
				should.exist(err);
				done();
			});
		});
	});

});

