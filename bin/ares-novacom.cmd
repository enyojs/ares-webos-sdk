:: Created by npm, please don't edit manually.
@SET SCRIPT="%~dp0\.\node_modules\ares-webos-sdk\bin\ares-novacom.js"

@IF NOT EXIST %SCRIPT% (
    @SET SCRIPT="%~dp0\.\ares-launch.js"
) 

@IF EXIST "%~dp0\node.exe" (
  "%~dp0\node.exe"  %SCRIPT% %*
) ELSE (
  node  %SCRIPT% %*
)
