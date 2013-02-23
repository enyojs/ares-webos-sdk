var fs = require('fs'),
    path = require('path'),
    util = require('util'),
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
		 *  palm-install --help
		 * Usage: palm-install [OPTION...] [PACKAGE | APP_ID]
		 * Install or remove applications from a HP webOS device.
		 * 
		 * Options:
		 * -d, --device=DEVICE     Specify DEVICE to use
		 *     --device-list       List the available devices
		 * -l, --list              List the installed applications
		 * -r, --remove            Remove applications instead of installing
		 *     --version           Display version info and exit
		 *     --help              Display this help and exit
		 * 
		 * PACKAGE is the file path of the package to install,
		 * e.g. ~/projects/packages/com.example.app_1.0_all.ipk.
		 * 
		 * APP_ID is the id of the application to remove.
		 * 
		 * DEVICE is a unique identifier which matches a device name, type, or id
		 * (as returned by the device-list option). e.g. Use "usb" for a usb-connected
		 * device, or "tcp" for an emulator (note: emulator must be running). If not
		 * specified, the first device found is used.
		 * 
		 * Examples:
		 * 
		 * # Install package
		 * palm-install ~/projects/packages/com.example.app_1.0_all.ipk
		 * 
		 * # Remove application
		 * palm-install -r com.example.app
		 * 
		 * # List applications on default device
		 * palm-install -l
		 * 
		 * # List applications on usb device
		 * palm-install -d usb -l
		 * 
		 * # List applications on emulator
		 * palm-install -d tcp -l
		 */

		/**
		 * @property {Object} log an npm log instance
		 */
		log: log,

		/**
		 * Install the given package on the given target device
		 * @param {Object} options installation options
		 * @options options {Object} device the device to install the package onto, or null to select the default device
		 * @param {String} hostPkgPath absolute path on the host of the package to be installed
		 * @param {Function} next common-js callback
		 */
		install: function(options, hostPkgPath, next) {
			if (typeof next !== 'function') {
				throw new Error('Missing completion callback (next=' + util.inspect(next) + ')');
			}
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
		
		remove: function(options, packageName, next) {
			if (typeof next !== 'function') {
				throw new Error('Missing completion callback (next=' + util.inspect(next) + ')');
			}
			options = options || {};
			async.series([
				function(next) {
					options.nReplies = undefined; // -i
					options.session = new novacom.Session(options.device, next);
				},
				luna.send.bind(null, options, {
					// luna addr
					service: 'com.palm.appinstaller',
					method: 'remove'
				}, {	// luna param
					subscribe: true,
					packageName: packageName
				}, function(lineObj, next) {
					log.verbose("installer#remove():", "lineObj: %j", lineObj);
					if (lineObj.status.match(/^FAILED_/)) {
						// failure: stop
						log.verbose("installer#remove():", "failure");
						next(new Error(lineObj.status));
					} else if (lineObj.status.match(/^SUCCESS/)) {
						log.verbose("installer#remove():", "success");
						// success: stop
						next(null, lineObj.status);
					} else {
						// no err & no status : continue
						log.verbose("installer#remove():", "waiting");
						next();
					}
				})
			], function(err, results) {
				log.verbose("installer#remove():", "err:", err, "results:", results);
				// 2 steps in async.series, we want to
				// the value returned by the second
				// step (index=1)
				next(err, results[1]);
			});
		},
		
		list: function(options, next) {
			if (typeof next !== 'function') {
				throw new Error('Missing completion callback (next=' + util.inspect(next) + ')');
			}
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
