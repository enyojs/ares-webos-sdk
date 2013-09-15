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
    request = require('request');

(function () {

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
		}, "webospro": {
			lunaAddr: {
				install: {
					service: "com.webos.appInstallService",
					method: "installLocalNoVerify"
				},
				remove: {
					service: "com.webos.appInstallService",
					method: "remove"
				},
				list: {
					service: "com.webos.applicationManager",
					method: "listApps"
				},
				launch: {
					service: "com.webos.applicationManager",
					method: "launch" 
				},
				terminate: {
					service: "com.webos.applicationManager",
					method: "closeByAppId" 
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
				}
			}		
		}, "starfish": {
			lunaAddr: {
				install: {
					service: "com.webos.appInstallService",
					method: "installLocalNoVerify"
				},
				remove: {
					service: "com.webos.appInstallService",
					method: "remove"
				},
				list: {
					service: "com.webos.applicationManager",
					method: "listApps"
				},
				launch: {
					service: "com.webos.applicationManager",
					method: "launch" 
				},
				terminate: {
					service: "com.webos.applicationManager",
					method: "closeByAppId" 
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
				}
			}
		}
	};

	function makeExecError(cmd, code, signal) {
		var err = null; 	// null:success, undefined:did-not-run, Error:failure
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
		this.deviceFileContent;
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
				_readFile.bind(resolver, builtins, true /*mandatory*/),
				_loadString.bind(resolver)
				// FIXME: here is problem causing parsing error 
				// _readFile.bind(resolver, builtins, false /*mandatory*/),
				// _loadString.bind(resolver),
				// this._save.bind(this)
			], function(err) {
				if (err) {
					next(err);
				} else {
					log.info("Resolver#load()", "devices:", resolver.devices);
					next();
				}
			});

			function _readFile(fileName, mandatory, next) {
				log.verbose("Resolver#load#_readFile()", "<<< " + fileName);
				if (mandatory) {
					fs.readFile(fileName, 'utf8', next);
				} else {
					fs.readFile(fileName, 'utf8', function(err, str) {
						if (err && err.code === 'ENOENT') {
							next(null, "[]");
						} else {
							next(err, str);
						}
					});
				}
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
					next(new Error("Incorrect file format'"));
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
						next(err);
					} else {
						log.verbose("Resolver#load#_loadString()", "devices:", resolver.devices);
						next();
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
				if (key === "display" || key === "lunaAddr"  || key === "lunaResult") {
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
				name: deviceInfo.name.toLowerCase().replace(/ +/g,"_"),
				description: deviceInfo.description || deviceInfo.name,
				host: deviceInfo.host || "127.0.0.1",
				port: deviceInfo.port || 5522,
				username: deviceInfo.username || 'root',
				type: deviceInfo.type || 'webospro'
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
				next();
			} else if (inDevice.type === 'webospro') {
				var keyDirPath = __dirname;
				async.waterfall([
					function(next) {
						fs.exists(path.join(keyDirPath, inDevice.privateKey.openSsh), function(exists) {
							if (!exists) {
								keyDirPath = keydir;
							}
							fs.readFile(path.join(keyDirPath, inDevice.privateKey.openSsh), next);
						});
					}.bind(this),
					function(privateKey, next) {
						inDevice.privateKeyName = inDevice.privateKey.openSsh;
						inDevice.privateKey = privateKey;
						next();
					}
				], function(err) {
					// do not load non-existing OpenSSH private key files
					if (err) {
						log.warn("Resolver#_loadOne()", "Unable to find OpenSSH private key named '" + inDevice.privateKey.openSsh + "': ignoring device '" + inDevice.name + "'");
						inDevice.privateKey = undefined;
					}
					next();
				}); 
			} else if (typeof inDevice.privateKey === 'object' && typeof inDevice.privateKey.openSsh === 'string') {
				async.waterfall([
					fs.readFile.bind(this, path.join(keydir, inDevice.privateKey.openSsh)),
					function(privateKey, next) {
						inDevice.privateKeyName = inDevice.privateKey.openSsh;
						inDevice.privateKey = privateKey;
						next();
					}
				], function(err) {
					// do not load non-existing OpenSSH private key files
					if (err) {
						log.warn("Resolver#_loadOne()", "Unable to find OpenSSH private key named '" + inDevice.privateKey.openSsh + "': ignoring device '" + inDevice.name + "'");
						inDevice.privateKey = undefined;
					}
					next();
				});
			} else if (typeof inDevice.type === 'webospro') {
				// FIXME: here is the place to
				// stream-down the SSH private key
				// from the device
				next(new Error("Not implemented: go & grab the webOS Pro private key here"));
			} else { //private Key is not defined in novacom-device.json
				//next(new Error("Unable to handle device name '" + inDevice.name + "' with privateKey:" + util.inspect(inDevice.privateKey)));
				log.warn("Resolver#_loadOne()", "Regist privateKey : ignoring device '" + inDevice.name + "'");
				inDevice.privateKeyName = undefined;
				inDevice.privateKey = undefined;
				next();
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
				description: inDevice.description
			};
			if (inDevice.username && inDevice.host && inDevice.port) {
				inDevice.display.addr = "ssh://" + inDevice.username + "@" + inDevice.host + ":" + inDevice.port;
			}
			for(var n in inDevice){
				if(n !== "display"){
					inDevice.display[n] = inDevice[n];
				}				
			}
			log.silly("Resolver#_addOne()", "device:", inDevice);
			// filter-out `this.devices` from the one having the same name as `inDevice`...
			this.devices = this.devices.filter(function(device) {
				return device.name !== inDevice.name;
			});
			// ...hook proper luna interface
			inDevice.lunaAddr   = systemTypes[inDevice.type].lunaAddr;
			inDevice.lunaResult = systemTypes[inDevice.type].lunaResult; 
			// ...and then append `inDevice`
			this.devices.push(inDevice);
			next();
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
			var builtins = path.join(__dirname, 'novacom-devices.json');
			log.verbose("Resolver#save()", "devicesData:", devicesData);
			fs.writeFile(builtins, JSON.stringify(devicesData, null, "\t"),next);
		},		

		/**
		 * @public
		 */
		list: function(next) {
			log.verbose("Resolver#list()");
			next(null, this.devices.map(function(device) {
				return device.display;
			}));
		},

		getDeviceBy: function(key, value, next) {
			log.verbose("Resolver#getDeviceBy()", "key:", key, "value:", value);
			var device = this.devices.filter(function(device) {
				return device[key] && device[key] === value;
			})[0];
			log.verbose("Resolver#getDeviceBy()", "device:", device);
			if (typeof next === 'function') {
				log.silly("Resolver#getDeviceBy()", "async");
				if (device) {
					next(null, device);
				} else {
					next(new Error("No device matching '" + key + "'='" + value + "'"));
				}
			} else {
				log.silly("Resolver#getDeviceBy()", "sync");
				return device;
			}
		},

		getSshPrvKey: function(target, next) {
			var name = (typeof target === 'string' ? target : target && target.name) || 'webos3-qemux86';
			async.waterfall([
				this.getDeviceBy.bind(this, 'name', name),
				function(target, next) {
					log.info("Resolver#getSshPrvKey()", "target.host:", target.host);
					var keyStream = request('http://'+target.host+':9991/webos_rsa');
					keyStream.on('error', function(){ next(new Error("Failed to get ssh private key")); });
					keyStream.on('data', function(data){
						var keyFileNamePrefix = target.name.replace(/(\s+)/gi,'_');
						var keyFileName = keyFileNamePrefix + "_webos";
						var keySavePath = path.join(keydir, keyFileName);
						log.info("Resolver#getSshPrvKey()", "key data:", data);
						fs.writeFile(keySavePath, data, function (err) {
							if (err) {
								next(new Error(err)); 
							} else { 
								next(null, keySavePath, keyFileName);
							} });
						});
				},
				function(keyFilePath, keyFileName, next) {
					log.info("Resolver#getSshPrvKey()", "SSH Private Key:", keyFilePath);
					console.log("SSH Private Key:", keyFilePath);
					next(null, keyFileName);
				}
			], next);
		},

		modifyDeviceFile: function(target, next) {
			if (!target.name) {
				next(new Error("Incorrect target name"));
				return;
			}
			if (!this.deviceFileContent) {
				next(new Error("Need to load file"));
				return;
			}
			var inDevices = JSON.parse(this.deviceFileContent);
			if (!Array.isArray(inDevices)) {
				next(new Error("Incorrect file format'"));
				return;
			}

			inDevices.forEach(function(inDevice) {
				if (inDevice.name === target.name) {
					if (target.privateKey) {
						inDevice.privateKey = target.privateKey;
					}
					if (target.passphrase) {
						inDevice.passphrase = target.passphrase;
						//FIXME: termporary code for get authentication from tv 
						//       until webos tv has a proper authorized_keys file.
						inDevice.password = "lgsmarttvsdk";
					}
				}
			});
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
		var name = (typeof target === 'string' ? target : target && target.name) || 'webos3-qemux86';
		log.info("novacom.Session()", "opening session to '" + name + "'");
		this.resolver = new Resolver();
		async.waterfall([
			this.resolver.load.bind(this.resolver),
			this.resolver.getDeviceBy.bind(this.resolver, 'name', name),
			this.begin.bind(this)
		], next);
	}

	novacom.Session = Session;

	novacom.Session.prototype = {

		/**
		 * Begin a novacom session with the current target
		 * 
		 * This method can be called multiple times.
		 * 
		 * @param {Function} next common-js callback
		 */
		begin: function(target, next) {
			log.verbose('Session#begin()', "target:", target);
			this.target = target || this.target;
			if(!this.target.privateKey) {
				next(new Error("Private Key does not exist!!"));
				return;
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
				this.ssh.connect(this.target);
			}
			return this;

			function _next(err) {
				next(err, this);
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
			this.ssh.end();
			this.ssh = null;
			return this;
		},

		/**
		 * Upload a file on the device
		 * @param {String} outPath location on the device
		 * @param {ReadableStream} inStream paused host-side source
		 * @param {Function} next common-js callback
		 */
		put: function(outPath, inStream, next) {
			log.verbose('Session#put()', "streaming into device:" + outPath);
			var cmd = '/bin/cat > ' + outPath;
			this.run(cmd, inStream /*stdin*/, null /*stdout*/, process.stderr /*stderr*/, next); 
		},

		/**
		 * Upload a file on the device via sftp
		 * @param {String} inPath location on the host
		 * @param {String} outPath location on the device
		 * @param {Function} next common-js callback
		 */
		sftp: function(inPath, outPath, next) {
			log.verbose('Session#sftp()', "streaming into device:" + outPath + "from host:" + inPath);
			
			this.ssh.sftp(function(err, sftp) {
					if (err) {
						next(err);
						return;
					}
					var readStream = fs.createReadStream(inPath);
					var writeStream = sftp.createWriteStream(outPath);
					writeStream.on('close', function() {
												sftp.end();
												next();
											});
					// Exit when the remote process has terminated
					writeStream.on('exit', function(code, signal) {
						err = makeExecError('sftp', code, signal);
						next(err);
					});
					
					readStream.pipe(writeStream);
				});
		},

		/**
		 * Read a file from the device
		 * @param {String} inPath the device file path to be read
		 * @param {WritableStream} outStream host-side destination to copy the file into
		 * @param {Function} next commonJS callback invoked upon completion or failure
		 */
		get: function(inPath, outStream, next) {
			log.verbose('Session#get()', "streaming from device:" + inPath);
			var cmd = '/bin/cat ' + inPath;
			this.run(cmd, null /*stdin*/, outStream /*stdout*/, process.stderr /*stderr*/, next); 
		},
		
		/**
		 * Download file on the device via sftp
		 * @param {String} inPath location on the device
		 * @param {String} outPath location on the host
		 * @param {Function} next common-js callback
		 */
		getBySftp: function(inPath, outPath, next) {
			log.verbose('Session#sftp()', "streaming into device:" + outPath + "from host:" + inPath);
			
			this.ssh.sftp(function(err, sftp) {
					if (err) {
						next(err);
						return;
					}
					var readStream = sftp.createReadStream(inPath);
					var writeStream = fs.createWriteStream(outPath);
					readStream.on('close', function() {
												sftp.end();
												next();
											});
					// Exit when the remote process has terminated
					readStream.on('exit', function(code, signal) {
						err = makeExecError('getBySftp', code, signal);
						next(err);
					});
					
					readStream.pipe(writeStream);
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
				next(new Error("Invalid novacom stdout: " + util.inspect(stdout)));
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
				next(new Error("Invalid novacom stderr: " + util.inspect(stderr)));
			}
			
			// execute command
			this.ssh.exec(cmd, (function(err, chStream) {
				log.verbose('Session#run()', 'exec cmd: ' + cmd + ', err:' + err);
				if (err) {
					next(err);
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
					next(err);
				});

				// Exit if the 'exit' event was not
				// received (dropbear <= 0.51)
				chStream.on('close', function() {
					log.verbose('Session#run()', "event close  (cmd: " + cmd + ")");
					if (err === undefined) {
						next();
					}
				});

				if (stdin) {
					stdin.pipe(chStream);
					log.verbose('Session#run()', 'resuming input');
					if (stdin !== process.stdin) {
						stdin.resume();
					}
				}
			}).bind(this));
		},

		/**
		 * Run a command on the device considerless return stdout
		 * @param {String} cmd the device command to run
		 * @param {stream.ReadableStream} stdin given as novacom process stdin
		 * @param {stream.WritableStream} stdout given as novacom process stdout
		 * @param {stream.WritableStream} stderr given as novacom process stderr
		 * @param {Function} next commonJS callback invoked upon completion or failure
		 */
		runNoHangup: function(cmd, next) {
			var err;
			log.verbose('Session#run()', "cmd=" + cmd);
			if (typeof next !== 'function') {
				throw new Error("BUG: 'next' is not a callback");
			}
			
			// execute command
			this.ssh.exec(cmd, (function(err, stream) {
				log.verbose('Session#run()', 'exec cmd: ' + cmd + ', err:' + err);
				if (err) {
					next(err);
					return;
				}

				next();
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
				if (session.forwardedPorts.indexOf({name:registerName, local:localPort, device:devicePort}) > 0 ) {
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
				next();
				return;
			}

			var localServer = net.createServer(function(inCnx) {

				log.info('Session#forward()', "new client, localPort:", localPort);
				log.verbose('Session#forward()', "new client, from: " + inCnx.remoteAddress +':'+ inCnx.remotePort);
				inCnx.on('data', function(data){
					if(data.toString().indexOf("closeAresInspector") != -1){
						localServer.close();
					}
				});
				inCnx.pause();
				// Open the outbound connection on the
				// device to match the incoming
				// client.
				session.ssh.forwardOut("127.0.0.1" /*srcAddr*/, inCnx.remotePort /*srcPort*/, "127.0.0.1" /*dstAddr*/, devicePort /*dstPort*/, function(err, outCnx) {
					if (err) {
						console.log('Session#forward()', "failed forwarding client localPort:", localPort, "(inCnx.remotePort:",inCnx.remotePort,")=> devicePort:", devicePort);
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
				localServer.listen(localPort, "127.0.0.1", null, (function(){
					localServerPort = localServer.address().port;
					session.forwardedPorts.push({name:registerName, local:localServerPort, device: devicePort});
					next();	
				}.bind(this)));
			} catch(err) {
				next(err);
			}
		},
		getLocalPortByDevicePort:function(remotePort){
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
		getLocalPortByName:function(queryName){
			var session = this;
			var found = null;
			session.forwardedPorts.forEach(function(portItem) {
						if (portItem.name === queryName) {
							found = portItem.local;
							return;
						}
					});
			return found;
		}
	}
}());
