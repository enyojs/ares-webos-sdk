/*jshint node: true, strict: false, globalstrict: false */

var sprintf = require('sprintf').sprintf;

(function () {

	var helpFormat = {};
	
	if (typeof module !== 'undefined' && module.exports) {
		module.exports = helpFormat;
	}

	helpFormat.format =  function(msg) {
		var helpString = "";
		msg = [].concat(msg);
		var dependOnPlatform = false,
			accept = false;
		msg.forEach(function(platform) {
			if (["win32", "linux", "darwin"].indexOf(platform) != -1)
			{
				dependOnPlatform = true;
				if (platform == process.platform) {
					accept = true;
				}
			}
		});
		var idx = 0;
		if (dependOnPlatform === true) {
			if (accept === true) {
				idx = 1;
			} else {
				return null;
			}
		}
		for(idx; idx < arguments.length; idx++) {
			helpString = helpString.concat(sprintf('\t%-30s', arguments[idx]));
		}
		return helpString;
	};

	helpFormat.print = function(arrayStrHelp) {
		arrayStrHelp = [].concat(arrayStrHelp);
		arrayStrHelp.forEach(function(line) {
			if (typeof line === 'string') {
				console.log(line);
			}
		});
	}
}());
