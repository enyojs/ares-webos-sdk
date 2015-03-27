set( CMAKE_SYSTEM_NAME Linux )
set( CMAKE_SYSTEM_PROCESSOR arm )
set( CMAKE_C_COMPILER arm-starfish-linux-gnueabi-gcc )
set( CMAKE_CXX_COMPILER arm-starfish-linux-gnueabi-g++ )
set( WEBOS_NATIVE_SYS_ROOT "$ENV{OECORE_NATIVE_SYSROOT}" )
set( WEBOS_SYS_ROOTS "$ENV{OECORE_TARGET_SYSROOT}")
set( CMAKE_C_FLAGS " -march=armv7-a -marm -mthumb-interwork -mfloat-abi=softfp -mfpu=neon -mtune=cortex-a9 -mcpu=cortex-a9 -funwind-tables -mvectorize-with-neon-quad -rdynamic --sysroot=${WEBOS_SYS_ROOTS} " CACHE STRING "CFLAGS" )
set( CMAKE_CXX_FLAGS " -march=armv7-a -marm -mthumb-interwork -mfloat-abi=softfp -mfpu=neon -mtune=cortex-a9 -mcpu=cortex-a9 -funwind-tables -mvectorize-with-neon-quad -rdynamic --sysroot=${WEBOS_SYS_ROOTS} -O2 -pipe -g -feliminate-unused-debug-types -fpermissive -fvisibility-inlines-hidden -fpermissive" CACHE STRING "CXXFLAGS" )
set( CMAKE_C_FLAGS_RELEASE "-O2 -pipe -g -feliminate-unused-debug-types -DNDEBUG" CACHE STRING "CFLAGS for release" )
set( CMAKE_CXX_FLAGS_RELEASE "-O2 -pipe -g -feliminate-unused-debug-types -O2 -pipe -g -feliminate-unused-debug-types -fpermissive -fvisibility-inlines-hidden -DNDEBUG" CACHE STRING "CXXFLAGS for release" )
set( CMAKE_C_LINK_FLAGS " -march=armv7-a -marm -mthumb-interwork -mfloat-abi=softfp -mfpu=neon -mtune=cortex-a9 -mcpu=cortex-a9 -funwind-tables -mvectorize-with-neon-quad -rdynamic --sysroot=${WEBOS_SYS_ROOTS} -Wl,-O1 -Wl,--hash-style=gnu -Wl,--as-needed" CACHE STRING "LDFLAGS" )
set( CMAKE_CXX_LINK_FLAGS " -march=armv7-a -marm -mthumb-interwork -mfloat-abi=softfp -mfpu=neon -mtune=cortex-a9 -mcpu=cortex-a9 -funwind-tables -mvectorize-with-neon-quad -rdynamic --sysroot=${WEBOS_SYS_ROOTS} -O2 -pipe -g -feliminate-unused-debug-types -fpermissive -fvisibility-inlines-hidden -Wl,-O1 -Wl,--hash-style=gnu -Wl,--as-needed" CACHE STRING "LDFLAGS" )

# only search in the paths provided so cmake doesnt pick
# up libraries and tools from the native build machine
set( CMAKE_FIND_ROOT_PATH ${WEBOS_SYS_ROOTS} ${WEBOS_NATIVE_SYS_ROOT})
set( CMAKE_FIND_ROOT_PATH_MODE_PROGRAM ONLY )
set( CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY )
set( CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY )

