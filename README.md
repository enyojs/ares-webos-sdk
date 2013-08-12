ares-webos-sdk
==============

Summary
-------

A module that provides:

* command line to generate, package, install, run and debug Open webOS applications.
* an Ares plugin generate, package, install, run and debug Open webOS applications from Ares IDE.

Install
-------

* In order to hack on `ares-webos-sdk`:

		$ git clone --recursive https://github.com/enyojs/ares-webos-sdk
		$ cd ares-webos-sdk
		$ npm install

* In order to use a development tree of `ares-webos-sdk` from within your own project (eg. from the Ares IDE), manually add this modules under the source-code Ares using NPM:

		$ cd /path/to/ares-webos-sdk
		$ npm install
		$ cd /path/to/ares-ide
		$ npm install ../relative/path/to/ares-webos-sdk

* In order to use a specific version of `ares-webos-sdk` in your own modules (eg. from the Ares IDE), without actually working on it, then run `npm install git@github.com:enyojs/ares-webos-sdk#0.0.1` where `0.0.1` is the version you want to use (_not yet working_).
* On Mac OS X, you need to install Xcode and Xcode Command Line Tools (Xcode -> Preferences -> Downloads -> Components)

Setup
-----

### Ssh settings

Please refer to [SSH-KEY-SETUP.md](SSH-KEY-SETUP.md) for intructions.

### SSH plumbing to use ares-install from VirtualBox enviromment

In case your webOS SDK (and/or Ares IDE) are both running in VirtualBox guests, you need to tunnel the port 5522 from the IDE guest to the emulator guest (replace `<username>` )

	$ ssh -L5522:localhost:5522 <username>@10.0.2.2

### Path setting (needed only for command line)

The commands ares-* can be invoked from anywhere in the file system provided the PATH
has been set correctly.

On Linux and Mac OS X:

	$ export PATH=$PATH:<webos-sdk-commands-full-path>/bin
	For exanple: export PATH=$PATH:/Users/ares/GIT/ares-webos-sdk/bin

On windows (cmd.exe):

	> SET PATH=%PATH%;<webos-sdk-commands-full-path>/bin
	For example: > SET PATH=%PATH%;C:\Users\ares\GIT\ares-webos-sdk/bin

NOTE: On Windows, you can also use a bash enviromment.
For example: [Git for Windows](http://code.google.com/p/msysgit/downloads/list?q=full+installer+official+git) which provides a bash shell as on Linux.

Command line usage
------------------

Warning: http proxy is not yet supported.

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


Project template configuration
------------------------------

There are two diferent project template configuration.

* for the command line ares-generate
* for the Ares IDE

### Project template configuration for ares-generate

The project templates used by the command line `ares-generate` are defined in the file `templates/project-templates.json`.

Additional templates could:

* be added directly into the file 'templates/project-templates.json'
* be added thru command line option '--repo <filename>'
* be added directly in the code of ares-generate.
For that, go in 'lib/ares-generate.js' in the property 'this.repositories'.
The entries of 'this.repositories' can either be local files under the 'templates' directory or files accessible thru http.

### Project template configuration for Ares IDE

This module "ares-webos-sdk" brings some additional project templates for `webOS` and override some project template definition brought by the Ares IDE.

This is done by the "genZip" entry of the file "ide.json" stored in the main directory of this module.

See [Project template configuration](../../hermes/README.md#project-template-config) in ares-project for more information.

Source code organization
------------------------

The source code of this module is organized as follow:

* `ares/client`: This is a browser side code of the webOS Ares plugin loaded in the Ares IDE. This part is written in enyo.
* `ares/server`: This is a server side code of the webOS Ares plugin loaded in the Ares IDE. This part is in javascript running into a nodejs server.
* `bin`: This directory contains the .sh and .bat wrappers for the ares-* commands
* `lib`: This directory contains the javascript code used by the server side Ares plugin and the ares-* commands.
* `scripts`: This directory contains script(s) used during 'npm install' to 'npm install' node modules integrated as git submodules.
* `templates`: This directory contains project template definitions
* `test`: This directory contains various tests for that module.

Test
----

3. Start the emulator
4. Run the `novacom` interface tester

		$ test/novacom.spec.js
		  novacom
		    #put
		      ✓ should write a file on the device (1049ms)
		      ◦ should fail to write a file in a non-existing device folder: sh: can't create /dev/null/mocha72996: nonexistent directory
		      ✓ should fail to write a file in a non-existing device folder
		    #get
		      ✓ should write then read the same file from the device (1021ms)
		    #run
		      ✓ should fail to run a non-existing command
		      ◦ should write a file on the device and 'ls' it successfully:
		      ✓ should write a file on the device and 'ls' it successfully (1054ms)
		      ✓ should fail to 'ls' a non-existing file (43ms)


		  6 tests complete (11 seconds)

5. Run the `luna` interface tester

        $ test/luna.spec.js
          luna
            #send
              ✓ should fail to invoke non-existing service
              ✓ should list luna statistics (51ms)

          2 tests complete (132 ms)

        $ test/novacom.spec.js

6. Run the `sdk` interface tester (_**Note:** you need a specific package in you home directory_).

        $ test/sdk.spec.js

          installer
            #install
              ✓ should install a package (2808ms)
            #list
              ✓ should list installed packages (141ms)

          2 tests complete (3 seconds)


Reference
---------

### Emulator

Whether there are one or several Emulator images, TCP Ports Redirections remain the same:

| Name | Host Port | Guest Port | Role |
| palm.emulator.debugger | 5858 | 5858 | **TBC** |
| palm.emulator.hostmode | 5880 | 8080 | **TBC** |
| palm.emulator.inspector | 9991 | 9991 | **TBC** |
| palm.emulator.ls2.private | 5512 | 4412 | **TBC** |
| palm.emulator.ls2.public | 5511 | 4411 | **TBC** |
| palm.emulator.ssh | 5522 | 22 | **TBC** |
