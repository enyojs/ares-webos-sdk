:: Created by npm, please don't edit manually.
@ECHO OFF
@SET SCRIPT="%~dp0\.\node_modules\ares-webos-sdk\bin\ares-launch.js"

@IF NOT EXIST %SCRIPT% (
    @SET SCRIPT="%~dp0\.\ares-launch.js"
) 

@SET args=%*

:: Convert if param has "'{" & "}'" 
:: Temp way to get JSON param enclosed with single quotes.
@SET CONVERT=FALSE
@echo.%* | findstr /C:"'{">nul && (
           @echo.%* | findstr /C:"}'">nul && (
                     @SET CONVERT=TRUE
           )
) || (
           @SET CONVERT=FALSE
)

:: If powershell exist, no need converting
powershell /? >null 2>&1 && (
    @SET RUNCMD=cmd /c powershell node
    @SET CONVERT=FALSE
) || (
  @SET RUNCMD=node
)

@IF %CONVERT%==TRUE (
    @SET temp1=%args:"=""%
    @SET args=%temp1:'="%
)

@IF EXIST "%~dp0\x86\node.exe" (
    @SETLOCAL
    @SET "PATH=%~dp0\x86;%PATH%"
    %RUNCMD% %SCRIPT% %args%
) ELSE (
    %RUNCMD% %SCRIPT% %args%
)
