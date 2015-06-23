var util = require('util'),
    async = require('async'),
    path = require('path'),
    npmlog = require('npmlog'),
    request = require('request'),
    luna = require('./luna'),
    streamBuffers = require("stream-buffers"),
    spawn = require('child_process').spawn,
    fs = require('fs'),
    novacom = require('./novacom'),
    utility = require('./utility'),
    sdkenv	= require('./sdkenv'),
    installer = require('./installer');

var platformOpen = {
	win32: [ "cmd" , '/c', 'start' ],
	darwin:[ "open" ],
	linux: [ "xdg-open" ]
};

var defaultAppInsptPort = "9998";
var defaultNodeInsptPort = "8080";
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

		inspect: function(options, params, next) {
			if (typeof next !== 'function') {
				throw new Error('Missing completion callback (next=' + util.inspect(next) + ')');
			}
			options.svcDbgInfo = {}; /* { id : { port : String , path : String } } */
			if (options && options.hasOwnProperty('serviceId')) {
				if (options.serviceId instanceof Array) {
					options.serviceId.forEach(function(id) {
						options.svcDbgInfo[id] = {};
					})
				} else {
					options.svcDbgInfo[options.serviceId] = {};
				}
			}
			async.series([
				_findSdkEnv,
				_getPkgList,
				_makeSession,
				_runAppPortForwardServer,
				_runAppInspector,
				_runServicePortForwardServer,
				function(next) {
					log.verbose("inspector#inspect()", "running...");
				}
			], function(err, results) {
				log.verbose("inspector#inspect()", "err: ", err, "results:", results);
				var result = results[1];
				next(err, result);
			});

			function _findSdkEnv(next) {
				var env = new sdkenv.Env();
				env.getEnvValue("BROWSER", function(err, browserPath) {
					options.bundledBrowserPath = browserPath;
					next();
				});
			}

			function _getPkgList(next) {
				if (!options.serviceId) {
					return next();
				}
				installer.list(options, function(err, pkgs) {
					if (pkgs instanceof Array) {
						options.instPkgs = pkgs;
					}
					next(err);
				});
			}

			function _makeSession(next) {
				options.nReplies = 1; // -n 1
				options.session = new novacom.Session(options.device, next);
			}

			function _runAppPortForwardServer(next){
				if (options.appId) {
					options.session.forward(defaultAppInsptPort, options.hostPort || 0 /* random port */, options.appId, next);
				} else {
					next();
				}
			}

			function _findNewDebugPort(dbgPort, next) {
				var format = "netstat -ltn 2>/dev/null | grep :%s | wc -l";
				var cmdPortInUsed = util.format(format, dbgPort);

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
						return next(new Error("Failed to get Debug Port"));
					}
				}
			}

			function _runServicePortForwardServer(next) {
				var svcIds = Object.keys(options.svcDbgInfo).filter(function(id) {
					return id !== 'undefined';
				});
				async.forEachSeries(svcIds, __eachServicePortForward,
					function(err) {
						next(err);
					}
				);

				function __eachServicePortForward(serviceId, next) {
					if (!serviceId) {
						return next();
					}
					var dbgPort = defaultServiceDebugPort;
					var format = "sh /usr/bin/run-js-service -d -p %s %s";
                    var __launchServiceInspector = function(svcId, next) {
    					if (!options.svcDbgInfo[svcId]['port']) {
	    					return next();
		    			}
			    		var info = platformOpen[process.platform];
				    	// open browser with the following url.
					    // http://localhost:(host random port)/debug?port=(node debug port)
    					var nodeInsptUrl;
	    				var ip = 'localhost';
		    			var nodeInsptPort = options.session.getLocalPortByName(svcId);
			    		var nodeDebugPort = options.svcDbgInfo[svcId]['port'];
				    	var format = "http://%s:%s/debug?port=%s";
				    	var killTimer;
    					nodeInsptUrl = util.format(format, ip, nodeInsptPort, nodeDebugPort);
	    				request.get(nodeInsptUrl, function(error, response, body) {
		    				if (!error && response.statusCode == 200) {
			    				function _reqHandler(code, res) {
				    				if (code === "@@ARES_CLOSE@@") {
					    				res.status(200).send();
						    			killTimer = setTimeout(function() {
							    			process.exit(0);
								    	}, 2 * 1000);
    								} else if (code === "@@GET_URL@@") {
	    								clearTimeout(killTimer);
		    							res.status(200).send(nodeInsptUrl);
			    					}
				    			}

					    		function _postAction(err, serverInfo) {
						    		if (err) {
							    		process.exit(1);
								    } else {
	    								if (serverInfo && serverInfo.msg && options.open) {
    										var serverUrl = 'http://localhost:' + serverInfo.port + '/ares_cli/ares.html';
		    								utility.openBrowser(serverUrl, options.bundledBrowserPath);
			    						}
				    				}
					    		}
						    	console.log("nodeInsptUrl:", nodeInsptUrl);
							    utility.runServer(__dirname, 0, _reqHandler, _postAction);
    							next();
	    					}
		    			});
			    	}

					async.waterfall([
						function findSvcFilePath(next) {
							if (options.instPkgs) {
								options.instPkgs.every(function(pkg) {
									if (serviceId.indexOf(pkg.id) !== -1) {
										options.svcDbgInfo[serviceId]['path'] = path.join(path.dirname(pkg.folderPath), '..', 'services', serviceId).replace(/\\/g, '/');
										return false;
									}
									return true;
								});
							}
							if (!options.svcDbgInfo[serviceId]['path']) {
								return next(new Error("Failed to get service installation path '" + serviceId + "'"));
							}
							next();
						},
						function parserMeta(next) {
							var metaFilePath = path.join(options.svcDbgInfo[serviceId]['path'], "services.json").replace(/\\/g, '/');
							var cmdCatServiceInfo = "cat " + metaFilePath;
							var metaData;

							async.series([
								function(next) {
									options.session.run(cmdCatServiceInfo, process.stdin, _onData, process.stderr, next);
								}
							], function(err, results) {
								if (err) {
									return next(new Error("Failed to find an installed service '" + serviceId + "'"));
								}
							});

							function _onData(data) {
								if (Buffer.isBuffer(data)) {
									metaData = data.toString().trim();
								} else {
									metaData = data.trim();
								}
								next(null, metaData);
							}
						},
						function checkServiceType(metaData, next) {
							try {
								var metaInfo = JSON.parse(metaData);
								if (metaInfo["engine"] === "native") {
									return next(new Error(serviceId + " is a native service, please use ares-gdbserver to debug it."));
								}
								next();
							} catch (err) {
								next(err);
							}
						},
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
							var cmdMkDir = "mkdir -p " + options.svcDbgInfo[serviceId]['path'] + "/_ares";
							options.session.runNoHangup(cmdMkDir, next);
						},
						_findNewDebugPort.bind(this, dbgPort),
						function makeDbgFile(port, next) {
							dbgPort = port;
							var cmdWriteDbgPort = "echo " + dbgPort + " > " + options.svcDbgInfo[serviceId]['path'] + "/_ares/debugger-port";
							options.session.runNoHangup(cmdWriteDbgPort, next);
						},
						function(next) {
							setTimeout(function(){
								next();
							},1000);
						}.bind(this),
						function runService(next) {
							options.svcDbgInfo[serviceId]['port'] = dbgPort;
							if (options.session.getDevice().username == 'root') {
								var cmdRunSvcDbg = util.format(format, dbgPort, options.svcDbgInfo[serviceId]['path']);
								cmdRunSvcDbg = cmdRunSvcDbg.replace(/\\/g, "/");
								options.session.runNoHangup(cmdRunSvcDbg, next);
							} else {
								options.nReplies = 1;
								var addr = {
									"service": serviceId,
									"method": "info"
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
						options.session.forward.bind(options.session, defaultNodeInsptPort, options.hostPort || 0 /* random port */, serviceId),
						function clearDbgFile(next) {
							var cmdRmDbgFile = "rm -rf " + options.svcDbgInfo[serviceId]['path'] + "/_ares";
							options.session.runNoHangup(cmdRmDbgFile, next);
						},
                        __launchServiceInspector.bind(this, serviceId)
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
					var killTimer;
					if(options.session.target.noPortForwarding){
						log.verbose("inspector#inspect()","noPortForwarding");
						url = "http://"+options.session.ssh._host+":9998";
					}
					request.get(url + '/pagelist.json', function (error, response, body) {
						if (!error && response.statusCode == 200) {
							var pagelist = JSON.parse(body);
							for(var index in pagelist) {
								if(pagelist[index].url.indexOf(options.appId) != -1 || pagelist[index].url.indexOf(options.localIP) != -1) {
									url += pagelist[index].inspectorUrl;
								}
							}
							console.log("Application Debugging - " + url);
						}
						function _reqHandler(code, res) {
							if (code === "@@ARES_CLOSE@@") {
								res.status(200).send();
								killTimer = setTimeout(function() {
									process.exit(0);
								}, 2 * 1000);
							} else if (code === "@@GET_URL@@") {
								clearTimeout(killTimer);
								res.status(200).send(url);
							}
						}
						function _postAction(err, serverInfo) {
							if (err) {
								process.exit(1);
							} else {
								if (serverInfo && serverInfo.msg && options.open) {
									var serverUrl = 'http://localhost:' + serverInfo.port + '/ares_cli/ares.html';
									utility.openBrowser(serverUrl, options.bundledBrowserPath);
								}
							}
						}
						utility.runServer(__dirname, 0, _reqHandler, _postAction);
					});
				}
				next();
			}
		}
	};

	if (typeof module !== 'undefined' && module.exports) {
		module.exports = inspector;
	}
}())
