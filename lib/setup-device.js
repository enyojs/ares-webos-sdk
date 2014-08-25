var async = require('async'), 
	sprintf = require('sprintf-js').sprintf,
	Table = require('easy-table'),
	novacom = require('./novacom');

(function () {

	var devicetools = {};

	if (typeof module !== 'undefined' && module.exports) {
		module.exports = devicetools;
	}

	devicetools.showDeviceListAndExit = function() {
		var table = new Table;
		var data = [];
		var resolver = new novacom.Resolver();
		async.waterfall([
			resolver.load.bind(resolver),
			resolver.list.bind(resolver),
			function(devices, next) {
				if (Array.isArray(devices)) {
					devices.forEach(function(device) {
						var info = device.username + '@' + device.host + ':' + device.port;
						data.push( {name: device.name, info:info, connection:'ssh' } );
					});
				}
				data.forEach(function(item){
					table.cell('name', item.name);
					table.cell('deviceinfo', item.info);
					table.cell('connection', item.connection);
					table.newRow();
				});
				console.log(table.toString());
				next();
			}
		], function(err) {
				process.exit(0);
		});
	};
}());
