#include "movement.h"
#include "collision.h"
#include "raymath.h"

#include <algorithm>
#include <cmath>

static const float ROCK_SIZE = 0.9f;
static const float STICK_WIDTH = 0.8f;
static const float STICK_DEPTH = 0.35f;
static const float STICK_HEIGHT = 0.35f;

static const float PLANT_SIZE = 1.0f;
static const float MOUSE_SENSITIVITY = 0.002f;
static const float PLAYER_MOVE_SPEED = 3.0f;
static const float SPRINT_SPEED = 6.0f;
static const float JUMP_SPEED = 7.0f;
static const float GRAVITY = 15.0f;
static const float STAMINA_DEPLETION_RATE = 25.0f;
static const float STAMINA_REGEN_RATE = 12.5f;
static const float SPRINT_END_DELAY = 0.5f;

static bool CollidesWithAnySide(const Vector3& position, const std::vector<BoxCollider>& boxes)
{
    for (const auto& box : boxes)
    {
        if (PlayerSideTouchesBox(position, PLAYER_HALF_SIZE, box))
        {
            return true;
        }
    }

    return false;
}

static bool CollidesWithRocks(const Vector3& position, const std::vector<Item>& rocks, float playerFeetY)
{
    Vector3 rockHalf = { ROCK_SIZE / 2.0f, ROCK_SIZE / 2.0f, ROCK_SIZE / 2.0f };
    for (const auto& rock : rocks)
    {
        float rockTop = rock.position.y + rockHalf.y;
        float rockBottom = rock.position.y - rockHalf.y;

        // Allow horizontal movement if player is standing ON TOP of the rock
        // (feet are close to the rock's top surface)
        if (playerFeetY >= rockTop - 0.1f && playerFeetY <= rockTop + 0.8f)
        {
            continue; // Player is standing on top, allow movement
        }

        // Allow jumping over if player is above the rock
        if (playerFeetY > rockTop + 0.2f)
        {
            continue; // Player is above the rock, can pass over it
        }

        if (PlayerIntersectsItem(position, PLAYER_HALF_SIZE, rock.position, rockHalf))
        {
            return true;
        }
    }

    return false;
}

static bool CollidesWithSticks(const Vector3& position, const std::vector<Item>& sticks, float playerFeetY)
{
    Vector3 stickHalf = { STICK_WIDTH / 2.0f, STICK_HEIGHT / 2.0f, STICK_DEPTH / 2.0f };
    for (const auto& stick : sticks)
    {
        float stickTop = stick.position.y + stickHalf.y;
        float stickBottom = stick.position.y - stickHalf.y;

        // Allow horizontal movement if player is standing ON TOP of the stick
        if (playerFeetY >= stickTop - 0.1f && playerFeetY <= stickTop + 0.8f)
        {
            continue; // Player is standing on top, allow movement
        }

        // Allow jumping over if player is above the stick
        if (playerFeetY > stickTop + 0.2f)
        {
            continue; // Player is above the stick, can pass over it
        }

        if (PlayerIntersectsItem(position, PLAYER_HALF_SIZE, stick.position, stickHalf))
        {
            return true;
        }
    }

    return false;
}

static bool CollidesWithPlants(const Vector3& position, const std::vector<Item>& plants, float playerFeetY)
{
    Vector3 plantHalf = { PLANT_SIZE / 2.0f, PLANT_SIZE / 2.0f, PLANT_SIZE / 2.0f };
    for (const auto& plant : plants)
    {
        float plantTop = plant.position.y + plantHalf.y;

        // Allow horizontal movement if player is standing ON TOP of the plant
        if (playerFeetY >= plantTop - 0.1f && playerFeetY <= plantTop + 0.8f)
            continue;

        // Allow jumping over if player is above the plant
        if (playerFeetY > plantTop + 0.2f)
            continue;

        if (PlayerIntersectsItem(position, PLAYER_HALF_SIZE, plant.position, plantHalf))
            return true;
    }

    return false;
}

static void TryMoveX(Player& player, float deltaX, const std::vector<BoxCollider>& boxes, const std::vector<Item>& rocks, const std::vector<Item>& sticks, const std::vector<Item>& plants)
{
    if (deltaX == 0.0f) return;

    float oldX = player.position.x;
    player.position.x += deltaX;

    float playerFeetY = player.position.y - PLAYER_HALF_SIZE.y;
    if (CollidesWithAnySide(player.position, boxes) || CollidesWithRocks(player.position, rocks, playerFeetY) || CollidesWithSticks(player.position, sticks, playerFeetY) || CollidesWithPlants(player.position, plants, playerFeetY))
    {
        player.position.x = oldX;
    }
}

static void TryMoveZ(Player& player, float deltaZ, const std::vector<BoxCollider>& boxes, const std::vector<Item>& rocks, const std::vector<Item>& sticks, const std::vector<Item>& plants)
{
    if (deltaZ == 0.0f) return;

    float oldZ = player.position.z;
    player.position.z += deltaZ;

    float playerFeetY = player.position.y - PLAYER_HALF_SIZE.y;
    if (CollidesWithAnySide(player.position, boxes) || CollidesWithRocks(player.position, rocks, playerFeetY) || CollidesWithSticks(player.position, sticks, playerFeetY) || CollidesWithPlants(player.position, plants, playerFeetY))
    {
        player.position.z = oldZ;
    }
}

static void TryMoveY(Player& player, float deltaY, const std::vector<BoxCollider>& boxes, const std::vector<Item>& rocks, const std::vector<Item>& sticks, const std::vector<Item>& plants)
{
    if (deltaY == 0.0f) return;

    float oldY = player.position.y;
    player.position.y += deltaY;
    player.onGround = false;

    // Terrain floor
    float terrainY = GetTerrainHeight(player.position.x, player.position.z);
    if (player.position.y - PLAYER_HALF_SIZE.y <= terrainY)
    {
        player.position.y = terrainY + PLAYER_HALF_SIZE.y;
        player.velocity.y = 0.0f;
        player.onGround = true;
        return;
    }

    for (const auto& box : boxes)
    {
        if (!AABBIntersects(player.position, PLAYER_HALF_SIZE, box.center, box.halfSize))
        {
            continue;
        }

        float boxTop = box.center.y + box.halfSize.y;
        float boxBottom = box.center.y - box.halfSize.y;

        float playerBottomOld = oldY - PLAYER_HALF_SIZE.y;
        float playerTopOld = oldY + PLAYER_HALF_SIZE.y;
        float playerBottomNew = player.position.y - PLAYER_HALF_SIZE.y;
        float playerTopNew = player.position.y + PLAYER_HALF_SIZE.y;

        if (deltaY < 0.0f && playerBottomOld >= boxTop && playerBottomNew <= boxTop)
        {
            player.position.y = boxTop + PLAYER_HALF_SIZE.y;
            player.velocity.y = 0.0f;
            player.onGround = true;
            return;
        }

        if (deltaY > 0.0f && playerTopOld <= boxBottom && playerTopNew >= boxBottom)
        {
            player.position.y = boxBottom - PLAYER_HALF_SIZE.y;
            player.velocity.y = 0.0f;
            return;
        }

        player.position.y = oldY;
        player.velocity.y = 0.0f;
        return;
    }

    // Check item collisions for vertical movement
    float playerFeetY = player.position.y - PLAYER_HALF_SIZE.y;
    float playerFeetOld = oldY - PLAYER_HALF_SIZE.y;

    // Check landing on rocks
    for (const auto& rock : rocks)
    {
        Vector3 rockHalf = { ROCK_SIZE / 2.0f, ROCK_SIZE / 2.0f, ROCK_SIZE / 2.0f };
        float rockTop = rock.position.y + rockHalf.y;

        // Check if player is falling onto the rock
        if (deltaY < 0.0f && playerFeetOld >= rockTop && playerFeetY <= rockTop)
        {
            // Check horizontal overlap
            if (std::fabs(player.position.x - rock.position.x) < (PLAYER_HALF_SIZE.x + rockHalf.x) &&
                std::fabs(player.position.z - rock.position.z) < (PLAYER_HALF_SIZE.z + rockHalf.z))
            {
                player.position.y = rockTop + PLAYER_HALF_SIZE.y;
                player.velocity.y = 0.0f;
                player.onGround = true;
                return;
            }
        }
    }

    // Check landing on sticks
    for (const auto& stick : sticks)
    {
        Vector3 stickHalf = { STICK_WIDTH / 2.0f, STICK_HEIGHT / 2.0f, STICK_DEPTH / 2.0f };
        float stickTop = stick.position.y + stickHalf.y;

        // Check if player is falling onto the stick
        if (deltaY < 0.0f && playerFeetOld >= stickTop && playerFeetY <= stickTop)
        {
            // Check horizontal overlap
            if (std::fabs(player.position.x - stick.position.x) < (PLAYER_HALF_SIZE.x + stickHalf.x) &&
                std::fabs(player.position.z - stick.position.z) < (PLAYER_HALF_SIZE.z + stickHalf.z))
            {
                player.position.y = stickTop + PLAYER_HALF_SIZE.y;
                player.velocity.y = 0.0f;
                player.onGround = true;
                return;
            }
        }
    }

    // Check landing on plants
    for (const auto& plant : plants)
    {
        Vector3 plantHalf = { PLANT_SIZE / 2.0f, PLANT_SIZE / 2.0f, PLANT_SIZE / 2.0f };
        float plantTop = plant.position.y + plantHalf.y;

        if (deltaY < 0.0f && playerFeetOld >= plantTop && playerFeetY <= plantTop)
        {
            if (std::fabs(player.position.x - plant.position.x) < (PLAYER_HALF_SIZE.x + plantHalf.x) &&
                std::fabs(player.position.z - plant.position.z) < (PLAYER_HALF_SIZE.z + plantHalf.z))
            {
                player.position.y = plantTop + PLAYER_HALF_SIZE.y;
                player.velocity.y = 0.0f;
                player.onGround = true;
                return;
            }
        }
    }

    // Check side collision with items (block movement into items)
    if (CollidesWithRocks(player.position, rocks, playerFeetY) || CollidesWithSticks(player.position, sticks, playerFeetY) || CollidesWithPlants(player.position, plants, playerFeetY))
    {
        player.position.y = oldY;
        player.velocity.y = 0.0f;
        return;
    }
}

void UpdatePlayerMovement(Player& player, const std::vector<BoxCollider>& boxes, std::vector<Item>& rocks, std::vector<Item>& sticks, const std::vector<Item>& plants, bool lockCamera)
{
    float dt = GetFrameTime();

    Vector2 mouseDelta = GetMouseDelta();

    // Camera lock - skip mouse look when inventory is active
    if (!lockCamera)
    {
        // Fixed: left/right no longer inverted
        player.yaw -= mouseDelta.x * MOUSE_SENSITIVITY;
        player.pitch -= mouseDelta.y * MOUSE_SENSITIVITY;
        player.pitch = std::clamp(player.pitch, -PI/2.0f + 0.001f, PI/2.0f - 0.001f);
    }

    Vector3 forward = {
        std::sin(player.yaw),
        0.0f,
        std::cos(player.yaw)
    };
    Vector3 right = { -forward.z, 0.0f, forward.x };

    Vector3 move = { 0.0f, 0.0f, 0.0f };

    if (IsKeyDown(KEY_W)) move = Vector3Add(move, forward);
    if (IsKeyDown(KEY_S)) move = Vector3Subtract(move, forward);
    if (IsKeyDown(KEY_D)) move = Vector3Add(move, right);
    if (IsKeyDown(KEY_A)) move = Vector3Subtract(move, right);

    move.y = 0.0f;
    bool isMoving = false;
    if (Vector3Length(move) > 0.0f)
    {
        move = Vector3Normalize(move);
        isMoving = true;
    }

    // Check if sprinting (Shift + moving)
    bool isSprinting = isMoving && IsKeyDown(KEY_LEFT_SHIFT) && player.stamina > 0.0f;

    // Track sprint end time for delay
    if (isSprinting)
    {
        player.timeSinceSprintEnded = 0.0f;
    }
    else if (player.timeSinceSprintEnded < SPRINT_END_DELAY)
    {
        player.timeSinceSprintEnded += dt;
    }

    // Check if regen delay is over
    bool canRegen = player.timeSinceSprintEnded >= SPRINT_END_DELAY;

    // Stamina system (no fading)
    if (isSprinting && player.stamina > 0.0f)
    {
        player.stamina -= STAMINA_DEPLETION_RATE * dt;
        if (player.stamina < 0.0f) player.stamina = 0.0f;
    }
    else if (!isSprinting && canRegen && player.stamina < player.maxStamina)
    {
        player.stamina += STAMINA_REGEN_RATE * dt;
        if (player.stamina > player.maxStamina) player.stamina = player.maxStamina;
    }

    // Calculate speed based on sprinting and stamina
    float currentMoveSpeed;
    if (isSprinting)
    {
        // Smoothly fade from sprint speed to walk speed as stamina depletes
        float staminaRatio = player.stamina / player.maxStamina;
        float speedMultiplier = 0.5f + (0.5f * staminaRatio); // Minimum 50% of sprint speed
        currentMoveSpeed = SPRINT_SPEED * speedMultiplier;
    }
    else
    {
        currentMoveSpeed = PLAYER_MOVE_SPEED;
    }

    TryMoveX(player, move.x * currentMoveSpeed * dt, boxes, rocks, sticks, plants);
    TryMoveZ(player, move.z * currentMoveSpeed * dt, boxes, rocks, sticks, plants);

    if (player.onGround)
    {
        float terrainY = GetTerrainHeight(player.position.x, player.position.z);
        if (player.position.y < terrainY + PLAYER_HALF_SIZE.y)
        {
            player.position.y = terrainY + PLAYER_HALF_SIZE.y;
            player.velocity.y = 0.0f;
        }
    }

    if (IsKeyPressed(KEY_SPACE) && player.onGround)
    {
        player.velocity.y = JUMP_SPEED;
        player.onGround = false;
    }

    player.velocity.y -= GRAVITY * dt;
    TryMoveY(player, player.velocity.y * dt, boxes, rocks, sticks, plants);
}
