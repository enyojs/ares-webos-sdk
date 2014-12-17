/*jshint node: true, strict: false, globalstrict: false */

(function () {

    var cliControl = {};
    
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = cliControl;
    }

    cliControl.end =  function(exitCode) {
        var draining = 0;
        var exit = function() { if (!(draining--)) process.exit(exitCode || 0); }
        var streams = [process.stdout, process.stderr];
        streams.forEach(function(stream) {
                draining += 1;
                stream.write('', exit);
        });
        exit();
    };

	if (process.stdin) {
		var reqExit = "@ARES-CLOSE@";
		process.stdin.on("data", function(data) {
			var str;
			if (Buffer.isBuffer(data)) {
				str = data.toString();
			} else {
				str = data;
			}
			if (str.trim() === reqExit) {
				cliControl.end(0);
			}
		});
	}

}());
