var util = require('util'),
    async = require('async'),
    path = require('path'),
    npmlog = require('npmlog'),
    request = require('request'),
    luna = require('./luna'),
    streamBuffers = require("stream-buffers"),
    spawn = require('child_process').spawn,
    fs = require('fs'),
	sprintf = require('sprintf').sprintf,
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
				_makeSession,
				_readAppInfo,
				_getExecFileName,
				_findNewDebugPort,
				_setEnv,
				_killPrevGdbserver,
				_launchGdbserver,
				_portForward
			], function(err, results) {
				log.verbose("gdbserver#run()", "err: ", err, "results:", results);
				var result = results[7];
				next(err, result);
			});

			function _makeSession(next) {
				options.nReplies = 1; // -n 1
				options.session = new novacom.Session(options.device, next);
			}
			function _readAppInfo(session, next) {
				var appInfoFilePath = path.join(defaultNativeAppInstallPath, appId, 'appinfo.json');
				var cmdCatAppInfo = "cat " + appInfoFilePath;
				var appInfoData;

				async.series([
					options.session.run.bind(options.session, cmdCatAppInfo, process.stdin, _onData, process.stderr),
				], function(err, results) {
					console.log("[ByJunil] results:", results);
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
						console.log("[ByJunil]appInfoData:", appInfoData);
						next(null, appInfoData);
					} else {
						throw new Error("Failed to get appinfo.json");
						return;
					}
				}
			}
			function _getExecFileName(appInfoData, next) {
				console.log("_getExecFileName#appInfoData:", appInfoData);
				try {
					var appInfo = JSON.parse(appInfoData);
					execName = appInfo.main
					next(null, port);
				} catch(err) {
					next(err);
				}
			}
			function _findNewDebugPort(gdbPort, next) {
				console.log("_findNewDebugPort:gdbPort", gdbPort);
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
				console.log("found execName:", execName);
				var cmdSetEnv = "sh /etc/init.d/env.sh;export SDL_VIDEODRIVER=wayland";
				options.session.run(cmdSetEnv, null, null, null, next);
			}
			function _killPrevGdbserver(next) {
				console.log("_killPrevGdbserver:next:");
				var cmdKillGdbserver = "kill -9 `pidof gdbserver`";
				options.session.run(cmdKillGdbserver, null, null, null, next);
				next();
			}
			function _launchGdbserver(next) {
				console.log("_launchGdbserver");
				next();
			}
			function _portForward(next) {
				next();
			}
		},

		close:function(options, params, next) {
			if (typeof next !== 'function') {
				throw new Error('Missing completion callback (next=' + util.inspect(next) + ')');
			}
			async.series([
				_makeSession,
				_killPrevGdbserver
			], function(err, results) {
				log.verbose("gdbserver#close()", "err: ", err, "results:", results);
				var result = results[1];
				next(err, result);
			});

			function _makeSession(next) {
				options.nReplies = 1; // -n 1
				options.session = new novacom.Session(options.device, next);
			}
			
			function _killPrevGdbserver(next) {
				next();
			}
		},
	};
	
	if (typeof module !== 'undefined' && module.exports) {
		module.exports = gdbserver;
	}
}());
