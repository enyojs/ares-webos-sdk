var fs = require('fs'),
	path = require('path'),
	util = require('util'),
	npmlog = require('npmlog'),
	async = require('async'),
	streamBuffers = require("stream-buffers"),
	crypto = require('crypto'),
	luna = require('./luna'),
	novacom = require('./novacom'),
	errMsgHndl = require('./error-handler');

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
				os = new streamBuffers.WritableStreamBuffer();
			var appId = options.appId;
			var srcMd5, dstMd5;
			var md5DataSize = 200;
			var storage;
			log.info('installer#install():', 'installing ' + hostPkgPath);
			options = options || {};

			async.waterfall([

				function(next) {
					options.nReplies = 0; // -i
					new novacom.Session(options.device, next);
				},
				function(session, next) {
					options.session = session;
					setImmediate(next, null, options);
				},
				_getStorageList,
				function(storageList, next) {
					var storageNames = storageList.map(function(storage){return storage.name;});
					if (options.storage && storageNames.indexOf(options.storage) === -1) {
						return setImmediate(next, new Error("invalid storage name"));
					}
					storageList.forEach(function(strg){
						if (strg.name === options.storage) {
							storage = strg;
							return;
						}
					});
					/* //FIXME: Can't access to the external storage path in jailed tunnel.
					if (storage) {
						tempDirPath = storage.uri + '/temp';
						devicePkgPath = tempDirPath + '/' + hostPkgName;
					}
					*/
					setImmediate(next);
				},
				function(next) {
					if (options.opkg) {
						//FIXME: Need more consideration whether this condition is necessary or not.
						if (options.session.getDevice().username != 'root') {
							return setImmediate(next, new Error("opkg-install is only available for the device allowing root-connection"));
						}
					}
					var cmd = '/bin/rm -rf ' + tempDirPath + ' && /bin/mkdir -p ' + tempDirPath;
					if (options.session.getDevice().username === 'root') {
						cmd += ' && /bin/chmod 777 ' + tempDirPath;
					}
					options.op = (options.session.target.files || 'stream') + 'Put';
					options.session.run(cmd, null, null, null, next);
				},
				function(next) {
					console.log("Installing package " + hostPkgPath);
					options.session.put(hostPkgPath, devicePkgPath, next);
				},
				function(next) {
					options.session.run("/bin/ls -l " + devicePkgPath, null, os, null, next);
				},
				function(next) {
					log.verbose("installer#install():", "ls -l:", os.getContents().toString());
					next();
				},
				function(next) {
					var md5 = crypto.createHash('md5');
					var buffer=new Buffer(md5DataSize);
					var pos = 0;
					async.waterfall([
						fs.lstat.bind(fs, hostPkgPath),
						function(stat, next) {
							if (stat.size > md5DataSize) {
								pos = stat.size-md5DataSize;
							} else {
								pos = 0;
								md5DataSize = stat.size;
							}
							next();
						},
						fs.open.bind(fs, hostPkgPath, 'r'),
						function(fd, next) {
							fs.read(fd, buffer, 0, md5DataSize, pos, function(err, fd) {
								md5.update(buffer);
								next();
							});
						},
						function() {
							srcMd5 = md5.digest('hex');
							if (!srcMd5) {
								log.warn("installer#install():", "Failed to get md5sum from the ipk file");
							}
							log.verbose("installer#install():", "srcMd5:", srcMd5);
							next();
						}
					], function(err) {
						next(err);
					})
				},
				function(next) {
					var cmd = "/usr/bin/tail -c " + md5DataSize + " " + devicePkgPath + " | /usr/bin/md5sum";
					async.series([
						function(next) {
							options.session.run(cmd, null, _onData, null, next);
						}
					], function(err) {
						if (err) {
							return next(err);
						}
					});

					function _onData(data) {
						var str;
						if (Buffer.isBuffer(data)) {
							str = data.toString().trim();
						} else {
							str = data.trim();
						}
						if (str) {
							dstMd5 = str.split('-')[0].trim();
							log.verbose("installer#install():", "dstMd5:", dstMd5);
						}
						if (!dstMd5) {
							log.warn("installer#install():", "Failed to get md5sum from the transmitted file");
						}
						next();
					}
				},
				function(next)	{
					if (!srcMd5 || !dstMd5) {
						log.warn("installer#install():", "Cannot verify transmitted file");
					} else {
						log.verbose("installer#install():", "srcMd5:", srcMd5, ", dstMd5:", dstMd5);
						if (srcMd5 !== dstMd5) {
							return next(new Error("File transmission error, please try again."));
						}
					}
					next();
				},
				function(next) {
					op = (options.opkg) ? _opkg : _appinstalld;
					op(next);

					function _opkg(next) {
						var cmd = '/usr/bin/opkg install ' + devicePkgPath;
						cmd =  cmd.concat((options['opkg_param'])? ' ' + options['opkg_param'] : '');
						async.series([
							options.session.run.bind(options.session, cmd,
								null, __data, __data),
							options.session.run.bind(options.session, '/usr/sbin/ls-control scan-services ',
								null, null, __data)
						], function(err) {
							if (err) {
								return next(err);
							}
							next(null, null);
						});

						function __data(data) {
							var str = (Buffer.isBuffer(data)) ? data.toString() : data;
							console.log(str);
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
						if (target.type !== "webos3" && storage) {
							if (storage.dvid && storage.drid) {
								param.target = {deviceId: storage.dvid, driveId: storage.drid};
							}
						}

						luna.send(options, addr, param, function(lineObj, next) {
							log.verbose("installer#install():", "lineObj: %j", lineObj);
							var resultValue = result.getResultValue(lineObj);
							if (resultValue.match(/FAILED/i)) {
								// failure: stop
								log.verbose("installer#install():", "failure");
								if (lineObj.details && lineObj.details.errorCode) {
									next(errMsgHndl.getErrMsg(addr.service, lineObj.details.errorCode) || resultValue);
								} else {
									next(resultValue);
								}
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
				options.session = session;
				if (options.opkg) {
					//FIXME: Need more consideration whether this condition is necessary or not.
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
					var cmd = '/usr/bin/opkg remove ' + packageName;
					cmd =  cmd.concat((options['opkg_param'])? ' ' + options['opkg_param'] : '');
					async.series([
						options.session.run.bind(options.session, cmd,
							null, __data, __error),
						options.session.run.bind(options.session, '/usr/sbin/ls-control scan-services ',
							null, null, __error)
					], function(err) {
						if (err) {
							return next(err);
						}
						next(null, {});
					});

					function __data(data) {
						var str = (Buffer.isBuffer(data)) ? data.toString() : data;
						console.log(str);
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
		], function(err, result) {
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
					options.session = session;
					if (options.opkg) {
						//FIXME: Need more consideration whether this condition is necessary or not.
						if (options.session.getDevice().username != 'root') {
							return setImmediate(next, new Error("opkg-list is only available for the device allowing root-connection"));
						}
					}
					setImmediate(next);
				},
				function(next) {
					op = (options.opkg) ? _opkg : _appinstalld;
					op(next);

					function _opkg(next) {
						var cmd = '/usr/bin/opkg list';
						cmd =  cmd.concat((options['opkg_param'])? ' ' + options['opkg_param'] : '');
						async.series([
							options.session.run.bind(options.session, cmd,
								null, __data, __data)
						], function(err) {
							if (err) {
								return next(err);
							}
							next(null, {});
						});

						function __data(data) {
							var str = (Buffer.isBuffer(data)) ? data.toString() : data;
							console.log(str);
						}
					}
					function _appinstalld(next) {
						var addr = options.session.getDevice().lunaAddr.list;
						var result = options.session.getDevice().lunaResult.list;
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
				}
			], function(err, results) {
				log.verbose("installer#list():", "err:", err, "results:", results);
				next(err, results);
			});
		},

		listStorage: function(options, next) {
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
					options.session = session;
					setImmediate(next, null, options);
				},
				_getStorageList
			], function(err, results) {
				log.verbose("installer#listStorage():", "err:", err, "results:", results);
				next(err, results);
			});
		}
	};

	function _getStorageList(options, next) {
		var defStorage = {
			idx : 0,
			name : 'internal',
			dvid : null,
			drid : null,
			type: 'flash',
			uri: '/media/developer'
		};
		var storageList = [ defStorage ];
		var addr = options.session.getDevice().lunaAddr.getStorageList;
		var result = options.session.getDevice().lunaResult.getStorageList;
		var resultValue;
		var param = { subscribe: false };
		if (!addr) return next(null, storageList);

		luna.send(options, addr, param, function(lineObj, next) {
			resultValue = result.getResultValue(lineObj);
			if (resultValue.returnValue === true) {
				if (resultValue.devices) {
					var devices = resultValue.devices;
					var usbDevices = devices.filter(function(device) {
						return (device.deviceType === 'usb');
					});
					usbDevices.forEach(function(usbDevice){
						usbDevice.subDevices.forEach(function(subDevice){
							storageList.push(
								{
									idx : storageList.length,
									name : ('usb' + storageList.length),
									dvid : usbDevice.deviceId,
									drid : subDevice.deviceId,
									type: 'usb',
									uri: subDevice.deviceUri
								}
							);
						})
					});
				}
			} else {
				// Ignore the case that returnValue is 'false'
			}
			next(null, storageList);
		}, next);
	}

	if (typeof module !== 'undefined' && module.exports) {
		module.exports = installer;
	}

}());
