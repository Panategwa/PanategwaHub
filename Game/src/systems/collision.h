#pragma once
#include "game.h"

bool AABBIntersects(const Vector3& aPos, const Vector3& aHalf, const Vector3& bPos, const Vector3& bHalf);
bool PlayerIntersectsBox(const Vector3& playerPos, const Vector3& playerHalf, const BoxCollider& box);
bool PlayerSideTouchesBox(const Vector3& playerPos, const Vector3& playerHalf, const BoxCollider& box);

// Item collision functions
bool PlayerIntersectsItem(const Vector3& playerPos, const Vector3& playerHalf, const Vector3& itemPos, const Vector3& itemHalf);