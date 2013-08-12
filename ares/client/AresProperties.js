/**
 * UI: WebOS pane in the AresProperties popup
 * @name WebOS.AresProperties
 */

enyo.kind({
	name: "WebOS.AresProperties",
	debug: false,
	published: {
		provider: null
	},
	components: [
		{name:"targetConfiguration", kind: "TargetConfiguration", style:"width:500px; height:300px;"}
	],
	events:{
		onError:""
	},
	
	create: function() {
		this.inherited(arguments);
		this.loadDevicesList();
	},
	loadDevicesList: function (){
		var self = this;
		this.provider = this.provider || ServiceRegistry.instance.resolveServiceId('webos');
		this.provider['loadDevicesList'](function(inData) {
			var devices = enyo.json.parse(inData);
			for(index in devices){
				if(!devices[index]["passphrase"])
					devices[index]["passphrase"] = "";
				if(!devices[index]["password"])
					devices[index]["password"] = "";
			}
			self.$.targetConfiguration.setDevicesList(devices);
		});
	}
});
