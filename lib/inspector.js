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

var defaultServiceInstallPath = "/media/developer/apps/usr/palm/services/";
var defaultNodeInsptPath = "/media/cryptofs/apps/usr/palm/services/com.palmdts.devmode.service/";

(function() {

	var log = npmlog;
	var serverFlag = false;

	log.heading = 'inspector';
	log.level = 'warn';

	
	var inspector = {

		/**
		 * @property {Object} log an npm log instance
		 */
		log: log,
		
		inspect:function(options, params, next){
			if (typeof next !== 'function') {
				throw new Error('Missing completion callback (next=' + util.inspect(next) + ')');
			}
			var os = new streamBuffers.WritableStreamBuffer();
			async.series([
				_makeSession,
				_runAppPortForwardServer,
				_runServicePortForwardServer,
				_runInspector
			], function(err, results) {
				log.verbose("inspector#inspect()", "err: ", err, "results:", results);
				var result = results[1];
				next(err, result);
			});

			function _makeSession(next) {
				options.nReplies = 1; // -n 1
				options.session = new novacom.Session(options.device, next);
			}
			
			function _runAppPortForwardServer(next){
				if (options.appId) {		
					options.session.forward(options.session.ssh._host, '9998', 0 /* random port */,next);
				} else {
					next();
				}
			}

			function _findNewDebugPort(dbgPort, next) {
				var format = "netstat -lt 2>/dev/null | grep :%s | wc -l";
				var cmdPortInUsed = sprintf(format, dbgPort);
				
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
					console.log("[*****ByJunil] returnValue:", str);
					if (str === "0") {
						console.log("[*****ByJunil] new Port:", dbgPort);
						next();
					} else if (str === "1") {
						dbgPort = Number(dbgPort)+1;
						console.log("[*****ByJunil] try again Port:", dbgPort);
						_findNewDebugPort(dbgPort, next);
					} else {
						throw new Error("Failed to get Debug Port");
						return;
					}
					//str.split(/\r?\n/).forEach(_onLine);
				}
			}

			function _runServicePortForwardServer(next) {
				//test
				options.serviceId = "com.yourdomain.hello.service";
				if (options.serviceId) {
					var cmdNodeInspt = path.join('sh ', defaultNodeInsptPath, 'node-inspector.sh');
					//var cmdNodeInspt = path.join('node ', defaultNodeInsptPath, 'node-inspector/bin/inspector.js');
					//var cmdRunSvcDbg = 'nohup /usr/bin/run-js-service -d ' + path.join(defaultServiceInstallPath, options.serviceId) + ' &';
					//var cmdRunSvcDbg = 'sh /usr/bin/run-js-service -d ' + path.join(defaultServiceInstallPath, options.serviceId);
					var dbgPort = 5885;
					var format = "sh /usr/bin/run-js-service -d -p %s %s";
					cmdRunSvcDbg = sprintf(format, dbgPort, path.join(defaultServiceInstallPath, options.serviceId));

					console.log("*******cmdNodeInspt:", cmdNodeInspt);
					console.log("*******cmdRunSvcDbg:", cmdRunSvcDbg);
					async.series([
						//options.session.run.bind(options.session, cmdNodeInspt, null, null, null),
						_findNewDebugPort.bind(this, dbgPort),
						function(next){
							cmdRunSvcDbg = sprintf(format, dbgPort, path.join(defaultServiceInstallPath, options.serviceId));
							next();
						}.bind(this),
						options.session.runWithNoReturn.bind(options.session, cmdRunSvcDbg, null, null, null),
						function(next){
							setTimeout(function(){
									next();
								},2000);
						}.bind(this),
						options.session.forward.bind(options.session, options.session.ssh._host, '8080', 0 /* random port */)
					], function(err, results) {
						console.log("inspector#inspect()", "err: ", err, "results:", results);
						log.verbose("inspector#inspect()", "err: ", err, "results:", results);
						var result = results[1];
						next(err, result);
					});

					//1. run node-inspector with port (default:8080)
					//2. need port-forward 'host random port' into 'node-inspector port'
					//3. run node using run-js-service -d (default:5885)
					//options.session.forward(options.session.ssh._host, '8080', 0 /* random port */,next);
				} else {
					next();
				}
			}
				
			function _runInspector(next) {				
				if (options.appId) {		
					//var url = "http://localhost:" + options.session.getPortNumber();
					var url = "http://localhost:" + options.session.getLocalPort('9998');
					var info = platformOpen[process.platform];
					
					request.get(url + '/pagelist.json', function (error, response, body) {
					    if (!error && response.statusCode == 200) {
					        var pagelist = JSON.parse(body);
					        for(var index in pagelist){
					        	if(pagelist[index].url.indexOf(options.appId) != -1){
					        		url += pagelist[index].inspectorUrl;
					        	}
					        }
					        console.log("Application Debugging - " + url);
					        var inspectBrowser = spawn(info[0], info.slice(1).concat([url]));
					    }
					});
				}

				//test
				options.serviceId = "test";
				if (options.serviceId) {
					// open browser like following url.
					// http://localhost:(host random port)/debug?port=(node debug port)
					var nodeInsptUrl;
					var ip = 'localhost'; //"10.195.245.40"; //"localhost";
					var nodeInsptPort = options.session.getLocalPort('8080'); //'8080';
					var nodeDebugPort = '5885';
					var format = "http://%s:%s/debug?port=%s";
					nodeInsptUrl = sprintf(format, ip, nodeInsptPort, nodeDebugPort);
					console.log("nodeInsptUrl:", nodeInsptUrl);
					var inspectBrowser = spawn(info[0], info.slice(1).concat([nodeInsptUrl]));
				}
			}
		},
	};
	
	if (typeof module !== 'undefined' && module.exports) {
		module.exports = inspector;
	}
}());
