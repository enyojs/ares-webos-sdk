/*jshint node: true, strict: false, globalstrict: false */

(function () {

	var errMsgHdlr = {};
	
	if (typeof module !== 'undefined' && module.exports) {
		module.exports = errMsgHdlr;
	}

	errMsgHdlr.changeErrMsg = function(err) {
		if (!err) {
			return err;
		}
		var returnMsg;
		var errMsgMap = {
			"EACCES" : "No permission to write, please check the directory permission.",
			"ECONNREFUSED": "Please check the device IP address or port.",
			"ECONNRESET": "Ssh server does not allow to connect, please check the device.",
			"Authentication failure": "Ssh authentication failure, please check ssh connection info such as password, privatekey and username again.",
			"Time out": "Connection time out. please check the device IP address or port.",
			"connect Unknown system" : "Please check the device IP address or port.",
			"Unable to parse private key": "Wrong passphrase for ssh key, please check passphrase again."
		};
		for (key in errMsgMap) {
			if (err.toString().match(new RegExp(key, "i"))) {
				returnMsg = new Error(errMsgMap[key]);
				break;
			}
		}
		if (!returnMsg) {
			returnMsg = err;
		}
		return returnMsg;
	}
}());
