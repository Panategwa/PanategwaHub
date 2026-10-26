#include "camera.h"
#include "raymath.h"

#include <cmath>

static const float CAMERA_DISTANCE = 10.0f;

void UpdateCamera(float yaw, float pitch, Vector3 position, Camera3D& camera)
{
    Vector3 forward;
    forward.x = std::cos(pitch) * std::sin(yaw);
    forward.y = std::sin(pitch);
    forward.z = std::cos(pitch) * std::cos(yaw);
    
    camera.position = {
        position.x,
        position.y + CAMERA_EYE_HEIGHT,
        position.z
    };
    camera.target = {
        camera.position.x + forward.x * CAMERA_DISTANCE,
        camera.position.y + forward.y * CAMERA_DISTANCE,
        camera.position.z + forward.z * CAMERA_DISTANCE
    };
    camera.up = { 0.0f, 1.0f, 0.0f };
    camera.fovy = 90.0f;
    camera.projection = CAMERA_PERSPECTIVE;
}

void DrawCrosshair(int screenWidth, int screenHeight, Color color)
{
    int centerX = screenWidth / 2;
    int centerY = screenHeight / 2;
    int size = 15;
    int thickness = 2;

    // Draw horizontal line with thickness
    for (int i = -thickness/2; i <= thickness/2; i++)
    {
        DrawLine(centerX - size, centerY + i, centerX + size, centerY + i, color);
    }

    // Draw vertical line with thickness
    for (int i = -thickness/2; i <= thickness/2; i++)
    {
        DrawLine(centerX + i, centerY - size, centerX + i, centerY + size, color);
    }
}