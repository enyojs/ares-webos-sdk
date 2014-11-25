/*jshint node: true, strict: false, globalstrict: false */

var fs = require('fs'),
	path = require('path');

(function () {
    var bundleBrowserPath = {
        win32: "/IDE/chromium/chrome.exe",
        darwin:"/IDE/chromium/Chromium.app",
        linux: "/IDE/chromium/chrome"
    };

    var sdkenv = {};
    
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = sdkenv;
    }

	function SdkEnv() {
		// Read SDK ENV
		var sdkPath = process.env["LG_WEBOS_TV_SDK_HOME"];
		if (sdkPath) {
			if (!process.env["ARES_BUNDLE_BROWSER"]) {
				process.env["ARES_BUNDLE_BROWSER"] = path.join(sdkPath, bundleBrowserPath[process.platform]);	
			}
		}

		var browserPath = process.env["ARES_BUNDLE_BROWSER"];
		this.envList = {};
		if (fs.existsSync(sdkPath)) {
			this.envList["SDK"] = sdkPath;
		}
		if (fs.existsSync(browserPath)) {
			this.envList["BROWSER"] = browserPath;
		}
	}

	sdkenv.Env = SdkEnv;

	sdkenv.create = function() {
		return new SdkEnv();
	};

	SdkEnv.prototype = {
		getEnvList: function(next) {
			var envNameList = Object.keys(this.envList);
			setImmediate(next, null, envNameList);
		},
		getEnvValue: function(name, next) {
			var envValue = this.envList[name];
			setImmediate(next, null, envValue);
		}
	};

}());
