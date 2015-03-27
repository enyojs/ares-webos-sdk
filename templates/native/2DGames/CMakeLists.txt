cmake_minimum_required(VERSION 2.8.7)
project(2DGame C CXX)

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

pkg_check_modules(SDL2-TTF REQUIRED SDL2_ttf)
include_directories(${SDL2-TTF_INCLUDE_DIRS})


MESSAGE( "CMAKE_SOURCE_DIR: " ${CMAKE_SOURCE_DIR})
MESSAGE( "SDL2_INCLUDE: " ${SDL2_INCLUDE_DIRS} )

# ---
# create executable file
set(BIN_NAME @EXECUTABLE-NAME@)

set(SRC_LIST
        ${CMAKE_SOURCE_DIR}/src/Base.cpp
        ${CMAKE_SOURCE_DIR}/src/Main.cpp
)

set(CMAKE_RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/pkg/")
add_executable(${BIN_NAME} ${SRC_LIST})
set_target_properties(${BIN_NAME} PROPERTIES LINKER_LANGUAGE C)

target_link_libraries (${BIN_NAME}
        ${SDL2_LDFLAGS}
        ${SDL2-TTF_LDFLAGS}
)
