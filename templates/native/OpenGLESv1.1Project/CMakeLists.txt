cmake_minimum_required(VERSION 2.8.7)
project(OpenGLESv1.1 C CXX)

# ---
# add include files
include_directories(${CMAKE_SOURCE_DIR})
include_directories(${CMAKE_SOURCE_DIR}/src)
include_directories(${CMAKE_SOURCE_DIR}/include)

# ---
# find required packages
include(FindPkgConfig)

pkg_check_modules(SDL2 REQUIRED sdl2)
include_directories(${SDL2_INCLUDE_DIRS})

pkg_check_modules(GLES1.1 REQUIRED glesv1_cm)
include_directories(${GLES1.1_INCLUDE_DIRS})


MESSAGE( "CMAKE_SOURCE_DIR: " ${CMAKE_SOURCE_DIR})
MESSAGE( "GLES1.1_INCLUDE: " ${GLES1.1_INCLUDE_DIRS} )

# ---
# create executable file
set(BIN_NAME @EXECUTABLE-NAME@)

set(SRC_LIST
        ${CMAKE_SOURCE_DIR}/src/Main.cpp
)

set(CMAKE_RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/pkg/")
add_executable(${BIN_NAME} ${SRC_LIST})
set_target_properties(${BIN_NAME} PROPERTIES LINKER_LANGUAGE C)

target_link_libraries (${BIN_NAME}
        ${SDL2_LDFLAGS}
        ${GLES1.1_LDFLAGS}
)


# copy appinfo.json file to output folder
if(EXISTS "${CMAKE_SOURCE_DIR}/appinfo.json")
    file(COPY "${CMAKE_SOURCE_DIR}/appinfo.json" DESTINATION ${CMAKE_RUNTIME_OUTPUT_DIRECTORY})
else()
    MESSAGE( "'appinfo.json' file was not found !!")
endif()

# copy icon.png file to output folder
if(EXISTS "${CMAKE_SOURCE_DIR}/icon.png")
    file(COPY "${CMAKE_SOURCE_DIR}/icon.png" DESTINATION ${CMAKE_RUNTIME_OUTPUT_DIRECTORY})
else()
    MESSAGE( "'icon.png' file was not found !!")
endif()

# copy largeIcon.png file to output folder
if(EXISTS "${CMAKE_SOURCE_DIR}/largeIcon.png")
    file(COPY "${CMAKE_SOURCE_DIR}/largeIcon.png" DESTINATION ${CMAKE_RUNTIME_OUTPUT_DIRECTORY})
else()
    MESSAGE( "'largeIcon.png' file was not found !!")
endif()

