#include "collision.h"

#include <cmath>

bool AABBIntersects(const Vector3& aPos, const Vector3& aHalf, const Vector3& bPos, const Vector3& bHalf)
{
    return (std::fabs(aPos.x - bPos.x) <= (aHalf.x + bHalf.x)) &&
        (std::fabs(aPos.y - bPos.y) <= (aHalf.y + bHalf.y)) &&
        (std::fabs(aPos.z - bPos.z) <= (aHalf.z + bHalf.z));
}

bool PlayerIntersectsBox(const Vector3& playerPos, const Vector3& playerHalf, const BoxCollider& box)
{
    return AABBIntersects(playerPos, playerHalf, box.center, box.halfSize);
}

bool PlayerSideTouchesBox(const Vector3& playerPos, const Vector3& playerHalf, const BoxCollider& box)
{
    constexpr float epsilon = 0.001f;

    bool xOverlap = std::fabs(playerPos.x - box.center.x) < (playerHalf.x + box.halfSize.x);
    bool zOverlap = std::fabs(playerPos.z - box.center.z) < (playerHalf.z + box.halfSize.z);

    // This stops "standing on top" from counting as a side collision.
    bool yOverlap = std::fabs(playerPos.y - box.center.y) < ((playerHalf.y + box.halfSize.y) - epsilon);

    return xOverlap && yOverlap && zOverlap;
}

bool PlayerIntersectsItem(const Vector3& playerPos, const Vector3& playerHalf, const Vector3& itemPos, const Vector3& itemHalf)
{
    return AABBIntersects(playerPos, playerHalf, itemPos, itemHalf);
}