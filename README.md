nodejs-module-webos-ipkg
========================

Summary
-------

A module for nodejs that allows to generate, package, install, run and debug Open webOS applications.

Install
-------

* In order to hack on `nodejs-module-webos-ipkg`, clone from [GitHub](https://github.com/enyojs/nodejs-module-webos-ipkg), then run `npm install`.
* In order to use `nodejs-module-webos-ipkg` in your own modules, without actually working on it, then run `npm install git@github.com:enyojs/nodejs-module-webos-ipkg.git#0.0.1` where `0.0.1` is the version you want to use (_not yet working_).
* On Mac OS X, you need to install Xcode and Xcode Command Line Tools (Xcode -> Preferences -> Downloads -> Components)

Test
----

3. Start the emulator
4. Run the `novacom` interface tester

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

Setup
-----

**NOTE:** Until now, there is no SSH key distribution system.  This section explains manual generation & installation.

### Generic instructions

1. Generate the SSH keypair using Open-SSH

		$ ssh-keygen -f ~/.ssh/webos -C root@webos-emulator
		
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

### Open webOS

1. Install an Open webOS emualator image & start it
2. Install the SSH public key.  Each of the command below will ask for the `root` password.

		$ ssh -p 6622 root@localhost mkdir .ssh
		$ ssh -p 6622 root@localhost chmod 700 .ssh
		$ cat ~/.ssh/webos.pub | ssh -p 6622 root@localhost "cat > .ssh/authorized_keys"
		$ ssh -p 6622 root@localhost chmod 700 .ssh/authorized_keys

3. Test that key-based authentication works fine (password should not be needed at this step).

		$ ssh -p 6622 -i ~/.ssh/webos root@localhost
		root@qemux86:~# 



### webOS 3.0.5

**Note:** webOS 3.0.5 is running an old verion of the light-weight `dropbear` SSH server that may cause failure of the test suite, although every remote commands succeed.

1. Install the webOS 3.0.5 SDK
2. Start the webOS emulator:

	Assuming `/opt/PalmSDK/Current/bin` is in your `PATH`, run:
	
		$ palm-emulator --list
		Available images:
		SDK 3.0.4.669 (1024x768)
		SDK 3.0.5.676 (1024x768)
		$ palm-emulator --no-vbox-check --start "SDK 3.0.5.676 (1024x768)"

3. Install the public key at the proper location of the emulator

	Assuming `/usr/local/bin` is in your `PATH`, run:

		$ novacom run file:///bin/mkdir /home/root/.ssh
		$ novacom run file:///bin/chmod 700 /home/root/.ssh
		$ novacom put file:///home/root/.ssh/authorized_keys < ~/.ssh/webos.pub
		$ novacom run file:///bin/chmod 600 /home/root/.ssh/authorized_keys

3. Test the SSH login

		$ ssh -i ~/.ssh/webos -p 5522 root@localhost
		root@qemux86:/var/home/root# 


## Reference

### Emulator

Whether there are one or several Emulator images, TCP Ports Redirections remain the same:

| Name | Host Port | Guest Port | Role |
| palm.emulator.debugger | 5858 | 5858 | **TBC** |
| palm.emulator.hostmode | 5880 | 8080 | **TBC** |
| palm.emulator.inspector | 9991 | 9991 | **TBC** |
| palm.emulator.ls2.private | 5512 | 4412 | **TBC** |
| palm.emulator.ls2.public | 5511 | 4411 | **TBC** |
| palm.emulator.ssh | 5522 | 22 | **TBC** |
