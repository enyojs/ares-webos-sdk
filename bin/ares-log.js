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
    log.error("*** " + processName + ": "+ err.toString());
    log.info('uncaughtException', err.stack);
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
	"device":	[String, null],
	// no shortHands
	"id" : 	[String, null],
	"file" : [String, null],
	"output" : [String, null],
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
	"i": ["--id"],
	"f": ["--follow"],
	"F": ["--file"],
	"o": ["--output"],
	"d": ["--device"],
	"c": ["--config"],
	"gc": ["--gen-config"],
};

var helpString = [
	"",
	"NAME",
	help.format(processName + " - Display application logs from a webOS device."),
	"",
	"SYNOPSIS",
	help.format(processName + " [OPTION...]"),
	help.format(processName + " [OPTION...] <FILTER>"),
	"",
	"OPTION",
	help.format("-d, --device <DEVICE>", "Specify DEVICE to use"),
	help.format("-D, --device-list", "List the available DEVICEs"),
	help.format("-f, --follow", "Follow the log output (use Ctrl-C to terminate)"),
	//help.format("-F, --file <LOG_FILE>", "Specify LOG_FILE on target"),
	help.format("-o, --output <FORMAT>, ", 
			"Display additional log data with default log, <FORMAT> : time, process"),
	help.format("-i, --id <APP ID> or <Service ID>", "Specify ID to display"),
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
	processName + " -d emulator",
	"",
	"# Follow logs for app",
	processName + " -d emulator -f",
	"",
	"# Display filtered logs for app",
	processName + " -d emulator <FILTER> <FILTER> ...",
	"",
	"## <FILTER> is a series of",
	"tag[:LEVEL], (e.g. UserTag1:E, *:I)",
	"",
	"LEVEL priority",
	" D\tDebug (lowest)",
	" I\tInfo",
	" W\tWarning",
	" E\tError",
	" C\tCritical",
	" S\tSilent (higest)",
	"",
	" '*' mean all tags",
	" If no <FILTER> Rule specified, filter defaults to '*:D'",
	""
];

var argv = nopt(knownOpts, shortHands, process.argv, 2 /*drop 'node' & 'ares-*.js'*/);

/**********************************************************************/

log.heading = processName;
log.level = argv.level || 'warn';

/**********************************************************************/
log.verbose("argv", argv);

var op;
if (argv['device-list']) {
	deviceTools.showDeviceListAndExit();
} else if (argv['gen-config']) {
	op = generateConfig;
} else if (argv.version) {
	versionTool.showVersionAndExit();
} else if (argv.help) {
	help.print(helpString);
	cliControl.end();
} else {
	op = printLog;
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


function printLog(next) {
	log.verbose("printLog()", "options:", options);
	
	var self = this;
	argv.follow = (argv.follow)? "-f":"";

	async.series([
		_splitArguments.bind(self),
		_getLogs.bind(self)
	], function(err, result) {
		next(err);
	});
	
}

/**********************************************************************/

function _splitArguments(next){
	log.verbose("_splitArguments()");
	var self = this;
	var filters = argv.argv.remain;
	var stdLevel = ["D","I", "W", "E", "C", "S"];
	var stdOutputs = {DEFAULT : "", TIME: "time", PROCESS:"time:process:pid:tid"};

	self.id = argv.id || "";
	self.filters = {};
	self.filters["*"] = "D";

	for(index = 0; index < filters.length; index++){
		var filter = filters[index].split(":");
		if (filter.length > 2 )
			return next(new Error("Invalid filter expression"));
		if (filter.length == 2 && (filter[0] == "" || filter[1] == "") )
			return next(new Error("Invalid filter expression"));
		if (filter.length == 2  && stdLevel.indexOf(filter[1].toUpperCase()) == -1)
			return next(new Error("Invalid filter expression"));
			
		self.filters[filter[0]] = filter[1] || "D";
	}
	if(argv.output){
		if(stdOutputs.hasOwnProperty(argv.output.toUpperCase()))
			argv.output = stdOutputs[argv.output.toUpperCase()];
		else 
			next(new Error("Error, Invalid parameter to -o"));
	}
	next();
}

function _getLogs(next){
	log.verbose("_getLogs()");
	var logFile = argv.file || "/media/developer/log/devlog";
	var msgNotFoundLog = "Cannot access the Log file";
	
	async.waterfall([
		function(next){
			new novacom.Session(argv.device, next);
		},
		function (session, next){
			
			var command = util.format('test -e %s && ( wc -l %s | xargs tail %s -n ) || echo %s',
				logFile,
				logFile,
				argv.follow,
				msgNotFoundLog);
			session.run(command, process.stdin, _onData, process.stderr, next);
		}
	], function (err){
		next(err);
	});
}

function _onData(data) {
	var str = (Buffer.isBuffer(data))? data.toString():data;
	str.split(/\r?\n/).forEach(_onLine);
}

function _onLine(line) {
	var msgNotFoundLog = "Cannot access the Log file";
	if (line == '' || line == undefined)
		return;
	if (line == msgNotFoundLog){
		throw new Error(line);
	}
	var logLine = _splitLog(line);
	if(_checkFilter(logLine)){
		_printLog(logLine);
	}
}

function _splitLog(line){
	var indexSpace = 0;
	var indexText = -1;
	var log = {
		time:"",
		monotonicTime:"",
		facility:"",
		process:"",
		pid:"",
		context:"",
		messageId:""				
	};
	// Split the log by " "(empty space)
	for (data in log) {
		indexSpace = line.slice(++indexText).indexOf(" ");
		log[data] = line.slice(indexText, indexText+indexSpace);
		indexText += indexSpace;
	}

	log.time = new Date(log.time).toString();
	log.level = log.facility.split(".")[1] || '';
	log.facility = log.facility.split(".")[0] || '';
	
	log.tid = log.pid.slice(1,log.pid.length-1).split(":")[1] || '';
	log.pid = log.pid.slice(1,log.pid.length-1).split(":")[0] || '';
	
	remainLogData = line.slice(indexText).split("} ");	//Json data & Free Text Data
	log.json = "";
	
	for(index = 0 ; index < remainLogData.length-1; index++)
		log.json += remainLogData[index];
	log.json += (log.json == '')? "{}":"}";
	log.text = remainLogData[remainLogData.length-1];

	log.id = "";
	log.tag = "";

	var tagIndex1 = log.text.indexOf("/");
	var tagIndex2 = log.text.indexOf(":");
	if(tagIndex1 != -1 && tagIndex2 != -1 && tagIndex1 < tagIndex2){
		log.id = log.text.slice(0, tagIndex1);
		log.tag = log.text.slice(tagIndex1+1, tagIndex2);
		log.text = log.text.slice(tagIndex2+1);
	}

	return log;
}

function _checkFilter(logLine){
	var stdLevel = ["DEBUG","INFO", "WARNING", "ERR", "CRIT", "SILENT"];
	var stdShortLevel = { D: "DEBUG", I:"INFO", W:"WARNING", E:"ERR", C:"CRIT", S:"SILENT"};
	var filterFlag = true;
	var idFlag = true;
	var shortLevel, levelindex, lineLevelIndex;

	if (this.id != ""){
		idFlag = (this.id == logLine.id)?true:false;		
	}

	if(this.filters.hasOwnProperty(logLine.tag)){
		shortLevel = this.filters[logLine.tag].toUpperCase();
	}
	else {
		shortLevel = this.filters["*"].toUpperCase();
	}
		levelIndex = stdLevel.indexOf(stdShortLevel[shortLevel]);
		lineLevelIndex = stdLevel.indexOf(logLine.level.toUpperCase());
		if(levelIndex == -1 || lineLevelIndex == -1 || levelIndex > lineLevelIndex)
			filterFlag = false;		
	
	return filterFlag&&idFlag;
}

function _printLog(logLine){
	var colorSet = { DEBUG : "blue", INFO:"green", WARNING:"yellow", ERR:"red", CRIT:"cyan", SILENT:"gray"};
	var defaultLogLine = logLine.level + "|" + logLine.tag + "|" + logLine.id;
	var log = "[" + defaultLogLine + "] ";
	if (logLine.text.trim().length === 0)
		return;
	if (argv.output){
		var output  = argv.output.split(":");
		for(index = 0; index < output.length; index++){
			if (output[index] == 'pid')
				log += "[";
			if (output[index] == 'tid')
				log += ":";
			if(logLine[output[index]]){
				log += (logLine[output[index].toLowerCase()]+" ");
			}
			if (output[index] == 'tid')
					log+= "] ";
			
		}
	}
	log += logLine.text;
	log = log[colorSet[logLine.level.toUpperCase()]];
	console.log(log);
}


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

