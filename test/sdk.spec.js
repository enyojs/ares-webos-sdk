#!/usr/bin/env node_modules/.bin/mocha

/**********************************************************************/

var path = require('path'),
    util = require('util'),
    log = require('npmlog'),
    nopt = require('nopt'),
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
	});

	describe ("#list", function() {
		it ("should list installed packages", function(done) {
			installer.list(null, function(err, packages) {
				log.verbose("test installer#list", "err:", err);
				should.not.exist(err);
				log.info("test installer#list", "packages:", packages);
				should.exist(packages);
				var found = packages.filter(function(p) {
					return p && (p.id === id);
				})[0];
				log.info("test installer#list", "found:", found);
				should.exist(found);
				done();
			});
		});
	});
	
});

