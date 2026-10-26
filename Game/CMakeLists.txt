cmake_minimum_required(VERSION 3.20)
project(XenoterraEngine LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Use local raylib instead of FetchContent for portability
add_subdirectory(raylib-5.5)

add_executable(XenoterraEngine
    main.cpp
    src/systems/game.cpp
    src/systems/texture.cpp
    src/systems/inventory.cpp
    src/systems/collision.cpp
    src/systems/movement.cpp
    src/systems/camera.cpp
    src/systems/gravity.cpp
    src/ui/main_menu.cpp
    src/ui/pause_menu.cpp
    src/ui/inventory.cpp
    src/ui/selected_item.cpp
    src/ui/stamina.cpp
)

target_link_libraries(XenoterraEngine PRIVATE raylib)


