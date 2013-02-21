var fs = require('fs'),
    path = require('path'),
    npmlog = require('npmlog'),
    async = require('async'),
    streamBuffers = require("stream-buffers"),
    luna = require('./luna'),
    novacom = require('./novacom');

(function() {

	var log = npmlog;
	log.heading = 'installer';
	log.level = 'warn';

	var installer = {
		/*
		 * From "palm-package--help
		 * # Install package
		 * palm-install ~/projects/packages/com.example.app_1.0_all.ipk
		 * 
		 * # Remove application
		 * palm-install -r com.example.app
		 * 
		 * # List applications on default device
		 * palm-install -l
		 */

		/**
		 * Install the given package on the given target device
		 * @param {Object} options installation options
		 * @options options {Object} device the device to install the package onto, or null to select the default device
		 * @param {String} hostPkgPath absolute path on the host of the package to be installed
		 * @param {Function} next common-js callback
		 */
		install: function(options, hostPkgPath, next) {
			var devicePkgPath = '/tmp/' + path.basename(hostPkgPath),
			    // FIXME: file-based streaming does not
			    // work (output is truncated).  As a
			    // work-around, we load the entire package
			    // in memory (as a Buffer).  is =
			    // fs.createReadStream(hostPkgPath),
			    is = new streamBuffers.ReadableStreamBuffer(),
			    os = new streamBuffers.WritableStreamBuffer();
			log.info('installer#install():', 'installing ' + hostPkgPath);
			is.pause();
			options = options || {};
			
			async.waterfall([
				function(next) {
					options.nReplies = 0; // -i
					options.session = new novacom.Session(options && options.device, next);
				},
				fs.readFile.bind(null, hostPkgPath),
				function(data, next) {
					is.put(data);
					next();
				},
				function(next) {
					options.session.put(devicePkgPath, is, next);
				},
				function(next) {
					options.session.run("/bin/ls -l " + devicePkgPath, null, os, null, next);
				},
				function(next) {
					log.verbose("installer#install():", "ls -l:", os.getContents().toString());
					next();
				},
				luna.send.bind(null, options, {
					// luna addr
					service: 'com.palm.appinstaller',
					// FIXME: 'install' fails,
					// webOS 3.x palm-install also
					// uses 'installNoVerify'
					
					//method: 'install'
					method: 'installNoVerify'
				}, {
					// luna param
					target: devicePkgPath,
					subscribe: true
				}, function(lineObj, next) {
					log.verbose("installer#install():", "lineObj: %j", lineObj);
					if (lineObj.status.match(/^FAILED_/)) {
						// failure: stop
						log.verbose("installer#install():", "failure");
						next(new Error(lineObj.status));
					} else if (lineObj.status.match(/^SUCCESS/)) {
						log.verbose("installer#install():", "success");
						// success: stop
						next(null, lineObj.status);
					} else {
						// no err & no status : continue
						log.verbose("installer#install():", "waiting");
						next();
					}
				})
			], function(err) {
				// delete temporary file & exit
				options.session.run('/bin/rm -f ' + devicePkgPath, null, null, null, function() {
					options.session.end();
					options.session = null;
					// ignore the success of the
					// temp file removal & return
					// the installation error
					// status
					next(err);
				});
			});
		},
		
		remove: function(packageName) {
		},
		
		list: function(options, next) {
			options = options || {};
			async.series([
				function(next) {
					options.nReplies = 1; // -n 1
					options.session = new novacom.Session(options.device, next);
				},
				luna.send.bind(null, options, {
					// luna addr
					service: 'com.palm.applicationManager',
					method: 'listPackages'
				}, {	// luna param
					subscribe: false
				}, function(lineObj, next) {
					if (Array.isArray(lineObj.packages)) {
						// success: stop
						log.verbose("installer#list():", "success");
						next(null, lineObj.packages);
					} else {
						// failure: stop
						log.verbose("installer#list():", "failure");
						next(new Error("object format error"));
					}
				})
			], function(err, results) {
				// 2 steps in async.series, we want to
				// the value returned by the second
				// step (index=1)
				next(err, results[1]);
			});
		}
	};
	
	if (typeof module !== 'undefined' && module.exports) {
		module.exports = installer;
	}
	
}());
