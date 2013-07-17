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

var defaultNodeInsptPath = "/media/cryptofs/apps/usr/palm/services/com.palmdts.devmode.service/";
var defaultServiceInstallPath = "/media/developer/apps/usr/palm/services/";
var defaultServiceDebugPort = "5885";

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
			if (options && options.hasOwnProperty('serviceId')) {
				if (options.serviceId instanceof Array) {
					options.serviceIds = options.serviceId;
				} else {
					options.serviceIds = [];
					options.serviceIds.push(options.serviceId);
				}
			}
			async.series([
				_makeSession,
				_runAppPortForwardServer,
				_runServicePortForwardServer,
				_runInspector,
				//_runAppInspector,
				//_runServiceInspector,
				function(next) {
					log.verbose("inspector#inspect()","running...");
				}
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
					options.session.forward('9998', 0 /* random port */,next);
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
					if (str === "0") {
						next(null, dbgPort);
					} else if (str === "1") {
						dbgPort = Number(dbgPort)+1;
						_findNewDebugPort(dbgPort, next);
					} else {
						throw new Error("Failed to get Debug Port");
						return;
					}
				}
			}

			function _runServicePortForwardServer(next) {
				//test
				//options.serviceId = "com.yourdomain.hello.service";
				options.serviceIds.forEach(function(serviceId) {
					var dbgPort = defaultServiceDebugPort;
					var format = "sh /usr/bin/run-js-service -d -p %s %s";
					var cmdRunSvcDbg = sprintf(format, dbgPort, path.join(defaultServiceInstallPath, serviceId));
					async.waterfall([
						function(next) {
							//FIXME: need to change to use __quit
							var cmdKillPrvSvc = "kill -9 `pidof " + serviceId + ".js`";
							next(null, cmdKillPrvSvc, null, null, null);
						}.bind(this),
						options.session.runWithNoReturn.bind(options.session),
						_findNewDebugPort.bind(this, dbgPort),
						function(dbgPort, next) {
							if (!options.svcDbgPorts) {
								options.svcDbgPorts = [];
							}
							options.svcDbgPorts.push(dbgPort);
							cmdRunSvcDbg = sprintf(format, dbgPort, path.join(defaultServiceInstallPath, serviceId));
							next(null, cmdRunSvcDbg, null, null, null);
						}.bind(this),
						options.session.runWithNoReturn.bind(options.session),
						function(next) {
							setTimeout(function(){
								next();
							},2000);
						}.bind(this),
						options.session.forward.bind(options.session, '8080', 0 /* random port */)
					], function(err, results) {
						log.verbose("inspector#inspect()", "err: ", err, "results:", results);
						next(err, results);
					});
				});
				next();
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
				//options.serviceId = "test";
				options.svcDbgPorts.forEach( function(svcDbgPort) {
					// open browser like following url.
					// http://localhost:(host random port)/debug?port=(node debug port)
					var nodeInsptUrl;
					var ip = 'localhost'; //"10.195.245.40"; //"localhost";
					var nodeInsptPort = options.session.getLocalPort('8080'); //'8080';
					var nodeDebugPort = svcDbgPort;
					var format = "http://%s:%s/debug?port=%s";
					nodeInsptUrl = sprintf(format, ip, nodeInsptPort, nodeDebugPort);
					console.log("nodeInsptUrl:", nodeInsptUrl);
					var inspectBrowser = spawn(info[0], info.slice(1).concat([nodeInsptUrl]));
				});
				next();
			}
				
			function _runAppInspector(next) {				
				if (options.appId) {		
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
				next();
			}

			function _runServiceInspector(next) {				
				if (options.serviceId) {
					var url = "http://localhost:" + options.session.getLocalPort('9998');
					var info = platformOpen[process.platform];
					// open browser like following url.
					// http://localhost:(host random port)/debug?port=(node debug port)
					var nodeInsptUrl;
					var ip = 'localhost'; //"10.195.245.40"; //"localhost";
					var nodeInsptPort = options.session.getLocalPort('8080'); //'8080';
					var nodeDebugPort = options.svcDbgPort;
					var format = "http://%s:%s/debug?port=%s";
					nodeInsptUrl = sprintf(format, ip, nodeInsptPort, nodeDebugPort);
					console.log("nodeInsptUrl:", nodeInsptUrl);
					var inspectBrowser = spawn(info[0], info.slice(1).concat([nodeInsptUrl]));
				}
				next();
			}

			/* //FIXME: cleanup 
			process.on("SIGINT", function() {
					console.log("This is SIGINT handling....");
					options.session.end();
					process.exit();
			});
			*/
		},
	};
	
	if (typeof module !== 'undefined' && module.exports) {
		module.exports = inspector;
	}
	
	/* //FIXME: cleanup 
	var readLine = require("readline");
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
}()) 
