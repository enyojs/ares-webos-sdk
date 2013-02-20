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
			var session = new novacom.Session(options && options.device, _install);

			function _install(err) {
				if (err) {
					next(err);
				}
				var devicePkgPath = '/tmp/' + path.basename(hostPkgPath),
				    // FIXME: file-based streaming
				    // does not work (output is
				    // truncated).  As a work-around,
				    // we load the entire package in
				    // memory (as a Buffer).
				    //is = fs.createReadStream(hostPkgPath),
				    is = new streamBuffers.ReadableStreamBuffer(),
				    os = new streamBuffers.WritableStreamBuffer();
				log.info('Installer#install():', 'installing ' + hostPkgPath);
				is.pause();
				async.waterfall([
					fs.readFile.bind(null, hostPkgPath),
					function(data, done) {
						is.put(data);
						done();
					},
					session.put.bind(session, devicePkgPath, is),
					session.run.bind(session, "/bin/ls -l " + devicePkgPath, null, os, null),
					function(done) {
						log.verbose("Installer#install():", "ls -l:", os.getContents().toString());
						done();
					},
					luna.send.bind(null, {
						// options
						novacom: session
					}, {
						// luna addr
						service: 'com.palm.appinstaller',
						// FIXME: 'install'
						// fails, webOS 3.x
						// palm-install also
						// uses
						// 'installNoVerify'

						//method: 'install'
						method: 'installNoVerify'
					}, {
						// luna param
						target: devicePkgPath
					}, function(lineObj, next) {
						log.verbose("Installer#install():", "lineObj: %j", lineObj);
						if (lineObj.status.match(/^FAILED_/)) {
							// failure: stop
							log.verbose("Installer#install():", "failure");
							next(new Error(lineObj.status));
						} else if (lineObj.status.match(/^SUCCESS/)) {
							log.verbose("Installer#install():", "success");
							// success: stop
							next(null, lineObj.status);
						} else {
							// no err & no status : continue
							log.verbose("Installer#install():", "waiting");
							next();
						}
					})
				], function(err) {
					// delete temporary file & exit
					session.run('/bin/rm -f ' + devicePkgPath, null, null, null, function() {
						session.end();
						// ignore the success of the
						// temp file removal & return
						// the installation error
						// status
						next(err);
					});
					next(err);
				});
			}
		},

		remove: function(packageName) {
		},

		list: function(options, next) {
			var session = new novacom.Session(options && options.device, next);
			luna.send({
				// options
				novacom: session
			}, {
				// luna addr
				service: 'com.palm.appinstaller',
				method: 'getUserInstalledAppSizes'
			}, {	// luna param
			}, function(lineObj, next) {
				log.verbose("Installer#list():", "lineObj: %j", lineObj);
				if (lineObj.status.match(/^FAILED_/)) {
					// failure: stop
					log.verbose("Installer#list():", "failure");
					next(new Error(lineObj.status));
				} else if (lineObj.status.match(/^SUCCESS/)) {
					log.verbose("Installer#list():", "success");
					// success: stop
					next(null, lineObj.status);
				} else {
					// no err & no status : continue
					log.verbose("Installer#list():", "waiting");
					next();
				}
			});
		}
	};

	if (typeof module !== 'undefined' && module.exports) {
		module.exports = installer;
	}

}());
