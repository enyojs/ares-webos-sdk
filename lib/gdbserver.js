var util = require('util'),
    async = require('async'),
    path = require('path'),
    npmlog = require('npmlog'),
    request = require('request'),
    spawn = require('child_process').spawn,
    fs = require('fs'),
    sprintf = require('sprintf').sprintf,
    readLine = require('readline'),
    novacom = require('./novacom');

var platformOpen = {
	win32: [ "cmd" , '/c', 'start' ],
	darwin:[ "open" ],
	linux: [ "xdg-open" ]
};

var defaultNativeAppInstallPath = "/media/developer/apps/usr/palm/applications";
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
		
		run:function(options, params, next) {
			if (typeof next !== 'function') {
				throw new Error('Missing completion callback (next=' + util.inspect(next) + ')');
			}
			var appId = options.appId;
			var port = options.port || defaultGdbserverPort;
			var execName;
			if (!appId) {
				next(new Error('gdbserver launch failed due to no appId'));
				return;
			}
			async.waterfall([
				this.closeSession,
				_makeSession,
				_readAppInfo,
				_getExecFileName,
				_findNewDebugPort,
				_setEnv,
				this.killPrevGdbserver,
				_launchGdbserver,
				_portForward,
				_waitExit
			], function(err, result) {
				log.verbose("gdbserver#run()", "err: ", err, "result:", result);
				next(err, result);
			});

			function _makeSession(next) {
				options.nReplies = 1; // -n 1
				options.session = new novacom.Session(options.device, next);
				this.session = options.session;
			}
			function _readAppInfo(session, next) {
				var appInfoFilePath = path.join(defaultNativeAppInstallPath, appId, 'appinfo.json');
				var cmdCatAppInfo = "cat " + appInfoFilePath;
				var appInfoData;

				async.series([
					options.session.run.bind(options.session, cmdCatAppInfo, process.stdin, _onData, process.stderr)
				], function(err, results) {
					if (err) {
						next(err);
					}
				});

				function _onData(data) {
					if (Buffer.isBuffer(data)) {
						appInfoData = data.toString().trim();
					} else {
						appInfoData = data.trim();
					}
					if (appInfoData[0] === "{") {
						log.verbose("gdbserver#run()#_readAppInfo#appInfoData:", appInfoData);
						next(null, appInfoData);
					} else {
						throw new Error("Failed to get appinfo.json");
						return;
					}
				}
			}
			function _getExecFileName(appInfoData, next) {
				log.verbose("gdbserver#run()#_getExecFileName#appInfoData:", appInfoData);
				try {
					var appInfo = JSON.parse(appInfoData);
					execName = appInfo.main
					next(null, port);
				} catch(err) {
					next(err);
				}
			}
			function _findNewDebugPort(gdbPort, next) {
				log.verbose("gdbserver#run()#_findNewDebugPort#gdbPort:", gdbPort);
				var format = "netstat -lt 2>/dev/null | grep :%s | wc -l";
				var cmdPortInUsed = sprintf(format, gdbPort);

				async.series([
					options.session.run.bind(options.session, cmdPortInUsed, process.stdin, _onData, process.stderr),
				], function(err, results) {
					if (err) {
						next(err);
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
						port = gdbPort;
						next();
					} else if (str === "1") {
						gdbPort = Number(gdbPort)+1;
						_findNewDebugPort(gdbPort, next);
					} else {
						throw new Error("Failed to get Debug Port");
						return;
					}
				}
			}
			function _setEnv(next) {
				log.verbose("gdbserver#run()#_setEnv#execName:", execName);
				var cmdSetEnv = "sh /etc/init.d/env.sh;export SDL_VIDEODRIVER=wayland";
				options.session.run(cmdSetEnv, null, null, null, next);
			}
			function _launchGdbserver(next) {
				log.verbose("gdbserver#run()#_launchGdbserver");
				var format = "gdbserver localhost:%s %s";
				var cmdRunGdbserver = sprintf(format, port, path.join(defaultNativeAppInstallPath, appId, execName));
				options.session.runNoHangup(cmdRunGdbserver, null, null, null, next);
			}
			function _portForward(next) {
				log.verbose("gdbserver#run()#_portForward");
				options.session.forward(port, port, next);
			}
			function _waitExit(err, next) {
				log.verbose("gdbserver#run()#_waitExit");
				if (typeof err !== 'function') {
					console.log("err:", err);
					next(err);
				}
				console.log("gdbserver#_waitExit:port:",port);
			}
		},

		close:function(options, params, next) {
			if (typeof next !== 'function') {
				throw new Error('Missing completion callback (next=' + util.inspect(next) + ')');
			}
			async.series([
				this.closeSession,
				_makeSession,
				this.killPrevGdbserver
			], function(err, results) {
				log.verbose("gdbserver#close()", "err: ", err, "results:", results);
				var result = results[1];
				next(err, result);
			});

			function _makeSession(next) {
				options.nReplies = 1; // -n 1
				options.session = new novacom.Session(options.device, next);
				this.session = options.session;
			}
		},

		killPrevGdbserver:function(next) {
			if (this.session === null) {
				next(new Error("gdbserver#killPrevGdbserver()#no session"));
			}
			var cmdKillGdbserver = "kill -9 `pidof gdbserver` 2>/dev/null";
			this.session.runNoHangup(cmdKillGdbserver, null, null, null, next);
		},

		closeSession:function(next) {
			if (!this.session) {
				log.verbose("This session is null");
				next();
				return;
			}
			this.session.end();
			this.session = null;
			next();
		},
	};

	process.on("SIGINT", function() {
		console.log("This is SIGINT handling...");
		async.series([
			gdbserver.killPrevGdbserver,
			gdbserver.closeSession
		], function(err, results) {
			if(err) {
				console.error(err);
				process.exit(1);
			}
			process.exit(0);
		});
	});

	if (process.platform === "win32") {
		var rl = readLine.createInterface({
				input: process.stdin,
				output: process.stdout
				});

		rl.on("SIGINT", function() {
				process.emit("SIGINT");
			});
	}

	if (typeof module !== 'undefined' && module.exports) {
		module.exports = gdbserver;
	}
}());
