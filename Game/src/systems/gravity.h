#pragma once
#include "raylib.h"

// Gravity physics for falling objects
void ApplyGravity(Vector3& position, Vector3& velocity, float mass, float dt);
