#pragma once
#include "game.h"
#include "raylib.h"

static const float CAMERA_EYE_HEIGHT = 1.5f;

void UpdateCamera(float yaw, float pitch, Vector3 position, Camera3D& camera);
void DrawCrosshair(int screenWidth, int screenHeight, Color color = WHITE);