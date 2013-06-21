var util = require('util'),
    async = require('async'),
    npmlog = require('npmlog'),
    luna = require('./luna'),
    novacom = require('./novacom');

(function() {

	var log = npmlog;
	log.heading = 'launcher';
	log.level = 'warn';

	var launcher = {

		/*
		 * $ palm-launch --help
		 * Usage: palm-launch [OPTION...] [APP_ID]
		 * Launch applications on a HP webOS device.
		 * 
		 * Options:
		 * -c, --close             Close running applications instead of launching
		 * -d, --device=DEVICE     Specify DEVICE to use
		 *     --device-list       List the available devices
		 * -f, --relaunch          Relaunch app (close and reopen)
		 * -i, --inspect           Inspect the application
		 * -q, --list-stages       List the running stages
		 * -s, --stage=STAGE       Specify STAGE to inspect
		 * -l, --list              List the installed applications
		 * -p, --params=PARAMS     Set the launch parameters to PARAMS
		 *     --version           Display version info and exit
		 *     --help              Display this help and exit
		 *    
		 * APP_ID is the id of the application to launch (or close).
		 * 
		 * DEVICE is a unique identifier which matches a device name, type, or id
		 * (as returned by the device-list option). e.g. Use "usb" for a usb-connected
		 * device, or "tcp" for an emulator (note: emulator must be running). If not
		 * specified, the first device found is used.
		 * 
		 * STAGE is the id of the application's stage (as returned by the --list-stages option).
		 * 
		 * PARAMS defines launch parameters to be passed when launching an
		 * application. It is specified as a key-value pair of the form "key:value" or
		 * as a JSON object. Surrounding quotes are required in both cases.
		 * 
		 * Examples:
		 * 
		 * # Launch application
		 * palm-launch com.example.app
		 * 
		 * # Launch application, passing in framework configuration options
		 * palm-launch -p "{mojoConfig: {debuggingEnabled:true,timingEnabled:true}}" com.example.app
		 * 
		 * # Launch and inspect application
		 * palm-launch -i com.example.app
		 * 
		 * # List stages of running application
		 * palm-launch -q com.example.app
		 * 
		 * # Inspect specific stage of application
		 * palm-launch -i -s 1023 com.example.app
		 * 
		 * # Close application
		 * palm-launch -c com.example.app
		 * 
		 * # List applications on default device
		 * palm-launch -l
		 * 
		 * # List applications on usb device
		 * palm-launch -d usb -l
		 * 
		 * # List applications on emulator
		 * palm-launch -d tcp -l
		 */

		/**
		 * @property {Object} log an npm log instance
		 */
		log: log,

		/**
		 * Launch the given application id
		 * @param {Object} options
		 * @property options {String} device the device to connect to
		 * @property options {Boolean} inspect run the application with web-inspector turned on
		 */
		launch: function(options, id, params, next) {
			if (typeof next !== 'function') {
				throw new Error('Missing completion callback (next=' + util.inspect(next) + ')');
			}
			options = options || {};
			async.series([
				_makeSession,
				_launch,
				_getInspectorPort
			], function(err, results) {
				log.verbose("launcher#launch()", "err: ", err, "results:", results);
				// 2 steps in async.series, we want to
				// the value returned by the second
				// step (index=1)
				var result = results[1];
				if (!err) {
					result.msg = "Launched application " + id;
				}
				next(err, result);
			});

			function _makeSession(next) {
				options.nReplies = 1; // -n 1
				options.session = new novacom.Session(options.device, next);
			}

			function _launch(next) {
				var target = options.session.getDevice();
				var addr = target.lunaAddr.launch;
				var result = target.lunaResult.launch;
				//FIXME: webos-3.x use param {subscribe, id, params}
				//        next version webos us param {id, subscribe}
				var param = (target.name === "webos3-qemux86")? 
						{
							// luna param
							subscribe: false,
							id: id,
							params: params
						} : {
							// luna param
							id: id,
							subscribe: false
						};			

				luna.send(options, addr, param, function(lineObj, next) {
					log.silly("launcher#launch#_launch():", "lineObj:", lineObj);
					var resultValue = result.getResultValue(lineObj);
					if (resultValue) {
						// success: stop
						log.verbose("launcher#launch#_launch():", "success");
						next(null, { procId: resultValue});
					} else {
						// failure: stop
						log.verbose("launcher#launch#_launch():", "failure");
						next(new Error("object format error"));
					}
				}, next);
			}

			function _getInspectorPort(next) {
				if (!options.inspect) {
					log.verbose("launcher#launch#_getInspectorPort()", "no inspector port required");
					next(null, { port: undefined });
				} else {
					// FIXME: this service method
					// is not implemented.  This
					// code is a place-holder to
					// executing a specific luna
					// service to get the
					// inspector port for the
					// given application (or
					// service, in case we share
					// the code).
					luna.send(options, {
						// luna addr
						service: 'com.palm.lunastats', //FIXME: 'com.palm.applicationManager'
						method: 'gc' // FIXME: 'getInspectorPort'
					}, {	// luna param
						subscribe: false,
						id: id
					}, function(lineObj, next) {
						log.silly("launcher#launch#_getInspectorPort():", "lineObj:", lineObj);
						// FIXME: return a dummy port to make the command succeed.
						next(null, { port: 34567});
						/*
						if (lineObj.port) {
							// success: stop
							log.verbose("launcher#launch#_getInspectorPort()", "got inspector port:", lineObj.port);
							next(null, { port: lineObj.port});
						} else {
							// failure: stop
							log.verbose("launcher#launch#_getInspectorPort():", "fail to get inspector port");
							next(new Error("object format error"));
						}
						 */
					}, next);
				}
			}
		},
		/**
		 * Launch the given application id
		 * @param {Object} options
		 * @property options {String} device the device to connect to
		 * @property options {Boolean} inspect run the application with web-inspector turned on
		 */
		close: function(options, id, params, next) {
			if (typeof next !== 'function') {
				throw new Error('Missing completion callback (next=' + util.inspect(next) + ')');
			}
			options = options || {};
			async.series([
				_makeSession,
				_close
			], function(err, results) {
				log.verbose("launcher#close()", "err: ", err, "results:", results);
				// 2 steps in async.series, we want to
				// the value returned by the second
				// step (index=1)
				var result = results[1];
				if (!err) {
					result.msg = "Closed application " + id;
				}
				next(err, result);
			});

			function _makeSession(next) {
				options.nReplies = 1; // -n 1
				options.session = new novacom.Session(options.device, next);
			}

			function _close(next) {
				var target = options.session.getDevice();
				var addr = target.lunaAddr.terminate;
				var result = target.lunaResult.terminate;
				if (target.name === "webos3-qemux86") {
					next();
					return;
				}
				var param = {
						// luna param
						id: id,
						subscribe: false
					};				

				luna.send(options, addr, param, function(lineObj, next) {
					log.silly("launcher#close#_close():", "lineObj:", lineObj);
					var resultValue = result.getResultValue(lineObj);
					if (resultValue) {
						// success: stop
						log.verbose("launcher#close#_close():", "success");
						next(null, { procId: resultValue});
					} else {
						// failure: stop
						log.verbose("launcher#close#_close():", "failure");
						next(new Error("object format error"));
					}
				}, next);
			}
		}		
	};
	
	if (typeof module !== 'undefined' && module.exports) {
		module.exports = launcher;
	}
	
}());
