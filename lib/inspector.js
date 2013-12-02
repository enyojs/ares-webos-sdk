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

var prefixPath = "/media/developer/";
var defaultServiceInstallPath = "apps/usr/palm/services/";
var defaultAppInsptPort = "9998";
var defaultNodeInsptPort = "8080";
var defaultServiceDebugPort = "5885";

//FIXME: work around for launching inspector
if (process.platform.toString() === 'darwin') {
	delete process.env['ARES_BUNDLE_BROWSER'];
}

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
			options.serviceIds = [];
			options.svcDbgPorts = [];
			if (options && options.hasOwnProperty('serviceId')) {
				if (options.serviceId instanceof Array) {
					options.serviceIds = options.serviceId;
				} else {
					options.serviceIds.push(options.serviceId);
				}
			}
			async.series([
				_makeSession,
				_runAppPortForwardServer,
				_runServicePortForwardServer,
				_runAppInspector,
				_runServiceInspector,
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
					options.session.forward(defaultAppInsptPort, 0 /* random port */, options.appId, next);
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
				async.series([
					async.forEachSeries.bind(this, options.serviceIds, __eachServicePortForward.bind(this))
				], function(err) {
					if (err) {
						next(err);
					}
					next();
				});

				function __eachServicePortForward(serviceId, next) {
					if (!serviceId) {
						next();
						return;
					}
					if (options.session.getDevice().username == 'root') {
						defaultServiceInstallPath = prefixPath + defaultServiceInstallPath;
					}
					var dbgPort = defaultServiceDebugPort;
					var format = "sh /usr/bin/run-js-service -d -p %s %s";
					var servicePath = path.join(defaultServiceInstallPath, serviceId).replace(/\\/g, "/");
					async.waterfall([
						function quitPrevService(next) {
							options.nReplies = 1;
							var addr = {
								"service": serviceId,
								"method": "quit"
							};
							var param = {};
							luna.send(options, addr, param, function(lineObj, innerNext) {
								next();
							}, next);
						},
						function mkDirForDbgFile(next) {
							var cmdMkDir = "mkdir -p " + servicePath + "/_ares";
							options.session.runNoHangup(cmdMkDir, next);
						},
						_findNewDebugPort.bind(this, dbgPort),
						function makeDbgFile(port, next) {
							dbgPort = port;
							var cmdWriteDbgPort = "echo " + dbgPort + " > " + servicePath + "/_ares/debugger-port";
							options.session.runNoHangup(cmdWriteDbgPort, next);
						},
						function runService(next) {
							options.svcDbgPorts.push({id:serviceId, port:dbgPort});
							if (options.session.getDevice().username == 'root') {
								var cmdRunSvcDbg = sprintf(format, dbgPort, path.join(defaultServiceInstallPath, serviceId));
								cmdRunSvcDbg = cmdRunSvcDbg.replace(/\\/g, "/");
								options.session.runNoHangup(cmdRunSvcDbg, next);
							} else {
								options.nReplies = 1;
								var addr = {
									"service": serviceId,
									"method": "ping"
								};
								var param = {};
								luna.send(options, addr, param, function(lineObj, innerNext) {
									next();
								}, next);
							}
						}.bind(this),
						function(next) {
							setTimeout(function(){
								next();
							},1000);
						}.bind(this),
						options.session.forward.bind(options.session, defaultNodeInsptPort, 0 /* random port */, serviceId),
						function clearDbgFile(next) {
							var cmdRmDbgFile = "rm -rf " + servicePath + "/_ares";
							options.session.runNoHangup(cmdRmDbgFile, next);
						}
					], function(err, results) {
						log.verbose("inspector#inspect()", "err: ", err, "results:", results);
						next(err, results);
					});
				}
			}
				
			function _runAppInspector(next) {				
				if (options.appId) {		
					var url = "http://localhost:" + options.session.getLocalPortByName(options.appId);
					var info = platformOpen[process.platform];
					var bundledBrowserPath = process.env['ARES_BUNDLE_BROWSER'];
					if (bundledBrowserPath) {
						if (process.platform === 'win32') {
							info.splice(2, 1); //delete 'start' command
						}
						info = info.concat([bundledBrowserPath, '--args']);
					}		

					if(options.session.target.noPortForwarding){
						log.verbose("inspector#inspect()","noPortForwarding");
						url = "http://"+options.session.ssh._host+":9998";
					}

					request.get(url + '/pagelist.json', function (error, response, body) {
					    if (!error && response.statusCode == 200) {
					        var pagelist = JSON.parse(body);
					        for(var index in pagelist){
					        	if(pagelist[index].url.indexOf(options.appId) != -1 || pagelist[index].url.indexOf(options.localIP) != -1){
					        		url += pagelist[index].inspectorUrl;
					        	}
					        }
					        console.log("Application Debugging - " + url);
					    }
					    var inspectBrowser = spawn(info[0], info.slice(1).concat([url]));
					});
				}
				next();
			}

			function _runServiceInspector(next) {				
				async.series([
					async.forEachSeries.bind(this, options.svcDbgPorts, __eachServiceInspectorLaunch.bind(this))
				], function(err) {
					if (err) {
						next(err);
					}
					next();
				});

				function __eachServiceInspectorLaunch(svcDbgPort, next) {
					var info = platformOpen[process.platform];
					var bundledBrowserPath = process.env['ARES_BUNDLE_BROWSER'];
					if (bundledBrowserPath) {
						if (process.platform === 'win32') {
							info.splice(2, 1); //delete 'start' command
						}
						info = info.concat([bundledBrowserPath, '--args']);
					}					
					// open browser like following url.
					// http://localhost:(host random port)/debug?port=(node debug port)
					var nodeInsptUrl;
					var ip = 'localhost'; 
					var nodeInsptPort = options.session.getLocalPortByName(svcDbgPort.id);
					var nodeDebugPort = svcDbgPort.port;
					var format = "http://%s:%s/debug?port=%s";
					nodeInsptUrl = sprintf(format, ip, nodeInsptPort, nodeDebugPort);
					request.get(nodeInsptUrl, function (error, response, body) {
					    if (!error && response.statusCode == 200) {
							console.log("nodeInsptUrl:", nodeInsptUrl);
							spawn(info[0], info.slice(1).concat([nodeInsptUrl]));
					    }
					});
					next();
				}
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
