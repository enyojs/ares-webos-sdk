/*
 * novacom emulation layer, on top of ssh
 */

var fs = require('fs'),
	path = require('path'),
	util = require('util'),
	stream = require('stream'),
	net = require('net'),
	mkdirp = require('mkdirp'),
	async = require('async'),
	log = require('npmlog'),
	ssh2 = require('ssh2'),
	shelljs = require('shelljs'),
	express = require('express'),
	http = require('http'),
	mkdirp = require('mkdirp'),
	request = require('request'),
	streamBuffers = require('stream-buffers'),
	Validator = require('jsonschema').Validator,
	utility = require('./utility'),
	errMsgHndl = require('./error-handler');

(function() {

	var novacom = {};

	if (typeof module !== 'undefined' && module.exports) {
		module.exports = novacom;
	}

	log.heading = 'novacom';
	log.level = 'warn';
	novacom.log = log;

	var keydir = path.resolve(process.env.HOME || process.env.USERPROFILE, '.ssh'),
		appdir = path.resolve(process.env.APPDATA || process.env.HOME || process.env.USERPROFILE, '.ares');

	var systemTypes = {
		"webos3": {
			lunaSend: "/usr/bin/luna-send",
			lunaAddr: {
				install: {
					service: "com.palm.appinstaller",
					method: "installNoVerify"
				},
				remove: {
					service: "com.palm.appinstaller",
					method: "remove"
				},
				list: {
					service: "com.palm.applicationManager",
					method: "listPackages"
				},
				launch: {
					service: "com.palm.applicationManager",
					method: "launch"
				}
			},
			lunaResult: {
				install: {
					getResultValue: function(lineObj) {
						return lineObj.status;
					}
				},
				remove: {
					getResultValue: function(lineObj) {
						return lineObj.status;
					}
				},
				list: {
					getResultValue: function(lineObj) {
						return lineObj.packages;
					}
				},
				launch: {
					getResultValue: function(lineObj) {
						return lineObj.processId;
					}
				}
			}
		},
		"starfish": {
			lunaSend: "/usr/bin/luna-send-pub",
			lunaAddr: {
				install: {
					service: "com.webos.appInstallService",
					folder: "dev",
					method: "install"
				},
				remove: {
					service: "com.webos.appInstallService",
					folder: "dev",
					method: "remove"
				},
				list: {
					service: "com.webos.applicationManager",
					folder: "dev",
					method: "listApps"
				},
				launch: {
					service: "com.webos.applicationManager",
					method: "launch"
				},
				terminate: {
					service: "com.webos.applicationManager",
					folder: "dev",
					method: "closeByAppId"
				},
				running: {
					service: "com.webos.applicationManager",
					folder: "dev",
					method: "running"
				},
				getStorageList: {
					service: "com.webos.service.attachedstoragemanager",
					method: "listDevices"
				}
			},
			lunaResult: {
				install: {
					getResultValue: function(lineObj) {
						return lineObj.details.state;
					}
				},
				remove: {
					getResultValue: function(lineObj) {
						return lineObj.details.state;
					}
				},
				list: {
					getResultValue: function(lineObj) {
						return lineObj.apps;
					}
				},
				launch: {
					getResultValue: function(lineObj) {
						return lineObj.processId;
					}
				},
				terminate: {
					getResultValue: function(lineObj) {
						return lineObj.returnValue;
					}
				},
				running: {
					getResultValue: function(lineObj) {
						return lineObj.running;
					}
				},
				getStorageList: {
					getResultValue: function(lineObj) {
						return lineObj;
					}
				}
			}
		}
	};

	function makeExecError(cmd, code, signal) {
		var err = null; // null:success, undefined:did-not-run, Error:failure
		if (code !== 0 || signal) {
			err = new Error("Command '" + cmd + "' exited with code=" + code + " (signal: " + signal + ")");
			err.code = code;
			err.signal = signal;
		}
		return err;
	}

	novacom.Resolver = Resolver;

	/**
	 * @constructor
	 */
	function Resolver() {
		/**
		 * @property devices
		 * This list use to be maintained by novacomd
		 */
		this.devices = [];
		this.deviceFileContent = null;
	}

	novacom.Resolver.prototype = {
		/**
		 * Load the resolver DB from the filesystem
		 * @param {Function} next a common-JS callback invoked when the DB is ready to use.
		 */
		load: function(next) {
			var resolver = this,
				builtins = path.join(__dirname, 'novacom-devices.json'),
				others = path.join(appdir, 'novacom-devices.json');
			log.verbose("Resolver#load()");
			async.waterfall([
				_replaceBuiltinSshKey.bind(resolver),
				_replaceDeviceFile.bind(resolver, builtins, others),
				_readFile.bind(resolver),
				_loadString.bind(resolver)
				// FIXME: here is problem causing parsing error
				// _readFile.bind(resolver, builtins, false /*mandatory*/),
				// _loadString.bind(resolver),
				// this._save.bind(this)
			], function(err) {
				if (err) {
					setImmediate(next, err);
				} else {
					log.info("Resolver#load()", "devices:", resolver.devices);
					setImmediate(next);
				}
			});

			function _replaceBuiltinSshKey(next) {
				log.verbose("Resolver#load#_replaceBuiltinSshKey()");
				var builtinPrvKeyForEmul = path.join(__dirname, 'webos_emul');
				var userHomePrvKeyForEmul = path.join(keydir, 'webos_emul');
				fs.stat(builtinPrvKeyForEmul, function(err, builtinKeyStat) {
					if (err) {
						if (err.code === 'ENOENT') {
							setImmediate(next);
						} else {
							setImmediate(next, err);
						}
					} else {
						fs.stat(userHomePrvKeyForEmul, function(err, userKeyStat) {
							if (err) {
								if (err.code === 'ENOENT') {
									mkdirp(keydir, function(err) {
										shelljs.cp('-rf', builtinPrvKeyForEmul, keydir);
										fs.chmodSync(userHomePrvKeyForEmul, '0600');
										setImmediate(next);
									});
								} else {
									setImmediate(next, err);
								}
							} else {
								if (builtinKeyStat.mtime.getTime() > userKeyStat.mtime.getTime()) {
									shelljs.cp('-rf', builtinPrvKeyForEmul, keydir);
									fs.chmodSync(userHomePrvKeyForEmul, '0600');
								}
								setImmediate(next);
							}
						}.bind(this));
					}
				}.bind(this));
			}

			function _replaceDeviceFile(srcPath, dstPath, next) {
				log.verbose("Resolver#load#_replaceDeviceFile()", "buildtin:", srcPath, ",dstPath:", dstPath);
				var dstDir = path.dirname(dstPath);
				fs.stat(dstPath, function(err, dstStat) {
					if (err) {
						if (err.code === 'ENOENT') {
							async.series([
								mkdirp.bind(this, dstDir),
								function(next) {
									log.verbose("Resolver#_load#_checkFile() file copied from ", srcPath, " to ", dstPath);
									shelljs.cp('-rf', srcPath, dstDir);
									setImmediate(next);
								}.bind(this)
							], function(err) {
								if (err) {
									return setImmediate(next, err);
								}
								setImmediate(next, null, dstPath);
							});
						} else {
							return setImmediate(next, err);
						}
					} else {
						//compare modification date to replace novacom-devices.json in $HOME
						fs.stat(srcPath, function(err, srcStat) {
							if (err) {
								return setImmediate(next, err);
							} else {
								if (dstStat.mtime.getTime() < srcStat.mtime.getTime()) {
									shelljs.rm('-rf', dstPath);
									_replaceDeviceFile(srcPath, dstPath, next);
								} else {
									setImmediate(next, null, dstPath);
								}
							}
						}.bind(this));
					}
				}.bind(this));
			}

			function _readFile(fileName, next) {
				log.verbose("Resolver#load#_readFile()", "<<< " + fileName);
				fs.readFile(fileName, 'utf8', function(err, str) {
					if (err && err.code === 'ENOENT') {
						setImmediate(next, null, "[]");
					} else {
						setImmediate(next, err, str);
					}
				});
			}

			/*
			 * Load devices described in the given string
			 * (supposed to be a JSON Array).
			 */
			function _loadString(str, next) {
				log.silly("Resolver#load#_loadString()", "str:", str);
				this.deviceFileContent = str;
				var inDevices = JSON.parse(str);
				if (!Array.isArray(inDevices)) {
					setImmediate(next, new Error("Incorrect file format'"));
					return;
				}
				log.silly("Resolver#load#_loadString()", "inDevices:", inDevices);
				async.forEach(inDevices, function(inDevice, next) {
					async.series([
						resolver._loadOne.bind(resolver, inDevice),
						resolver._addOne.bind(resolver, inDevice)
					], next);
				}, function(err, results) {
					if (err) {
						setImmdiate(next, err);
					} else {
						log.verbose("Resolver#load#_loadString()", "devices:", resolver.devices);
						setImmediate(next);
					}
				});
			}
		},

		_save: function(next) {
			var others = path.join(appdir, 'novacom-devices.json'),
				devices = this.devices.filter(function(device) {
					// do not save devices that do not
					// have a resolved private key
					return device.privateKey;
				});
			log.verbose("Resolver#_save()", ">>> " + others);
			async.series([
				mkdirp.bind(this, appdir),
				fs.writeFile.bind(this, others, JSON.stringify(devices, _saveOne, 2))
			], next);

			function _saveOne(key, value) {
				if (key === "display" || key === "lunaAddr" || key === "lunaResult") {
					// Do not save property
					return undefined;
				}
				if (key === "privateKey") {
					if (typeof value === 'string') {
						return value;
					} else if (value instanceof Buffer) {
						// convert to base64
						return value.toString('base64');
					}
				}
				// recurse JSON.stringify
				return value;
			}
		},

		add: function(deviceInfo, next) {
			log.verbose("Resolver#add()", "deviceInfo:", deviceInfo);
			var device = {
				name: deviceInfo.name.toLowerCase().replace(/ +/g, "_"),
				description: deviceInfo.description || deviceInfo.name,
				host: deviceInfo.host || "127.0.0.1",
				port: deviceInfo.port || 6622,
				username: deviceInfo.username || 'root',
				type: deviceInfo.type || 'starfish'
			};
			async.series([
				this._loadOne.bind(this, device),
				this._addOne.bind(this, device),
				this._save.bind(this),
				function(next) {
					log.info("Resolver#add()", "added device:", device.display);
				}
			], next);
		},

		/*
		 * Resolve the SSH private key of the given device
		 * into a usable string.  Prefer already fetch keys,
		 * then manually-configured OpenSSH one & finally
		 * fetch it from a distant device (webOS Pro only).
		 */
		_loadOne: function(inDevice, next) {
			log.silly("Resolver#_loadOne()", "device:", inDevice);
			if (typeof inDevice.privateKey === 'string') {
				inDevice.privateKeyName = inDevice.privateKey;
				inDevice.privateKey = new Buffer(inDevice.privateKey, 'base64');
				setImmediate(next);
			} else if (typeof inDevice.privateKey === 'object' && typeof inDevice.privateKey.openSsh === 'string') {
				inDevice.privateKeyName = inDevice.privateKey.openSsh;
				async.waterfall([
					fs.readFile.bind(this, path.join(keydir, inDevice.privateKey.openSsh), next),
					function(privateKey, next) {
						inDevice.privateKey = privateKey;
						setImmediate(next);
					}
				], function(err) {
					// do not load non-existing OpenSSH private key files
					if (err) {
						log.verbose("Resolver#_loadOne()", "Unable to find SSH private key named '" + inDevice.privateKey.openSsh + "' from '" + keydir + " for '" + inDevice.name + "'");
						inDevice.privateKey = undefined;
					}
					setImmediate(next);
				});
			} else if (typeof inDevice.type === 'webospro') {
				// FIXME: here is the place to
				// stream-down the SSH private key
				// from the device
				setImmediate(next, new Error("Not implemented: go & grab the webOS Pro private key here"));
			} else { //private Key is not defined in novacom-device.json
				if (!inDevice.password) {
					log.verbose("Resolver#_loadOne()", "Regist privateKey : need to set a SSH private key in " + keydir + " for'" + inDevice.name + "'");
				}
				inDevice.privateKeyName = undefined;
				inDevice.privateKey = undefined;
				setImmediate(next);
			}
		},

		/*
		 * Add given inDevice to the Resolver DB, overwritting
		 * any existing one with the same "name:" is needed.
		 */
		_addOne: function(inDevice, next) {
			inDevice.display = {
				name: inDevice.name,
				type: inDevice.type,
				privateKeyName: inDevice.privateKeyName,
				passphase: inDevice.passphase,
				description: inDevice.description
			};
			if (inDevice.username && inDevice.host && inDevice.port) {
				inDevice.display.addr = "ssh://" + inDevice.username + "@" + inDevice.host + ":" + inDevice.port;
			}
			for (var n in inDevice) {
				if (n !== "display") {
					inDevice.display[n] = inDevice[n];
				}
			}
			log.silly("Resolver#_addOne()", "device:", inDevice);
			// filter-out `this.devices` from the one having the same name as `inDevice`...
			this.devices = this.devices.filter(function(device) {
				return device.name !== inDevice.name;
			});
			// ...hook proper luna interface
			inDevice.lunaSend = systemTypes[inDevice.type].lunaSend;
			inDevice.lunaAddr = systemTypes[inDevice.type].lunaAddr;
			inDevice.lunaResult = systemTypes[inDevice.type].lunaResult;
			// ...and then append `inDevice`
			this.devices.push(inDevice);
			setImmediate(next);
		},

		/**
		 * @public
		 */
		remove: function(deviceName, next) {
			log.verbose("Resolver#remove()", "deviceName:", deviceName);
			this.devices = this.devices.filter(function(device) {
				return (device.name !== deviceName);
			});
			this._save(next);
		},


		/**
		 * @public
		 */
		save: function(devicesData, next) {
			log.verbose("Resolver#save()", "devicesData:", devicesData);
			var deviceFilePath = path.join(appdir, 'novacom-devices.json');
			fs.exists(deviceFilePath, function(exist) {
				if (!exist) {
					deviceFilePath = path.join(__dirname, 'novacom-devices.json');
				}
				async.waterfall([
					_checkValidNovacomDevices.bind(this, devicesData)
				], function(err, result) {
					if (err)
						return next(err);
					else {
		                if (result && result.errors.length > 0) {
		                    var errMsg = "";
		                    errMsg = errMsg.concat("Invalid device info.");
		                    for (idx in result.errors) {
		                        errMsg = errMsg.concat("\n");
		                        var errMsgLine = result.errors[idx].property + " "
		                                + result.errors[idx].message;
		                        var regex = /instance\[*.*\]*\./g;
		                        if ((result = regex.exec(errMsgLine)) != null) {
		                            errMsgLine = errMsgLine.substring(result[0].length);
		                        }
		                        errMsg = errMsg.concat(errMsgLine);
		                    }
		                    return setImmediate(next, new Error(errMsg));
		                } else {
		                    log.verbose("Device Info is valid");
		                }
		                fs.writeFile(deviceFilePath, JSON.stringify(devicesData, null, "\t"), next);
					}
				});
			});

			function _checkValidNovacomDevices(devices, next) {
				log.verbose("Resolver#save()#_checkValidNovacomDevices()", "devices:", devices);
				var schemaArray = {
					"id": "test",
					"type": "array",
					"items": {
						"$ref": "/deviceSchema"
					}
				};
				var schemaFile = path.join(__dirname, 'NovacomDevices.schema');
				var stats = fs.statSync(schemaFile);
				if (stats.isFile()) {
					var schemaData = fs.readFileSync(schemaFile, "utf8");
					var v = new Validator();
					try {
						var schema = JSON.parse(schemaData);
						v.addSchema(schema, '/deviceSchema');
						next(null, v.validate(devices, schemaArray));
					} catch (err) {
						next(new Error("Invalid JSON Schema"));
					}
				} else {
					log.verbose("Resolver#save()#_checkValidNovacomDevices()", "No schema for novacom-devices.json");
					next();
				}
			}
		},

		/**
		 * @public
		 */
		list: function(next) {
			log.verbose("Resolver#list()");
			setImmediate(next, null, this.devices.map(function(device) {
				return device.display;
			}));
		},

		/**
		 * @public
		 */
		getRawDeviceString: function(next) {
			log.verbose("Resolver#getRawDeviceString()");
			setImmediate(next, null, this.deviceFileContent);
		},

		getDeviceBy: function(key, value, next) {
			log.verbose("Resolver#getDeviceBy()", "key:", key, "value:", value);
			var regExp = new RegExp(value, "gi");
			var device = [];
			var devices = this.devices.filter(function(device) {
				return device[key] && device[key].match(regExp);
			});
			if (devices.length > 1) {
				device = devices.filter(function(device) {
					return device[key] && device[key] === value;
				});
			}
			log.verbose("Resolver#getDeviceBy()", "devices:", devices);
			if (typeof next === 'function') {
				log.silly("Resolver#getDeviceBy()", "async");
				if (devices.length === 1) {
					setImmediate(next, null, devices[0]);
				} else if (devices.length > 1) {
					if (device.length === 1) {
						setImmediate(next, null, device[0]);
					} else {
						var deviceNames = devices.map(function(device) {
							return device.name;
						});
						setImmediate(next, new Error("Multiple devices(" + deviceNames.join() + ") matching '" + key + "'='" + value + "'"));
					}
				} else {
					setImmediate(next, new Error("No device matching '" + key + "'='" + value + "'"));
				}
			} else {
				log.silly("Resolver#getDeviceBy()", "sync");
				return device[0] || devices[0];
			}
		},

		getSshPrvKey: function(target, next) {
			var name = (typeof target === 'string' ? target : target && target.name);
			if (!name) {
				setImmediate(next, new Error("Need to select a device name to get Ssh Private Key"));
				return;
			}
			async.waterfall([
				this.getDeviceBy.bind(this, 'name', name),
				function(target, next) {
					log.info("Resolver#getSshPrvKey()", "target.host:", target.host);
					var url = 'http://' + target.host + ':9991' + '/webos_rsa';
					var keyFileNamePrefix = target.name.replace(/(\s+)/gi, '_');
					var keyFileName = keyFileNamePrefix + "_webos";
					var keySavePath = path.join(keydir, keyFileName);
					request.head(url, function(err, res, body) {
						if (err || (res && res.statusCode !== 200)) {
							return setImmediate(next, new Error("Failed to get ssh private key"));
						}
						log.info("Resolver#getSshPrvKey()#head", "content-type:", res.headers['content-type']);
						log.info("Resolver#getSshPrvKey()#head", "content-length:", res.headers['content-length']);
						request(url).pipe(fs.createWriteStream(keySavePath)).on('close',  function(err) {
							if (err)
								return setImmediate(next, new Error("Failed to get ssh private key"));
							else
								setImmediate(next, err, keySavePath, keyFileName);
						});
					});
				},
				function(keyFilePath, keyFileName, next) {
					log.info("Resolver#getSshPrvKey()", "SSH Private Key:", keyFilePath);
					console.log("SSH Private Key:", keyFilePath);
					fs.chmodSync(keyFilePath, '0600');
					setImmediate(next, null, keyFileName);
				}
			], next);
		},

		modifyDeviceFile: function(op, target, next) {
			if (!target.name) {
				setImmediate(next, new Error("Incorrect target name"));
				return;
			}
			if (!this.deviceFileContent) {
				setImmediate(next, new Error("Need to load file"));
				return;
			}
			var inDevices = JSON.parse(this.deviceFileContent);
			if (!Array.isArray(inDevices)) {
				setImmediate(next, new Error("Incorrect file format'"));
				return;
			}

			if (op == 'add') {
				var maxOrder = -1;
				for (idx in inDevices) {
					if (inDevices[idx].name === target.name) {
						setImmediate(next, new Error("Existing Target Name"));
						return;
					}
					if (inDevices[idx].order > maxOrder) {
						maxOrder = inDevices[idx].order;
					}
				}
				if (maxOrder != -1) {
					target.order = ++maxOrder;
				}
				for (key in target) {
					if (target[key] === "@DELETE@") {
						delete target[key];
					}
				}
				inDevices = inDevices.concat(target);
			} else if (op == 'remove') {
				var rmIdx = -1;
				var rmOrder = -1;
				for (idx in inDevices) {
					if (inDevices[idx].name === target.name) {
						rmIdx = idx;
						rmOrder = inDevices[idx].order || -1;
						break;
					}
				}
				if (idx !== -1) {
					if (inDevices[idx].name !== target.name) {
						return setImmediate(next, new Error("Please enter a correct device name!!"));
					}
					else if (inDevices[idx].indelible && inDevices[idx].indelible === true) {
						return setImmediate(next, new Error("this device should not be removed!!"));
					}
					else {
						inDevices.splice(idx, 1);
						for (idx in inDevices) {
							if (inDevices[idx].order > rmOrder) {
								inDevices[idx].order--;
							}
						}
					}
				}
			} else if (op == 'modify') {
				var found = false;
				inDevices.forEach(function(inDevice) {
					if (inDevice.name === target.name) {
						found = true;
						var keys = Object.keys(target);
						keys.forEach(function(key) {
							if (target[key] === "@DELETE@") {
								delete inDevice[key];
							} else {
								inDevice[key] = target[key];
							}
						});
					}
				});
				if (found === false) {
					return setImmediate(next, new Error("Could not find a device named " + target.name));
				}
			} else {
				return setImmediate(next, new Error("Unknown operator"));
			}
			this.save(inDevices, next);
		}
	};

	/**
	 * @constructor
	 * @param {String} target the name of the target device to connect to.  "default"
	 * @param {Function} next common-js callback, invoked when the Session becomes usable or definitively unusable (failed)
	 */
	function Session(target, next) {
		if (typeof next !== 'function') {
			throw new Error('novacom.Session(): BUG next must be a common-js callback');
		}
		var session = this;
		var name = (typeof target === 'string' ? target : target && target.name) || 'emulator';
		log.info("novacom.Session()", "opening session to '" + name + "'");
		this.resolver = new Resolver();
		async.waterfall([
			this.resolver.load.bind(this.resolver),
			this.resolver.getDeviceBy.bind(this.resolver, 'name', name),
			this.checkConnection.bind(this),
			this.begin.bind(this)
		], next);
	}

	novacom.Session = Session;

	novacom.Session.prototype = {
		/**
		 * Check if socket can be connected
		 *
		 * This method can be called multiple times.
		 *
		 * @param {Function} next common-js callback
		 */
		checkConnection: function(target, next) {
			var alive = false;
			if (target && target.host && target.port) {
				var socket = new net.Socket();
				socket.setTimeout(2000);
				var client = socket.connect({
					host: target.host,
					port: target.port
				});
				client.on('connect', function() {
					alive = true;
					client.end();
					setImmediate(next, null, target);
				});
				client.on('error', function(err) {
					client.destroy();
					setImmediate(next, errMsgHndl.changeErrMsg(err));
				});
				client.on('timeout', function(err) {
					client.destroy();
					if (!alive) {
						setImmediate(next, errMsgHndl.changeErrMsg("Time out"));
					}
				});
			} else {
				setImmediate(next, null, target);
			}
		},

		/**
		 * Begin a novacom session with the current target
		 *
		 * This method can be called multiple times.
		 *
		 * @param {Function} next common-js callback
		 */
		begin: function(target, next) {
			log.verbose('Session#begin()', "target:", target);
			var self = this;
			this.target = target || this.target;
			if (!typeof this.target.privateKey && !typeof this.target.password) {
				return setImmediate(next, new Error("Private Key File or Password does not exist!!"));
			}

			if (!this.ssh) {
				this.forwardedPorts = [];
				this.ssh = new ssh2();
				this.ssh.on('connect', function() {
					log.verbose('Session#begin()', "ssh session event: connected");
				});
				this.ssh.on('ready', _next.bind(this));

				this.ssh.on('error', _next.bind(this));

				this.ssh.on('end', function() {
					log.verbose('Session#begin()', "ssh session event: end");
				});
				this.ssh.on('close', function(had_error) {
					log.verbose('Session#begin()', "ssh session event: close  (had_error:", had_error, ")");
				});
				this.target.readyTimeout = 30000;
				this.ssh.connect(this.target);

				process.on("SIGHUP", _clearSession);
				process.on("SIGINT", _clearSession);
				process.on("SIGQUIT", _clearSession);
				process.on("SIGTERM", _clearSession);
				process.on("exit", function(code) {
						_clearSession();
				});
				// Node.js cannot handle SIGKILL, SIGSTOP
				//process.on("SIGKILL", _clearSession);
				//process.on("SIGSTOP", _clearSession);
			}
			return this;

			function _next(err) {
				setImmediate(next, errMsgHndl.changeErrMsg(err), this);
			}

			function _clearSession() {
				log.verbose("Clear Session");
				self.end();
				setTimeout(function() {
					process.exit();
				}, 500);
			}
		},

		/**
		 * @return the resolved device actually in use for this session
		 */
		getDevice: function() {
			return this.target;
		},

		/**
		 * Suspend the novacom session.  Underlying resources
		 * are released (eg. SSH connections are closed).
		 */
		end: function() {
			log.verbose('Session#end()', "user-requested termination");
			if (this.ssh) {
				this.ssh.end();
			}
			return this;
		},

		_checkSftp: function(next) {
			// FIXME: This is workaround to prevent hang from ssh2.sftp()
			//       - issue in ssh2: https://github.com/mscdex/ssh2/issues/240
			//       This way only works with ssh2@0.2.x, not working with ssh2@0.4.x, ssh2@0.3.x.
			var self = this;
			self.ssh.subsys('sftp', function (err, stream) {
				if (err) {
					return setImmediate(next, err);
				}
				stream.once('data', function (data) {
					var regex = new RegExp("sftp-server(.| )+not found","gi");
					if (data.toString().match(regex)) {
						var sftpError = new Error("Unable to use sftp");
						sftpError.code = 4;
						return setImmediate(next, sftpError);
					}
				});
			});
		},

		/**
		 * Upload a file on the device
		 * @param {String} inPath location on the host
		 * @param {String} outPath location on the device
		 * @param {Function} next common-js callback
		 */
		put: function(inPath, outPath, next) {
			log.verbose('Session#put()', "streaming into device:", outPath, "from host:", inPath);
			var self = this;
			self.sftpPut(inPath, outPath, function(err) {
				if (err) {
					log.verbose(err);
					if (4 === err.code || 127 === err.code) {
						log.verbose('Session#put()', "sftp is not available, attempt transfering file via streamPut");
						// FIXME: file-based streaming does not
						// work (output is truncated).  As a
						// work-around, we load the entire package
						// in memory (as a Buffer).  is =
						// fs.createReadStream(inPath),
						is = new streamBuffers.ReadableStreamBuffer();
						is.pause();
						fs.readFile(inPath, function(err, data) {
							if (err) {
								return next(err);
							}
							is.put(data);
							self.streamPut(outPath, is, next);
						});
					} else {
						setImmediate(next, err);
					}
				} else {
					setImmediate(next);
				}
			});
		},

		/**
		 * Upload a file on the device via ssh stream
		 * @param {String} outPath location on the device
		 * @param {ReadableStream} inStream paused host-side source
		 * @param {Function} next common-js callback
		 */
		streamPut: function(outPath, inStream, next) {
			log.verbose('Session#streamPut()', "streaming into device:" + outPath);
			var cmd = '/bin/cat > ' + outPath;
			this.run(cmd, inStream /*stdin*/ , null /*stdout*/ , process.stderr /*stderr*/ , next);
		},

		/**
		 * Upload a file on the device via sftp
		 * @param {String} inPath location on the host
		 * @param {String} outPath location on the device
		 * @param {Function} next common-js callback
		 */
		sftpPut: function(inPath, outPath, next) {
			log.verbose('Session#sftpPut()', "streaming into device:", outPath, "from host:", inPath);
			var self = this;
			self._checkSftp(next);
			async.series({
				transfer: function(next) {
					self.ssh.sftp(function(err, sftp) {
						if (err) {
							return setImmediate(next, err);
						}
						var readStream = fs.createReadStream(inPath);
						var writeStream = sftp.createWriteStream(outPath);
						writeStream.on('close', function() {
							sftp.end();
							setImmediate(next);
						});
						// Exit when the remote process has terminated
						writeStream.on('exit', function(code, signal) {
							err = makeExecError('sftpPut', code, signal);
							setImmediate(next, err);
						});

						writeStream.on('error', function(err) {
							log.verbose('Session#sftpPut()', "error:", err);
							var detailMsg = errMsgHndl.changeErrMsg("sftp fail");
							setImmediate(next, detailMsg);
						});

						readStream.pipe(writeStream);
					});
				}
			}, function(err) {
				setImmediate(next, err);
			});
		},

		/**
		 * Download file on the device
		 * @param {String} inPath location on the device
		 * @param {String} outPath location on the host
		 * @param {Function} next common-js callback
		 */
		get: function(inPath, outPath, next) {
			log.verbose('Session#get()', "streaming into host:", outPath, "from target:", inPath);
			var self = this;
			self.sftpGet(inPath, outPath, function(err) {
				if (err) {
					log.verbose(err);
					if (4 === err.code) {
						log.verbose('Session#get()', "sftp is not available, attempt transfering file via streamPut");
						os = fs.createWriteStream(outPath);
						self.streamGet(inPath, os, next);
					} else {
						setImmediate(next, err);
					}
				} else {
					setImmediate(next);
				}
			});
		},

		/**
		 * Read a file from the device via ssh stream
		 * @param {String} inPath the device file path to be read
		 * @param {WritableStream} outStream host-side destination to copy the file into
		 * @param {Function} next commonJS callback invoked upon completion or failure
		 */
		streamGet: function(inPath, outStream, next) {
			log.verbose('Session#streamGet()', "streaming from device:" + inPath);
			var cmd = '/bin/cat ' + inPath;
			this.run(cmd, null /*stdin*/ , outStream /*stdout*/ , process.stderr /*stderr*/ , next);
		},

		/**
		 * Download file on the device via sftp
		 * @param {String} inPath location on the device
		 * @param {String} outPath location on the host
		 * @param {Function} next common-js callback
		 */
		sftpGet: function(inPath, outPath, next) {
			log.verbose('Session#sftpGet()', "streaming into host:", outPath, "from target:", inPath);
			var self = this;
			self._checkSftp(next);
			async.series({
				transfer: function(next) {
					self.ssh.sftp(function(err, sftp) {
						if (err) {
							setImmediate(next, err);
							return;
						}
						var readStream = sftp.createReadStream(inPath);
						var writeStream = fs.createWriteStream(outPath);
						readStream.on('close', function() {
							sftp.end();
							setImmediate(next);
						});
						// Exit when the remote process has terminated
						readStream.on('exit', function(code, signal) {
							err = makeExecError('sftpGet', code, signal);
							setImmediate(next, err);
						});

						readStream.pipe(writeStream);
					});
				}
			}, function(err) {
				setImmediate(next, err);
			});
		},

		/**
		 * Run a command on the device
		 * @param {String} cmd the device command to run
		 * @param {stream.ReadableStream} stdin given as novacom process stdin
		 * @param {stream.WritableStream} stdout given as novacom process stdout
		 * @param {stream.WritableStream} stderr given as novacom process stderr
		 * @param {Function} next commonJS callback invoked upon completion or failure
		 */
		run: function(cmd, stdin, stdout, stderr, next) {
			var err;
			log.verbose('Session#run()', "cmd=" + cmd);
			if (typeof next !== 'function') {
				throw new Error("BUG: 'next' is not a callback");
			}

			// plumb output
			var write = {}, obj = {};
			if (!stdout) {
				log.silly('Session#run()', "stdout: none");
				write.stdout = function() {};
			} else if (stdout instanceof stream.Stream) {
				log.silly('Session#run()', "stdout: stream");
				write.stdout = stdout.write;
				obj.stdout = stdout;
			} else if (stdout instanceof Function) {
				log.silly('Session#run()', "stdout: function");
				write.stdout = stdout;
			} else {
				setImmediate(next, new Error("Invalid novacom stdout: " + util.inspect(stdout)));
			}

			if (!stderr) {
				log.silly('Session#run()', "stderr: none");
				write.stderr = function() {};
			} else if (stderr instanceof stream.Stream) {
				log.silly('Session#run()', "stderr: stream");
				write.stderr = stderr.write;
				obj.stderr = stderr;
			} else if (stderr instanceof Function) {
				log.silly('Session#run()', "stderr: function");
				write.stderr = stderr;
			} else {
				setImmediate(next, new Error("Invalid novacom stderr: " + util.inspect(stderr)));
			}

			// execute command
			this.ssh.exec(cmd, (function(err, chStream) {
				log.verbose('Session#run()', 'exec cmd: ' + cmd + ', err:' + err);
				if (err) {
					setImmediate(next, err);
					return;
				}

				// manual pipe(): handle & divert data chunks
				chStream.on('data', function(data, extended) {
					extended = extended || 'stdout';
					log.verbose('Session#run()', "on data (" + extended + ")");
					write[extended].bind(obj[extended])(data);
				});
				// manual pipe(): handle EOF
				chStream.on('end', function() {
					log.verbose('Session#run()', "event EOF from (cmd: " + cmd + ")");
					if ((stdout !== process.stdout) && (stdout instanceof stream.Stream)) {
						stdout.end();
					}
					if ((stderr !== process.stderr) && (stderr instanceof stream.Stream)) {
						stderr.end();
					}
				});

				// Exit when the remote process has terminated
				chStream.on('exit', function(code, signal) {
					log.verbose('Session#run()', "event exit code=" + code + ', signal=' + signal + " (cmd: " + cmd + ")");
					err = makeExecError(cmd, code, signal);
					setImmediate(next, err);
				});

				// Exit if the 'exit' event was not
				// received (dropbear <= 0.51)
				chStream.on('close', function() {
					log.verbose('Session#run()', "event close  (cmd: " + cmd + ")");
					if (err === undefined) {
						setImmediate(next);
					}
				});

				if (stdin) {
					stdin.pipe(chStream);
					log.verbose('Session#run()', 'resuming input');
					stdin.resume();
				}
			}).bind(this));
		},

		/**
		 * Run a command on the device considerless return stdout
		 * @param {String} cmd the device command to run
		 * @param {Function} callback invoked upon exit event
		 * @param {Function} next commonJS callback invoked upon completion or failure
		 */
		runNoHangup: function(cmd, cbData, cbExit, next) {
			var err;
			log.verbose('Session#runNoHangup()', "cmd=" + cmd);
			if (arguments.length < 2) {
				throw new Error("BUG: 'next' is not a callback");
			}
			switch (arguments.length) {
				case 2:
					next = cbData;
					cbData = cbExit = null;
					break;
				case 3:
					next = cbExit;
					cbExit = cbData;
					cbData = null;
					break;
				default:
					break;
			}
			if (typeof next !== 'function') {
				throw new Error("BUG: 'next' is not a callback");
			}

			// execute command
			this.ssh.exec(cmd, (function(err, stream) {
				log.verbose('Session#run()', 'exec cmd: ' + cmd + ', err:' + err);
				if (err) {
					setImmediate(next, err);
					return;
				}
				stream.on('data', function(data, extended) {
					extended = extended || 'stdout';
					var str = (Buffer.isBuffer(data))? data.toString() : data;
					log.verbose('[Session#runNoHangup()#onData]', str);
					if (cbData) {
						cbData(data);
					}
				});

				// Exit when the remote process has terminated
				if (cbExit) {
					stream.on('exit', function(code, signal) {
						log.verbose('Session#runNoHangup()', "event exit code=" + code + ', signal=' + signal + " (cmd: " + cmd + ")");
						err = makeExecError(cmd, code, signal);
						cbExit(err);
					});
				}
				setImmediate(next);
			}).bind(this));
		},

		/**
		 * Forward the given device port on the host
		 *
		 * As any other public method, this one can be called
		 * only once the ssh session has emitted the 'ready'
		 * event, so as part of the Session#next callback.
		 *
		 * @public
		 * @param {Function} next commonJS callback invoked upon completion or failure
		 */
		forward: function(devicePort, localPort, forwardName, next) {
			log.verbose('Session#forward()', "devicePort:", devicePort, "localPort:", localPort);
			var session = this;
			var forwardInUse = false;
			var registerName = null;
			if (typeof forwardName === 'function') {
				next = forwardName;
			} else {
				if (forwardName) {
					registerName = forwardName;
				}
			}

			if (localPort !== 0) {
				if (session.forwardedPorts.indexOf({
					name: registerName,
					local: localPort,
					device: devicePort
				}) > 0) {
					forwardInUse = true;
				}
			} else {
				if (session.forwardedPorts.filter(function(forwardItem) {
					return (forwardItem.device === devicePort && forwardItem.name === registerName);
				}).length > 0) {
					forwardInUse = true;
				}
			}

			if (forwardInUse) {
				setImmediate(next);
				return;
			}

			var localServer = net.createServer(function(inCnx) {

				log.info('Session#forward()', "new client, localPort:", localPort);
				log.verbose('Session#forward()', "new client, from: " + inCnx.remoteAddress + ':' + inCnx.remotePort);
				inCnx.on('error', function(err) {
					log.verbose('Session#forward()', 'inCnx::error, err:: ' + err);
				});
				inCnx.pause();
				// Open the outbound connection on the
				// device to match the incoming
				// client.
				session.ssh.forwardOut("127.0.0.1" /*srcAddr*/ , inCnx.remotePort /*srcPort*/ , "127.0.0.1" /*dstAddr*/ , devicePort /*dstPort*/ , function(err, outCnx) {
					if (err) {
						console.log('Session#forward()', "failed forwarding client localPort:", localPort, "(inCnx.remotePort:", inCnx.remotePort, ")=> devicePort:", devicePort);
						log.warn('Session#forward()', "failed forwarding client localPort:", localPort, "=> devicePort:", devicePort);
						inCnx.destroy();
						return;
					}
					log.info('Session#forward()', "connected, devicePort:", devicePort);
					outCnx.pause();
					outCnx.pipe(inCnx);
					inCnx.pipe(outCnx);
					inCnx.resume();
					outCnx.resume();
					outCnx.on('error', function(err) {
						log.verbose('Session#forward()', 'outCnx::error, err:: ' + err);
					});
					outCnx.on('close', function(had_err) {
						log.verbose('Session#forward()', 'outCnx::close, had_err:', had_err);
					});
				});

			});
			try {
				var localServerPort;
				localServer.listen(localPort, null, (function() {
					localServerPort = localServer.address().port;
					session.forwardedPorts.push({
						name: registerName,
						local: localServerPort,
						device: devicePort
					});
					setImmediate(next);
				}.bind(this)));
			} catch (err) {
				setImmediate(next, err);
			}
		},
		getLocalPortByDevicePort: function(remotePort) {
			var session = this;
			var found = null;
			session.forwardedPorts.forEach(function(portItem) {
				if (portItem.device === remotePort) {
					found = portItem.local;
					return;
				}
			});
			return found;
		},
		getLocalPortByName: function(queryName) {
			var session = this;
			var found = null;
			session.forwardedPorts.forEach(function(portItem) {
				if (portItem.name === queryName) {
					found = portItem.local;
					return;
				}
			});
			return found;
		},
		runHostedAppServer: function(url, next) {
			utility.runServer(url, 0, function(err, serverInfo) {
				if (serverInfo && serverInfo.port) {
					this.setHostedAppServerPort(serverInfo.port);
				}
				next(err);
			}.bind(this));
		},
		setHostedAppServerPort: function(port) {
			this.hostedAppServerPort = port;
		},
		getHostedAppServerPort: function() {
			return this.hostedAppServerPort;
		}
	}
}());
