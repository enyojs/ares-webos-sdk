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
  if(stream.type == "File") {
    if(this.permission[stream.basename]) {
      stream.props.mode = parseInt(this.permission[stream.basename], 8);
    }
  }
  this._buffer.push(stream)
  this._process()
  this._needDrain = this._buffer.length > 0
  return !this._needDrain
}

