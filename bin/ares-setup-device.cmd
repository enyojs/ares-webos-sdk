:: Created by npm, please don't edit manually.
@SET SCRIPT="%~dp0\.\node_modules\ares-webos-sdk\bin\ares-setup-device.js"

@IF NOT EXIST %SCRIPT% (
    @SET SCRIPT="%~dp0\.\ares-setup-device.js"
) 

@IF EXIST "%~dp0\x86\node.exe" (
    @SETLOCAL
    @SET PATH=%PATH%;"%~dp0\x86"
    node %SCRIPT% %*
) ELSE (
  node  %SCRIPT% %*
)
