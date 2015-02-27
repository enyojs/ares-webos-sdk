/*jshint node: true, strict: false, globalstrict: false */

(function () {

	var errMsgHdlr = {};

	var ErrCodeMap = {
		"com.webos.appInstallService": {
			"0": "Sucess",
			"-1": "General error during app install request",
			"-2": "Bad parameter",
			"-3": "Not enough storage",
			"-4": "Error on downloading app",
			"-5": "Previous app installation has not been completed yet",
			"-6": "General error on removing app",
			"-7": "Error on removing app",
			"-9": "Error code -9",
			"-10": "Installation failure (USB is busy)",
			"-11": "Installation failure on USB. This app should be installed on internal memory",
			"-12": "Restore task failure from power off",
			"-13": "Same app exists on another storage. Please install app on the same storage or remove the previous app",
			"-14": "Requested target storage does not exist",
			"-15": "Please change the app id (app id should not start with 'com.lge', 'com.webos', 'com.palm')",
			"-16": "User authentication error",
			"-17": "Error code -17"
		}
	};

	var ErrMsgMap = {
		"EACCES" : "No permission to write, please check the directory permission.",
		"ECONNREFUSED": "Please check the device IP address or port.",
		"ECONNRESET": "Ssh server does not allow to connect, please check the device.",
		"Authentication failure": "Ssh authentication failure, please check ssh connection info such as password, privatekey and username again.",
		"Time out": "Connection time out. please check the device IP address or port.",
		"connect Unknown system" : "Please check the device IP address or port.",
		"Unable to parse private key": "Wrong passphrase for ssh key, please check passphrase again.",
		"sftp fail": "Installation failure, please make sure the device is turned on or check the disk space.",
		"install failed": "Installation failure, please check the disk space."
	};

	if (typeof module !== 'undefined' && module.exports) {
		module.exports = errMsgHdlr;
	}

	errMsgHdlr.getErrMsg = function(service, code) {
		if (ErrCodeMap.hasOwnProperty(service)) {
			return ErrCodeMap[service][code];
		}
		return undefined;
	}

	errMsgHdlr.changeErrMsg = function(err) {
		if (!err) {
			return err;
		}
		var returnMsg;
		for (key in ErrMsgMap) {
			if (err.toString().match(new RegExp(key, "i"))) {
				returnMsg = new Error(ErrMsgMap[key]);
				break;
			}
		}
		if (!returnMsg) {
			returnMsg = err;
		}
		return returnMsg;
	}
}());
