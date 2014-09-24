var util = require('util'),
	async = require('async'),
	path = require('path'),
	npmlog = require('npmlog'),
	request = require('request'),
	spawn = require('child_process').spawn,
	fs = require('fs'),
	readLine = require('readline'),
	novacom = require('./novacom');

var prefixPath = "/media/developer/";
var defaultNativeAppInstallPath = prefixPath + "apps/usr/palm/applications";
var defaultNativeSvcInstallPath = prefixPath + "apps/usr/palm/services";
var defaultGdbserverPort = '9930';

(function() {

	var log = npmlog;
	var serverFlag = false;

	log.heading = 'gdbserver';
	log.level = 'warn';


	var gdbserver = {

		/**
		 * @property {Object} log an npm log instance
		 */
		log: log,
		/**
		 * @property {Object} ssh an novecom Session instance
		 */
		session: null,

		run: function(options, params, next) {
			if (typeof next !== 'function') {
				throw new Error('Missing completion callback (next=' + util.inspect(next) + ')');
			}
			var self = this;
			var appId = options.appId;
			var svcId = options.serviceId;
			var port = options.port || defaultGdbserverPort;
			var hostPort = options.hostPort || defaultGdbserverPort;
			if (!appId && !svcId) {
				next(new Error('gdbserver launch failed due to no appId'));
				return;
			}

			var sigintCount = 0;
			process.on("SIGINT", function() {
				log.verbose("This is SIGINT handling...");
				if (sigintCount++ > 0) {
					log.verbose("To prevent hangup due to an abnormal disconnection");
					process.exit(1);
				}

				async.waterfall([
					self.getPidUsingPort.bind(self, self.port),
					self.killProcByPid.bind(self),
					function(next) {
						//Need to wait kill command run in device.
						setTimeout(next, 1000);
					}
				], function(err, results) {
					if (err) {
						process.exit(1);
					}
					process.exit(0);
				});
			});

			async.waterfall([
				_makeSession.bind(this),
				_readAppInfo.bind(this),
				_getExecFileName.bind(this),
				this.getPidUsingPort.bind(this, port),
				this.killProcByPid.bind(this),
				_findNewDebugPort.bind(this, port),
				_getEnvFromDevice.bind(this),
				_addUserEnv.bind(this),
				_launchGdbserver.bind(this),
				_portForward.bind(this),
				_printForwardInfo.bind(this)
			], function(err, result) {
				log.verbose("gdbserver#run()", "err: ", err, "result:", result);
				next(err, result);
			});

			function _makeSession(next) {
				log.verbose("gdbserver#_makeSession");
				options.nReplies = 1; // -n 1
				options.session = new novacom.Session(options.device, next);
			}

			function _readAppInfo(session, next) {
				log.verbose("gdbserver#_readAppInfo");
				this.session = session;
				if (appId) {
					var metaFilePath = path.join(defaultNativeAppInstallPath, appId, 'appinfo.json');
				} else if (svcId) {
					var metaFilePath = path.join(defaultNativeSvcInstallPath, svcId, 'services.json');
				} else {
					return next(new Error('gdbserver launch failed due to no appId'));
				}
				metaFilePath = metaFilePath.replace(/\\/g, "/");
				var cmdCatAppInfo = "cat " + metaFilePath;
				var metaData;

				async.series([
					function(next) {
						options.session.run(cmdCatAppInfo, process.stdin, _onData, process.stderr, next);
					}
				], function(err, results) {
					if (err) {
						return next(err);
					}
				});

				function _onData(data) {
					if (Buffer.isBuffer(data)) {
						metaData = data.toString().trim();
					} else {
						metaData = data.trim();
					}
					if (metaData[0] === "{") {
						log.verbose("gdbserver#run()#_readAppInfo#metaData:", metaData);
						next(null, metaData);
					} else {
						return next(new Error("Failed to get appinfo.json"))
					}
				}
			}

			function _getExecFileName(metaData, next) {
				log.verbose("gdbserver#run()#_getExecFileName#metaData:", metaData);
				try {
					var metaInfo = JSON.parse(metaData);
					if (appId) {
						if (!metaInfo.main)
							return next(new Error("Failed to get Executable File Name from appinfo.json"));
						this.execName = metaInfo.main;
					} else if (svcId) {
						if (metaInfo.engine !== 'native')
							return next(new Error(metaInfo.id + " is not a native service"));
						this.execName = metaInfo.executable;
					}
					log.verbose("gdbserver#run()#_getExecFileName#execName:", this.execName);
					next();
				} catch (err) {
					next(err);
				}
			}

			function _findNewDebugPort(gdbPort, next) {
				log.verbose("gdbserver#run()#_findNewDebugPort#gdbPort:", gdbPort);
				if (gdbPort === null) {
					gdbPort = port;
				}
				if (typeof gdbPort === 'function') {
					next = gdbPort;
					gdbPort = port;
				}
				var self = this;
				var format = "netstat -ltn 2>/dev/null | grep :%s | wc -l";
				var cmdPortInUsed = util.format(format, gdbPort);

				async.series([

					function(next) {
						options.session.run(cmdPortInUsed, process.stdin, _onData, process.stderr, next);
					}
				], function(err, results) {
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
					if (str === "0") {
						self.port = gdbPort;
						next();
					} else if (str === "1") {
						gdbPort = Number(gdbPort) + 1;
						_findNewDebugPort(gdbPort, next);
					} else {
						return next(new Error("Failed to get Debug Port"));
					}
				}
			}

			function _getEnvFromDevice(next) {
				log.verbose("gdbserver#run()#_getEnvFromDevice");
				if (options.session.getDevice().username != 'root') {
					setImmediate(next, null, "");
					return;
				}
				var cmdGetEnvVars = "find /etc/jail_native_devmode.conf 2>/dev/null | xargs awk '/setenv/{printf \"export %s=%s;\\n\", $2,$3}' | xargs echo";
				var strEnvVars = "";
				options.session.run(cmdGetEnvVars, null, _onData, null, function(err) {
					if (err) {
						return setImmediate(next, err);
					}
				});

				function _onData(data) {
					if (Buffer.isBuffer(data)) {
						strEnvVars = strEnvVars.concat(data.toString());
					} else {
						strEnvVars = strEnvVars.concat(data);
					}
					setImmediate(next, null, strEnvVars);
				}
			}

			function _addUserEnv(systemEnv, next) {
				log.verbose("gdbserver#run()#_addUserEnv");
				if (appId) {
					var envVariables = {
						//"USER_VARS" : "VALUE",
						"LD_LIBRARY_PATH" : "$LD_LIBRARY_PATH:" + path.join(defaultNativeAppInstallPath, appId, 'lib').replace(/\\/g, "/")
					};
				} else if (svcId) {
					var envVariables = {
						//"USER_VARS" : "VALUE",
						"LD_LIBRARY_PATH" : "$LD_LIBRARY_PATH:" + path.join(defaultNativeSvcInstallPath, svcId, 'lib').replace(/\\/g, "/")
					};
				}
				var strEnvVar = systemEnv.concat(__makeStringGlobalEnv(envVariables));
				next(null, strEnvVar);

				function __makeStringGlobalEnv(obj, next) {
					var strGlobalEnv = "";
					Object.keys(obj).forEach(function(key) {
						strGlobalEnv = strGlobalEnv.concat("export ")
							.concat(key)
							.concat("=")
							.concat(obj[key])
							.concat(";");
					});
					return strGlobalEnv;
				}
			}

			function _launchGdbserver(prefixEnv, next) {
				log.verbose("gdbserver#run()#_launchGdbserver");
				var format = "gdbserver localhost:%s %s";
				if (appId) {
					var cmdRunGdbserver = util.format(format, this.port, path.join(defaultNativeAppInstallPath, appId, this.execName));
				} else if (svcId) {
					var cmdRunGdbserver = util.format(format, this.port, path.join(defaultNativeSvcInstallPath, svcId, this.execName));
				}
				cmdRunGdbserver = cmdRunGdbserver.replace(/\\/g, "/");
				options.session.runNoHangup(prefixEnv + cmdRunGdbserver, __data, __exit, next);
				function __data(data) {
					var str = (Buffer.isBuffer(data))? data.toString() : data;
					console.log("[gdbserver] " + str);
				}
				function __exit() {
					log.verbose("gdbserver#run()#_launchGdbserver#__exit");
					process.exit(0);
				}
			}

			function _portForward(next) {
				log.verbose("gdbserver#run()#_portForward");
				options.session.forward(this.port, hostPort, next);
			}

			function _printForwardInfo(err, next) {
				log.verbose("gdbserver#run()#_waitExit");
				if (typeof err !== 'function') {
					console.error(err);
					next(err);
				}
				console.log("gdbserver#_waitExit: port:", this.port);
				console.log("Port Forwarding#(HostPC:Device): ", hostPort, ":", this.port);
			}
		},

		close: function(options, params, next) {
			log.verbose("gdbserver#close");
			var port = options.port || defaultGdbserverPort;
			if (typeof next !== 'function') {
				throw new Error('Missing completion callback (next=' + util.inspect(next) + ')');
			}
			async.waterfall([
				_makeSession.bind(this),
				function(session, next) {
					this.session = session;
					next();
				}.bind(this),
				this.getPidUsingPort.bind(this, port),
				this.killProcByPid.bind(this),
				function(next) {
					//Need to wait kill command run in device.
					setTimeout(next, 1000);
				},
				this.closeSession
			], function(err, results) {
				log.verbose("gdbserver#close()", "err: ", err, "results:", results);
				next(err, results);
			});

			function _makeSession(next) {
				options.nReplies = 1; // -n 1
				options.session = new novacom.Session(options.device, next);
			}
		},

		killPrevGdbserver: function(next) {
			if (!options.session) {
				next(new Error("gdbserver#killPrevGdbserver()#no session"));
				return;
			}
			var cmdKillGdbserver = "kill -9 `pidof gdbserver` 2>/dev/null";
			this.session.runNoHangup(cmdKillGdbserver, next);
		},

		getPidUsingPort: function(port, next) {
			if (typeof port === 'function') {
				next = port;
				port = defaultGdbserverPort;
			}
			if (!this.session) {
				next(new Error("gdbserver#getPidUsingPort()#no session"));
				return;
			}
			var format = "fuser -n tcp %s 2>/dev/null | awk '{print $0}' | xargs echo";
			var cmdGetPidForPort = util.format(format, port);
			async.series([

				function(next) {
					this.session.run(cmdGetPidForPort, process.stdin, _onData, process.stderr, next);
				}.bind(this)
			], function(err, results) {
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
					var pids = str.split(' ').filter(function(str) {
						return str.trim() !== '';
					});
					next(null, pids);
				} else {
					next();
				}
			}
		},

		killProcByPid: function(pid, next) {
			log.verbose("gdbserver#killProcByPid");
			if (typeof pid === 'function') {
				next = pid;
				return next();
			}
			if (!this.session) {
				return next(new Error("gdbserver#killPrevGdbserver()#no session"));
			}
			var pids = [];
			if (pid instanceof Array) {
				pids = pid;
			} else if (pid instanceof String) {
				pids.push(pid);
			} else {
				return next(new Error("gdbserver#killPrevGdbserver()#no pid"));
			}

			var format = "kill -9 %s 2>/dev/null";
			var cmdKillPid = util.format(format, pids.join(' '));
			this.session.runNoHangup(cmdKillPid, next);
		},

		closeSession: function(next) {
			if (!this.session) {
				log.verbose("This session is already terminated");
				return next();
			}
			this.session.end();
			this.session = null;
			next();
		}
	};

	//FIXME: the following cause ENOTCONN on the following case.
	//       1. only when cli is executed from RCP ( it doesn't mean just JAVA, it means RCP plugin)
	//       2. node 10.0.18
	//       3. only windows
	/*
	if (process.platform === "win32") {
		var rl = readLine.createInterface({
				input: process.stdin,
				output: process.stdout
				});

		rl.on("SIGINT", function() {
				process.emit("SIGINT");
			});
	}
	*/

	if (typeof module !== 'undefined' && module.exports) {
		module.exports = gdbserver;
	}
}());
