nodejs-module-webos-ipkg
========================

Summary
-------

A module for nodejs that allows to generate, package, install, run and debug Open webOS applications.

Install
-------

* In order to hack on `nodejs-module-webos-ipkg`, clone from [GitHub](https://github.com/enyojs/nodejs-module-webos-ipkg), cd into the new directory and then run `npm install`.
* In order to use `nodejs-module-webos-ipkg` in your own modules, without actually working on it, then run `npm install git@github.com:enyojs/nodejs-module-webos-ipkg.git#0.0.1` where `0.0.1` is the version you want to use (_not yet working_).

Use
---

**NOTE:** Until now, there is no SSH key distribution system.  This section explains manual generation & installation.

1. Install the webOS 3.0.5 SDK
2. Start the webOS emulator:

	Assuming `/opt/PalmSDK/Current/bin` is in your `PATH`, run:
	
		$ palm-emulator --list
		Available images:
		SDK 3.0.4.669 (1024x768)
		SDK 3.0.5.676 (1024x768)
		$ palm-emulator --no-vbox-check --start "SDK 3.0.5.676 (1024x768)"

3. Generate the SSH keypair using Open-SSH

		$ ssh-keygen -f ~/.ssh/webos -C root@localhost:5522
		
		Generating public/private rsa key pair.
		Enter passphrase (empty for no passphrase): 
		Enter same passphrase again: 
		Your identification has been saved in webos.
		Your public key has been saved in webos.pub.
		The key fingerprint is:
		75:84:3b:f9:c0:f1:30:74:9d:f4:b2:ac:82:ec:cb:6e root@localhost:5522
		The key's randomart image is:
		+--[ RSA 2048]----+
		|         ...oo.. |
		|          =o  o. |
		|         ..B. . .|
		|         .*... o |
		|        S  +  o  |
		|       . .  ..   |
		|        o . .    |
		|       oE  .     |
		|       o=.       |
		+-----------------+

4. Install the public key at the proper location of the emulator

	Assuming `/usr/local/bin` is in your `PATH`, run:

		$ novacom run file:///bin/mkdir /home/root/.ssh
		$ novacom run file:///bin/chmod 700 /home/root/.ssh
		$ novacom put file:///home/root/.ssh/authorized_keys < ~/.ssh/webos.pub
		$ novacom run file:///bin/chmod 600 /home/root/.ssh/authorized_keys

5. Test the SSH login

		$ ssh -i ~/.ssh/webos -p 5522 root@localhost
		root@qemux86:/var/home/root# 

6. Run the module test suite

		$ test/novacom.spec.js

		  novacom
		    #put
		      ✓ should write a file on the device 
		      ✓ should fail to write a file in a non-existing device folder 
		    #get
		      ✓ should write then read the same file from the device 
		
		  3 tests complete (215 ms)






