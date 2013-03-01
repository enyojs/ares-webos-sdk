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

		launch: function(options, id, params, next) {
			if (typeof next !== 'function') {
				throw new Error('Missing completion callback (next=' + util.inspect(next) + ')');
			}
			options = options || {};
			async.series([
				function(next) {
					options.nReplies = 1; // -n 1
					options.session = new novacom.Session(options.device, next);
				},
				luna.send.bind(null, options, {
					// luna addr
					service: 'com.palm.applicationManager',
					method: 'launch'
				}, {	// luna param
					subscribe: false,
					id: id,
					params: params
				}, function(lineObj, next) {
					if (lineObj.processId) {
						// success: stop
						log.verbose("launcher#launch():", "success");
						next(null, { processId: lineObj.processId});
					} else {
						// failure: stop
						log.verbose("launcher#launch():", "failure");
						next(new Error("object format error"));
					}
				})
			], function(err, results) {
				log.verbose("launcher#async end: err: " + err, results[1]);
				// 2 steps in async.series, we want to
				// the value returned by the second
				// step (index=1)
				var result = results[1];
				if ( ! err) {
					result.msg = "Launching application " + id;
				}
				next(err, result);
			});
		}
	};
	
	if (typeof module !== 'undefined' && module.exports) {
		module.exports = launcher;
	}
	
}());
