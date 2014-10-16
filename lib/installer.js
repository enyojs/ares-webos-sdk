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
			var hostPkgName = path.basename(hostPkgPath);
			var tempDirPath = '/media/developer/temp/';
			if (!hostPkgName) {
				next(new Error("Invalid package: '" + hostPkgPath + "'"));
				return;
			}
			var devicePkgPath = tempDirPath + hostPkgName,
				// FIXME: file-based streaming does not
				// work (output is truncated).  As a
				// work-around, we load the entire package
				// in memory (as a Buffer).  is =
				// fs.createReadStream(hostPkgPath),
				is = new streamBuffers.ReadableStreamBuffer(),
				os = new streamBuffers.WritableStreamBuffer();
			var appId = options.appId;
			log.info('installer#install():', 'installing ' + hostPkgPath);
			is.pause();
			options = options || {};

			async.waterfall([

				function(next) {
					options.nReplies = 0; // -i
					options.session = new novacom.Session(options.device, next);
				},
				function(session, next) {
					options.session = session;
					if (options.opkg) {
						if (options.session.getDevice().username != 'root') {
							return setImmediate(next, new Error("opkg-install is only available for the device allowing root-connection"));
						}
					}
					options.op = (session.target.files || 'stream') + 'Put';
					options.session.run('/bin/rm -rf ' + tempDirPath + '&& /bin/mkdir -p ' + tempDirPath, null, null, null, next);
				},
				function(next) {
					console.log("Installing package " + hostPkgPath);
					var op = options.op;
					if (op === 'streamPut') {
						fs.readFile(hostPkgPath, function(err, data) {
							if (err) {
								next(err);
								return;
							}
							log.verbose("installer#input strean");
							is.put(data);
							log.verbose("installer#type:", op);
							options.session[op](devicePkgPath, is, next);
						});
					} else if (op === 'sftpPut') {
						log.verbose("installer#type:", op);
						options.session[op](hostPkgPath, devicePkgPath, next);
					} else {
						log.verbose("installer#type:", "unknown files type for installation");
						next(new Error("unknown files type for installtaion"));
						return;
					}
				},
				function(next) {
					options.session.run("/bin/ls -l " + devicePkgPath, null, os, null, next);
				},
				function(next) {
					log.verbose("installer#install():", "ls -l:", os.getContents().toString());
					next();
				},
			function(next) {
				op = (options.opkg) ? _opkg : _appinstalld;
				op(next);

				function _opkg(next) {
					async.series([
						options.session.run.bind(options.session, '/usr/bin/opkg install ' + devicePkgPath,
							null, __data, __error),
						options.session.run.bind(options.session, '/usr/sbin/ls-control scan-services ',
							null, __data, __error)
					], function(err) {
						if (err) {
							return next(err);
						}
						next(null, null);
					});

					function __data(data) {
						var str = (Buffer.isBuffer(data)) ? data.toString() : data;
						log.info(str);
					}

					function __error(data) {
						var str = (Buffer.isBuffer(data)) ? data.toString() : data;
						return next(new Error(str));
					}
				}

				function _appinstalld(next) {
					var target = options.session.getDevice();
					var addr = target.lunaAddr.install;
					var result = target.lunaResult.install;
					//FIXME: webos-3.x use param {target, subscribe}
					//        next version webos us param {id, ipkUrl, subscribe}
					var param = (target.type === "webos3") ? {
						// luna param
						target: devicePkgPath,
						subscribe: true
					} : {
						// luna param
						id: appId,
						ipkUrl: devicePkgPath,
						subscribe: true
					};

					luna.send(options, addr, param, function(lineObj, next) {
						log.verbose("installer#install():", "lineObj: %j", lineObj);
						var resultValue = result.getResultValue(lineObj);
						if (resultValue.match(/FAILED/i)) {
							// failure: stop
							log.verbose("installer#install():", "failure");
							next(new Error(resultValue));
						} else if (resultValue.match(/installed|^SUCCESS/i)) {
							log.verbose("installer#install():", "success");
							// success: stop
							next(null, resultValue);
						} else {
							// no err & no status : continue
							log.verbose("installer#install():", "waiting");
							next(null, null);
						}
					}, next);
				}
			},
				function(status, next) {
					if (typeof status === 'function') {
						next = status;
					}
					options.session.run('/bin/rm -f ' + devicePkgPath, null, null, null, next);
				},
				function() {
					options.session.end();
					options.session = null;
					next(null, {
						msg: "Success"
					});
				}
			], function(err) {
				log.verbose("installer#waterfall callback err:", err);
				next(err);
			});
		},

		remove: function(options, packageName, next) {
			if (typeof next !== 'function') {
				throw new Error('Missing completion callback (next=' + util.inspect(next) + ')');
			}
			options = options || {};
			async.waterfall([

			function(next) {
				options.nReplies = undefined; // -i
				options.session = new novacom.Session(options.device, next);
			},
			function(session, next) {
				if (options.opkg) {
					if (options.session.getDevice().username != 'root') {
						return setImmediate(next, new Error("opkg-remove is only available for the device allowing root-connection"));
					}
				}
				setImmediate(next);
			},
			function(next) {
				op = (options.opkg) ? _opkg : _appinstalld;
				op(next);

				function _opkg(next) {
					async.series([
						options.session.run.bind(options.session, '/usr/bin/opkg remove ' + packageName,
							null, __data, __error),
						options.session.run.bind(options.session, '/usr/sbin/ls-control scan-services ',
							null, __data, __error)
					], function(err) {
						if (err) {
							return next(err);
						}
						next(null, {});
					});

					function __data(data) {
						var str = (Buffer.isBuffer(data)) ? data.toString() : data;
						log.info(str);
						if (str.match(/No packages removed/g)) {
							return next(new Error('[package Name: ' + packageName +'] ' + str));
						}
					}

					function __error(data) {
						var str = (Buffer.isBuffer(data)) ? data.toString() : data;
						return next(new Error(str));
					}
				}

				function _appinstalld(next) {
					var target = options.session.getDevice();
					var addr = target.lunaAddr.remove;
					var result = target.lunaResult.remove;
					//FIXME: webos-3.x use param {subscribe, packageName}
					//        next version webos us param {id, subscribe}
					var param = (target.type === "webos3") ? {
						// luna param
						subscribe: true,
						packageName: packageName
					} : {
						// luna param
						id: packageName,
						subscribe: true
					};
					var exit = 0;

					luna.send(options, addr, param, function(lineObj, next) {
						log.verbose("installer#remove():", "lineObj: %j", lineObj);
						var resultValue = result.getResultValue(lineObj);
						if (resultValue.match(/FAILED/i)) {
							// failure: stop
							log.verbose("installer#remove():", "failure");
							if (!exit++) {
								next(new Error(resultValue));
							}
						} else if (resultValue.match(/removed|^SUCCESS/i)) {
							log.verbose("installer#remove():", "success");
							// success: stop
							next(null, {
								status: resultValue
							});
						} else {
							// no err & no status : continue
							log.verbose("installer#remove():", "waiting");
							next();
						}
					}, next);
				}
			}
		],
		function(err, result) {
			log.verbose("installer#remove():", "err:", err, "result:", result);
			if (!err) {
				result.msg = 'Removed package ' + packageName;
			}
			next(err, result);
		});
		},

		list: function(options, next) {
			if (typeof next !== 'function') {
				throw new Error('Missing completion callback (next=' + util.inspect(next) + ')');
			}
			options = options || {};
			async.waterfall([

				function(next) {
					options.nReplies = 1; // -n 1
					options.session = new novacom.Session(options.device, next);
				},
				function(session, next) {
					var addr = session.getDevice().lunaAddr.list;
					var result = session.getDevice().lunaResult.list;
					var resultValue;
					var param = {
						// luna param
						subscribe: false
					};

					luna.send(options, addr, param, function(lineObj, next) {
						resultValue = result.getResultValue(lineObj);
						if (Array.isArray(resultValue)) {
							// success: stop
							for (var index = 0; index < resultValue.length; index++) {
								if (!resultValue[index].visible) {
									resultValue.splice(index, 1);
									index--;
								}
							}
							log.verbose("installer#list():", "success");
							next(null, resultValue);
						} else {
							// failure: stop
							log.verbose("installer#list():", "failure");
							next(new Error("object format error"));
						}

					}, next);
				}
			], function(err, results) {
				log.verbose("installer#list():", "err:", err, "results:", results);
				next(err, results);
			});
		}
	};

	if (typeof module !== 'undefined' && module.exports) {
		module.exports = installer;
	}

}());

