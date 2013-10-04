/*jshint node: true, strict: false, globalstrict: false */

var fs = require('fs');

(function () {

	var consoleSync = {};
	
	if (typeof module !== 'undefined' && module.exports) {
		module.exports = consoleSync;
	}

	function _printArguments(fd, args) {
		var str="";
		var keys = Object.keys(args);
		for(key in keys) {
			str = str.concat(args[key]);
		}
		fs.writeSync(fd, str+'\n');
	}

	consoleSync.log =  function(msg) {
		_printArguments(process.stdout.fd, arguments);
	};

	consoleSync.error = function(msg) {
		_printArguments(process.stderr.fd, arguments);
	};

	consoleSync.info =  consoleSync.warn = consoleSync.log;
}());
