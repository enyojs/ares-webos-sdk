# webOS SDK Command Line Tools

## Install

There is not yet a packaged (installable) version.  
You need to get the source, using the procedure below.

1. Clone the repository from GitHub

		$ git clone --recursive https://github.com/enyojs/webos-sdk-commands.git

2. Install the dependencies

		$ cd webos-sdk-commands
		$ npm install
		
## Path setting

The commands ares-* can be invoked from anywhere in the file system provided the PATH
has been set correctly.

On Linux and Mac OS X:

	$ export PATH=$PATH:<webos-sdk-commands-full-path>
	For exanple: export PATH=$PATH:/Users/ares/GIT/webos-sdk-commands
 
On windows (cmd.exe):

	> SET PATH=%PATH%;<webos-sdk-commands-full-path>
	For example: > SET PATH=%PATH%;C:\Users\ares\GIT\webos-sdk-commands
	
NOTE: On Windows, you can also use a bash enviromment.  
For example: [Git for Windows](http://code.google.com/p/msysgit/downloads/list?q=full+installer+official+git) which provides a bash shell as on Linux.

## Usage

### ares-generate (.sh|.bat)

	$ ares-generate -l
	$ ares-generate -t bootplate-2.1.1-owo -p id=com.myapp -p version=1.2.3 -p title=MyApp MyApp

### ares-package (.sh|.bat)

	$ ares-package MyApp
	
	NB: ares-package will minify the application if possible.
	ares-package will also copy appinfo.json and framework_config.json after the minification

### ares-install (.sh|.bat)
	
	$ ares-install --list
	$ ares-install --install com.myapp_1.0.0_all.ipk
	$ ares-install --remove com.myapp

`--install` is the default:

	$ ares-install com.myapp_1.0.0_all.ipk
	
### ares-launch (.sh|.bat)
	
	$ ares-launch com.myapp

## Notes


### Repositories

When delivered as part of an SDK, ares-generate.js should refer to repositories brought on the local file system by the SDK.
	
This is not the case for the time being.   
ares-generate.js refers a ***temporary unofficial*** repository located at  [project-templates.json](https://raw.github.com/yves-del-medico/other-templates/master/project-templates.json).
	

### Run (without node installed)

If you do not have node installed but just have the binaries from e.g. [node-v0.8.19-darwin-x64.tar.gz](http://nodejs.org/dist/v0.8.19/node-v0.8.19-darwin-x64.tar.gz), you can still generate, deploy and package.

	$ export NODE_PATH=(path to downloaded node binary e.g. /Users/andrewrich/Downloads/node-v0.8.19-darwin-x64/bin)
	$ PATH=$PATH:$NODE_PATH node ares-generate.js -l
	$ PATH=$PATH:$NODE_PATH node ares-generate.js -t bootplate-2.1.1-owo -p id=com.myapp -p version=1.2.3 -p title=MyApp ../MyApp

	$ pushd ../MyApp
	$ PATH=$PATH:$NODE_PATH node enyo/tools/deploy.js
	$ cp appinfo.json framework_config.json deploy/MyApp
	$ popd

	$ PATH=$PATH:$NODE_PATH node ares-package.js ../MyApp/deploy/MyApp
	
#### Using ares-install in VirtualBox enviromment

To install a package from a Windows system running into a VM into a webOS emulator also running into a VM, we need some ssh tunnelling:

* Enable ssh access from the VMs (Windows, Ubuntu, webOS) to the host computer
	* On Mac: enable "Remote login" in "System preferences" -> "Sharing"
	* Setup your private key in HOME/.ssh in your VMs and the host computer
	* Test from the VMs:        NB: The IP may change depending of your configuration  
		`$ ssh <username>@10.0.2.2`
* Before using ares-install from your VM (let set windows), execute the following command  
	`$  ssh –L5522:localhost:5522 <username>@10.0.2.2`  
* Then execute the ares-install or ares-launch commands as if the webOS emulator was running as a VM inside your Windows VM  
	`$ ares-install com.app_0.0.1_all.ipk`  
NB: You will need to copy your 'webos' private key in your Windows VM








