var path = require('path');

module.exports = TarFilterPack

var inherits = require("inherits"),
	tar = require('tar'), 
	collect = require("fstream").collect;
  
inherits(TarFilterPack, tar.Pack);

function TarFilterPack (prop) {
  var self = this;
  self.permission = prop.permission;
  if (!(self instanceof TarFilterPack)) return new TarFilterPack(prop);
  TarFilterPack.super.call(self, prop);
}

TarFilterPack.prototype.add = function (stream) {
  if (this._global && !this._didGlobal) this.addGlobal(this._global)
  if (this._ended) return this.emit("error", new Error("add after end"))
  collect(stream)
  if(this.permission[stream.basename]) {
    stream.props.mode = parseInt(this.permission[stream.basename], 8);
  }

  // opkg does not support Posix Tar fully
  if (stream.basename.length !== Buffer.byteLength(stream.basename)) {
    var errFilePath = path.relative(stream.root.props.path, stream.path);
    var errMsg = "Please use the file name in english letters. \n\t\t (" + errFilePath+ ")";
    var em = new (require('events').EventEmitter)();
    em.emit('error', new Error(errMsg));
  }
  if (stream.props.uid > 07777777) {
    stream.props.uid = 0;
  }
  if (stream.props.gid > 07777777) {
    stream.props.gid = 0;
  }

  this._buffer.push(stream)
  this._process()
  this._needDrain = this._buffer.length > 0
  return !this._needDrain
}

