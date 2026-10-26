#include "gravity.h"

// Apply gravity to an object
void ApplyGravity(Vector3& position, Vector3& velocity, float mass, float dt)
{
    // Standard gravity, mass doesn't affect acceleration in real physics
    velocity.y -= 9.8f * dt;
    position.y += velocity.y * dt;
}
