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
		{name:"targetConfiguration", kind: "TargetConfiguration", classes:"target-configuration"}
	],
	
	create: function() {
		this.inherited(arguments);
		this.loadDevicesList();
	},
	loadDevicesList: function (){
		var self = this;
		this.provider = this.provider || ServiceRegistry.instance.resolveServiceId('webos');
		this.provider.loadDevicesList(function(inData) {
			var devices = enyo.json.parse(inData);
			self.$.targetConfiguration.setDevicesList(devices);
		});
	}
});
