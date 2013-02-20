#!/usr/bin/env node_modules/.bin/mocha

/**********************************************************************/

var path = require('path'),
    util = require('util'),
    log = require('npmlog'),
    nopt = require('nopt'),
    installer = require('./../lib/installer');

/**********************************************************************/

var knownOpts = {
	"level": ['silly', 'verbose', 'info', 'http', 'warn', 'error']
};
var argv = nopt(knownOpts, null /*shortHands*/, process.argv, 1 /*drop 'node'*/);

if (argv.help) {
	console.log("Usage: mocha novacom.spec.js [--level=LEVEL]\n" +
		    "\tLEVEL is one of 'silly', 'verbose', 'info', 'http', 'warn', 'error'");
	process.exit(0);
}

/**********************************************************************/

log.heading = 'install.spec';
log.level = argv.level || 'warn';

/**********************************************************************/

describe ("installer", function() {
	this.timeout(5000);
	
	describe ("#install", function() {
		it ("should install a package", function(done) {
			var pkgPath = path.resolve(process.env.HOME || process.env.USERPROFILE, "com.ydm.tipcalc_1.0.0_all.ipk");
			//var pkgPath = '/tmp/toto';
			installer.install(null, pkgPath, function(err, value) {
				log.verbose("err:", err, "value:", value);
				done(err);
			});
		});
	});
});

