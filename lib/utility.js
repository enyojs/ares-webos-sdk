/*jshint node: true, strict: false, globalstrict: false */

var fs = require('fs'),
    express = require('express'),
    http = require('http'),
    spawn = require('child_process').spawn;

(function () {
    var platformOpen = {
        win32: [ "cmd" , '/c', 'start' ],
        darwin:[ "open" ],
        linux: [ "xdg-open" ]
    };

    var utility = {};
    
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = utility;
    }

    /**
     * Run local server based on path
     * @param {path} path where local web server indicates.
     * @param {port} port number for web server. 0 means random port.
     * @param {Function} next a common-JS callback invoked when the DB is ready to use.
     */
    utility.runServer =  function(path, port, next) {
        var appPath = fs.realpathSync(path);
        var app = new express();
        app.use("/", express.static(appPath));
        var localServer = http.createServer(app);
        localServer.listen(port, function(err) {
            if (err) {
                return next(new Error(err));
            }
            var port = localServer.address().port;
            var url = 'http://localhost:' + port;
            next(null, {
                "msg":"Local server running on " + url,
                "url": url,
                "port": port
            });
        });
    };

    /**
     * Run local server based on path
     * @param {url} URL to be opened via web browser.
     * @param {browserPath} browser exectable path. (optional)
     * @param {Function} next a common-JS callback invoked when the DB is ready to use. (optional)
     */
    utility.openBrowser = function(url, browserPath, next) {
        var info = platformOpen[process.platform];
        if (typeof browserPath === 'function') {
            next = browserPath;
            browserPath = null;
        }
        if (browserPath) {
            if (process.platform === 'win32') {
                info.splice(2, 1); //delete 'start' command
            }
            info = info.concat([browserPath, '--args']);
        }
        this.browserProcess = spawn(info[0], info.slice(1).concat([url]));
        if (next) {
            next();
        }
    };

}());
