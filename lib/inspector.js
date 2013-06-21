var util = require('util'),
    async = require('async'),
    path = require('path'),
    npmlog = require('npmlog'),
    request = require('request'),
    luna = require('./luna'),
    streamBuffers = require("stream-buffers"),
    spawn = require('child_process').spawn,
    fs = require('fs'),
    novacom = require('./novacom');

var platformOpen = {
	win32: [ "cmd" , '/c', 'start' ],
	darwin:[ "open" ],
	linux: [ "xdg-open" ]
};


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
				_runPortForwardServer,
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
			
			function _runPortForwardServer(next){
				options.session.forward(options.session.ssh._host, '9998', 0 /* random port */,next);
			}
				
			function _runInspector(next){				
				if(options.appId){		
					var url = "http://localhost:" + options.session.getPortNumber();
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
			}
		},
	};
	
	if (typeof module !== 'undefined' && module.exports) {
		module.exports = inspector;
	}
}());
