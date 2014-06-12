var async = require('async'), 
	sprintf = require('sprintf-js').sprintf,
	novacom = require('./novacom');

(function () {

	var devicetools = {};

	if (typeof module !== 'undefined' && module.exports) {
		module.exports = devicetools;
	}

	devicetools.showDeviceListAndExit = function() {
		var resolver = new novacom.Resolver();
		async.waterfall([
			resolver.load.bind(resolver),
			resolver.list.bind(resolver),
			function(devices, next) {
				if (Array.isArray(devices)) {
					console.log(sprintf("%-15s %-12s %-20s %s", "|DEVICE NAME|", "|AUTH TYPE|", "|AUTH|", "|SSH ADDRESS|"));
					devices.forEach(function(device) {
						var authType = (device.privateKeyName)? "KeyFile" : (device.password)? "password" : "(empty)";
						var authInfo = "";
						switch (authType) {
							case "KeyFile":
								var passphrase = (device.passphrase)? "("+device.passphrase+")" : "";
								authInfo = device.privateKeyName + passphrase;
								break;
							case "password":
								authInfo = device.password;
								break;
							default:
								authInfo = "(empty)";
								break;
						}
						console.log(sprintf("%-15s %-12s %-20s (%s)",
								device.name, authType, authInfo, device.addr));
					});
				}
				next();
			}
		], function(err) {
				process.exit(0);
		});
	};

}());
