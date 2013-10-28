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
		{name:"targetConfiguration", kind: "TargetConfiguration", classes:"target-configuration"},
		{kind:"Ares.ActionPopup", name:"targetSavePopup", onConfirmActionPopup: "saveAction", onCancelActionPopup:"cancelAction"}
	],
	events:{
		onError:""
	},
	
	create: function() {
		this.inherited(arguments);
		this.targetSavePopupInit();
	},
	okButtonAction: function(){
		var modified = this.$.targetConfiguration.checkModified();
		if(modified){
			this.$.targetSavePopup.show();
		}
		return true;
	}, 
	targetSavePopupInit: function(){
		this.$.targetSavePopup.setTitle($L("Target List was modified!"));
		this.$.targetSavePopup.setMessage($L("Target List was modified! Save it before closing? "));
		this.$.targetSavePopup.setActionButton($L("Save"));
	},
	saveAction: function(){
		this.$.targetConfiguration.save();
	},
	cancelAction: function(){
		this.$.targetConfiguration.revertData();
	}
});
