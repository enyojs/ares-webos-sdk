SSH key setup
-------------

**NOTE:** Until now, there is no SSH key distribution system.  This section explains manual generation & installation.

### Generate the SSH keypair using Open-SSH

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


### Install the public key on webOS 3.0.5

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

### Open webOS

1. Install an Open webOS emulator image & start it
2. Install the SSH public key.  Each of the command below will ask for the `root` password.

		$ ssh -p 6622 root@localhost mkdir .ssh
		$ ssh -p 6622 root@localhost chmod 700 .ssh
		$ cat ~/.ssh/webos.pub | ssh -p 6622 root@localhost "cat > .ssh/authorized_keys"
		$ ssh -p 6622 root@localhost chmod 700 .ssh/authorized_keys

3. Test that key-based authentication works fine (password should not be needed at this step).

		$ ssh -p 6622 -i ~/.ssh/webos root@localhost
		root@qemux86:~# 
