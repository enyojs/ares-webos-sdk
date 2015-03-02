var fs  	= require('fs'),
    path 	= require("path"),
    log 	= require('npmlog'),
    nopt 	= require('nopt'),
    async 	= require('async'),
    ipkg	= require('./../lib/ipkg-tools'),
    versionTool = require('./../lib/version-tools'),
    cliControl 	= require('./../lib/cli-control'),
    novacom 	= require('./../lib/novacom'),
    help	= require('./../lib/helpFormat'),
    util 	= require('util'),
    shelljs 	= require('shelljs');
    colors	= require('colors'),
    deviceTools	= require('./../lib/setup-device');
    
/**********************************************************************/

var processName = path.basename(process.argv[1]).replace(/.js/, '');

process.on('uncaughtException', function (err) {
	log.info('exit', err);
	log.error('exit', err.toString());
	cliControl.end(-1);
});

if (process.argv.length === 2) {
	process.argv.splice(2, 0, '--help');
}

/**********************************************************************/

var processName = path.basename(process.argv[1]).replace(/.js/, '');

var knownOpts = {
	//generic options
	"help":		Boolean,
	"level":	['silly', 'verbose', 'info', 'http', 'warn', 'error'],
	"version":	Boolean,
	// command-specific options
	"device-list":		Boolean,
	"list":		Boolean,
	"port":		[String, Array],
	"device":	[String, null],
	// no shortHands
	"run":		[String, null],
	"file":		[String, null],
	"hostfile":	path,
	"follow":	Boolean,
	"config":	[String, null],
	"gen-config":	path
};

var shortHands = {
	// generic aliases
	"h": ["--help"],
	"v": ["--level", "verbose"],
	"V": ["--version"],
	// command-specific aliases
	"D": ["--device-list"],
	"l": ["--list"],
	"p": ["--port"],
	"f": ["--follow"],
	"d": ["--device"],
	"F": ["--file"],
	"c": ["--config"],
	"gc": ["--gen-config"],
	"HF": ["--hostfile"]
};

var helpString = [
	"",
	"NAME",
	help.format(processName + " - Display application logs from a webOS device."),
	"",
	"SYNOPSIS",
	help.format(processName + " [OPTION...]"),
//	"Options (Not implmeneted) :",
//	help.format(processName + " [OPTIONS] --put file://DEVICE_PATH < HOST_FILE"),
//	help.format(processName + " [OPTIONS] --get file://DEVICE_PATH > HOST_FILE"),
//	"",
	"",
	"OPTION",
	help.format("-d, --device <DEVICE>", "Specify DEVICE to use"),
	help.format("-D, --device-list", "List the available DEVICEs"),
	help.format("-f, --follow", "Follow the log output (use Ctrl-C to terminate)"),
	help.format("-c, --config <FILTER_CONFIG_FILE>", "Specify FILTER_CONFIG_FILE to use"),
	help.format("-gc, --gen-config <FILTER_CONFIG_FILE>", "Generate a FILTER_CONFIG_FILE"),
	help.format("-F, --file <LOG_FILE>", "Specify LOG_FILE on target to display the log"),
	help.format("-HF, --hostfile <LOG_FILE>", "Spefify LOG_FILE on host pc to display the log"),
	help.format("-h, --help", "Display this help"),
	help.format("-V, --version", "Display version info"),
	"",
	"DESCRIPTION",
	"",
	help.format("**Restriction**"),
	help.format("this command can display only native application logs, not web application."),
	"", 
	"Examples:",
	"",
	"# Display logs for app",
	processName + " -d emulator -F /media/developer/log/devlog",
	"",
	"# Follow logs for app",
	processName + " -d emulator -F /media/devleoper/log/devlog -f",
	"",
	"# Display filtered logs for app",
	processName + " -d emulator -F /media/devleoper/log/devlog \" (user && info) || (kernel && warning) \"",
	"",
];

var argv = nopt(knownOpts, shortHands, process.argv, 2 /*drop 'node' & 'ares-*.js'*/);

/**********************************************************************/

log.heading = processName;
log.level = argv.level || 'warn';

/**********************************************************************/
log.verbose("argv", argv);
argv.filter = (argv.argv.remain.length > 0)? argv.argv.remain[0] : null;

var op;
if (argv['device-list']) {
	deviceTools.showDeviceListAndExit();
} else if (argv.run) {
	op = run;
} else if (argv.device || argv.hostfile) {
	op = printLog;
} else if (argv['gen-config']) {
	op = generateConfig;
} else if (argv.version) {
	versionTool.showVersionAndExit();
} else if (argv.help) {
	help.print(helpString);
	cliControl.end();
} else {
	cliControl.end();
}

var options = {
	device: argv.device
};

if (op) {
	versionTool.checkNodeVersion(function(err) {
		op(finish);
	});
}

/**********************************************************************/
var defaultConfigFile = path.join(__dirname, '../lib/log-config.json');

function generateConfig(next){
	var dstPath = argv['gen-config'];
	fs.writeFileSync(dstPath, fs.readFileSync(defaultConfigFile));
	next();
}

function run(next) {
	var session = new novacom.Session(options.device, function(err, result) {
		log.verbose("run()", "argv:", argv.run);
		log.verbose("run()", "options:", options);
		if (err) {
			return next(err);
		}
		session.run(argv.run, process.stdin, process.stdout, process.stderr, next);
	});
}

function printLog(next) {
	var configFile;
	var configDataFromFile = {};
	var configData = {};
	log.verbose("printLog()", "options:", options);

	if (argv.follow) {
		argv.follow = "-f";
	} else {
		argv.follow = "";
	}


	var msgNotFoundLog = "Cannot access the Log file";
	var session;
	async.series([
		function(next) {
			var defaultConfigData = fs.readFileSync(defaultConfigFile, 'utf8');
			try {
				configData = JSON.parse(defaultConfigData);
			} catch(err) {
				return next(new Error("JSON syntax error in " + defaultConfigFile));
			}
			next();
		},
		function(next) {
			if(argv.config){
				configFile = path.resolve(argv.config);
				fs.readFile(configFile, 'utf8', function(err, str){
					if(err){
						return next(err);
					}
					_setConfigData(str);
				});
				function _setConfigData(str){
					try{
						configDataFromFile = JSON.parse(str);
					} catch (err){
						return next(new Error("JSON syntax error in " + configFile));
					}
					for(datas in configData){
						if (datas == "outputs" || datas == "filters")						
							for(data in configData[datas]){
								if(configDataFromFile[datas][data] == undefined)
									continue;
								configData[datas][data] = configDataFromFile[datas][data];
							}
						else
							configData[datas] = configDataFromFile[datas] || configData[datas];
					}
				}
			}
			next();
		},
		function(next) {
			var logFile = argv.file || argv.hostfile || configData.logFile;
			logFile = path.resolve(logFile);
			if(argv.hostfile && logFile === path.resolve(argv.hostfile)){
				fs.readFile(logFile, function(err, data){
					_onData(data);
					next();
				});
			}
			else {
				session = new novacom.Session(options.device, next);
				var command = "test -e " + logFile + " && tail -n " + configData.logLines + " " + argv.follow + " " + logFile + " || echo " + msgNotFoundLog;
				session.run(command, process.stdin, _onData, process.stderr, next);
			}

			function _onData(data) {
				var str;
				if (Buffer.isBuffer(data)) {
					str = data.toString();
				} else {
					str = data;
				}
				str.split(/\r?\n/).forEach(_onLine);
			}

			function _onLine(line) {	
				if (line == '' || line == undefined)
					return;

				var logs = _splitLog(line);

				for (filter in configData.filters){
					if(_checkFilter(logs, filter, configData.filters[filter]) == false){
						return;
					}
				}

				var printFlag = true;
				var printLog = _generateLog(logs);
				var splitFilters = [];

				if(argv.filter){
					printFlag = false;
					var originFilters = argv.filter;
					splitFilters = originFilters.split(/ ?\( ?| ?\) ?| ?&& ?| ?\|\| ?/);
					var newScript = '';

					for(index = 0; index < splitFilters.length; index++){
						if(splitFilters[index] == '')
							continue;
						var filterIndex = originFilters.indexOf(splitFilters[index]);
						if (filterIndex == 0){
							newScript += ("_checkInputFilter(printLog,'"+splitFilters[index]+"')");
						} else {
							newScript += (originFilters.slice(0,filterIndex)+"_checkInputFilter(printLog,'"+splitFilters[index]+"')");
						}
						originFilters = originFilters.slice(filterIndex + splitFilters[index].length);
					}

					newScript += originFilters;

					if(eval(newScript))
						printFlag = true;
				}

				for (filter in configData.filters){
					if(Array.isArray(filter))
						splitFilters.concat(configData.filters[filter]);
					else
						splitFilters.push(configData.filters[filter]);
				}	
				
				if(printFlag)
					_colorFilter(printLog, splitFilters, "yellow");
			}			
			function _splitLog(line){
				var indexSpace = 0;
				var indexText = -1;
				var log = {
					logTime:"",
					logMonotonicTime:"",
					logFacility:"",
					logProcess:"",
					logProcessId:"",
					logContext:"",
					logMessageId:""				
				};

				// Split the log by " "(empty space)
				for (data in log) {
					indexSpace = line.slice(++indexText).indexOf(" ");
					log[data] = line.slice(indexText, indexText+indexSpace);
					indexText += indexSpace;
				}
				log.logLevel = log.logFacility.split(".")[1] || '';
				log.logFacility = log.logFacility.split(".")[0] || '';

				log.logThreadId = log.logProcessId.slice(1,log.logProcessId.length-1).split(":")[1] || '';
				log.logProcessId = log.logProcessId.slice(1,log.logProcessId.length-1).split(":")[0] || '';

				remainLogData = line.slice(indexText).split("} ");	//Json data & Free Text Data
				log.logJson = "";

				for(index = 0 ; index < remainLogData.length-1; index++)
					log.logJson += remainLogData[index];
				log.logJson += (log.logJson == '')? "{}":"}";

				log.logText = remainLogData[remainLogData.length-1];
				log.logUserAppId = "";
				log.logUserTag = "";
				var userTagIndex1 = log.logText.indexOf("/");
				var userTagIndex2 = log.logText.indexOf(":");

				if(userTagIndex1 != -1 && userTagIndex2 != -1 && userTagIndex1 < userTagIndex2){
					log.logUserAppId = log.logText.slice(0, userTagIndex1);
					log.logUserTag = log.logText.slice(userTagIndex1+1, userTagIndex2);
					log.logText = log.logText.slice(userTagIndex2+1);
				}

				return log;
			}

			//User Input Filter
			function _checkInputFilter(logs, filterData){
				if (logs.indexOf(filterData) != -1)
					return true;
				return false;
			}
			//Config Data Filter
			function _checkFilter(logs, filter, filterData){
				var level = "emerg alert crit err error warn warning notice info debug";
				if (filter == "logLevel" && Array.isArray(filterData) == false){
					var index = level.indexOf(filterData);
					if (index != -1){
						filterData = level.slice(0,index+filterData.length).split(" ");
					}
				}

				filter = filter || "logText";

				if (Array.isArray(filterData)){
					for(data in filterData){
						// it is true, one or more data in filterData is matched with log (OR)
						if(logs[filter].indexOf(filterData[data]) != -1)
							return true;
					}
				}
				else{
					// It is true, data is matched with log
					if (logs[filter].indexOf(filterData) != -1)
						return true;
				}
				//No matched.
				return false;
			}

			function _generateLog(logs){
				var log = '';
				for(output in configData.outputs){
					if(configData.outputs[output]){
						if(output == 'logProcessId' || (output=='logThreadId' && configData.outputs.logProcessId == false))
							log += "[";
						if((logs.logUserAddId != "" || logs.logUserTag != "") && output == 'logUserTag')
							log += "/";							

						log += logs[output];

						if(output == 'logFacility' && configData.outputs.logLevel)
							log += ".";
						else if ((output == 'logProcessId' && configData.outputs.logThreadId) || (output == 'logUserTag'))
							log += ":";
						else if (output == 'logThreadId' || (output == 'logProcessId' && configData.outputs.logThreadId == false))
							log += "] "
						else if (output == 'logUserAppId'){
							var sp = (configData.outputs.logUserTag)?"" : "/:";
							log += sp;
						}
						else
							log += " ";
					}
				}
				return log;
			}

			function _colorFilter(logs, filter, color){
				var indexArray = [];
				var printLog = '';
				for (index = 0; index < filter.length; index++){
					
					var log = logs;
					var sliceIndex = 0;
					if(filter[index] == "")
						continue;

					while(1){
						findIndex = log.indexOf(filter[index]);
						if(findIndex == -1)
							break;
						indexArray.push([sliceIndex+findIndex,filter[index].length]);
						sliceIndex += (findIndex + filter[index].length);
						log = log.slice(findIndex + filter[index].length);
					}
				}
				indexArray = indexArray.sort(function(a, b){
					if(a[0] == b[0])
						return 0;
					if(a[0] < b[0])
						return -1;
					else
						return 1;
				});
				

				for(index = indexArray.length-1; index >= 0 ; index--){
					filterDataIndex = indexArray[index];
					printLog = logs.slice(filterDataIndex[0] + filterDataIndex[1]) + printLog;
					//Change the filter's color : Yellow
					printLog = logs.slice(filterDataIndex[0], filterDataIndex[0]+filterDataIndex[1])[color] + printLog;
					logs = logs.slice(0,filterDataIndex[0]);
				}

				printLog = logs + printLog;
				console.log(printLog);
			}
		}
	], function(err, result) {
		next(err);
	});
}

/**********************************************************************/

function finish(err, value) {
	log.info("finish():", "err:", err);
	if (err) {
		log.error(processName + ": "+ err.toString());
		log.verbose(err.stack);
		cliControl.end(-1);
	} else {
		log.info('finish():', value);
		if (value && value.msg) {
			console.log(value.msg);
		}
		cliControl.end();
	}
}

process.on('uncaughtException', function (err) {
	console.log('Caught exception: ' + err);
});
