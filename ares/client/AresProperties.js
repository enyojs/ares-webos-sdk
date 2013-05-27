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
	events: {
		onConfigure: ""
	},
	components: [
		{kind: "FittableRows", components: [
			{classes:"ares-row", components :[
				{tag:"label", content: "Target Selection"},
				{kind: "onyx.RadioGroup", onActivate:"targetSelected", components: [
					{content: "WebOS 3.0.5 Emulator", name: "default", active: true},
					{content: "WebOS Pro Emulator", name: "webospro"},
					{content: "LG Smart TV", name: "tv"}
				]}
			]}
		]}
	],
	
	create: function() {
		this.inherited(arguments);
	},

	targetSelected: function(inSender, inEvent) {
		if (inEvent.originator.getActive()) {
			this.provider = this.provider || ServiceRegistry.instance.resolveServiceId('webos');
			this.provider.setDevice(inEvent.originator.getName());
		}
	}
});
