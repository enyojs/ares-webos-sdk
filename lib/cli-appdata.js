/*jshint node: true, strict: false, globalstrict: false */

var fs = require('fs'),
  path = require('path'),
  mkdirp = require('mkdirp'),
  shelljs = require('shelljs');

(function() {

  var cliAppData = {};

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = cliAppData;
  }

  function CliAppData(postfix) {
    // Read SDK ENV
    var appDataPath = path.resolve(process.env.APPDATA || process.env.HOME || process.env.USERPROFILE, postfix);
    if (!fs.existsSync(appDataPath)) {
      mkdirp.sync(appDataPath);
    }
    this.appDataPath = appDataPath;
  }

  cliAppData.create = function(postfix) {
    return new CliAppData(postfix || '.ares');
  }

  CliAppData.prototype = {
    getPath: function(next) {
      if (next && typeof next === 'function') {
        return setImmediate(next, null, this.appDataPath);
      }
      return this.appDataPath;
    },
    isExist: function(subPath, next) {
      if (subPath && typeof subPath === 'function') {
        next = subPath;
        subPath = ".";
      }
      var exist = fs.existsSync(path.join(this.appDataPath, subPath));
      if (next && typeof next === 'function') {
        return setImmediate(next, null, exist);
      }
      return exist;
    },
    flush: function(subPath, next) {
      if (subPath && typeof subPath === 'function') {
        next = subPath;
        subPath = ".";
      }
      shelljs.rm('-rf', path.join(this.appDataPath, subPath));
      if (next && typeof next === 'function') {
        return setImmediate(next);
      }
      return;
    },
    put: function(originPath, subPath, next) {
      if (!typeof originPath === 'string') {
        var errMsg = "Wrong arguments in put()";
        if (next && typeof next === 'function') {
          return setImmediate(next, new Error(errMsg));
        }
        return errMsg;
      }
      if (typeof subPath === 'function') {
        next = subPath;
        subPath = ".";
      }
      var dstPath = path.join(this.appDataPath, subPath);
      if (!fs.existsSync(dstPath)) {
        mkdirp.sync(dstPath);
      }
      shelljs.cp('-Rf', originPath, dstPath);
      if (next && typeof next === 'function') {
        return setImmediate(next);
      }
      return;
    },
    remove: function(subPath, next) {
      if (typeof subPath === 'function') {
        next = subPath;
        subPath = ".";
      }
      var dstPath = path.join(this.appDataPath, subPath);
      if (fs.existsSync(dstPath)) {
        shelljs.rm('-rf', dstPath);
      }
      if (next && typeof next === 'function') {
        return setImmediate(next);
      }
      return;
    }
  };

}());