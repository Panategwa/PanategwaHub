#include "game.h"
#include "inventory.h"
#include "../ui/inventory.h"
#include "../ui/selected_item.h"
#include "../ui/stamina.h"
#include "../ui/styles.h"
#include "texture.h"
#include "movement.h"
#include "camera.h"
#include "collision.h"
#include "gravity.h"
#include "raymath.h"
#include "rlgl.h"

#include <cmath>
#include <fstream>
#include <filesystem>
#include <sstream>
#include <cstdlib>

static const float PICKUP_RANGE = 3.0f;
static const float GRID_SIZE = 100.0f;
static const float ROCK_SIZE = 0.9f;
static const float STICK_WIDTH = 0.8f;
static const float STICK_DEPTH = 0.35f;
static const float STICK_HEIGHT = 0.35f;
static const float PLANT_SIZE = 1.0f;
static const Color ROCK_COLOR = Color{ 140, 140, 140, 255 };
static const Color STICK_COLOR = Color{ 139, 69, 19, 255 };
static const Color ROCK_OUTLINE_COLOR = DARKGRAY;
static const Color STICK_OUTLINE_COLOR = DARKBROWN;
static const Color PLANT_STEM_COLOR = Color{ 101, 67, 33, 255 };
static const Color PLANT_LEAF_COLOR = Color{ 34, 139, 34, 255 };
static const Color PLANT_LEAF_OUTLINE = DARKGREEN;
static const float PLAYER_MODEL_WIDTH = 0.3f;
static const float PLAYER_MODEL_HEIGHT = 1.8f;
static const float PLAYER_MODEL_DEPTH = 0.3f;

// Boulders are large static world obstacles (bigger rocks, not pickable)
static const float BOULDER_HALF = 1.2f;

// Per-axis half-extents of an item, used for accurate collision/placement.
static Vector3 GetItemHalfExtents(ItemType type)
{
    switch (type)
    {
        case ItemType::Rock:  return { ROCK_SIZE / 2.0f, ROCK_SIZE / 2.0f, ROCK_SIZE / 2.0f };
        case ItemType::Stick: return { STICK_WIDTH / 2.0f, STICK_HEIGHT / 2.0f, STICK_DEPTH / 2.0f };
        case ItemType::Plant: return { PLANT_SIZE / 2.0f, PLANT_SIZE / 2.0f, PLANT_SIZE / 2.0f };
        default:              return { ROCK_SIZE / 2.0f, ROCK_SIZE / 2.0f, ROCK_SIZE / 2.0f };
    }
}

static std::vector<Item> MakeRocks()
{
    const float half = ROCK_SIZE / 2.0f;
    return {
        { ItemType::Rock, {  2.0f, GetTerrainHeight(2.0f, 1.0f) + half,  1.0f }, { 0.0f, 0.0f, 0.0f }, 2.0f, true },
        { ItemType::Rock, { -2.5f, GetTerrainHeight(-2.5f, 2.0f) + half,  2.0f }, { 0.0f, 0.0f, 0.0f }, 2.0f, true },
        { ItemType::Rock, {  1.0f, GetTerrainHeight(1.0f, -3.0f) + half, -3.0f }, { 0.0f, 0.0f, 0.0f }, 2.0f, true },
        { ItemType::Rock, {  4.0f, GetTerrainHeight(4.0f, -1.0f) + half, -1.0f }, { 0.0f, 0.0f, 0.0f }, 2.0f, true },
        { ItemType::Rock, { -4.0f, GetTerrainHeight(-4.0f, -3.0f) + half, -3.0f }, { 0.0f, 0.0f, 0.0f }, 2.0f, true },
        { ItemType::Rock, {  0.0f, GetTerrainHeight(0.0f, 4.0f) + half,  4.0f }, { 0.0f, 0.0f, 0.0f }, 2.0f, true },
        { ItemType::Rock, {  3.5f, GetTerrainHeight(3.5f, 3.5f) + half,  3.5f }, { 0.0f, 0.0f, 0.0f }, 2.0f, true },
        { ItemType::Rock, { -1.5f, GetTerrainHeight(-1.5f, 5.0f) + half,  5.0f }, { 0.0f, 0.0f, 0.0f }, 2.0f, true },
        { ItemType::Rock, {  8.0f, GetTerrainHeight(8.0f, -6.0f) + half, -6.0f }, { 0.0f, 0.0f, 0.0f }, 2.0f, true },
        { ItemType::Rock, { -9.0f, GetTerrainHeight(-9.0f, 7.0f) + half,  7.0f }, { 0.0f, 0.0f, 0.0f }, 2.0f, true },
        { ItemType::Rock, { 10.0f, GetTerrainHeight(10.0f, 10.0f) + half, 10.0f }, { 0.0f, 0.0f, 0.0f }, 2.0f, true },
        { ItemType::Rock, { -12.0f, GetTerrainHeight(-12.0f, 12.0f) + half, 12.0f }, { 0.0f, 0.0f, 0.0f }, 2.0f, true }
    };
}

static std::vector<Item> MakeSticks()
{
    const float halfH = STICK_HEIGHT / 2.0f;
    return {
        { ItemType::Stick, { -2.0f, GetTerrainHeight(-2.0f, 1.0f) + halfH,  1.0f }, { 0.0f, 0.0f, 0.0f }, 0.5f, true },
        { ItemType::Stick, {  2.5f, GetTerrainHeight(2.5f, 2.0f) + halfH,  2.0f }, { 0.0f, 0.0f, 0.0f }, 0.5f, true },
        { ItemType::Stick, { -1.0f, GetTerrainHeight(-1.0f, -3.0f) + halfH, -3.0f }, { 0.0f, 0.0f, 0.0f }, 0.5f, true },
        { ItemType::Stick, { -4.0f, GetTerrainHeight(-4.0f, -1.0f) + halfH, -1.0f }, { 0.0f, 0.0f, 0.0f }, 0.5f, true },
        { ItemType::Stick, {  4.0f, GetTerrainHeight(4.0f, 3.0f) + halfH,  3.0f }, { 0.0f, 0.0f, 0.0f }, 0.5f, true },
        { ItemType::Stick, {  0.0f, GetTerrainHeight(0.0f, -4.0f) + halfH, -4.0f }, { 0.0f, 0.0f, 0.0f }, 0.5f, true },
        { ItemType::Stick, { -6.0f, GetTerrainHeight(-6.0f, -7.0f) + halfH, -7.0f }, { 0.0f, 0.0f, 0.0f }, 0.5f, true },
        { ItemType::Stick, {  7.0f, GetTerrainHeight(7.0f, 8.0f) + halfH,  8.0f }, { 0.0f, 0.0f, 0.0f }, 0.5f, true }
    };
}

static std::vector<Item> MakePlants()
{
    const float half = PLANT_SIZE / 2.0f;
    return {
        { ItemType::Plant, {  4.0f, GetTerrainHeight(4.0f, 8.0f) + half,  8.0f }, { 0.0f, 0.0f, 0.0f }, 1.0f, true },
        { ItemType::Plant, { -5.0f, GetTerrainHeight(-5.0f, -4.0f) + half, -4.0f }, { 0.0f, 0.0f, 0.0f }, 1.0f, true },
        { ItemType::Plant, {  8.0f, GetTerrainHeight(8.0f, -5.0f) + half, -5.0f }, { 0.0f, 0.0f, 0.0f }, 1.0f, true },
        { ItemType::Plant, { -8.0f, GetTerrainHeight(-8.0f, 9.0f) + half,  9.0f }, { 0.0f, 0.0f, 0.0f }, 1.0f, true },
        { ItemType::Plant, { 10.0f, GetTerrainHeight(10.0f, 10.0f) + half, 10.0f }, { 0.0f, 0.0f, 0.0f }, 1.0f, true },
        { ItemType::Plant, { -12.0f, GetTerrainHeight(-12.0f, -12.0f) + half, -12.0f }, { 0.0f, 0.0f, 0.0f }, 1.0f, true }
    };
}

void ResetPlayer(Player& player)
{
    float startY = GetTerrainHeight(0.0f, 40.0f) + 1.0f;
    player.position = { 0.0f, startY, 40.0f };
    player.velocity = { 0.0f, 0.0f, 0.0f };
    player.yaw = PI;
    player.pitch = 0.0f;
    player.onGround = true;
    player.stamina = player.maxStamina;
    player.timeSinceSprintEnded = 0.0f;
    player.mass = 1.0f;
}

// Very simple heightmap terrain: flat near spawn, one small hill near center.
float GetTerrainHeight(float x, float z)
{
    float dist = std::sqrt(x * x + z * z);
    float radius = 30.0f;
    float height = 15.0f;
    if (dist < radius)
    {
        float t = dist / radius;
        return height * (1.0f - t * t * t);
    }
    return 0.0f;
}

Color TerrainColor(float h)
{
    float t = h / 15.0f;
    if (t < 0.5f)
    {
        float s = t / 0.5f;
        return Color{
            (unsigned char)(34 + s * (100 - 34)),
            (unsigned char)(139 + s * (180 - 139)),
            (unsigned char)(34 + s * (60 - 34)),
            255
        };
    }
    float s = (t - 0.5f) / 0.5f;
    return Color{
        (unsigned char)(100 + s * (139 - 100)),
        (unsigned char)(180 + s * (90 - 180)),
        (unsigned char)(60 + s * (60 - 60)),
        255
    };
}

void DrawTerrainMesh()
{
    Texture_EnsureGrassLoaded();

    const int size = (int)GRID_SIZE;
    const float half = GRID_SIZE / 2.0f;

    rlDisableBackfaceCulling();
    rlEnableTexture(Texture_GetGrass().id);

    const int CHUNK = 30; // 30*100*2 = 6000 tris, under default RL batch limit 8192

    for (int z0 = 0; z0 < size; z0 += CHUNK)
    {
        int z1 = z0 + CHUNK;
        if (z1 > size) z1 = size;

        rlBegin(RL_TRIANGLES);
        rlColor4ub(255, 255, 255, 255);

        for (int z = z0; z < z1; z++)
        {
            for (int x = 0; x < size; x++)
            {
                float wx0 = x - half;
                float wx1 = wx0 + 1.0f;
                float wz0 = z - half;
                float wz1 = wz0 + 1.0f;

                float h00 = GetTerrainHeight(wx0, wz0);
                float h10 = GetTerrainHeight(wx1, wz0);
                float h01 = GetTerrainHeight(wx0, wz1);
                float h11 = GetTerrainHeight(wx1, wz1);

                rlTexCoord2f(0.0f, 0.0f); rlVertex3f(wx0, h00, wz0);
                rlTexCoord2f(1.0f, 0.0f); rlVertex3f(wx1, h10, wz0);
                rlTexCoord2f(1.0f, 1.0f); rlVertex3f(wx1, h11, wz1);
                rlTexCoord2f(0.0f, 0.0f); rlVertex3f(wx0, h00, wz0);
                rlTexCoord2f(0.0f, 1.0f); rlVertex3f(wx0, h01, wz1);
                rlTexCoord2f(1.0f, 1.0f); rlVertex3f(wx1, h11, wz1);
            }
        }

        rlEnd();
    }

    rlDisableTexture();
    rlEnableBackfaceCulling();
}

void ResetWorld(Game& game)
{
    ResetPlayer(game.player);
    InitInventory(game.inventory);

    const float bh = BOULDER_HALF;
    game.boulders =
    {
        { {  0.0f, GetTerrainHeight(0.0f, 0.0f) + bh,  0.0f }, { bh, bh, bh } },
        { {  3.0f, GetTerrainHeight(3.0f, 2.5f) + bh,  2.5f }, { bh, bh, bh } },
        { { -3.0f, GetTerrainHeight(-3.0f, -2.0f) + bh, -2.0f }, { bh, bh, bh } },
        { {  5.0f, GetTerrainHeight(5.0f, 0.0f) + bh,  0.0f }, { bh, bh, bh } },
        { { -5.0f, GetTerrainHeight(-5.0f, 1.5f) + bh, 1.5f }, { bh, bh, bh } },
        { {  20.0f, GetTerrainHeight(20.0f, 10.0f) + bh, 10.0f }, { bh, bh, bh } },
        { { -20.0f, GetTerrainHeight(-20.0f, -10.0f) + bh, -10.0f }, { bh, bh, bh } },
        { {  40.0f, GetTerrainHeight(40.0f, 25.0f) + bh, 25.0f }, { bh, bh, bh } },
        { { -40.0f, GetTerrainHeight(-40.0f, -25.0f) + bh, -25.0f }, { bh, bh, bh } },
        { {  45.0f, GetTerrainHeight(45.0f, 45.0f) + bh, 45.0f }, { bh, bh, bh } },
        { { -45.0f, GetTerrainHeight(-45.0f, -45.0f) + bh, -45.0f }, { bh, bh, bh } },
        { {  30.0f, GetTerrainHeight(30.0f, -35.0f) + bh, -35.0f }, { bh, bh, bh } },
        { { -30.0f, GetTerrainHeight(-30.0f, 35.0f) + bh, 35.0f }, { bh, bh, bh } },
        { {  10.0f, GetTerrainHeight(10.0f, 45.0f) + bh, 45.0f }, { bh, bh, bh } },
        { { -45.0f, GetTerrainHeight(-45.0f, 15.0f) + bh, 15.0f }, { bh, bh, bh } },
        { {  45.0f, GetTerrainHeight(45.0f, -20.0f) + bh, -20.0f }, { bh, bh, bh } },
        { { -45.0f, GetTerrainHeight(-45.0f, 20.0f) + bh, 20.0f }, { bh, bh, bh } },
        { {  15.0f, GetTerrainHeight(15.0f, -45.0f) + bh, -45.0f }, { bh, bh, bh } },
        { { -15.0f, GetTerrainHeight(-15.0f, 50.0f) + bh, 50.0f }, { bh, bh, bh } }
    };

    game.rocks = MakeRocks();
    game.sticks = MakeSticks();
    game.plants = MakePlants();
}

void InitGame(Game& game)
{
    game.state = GameState::MainMenu;
    game.running = true;
    game.cursorHidden = false;

    ResetWorld(game);
}

enum class ItemTypeKind { Rock, Stick, Plant, Boulder };

struct ItemHit
{
    bool hit = false;
    ItemTypeKind type;
    int index;
    float distance;
    Vector3 point;
    Vector3 normal;
};

static ItemHit RaycastItem(const Game& game)
{
    ItemHit result;
    float closestDistance = PICKUP_RANGE;

    Vector3 rayOrigin = { game.player.position.x, game.player.position.y + CAMERA_EYE_HEIGHT, game.player.position.z };
    Vector3 rayDir = {
        std::cos(game.player.pitch) * std::sin(game.player.yaw),
        std::sin(game.player.pitch),
        std::cos(game.player.pitch) * std::cos(game.player.yaw)
    };
    Ray ray = { rayOrigin, rayDir };

    float halfRockSize = ROCK_SIZE / 2.0f;
    for (int i = 0; i < (int)game.rocks.size(); i++)
    {
        Vector3 boxCenter = game.rocks[i].position;
        BoundingBox box = {
            { boxCenter.x - halfRockSize, boxCenter.y - halfRockSize, boxCenter.z - halfRockSize },
            { boxCenter.x + halfRockSize, boxCenter.y + halfRockSize, boxCenter.z + halfRockSize }
        };
        RayCollision collision = GetRayCollisionBox(ray, box);
        if (collision.hit && collision.distance < closestDistance)
        {
            closestDistance = collision.distance;
            result.hit = true;
            result.type = ItemTypeKind::Rock;
            result.index = i;
            result.distance = collision.distance;
            result.point = collision.point;
            result.normal = collision.normal;
        }
    }

    float halfStickWidth = STICK_WIDTH / 2.0f;
    float halfStickHeight = STICK_HEIGHT / 2.0f;
    float halfStickDepth = STICK_DEPTH / 2.0f;
    for (int i = 0; i < (int)game.sticks.size(); i++)
    {
        Vector3 boxCenter = game.sticks[i].position;
        BoundingBox box2 = {
            { boxCenter.x - halfStickWidth, boxCenter.y - halfStickHeight, boxCenter.z - halfStickDepth },
            { boxCenter.x + halfStickWidth, boxCenter.y + halfStickHeight, boxCenter.z + halfStickDepth }
        };
        RayCollision collision = GetRayCollisionBox(ray, box2);
        if (collision.hit && collision.distance < closestDistance)
        {
            closestDistance = collision.distance;
            result.hit = true;
            result.type = ItemTypeKind::Stick;
            result.index = i;
            result.distance = collision.distance;
            result.point = collision.point;
            result.normal = collision.normal;
        }
    }

    float halfPlantSize = PLANT_SIZE / 2.0f;
    for (int i = 0; i < (int)game.plants.size(); i++)
    {
        Vector3 boxCenter = game.plants[i].position;
        BoundingBox box2 = {
            { boxCenter.x - halfPlantSize, boxCenter.y - halfPlantSize, boxCenter.z - halfPlantSize },
            { boxCenter.x + halfPlantSize, boxCenter.y + halfPlantSize, boxCenter.z + halfPlantSize }
        };
        RayCollision collision = GetRayCollisionBox(ray, box2);
        if (collision.hit && collision.distance < closestDistance)
        {
            closestDistance = collision.distance;
            result.hit = true;
            result.type = ItemTypeKind::Plant;
            result.index = i;
            result.distance = collision.distance;
            result.point = collision.point;
            result.normal = collision.normal;
        }
    }

    // Raycast against boulders (so items can be placed on them)
    for (int i = 0; i < (int)game.boulders.size(); i++)
    {
        const BoxCollider& box = game.boulders[i];
        BoundingBox box3 = {
            { box.center.x - box.halfSize.x, box.center.y - box.halfSize.y, box.center.z - box.halfSize.z },
            { box.center.x + box.halfSize.x, box.center.y + box.halfSize.y, box.center.z + box.halfSize.z }
        };
        RayCollision collision = GetRayCollisionBox(ray, box3);
        if (collision.hit && collision.distance < closestDistance)
        {
            closestDistance = collision.distance;
            result.hit = true;
            result.type = ItemTypeKind::Boulder;
            result.index = i;
            result.distance = collision.distance;
            result.point = collision.point;
            result.normal = collision.normal;
        }
    }

    return result;
}

static void TryPickupItem(Game& game)
{
    if (!IsKeyPressed(KEY_E))
        return;

    ItemHit hit = RaycastItem(game);
    if (!hit.hit)
        return;

    if (hit.type == ItemTypeKind::Rock)
    {
        if (TryAddRock(game.inventory, 1))
            game.rocks.erase(game.rocks.begin() + hit.index);
    }
    else if (hit.type == ItemTypeKind::Stick)
    {
        if (TryAddStick(game.inventory, 1))
            game.sticks.erase(game.sticks.begin() + hit.index);
    }
    else if (hit.type == ItemTypeKind::Plant)
    {
        if (TryAddPlant(game.inventory, 1))
            game.plants.erase(game.plants.begin() + hit.index);
    }
}

// Where the selected item would spawn: resting exactly on the crosshair target
// (its base sits on the hit surface), or a few units ahead in the air when
// looking at the sky / nothing.
static Vector3 GetDropSpawnPosition(const Game& game, ItemType dropType)
{
    Vector3 rayOrigin = { game.player.position.x, game.player.position.y + CAMERA_EYE_HEIGHT, game.player.position.z };
    Vector3 rayDir = {
        std::cos(game.player.pitch) * std::sin(game.player.yaw),
        std::sin(game.player.pitch),
        std::cos(game.player.pitch) * std::cos(game.player.yaw)
    };

    ItemHit hit = RaycastItem(game);
    if (hit.hit)
    {
        Vector3 half = GetItemHalfExtents(dropType);
        Vector3 offset = {
            (hit.normal.x != 0.0f) ? (half.x + 0.05f) * hit.normal.x : 0.0f,
            (hit.normal.y != 0.0f) ? (half.y + 0.05f) * hit.normal.y : 0.0f,
            (hit.normal.z != 0.0f) ? (half.z + 0.05f) * hit.normal.z : 0.0f
        };
        return { hit.point.x + offset.x, hit.point.y + offset.y, hit.point.z + offset.z };
    }

    float forwardDist = 3.0f;
    return {
        rayOrigin.x + rayDir.x * forwardDist,
        rayOrigin.y + rayDir.y * forwardDist,
        rayOrigin.z + rayDir.z * forwardDist
    };
}

void TryDropSelectedItem(Game& game)
{
    if (!IsMouseButtonPressed(MOUSE_BUTTON_RIGHT))
        return;

    int slotIdx = game.inventory.selectedSlot >= 0 ? game.inventory.selectedSlot : game.inventory.selectedHotbar;
    if ((slotIdx < 0 || slotIdx >= Inventory::SLOT_COUNT) && !game.inventory.isHolding)
        return;

    ItemType type;
    int count;
    if (game.inventory.isHolding)
    {
        type = game.inventory.heldItem.type;
        count = game.inventory.heldItem.count;
    }
    else
    {
        ItemStack& slot = game.inventory.slots[slotIdx];
        type = slot.type;
        count = slot.count;
    }
    if (type == ItemType::Empty || count <= 0)
        return;

    Vector3 spawn = GetDropSpawnPosition(game, type);
    Vector3 half = GetItemHalfExtents(type);

    // Re-use the same helper from game.h for cleaner overlap validation
    auto IsValid = [&](Vector3 pos) -> bool {
        if (AABBIntersects(pos, half, game.player.position, PLAYER_HALF_SIZE)) return false;
        for (const auto& r : game.rocks)
            if (AABBIntersects(pos, half, r.position, GetItemHalfExtents(ItemType::Rock))) return false;
        for (const auto& s : game.sticks)
            if (AABBIntersects(pos, half, s.position, GetItemHalfExtents(ItemType::Stick))) return false;
        for (const auto& p : game.plants)
            if (AABBIntersects(pos, half, p.position, GetItemHalfExtents(ItemType::Plant))) return false;
        for (const auto& b : game.boulders)
            if (AABBIntersects(pos, half, b.center, b.halfSize)) return false;
        return true;
    };

    if (!IsValid(spawn))
    {
        bool found = false;
        const float step = 0.15f;
        for (int ring = 1; ring <= 8 && !found; ring++)
        {
            float r = step * ring;
            for (float dx = -r; dx <= r + 1e-3f; dx += step)
            {
                for (float dz = -r; dz <= r + 1e-3f; dz += step)
                {
                    Vector3 cand = { spawn.x + dx, spawn.y, spawn.z + dz };
                    if (IsValid(cand)) { spawn = cand; found = true; break; }
                }
                if (found) break;
            }
        }
        if (!found) return;
    }

    Item item;
    item.type = type;
    item.position = spawn;
    item.velocity = { 0.0f, 0.0f, 0.0f };
    item.mass = (type == ItemType::Rock) ? 2.0f : (type == ItemType::Plant ? 1.0f : 0.5f);
    item.onGround = false;

    if (type == ItemType::Rock)
        game.rocks.push_back(item);
    else if (type == ItemType::Stick)
        game.sticks.push_back(item);
    else if (type == ItemType::Plant)
        game.plants.push_back(item);

    if (game.inventory.isHolding)
    {
        game.inventory.heldItem.count--;
        if (game.inventory.heldItem.count <= 0)
        {
            game.inventory.heldItem.type = ItemType::Empty;
            game.inventory.heldItem.count = 0;
            game.inventory.isHolding = false;
        }
    }
    else
    {
        slotIdx = game.inventory.selectedSlot >= 0 ? game.inventory.selectedSlot : game.inventory.selectedHotbar;
        ItemStack& slot = game.inventory.slots[slotIdx];
        slot.count--;
        if (slot.count <= 0)
        {
            slot.type = ItemType::Empty;
            slot.count = 0;
        }
    }
}

static void UpdateItemPhysics(Item& item, const std::vector<BoxCollider>& boxes, std::vector<Item>& allRocks, std::vector<Item>& allSticks, std::vector<Item>& allPlants, float dt)
{
    // Apply gravity
    ApplyGravity(item.position, item.velocity, item.mass, dt);

    Vector3 half = GetItemHalfExtents(item.type);

    // Horizontal integration + friction
    item.position.x += item.velocity.x * dt;
    item.position.z += item.velocity.z * dt;
    item.velocity.x *= 0.95f;
    item.velocity.z *= 0.95f;
    if (fabs(item.velocity.x) < 0.001f) item.velocity.x = 0.0f;
    if (fabs(item.velocity.z) < 0.001f) item.velocity.z = 0.0f;

    // Floor (terrain)
    float terrainY = GetTerrainHeight(item.position.x, item.position.z);
    if (item.position.y - half.y <= terrainY)
    {
        item.position.y = terrainY + half.y;
        item.velocity.y = 0.0f;
        item.onGround = true;
    }
    else
    {
        item.onGround = false;
    }

    // Boulder collisions: resolve along the axis of minimum penetration so the
    // item rests ON TOP instead of embedding or falling through.
    for (const auto& box : boxes)
    {
        if (!AABBIntersects(item.position, half, box.center, box.halfSize))
            continue;

        float ox = (half.x + box.halfSize.x) - fabs(item.position.x - box.center.x);
        float oy = (half.y + box.halfSize.y) - fabs(item.position.y - box.center.y);
        float oz = (half.z + box.halfSize.z) - fabs(item.position.z - box.center.z);

        if (oy <= ox && oy <= oz)
        {
            if (item.position.y >= box.center.y) item.position.y += oy; // resting on top
            else item.position.y -= oy;                                // hit from below
            item.velocity.y = 0.0f;
            item.onGround = true;
        }
        else if (ox <= oz)
        {
            item.position.x += (item.position.x >= box.center.x) ? ox : -ox;
            item.velocity.x = 0.0f;
        }
        else
        {
            item.position.z += (item.position.z >= box.center.z) ? oz : -oz;
            item.velocity.z = 0.0f;
        }
        break;
    }

    // Rest on top of other items (vertical only)
    auto RestOnTop = [&](const std::vector<Item>& others) {
        for (const auto& other : others)
        {
            if (&other == &item) continue;
            Vector3 oHalf = GetItemHalfExtents(other.type);
            float otherTop = other.position.y + oHalf.y;
            float ib = item.position.y - half.y;
            if (fabs(item.position.x - other.position.x) < (half.x + oHalf.x) &&
                fabs(item.position.z - other.position.z) < (half.z + oHalf.z) &&
                ib <= otherTop + 0.05f && ib >= otherTop - 0.05f)
            {
                item.position.y = otherTop + half.y;
                item.velocity.y = 0.0f;
                item.onGround = true;
            }
        }
    };
    RestOnTop(allRocks);
    RestOnTop(allSticks);
    RestOnTop(allPlants);

    // Horizontal item-to-item separation. Only when the items actually overlap
    // vertically - an item resting on top of another must NOT be pushed off.
    auto Separate = [&](std::vector<Item>& others) {
        for (auto& other : others)
        {
            if (&other == &item) continue;
            Vector3 oHalf = GetItemHalfExtents(other.type);
            float vertOverlap = (half.y + oHalf.y) - fabs(item.position.y - other.position.y);
            if (vertOverlap <= 0.1f) continue; // resting on top / not overlapping
            float dx = item.position.x - other.position.x;
            float dz = item.position.z - other.position.z;
            float overlapX = (half.x + oHalf.x) - fabs(dx);
            float overlapZ = (half.z + oHalf.z) - fabs(dz);
            if (overlapX > 0 && overlapZ > 0)
            {
                if (overlapX < overlapZ)
                {
                    float pushDir = (dx > 0) ? 1.0f : -1.0f;
                    item.position.x += pushDir * overlapX; // only move the item being placed
                }
                else
                {
                    float pushDir = (dz > 0) ? 1.0f : -1.0f;
                    item.position.z += pushDir * overlapZ; // only move the item being placed
                }
            }
        }
    };
    Separate(allRocks);
    Separate(allSticks);
    Separate(allPlants);
}

void UpdateGameplay(Game& game, int screenWidth, int screenHeight)
{
    float dt = GetFrameTime();

    // Lock camera when inventory is active (storage open)
    bool lockCamera = game.inventory.storageOpen || game.inventory.isHolding;
    UpdatePlayerMovement(game.player, game.boulders, game.rocks, game.sticks, game.plants, lockCamera);
    UpdateInventoryInput(game.inventory, screenWidth, screenHeight);
    UpdateSelectedItemInput(game.inventory);
    TryPickupItem(game);
    if (IsKeyPressed(KEY_B))
        game.inventory.showDropPreview = !game.inventory.showDropPreview;
    TryDropSelectedItem(game);

    // Update item physics (gravity and collision)
    for (auto& rock : game.rocks)
    {
        UpdateItemPhysics(rock, game.boulders, game.rocks, game.sticks, game.plants, dt);
    }
    for (auto& stick : game.sticks)
    {
        UpdateItemPhysics(stick, game.boulders, game.rocks, game.sticks, game.plants, dt);
    }
    for (auto& plant : game.plants)
    {
        UpdateItemPhysics(plant, game.boulders, game.rocks, game.sticks, game.plants, dt);
    }
}

static void DrawPlayerModel(const Player& player)
{
    Vector3 bodyPos = { player.position.x, player.position.y, player.position.z };
    DrawCube(bodyPos, PLAYER_MODEL_WIDTH, PLAYER_MODEL_HEIGHT, PLAYER_MODEL_DEPTH, Color{ 70, 120, 220, 255 });
    DrawCubeWires(bodyPos, PLAYER_MODEL_WIDTH, PLAYER_MODEL_HEIGHT, PLAYER_MODEL_DEPTH, BLUE);
}

static void DrawRock(const Item& item)
{
    DrawCube(item.position, ROCK_SIZE, ROCK_SIZE, ROCK_SIZE, ROCK_COLOR);
    DrawCubeWires(item.position, ROCK_SIZE, ROCK_SIZE, ROCK_SIZE, ROCK_OUTLINE_COLOR);
}

static void DrawSticks(const Item& item)
{
    DrawCube(item.position, STICK_WIDTH, STICK_HEIGHT, STICK_DEPTH, STICK_COLOR);
    DrawCubeWires(item.position, STICK_WIDTH, STICK_HEIGHT, STICK_DEPTH, STICK_OUTLINE_COLOR);
}

static void DrawPlant(const Item& item)
{
    Vector3 stemPos = { item.position.x, item.position.y - PLANT_SIZE / 4.0f, item.position.z };
    Vector3 leafPos = { item.position.x, item.position.y + PLANT_SIZE / 4.0f, item.position.z };
    DrawCube(stemPos, 0.15f, PLANT_SIZE / 2.0f, 0.15f, PLANT_STEM_COLOR);
    DrawCube(leafPos, 0.6f, 0.6f, 0.6f, PLANT_LEAF_COLOR);
    DrawCubeWires(leafPos, 0.6f, 0.6f, 0.6f, PLANT_LEAF_OUTLINE);
}

static void DrawWorld(const Game& game)
{
    for (const auto& box : game.boulders)
    {
        DrawCube(box.center, box.halfSize.x * 2.0f, box.halfSize.y * 2.0f, box.halfSize.z * 2.0f, Styles::BoulderColor);
        DrawCubeWires(box.center, box.halfSize.x * 2.0f, box.halfSize.y * 2.0f, box.halfSize.z * 2.0f, Styles::BoulderOutline);
    }

    for (const auto& rock : game.rocks)
    {
        DrawRock(rock);
    }

    for (const auto& stick : game.sticks)
    {
        DrawSticks(stick);
    }

    for (const auto& plant : game.plants)
    {
        DrawPlant(plant);
    }

    DrawPlayerModel(game.player);
}

void DrawGameScene(const Game& game, int screenWidth, int screenHeight)
{
    Camera3D camera = { 0 };
    UpdateCamera(game.player.yaw, game.player.pitch, game.player.position, camera);

    BeginMode3D(camera);

    DrawWorld(game);

    DrawTerrainMesh();

    if (game.inventory.showDropPreview)
    {
        ItemType previewType = ItemType::Empty;
        if (game.inventory.isHolding && game.inventory.heldItem.type != ItemType::Empty)
            previewType = game.inventory.heldItem.type;
        else
        {
            int slotIdx = game.inventory.selectedSlot >= 0 ? game.inventory.selectedSlot : game.inventory.selectedHotbar;
            if (slotIdx >= 0 && slotIdx < Inventory::SLOT_COUNT && game.inventory.slots[slotIdx].type != ItemType::Empty)
                previewType = game.inventory.slots[slotIdx].type;
        }
        if (previewType != ItemType::Empty)
        {
            Vector3 spawn = GetDropSpawnPosition(game, previewType);
            Vector3 half = GetItemHalfExtents(previewType);
            if (previewType == ItemType::Rock)
                DrawCube(spawn, ROCK_SIZE, ROCK_SIZE, ROCK_SIZE, Color{ 140, 140, 140, 100 });
            else if (previewType == ItemType::Stick)
                DrawCube(spawn, STICK_WIDTH, STICK_HEIGHT, STICK_DEPTH, Color{ 139, 69, 19, 100 });
            else if (previewType == ItemType::Plant)
                DrawCube(spawn, PLANT_SIZE, PLANT_SIZE, PLANT_SIZE, Color{ 34, 139, 34, 100 });
        }
    }

    EndMode3D();

    ItemHit hit = RaycastItem(game);
    if (hit.hit)
    {
        // Show item name above crosshair
        const char* itemName = "";
        if (hit.type == ItemTypeKind::Rock) itemName = "Rock";
        else if (hit.type == ItemTypeKind::Stick) itemName = "Stick";
        else if (hit.type == ItemTypeKind::Plant) itemName = "Plant";
        else if (hit.type == ItemTypeKind::Boulder) itemName = "Boulder";

        int textWidth = MeasureText(itemName, 20);
        DrawText(itemName, screenWidth / 2 - textWidth / 2, screenHeight / 2 - 60, 20, BLACK);
    }

    DrawInventoryUI(game.inventory, screenWidth, screenHeight);
    DrawSelectedItemPanel(game.inventory, screenWidth, screenHeight);
    DrawHeldItemText(game.inventory, screenWidth, screenHeight);
    DrawStaminaBar(game.player, screenWidth, screenHeight);

    DrawCrosshair(screenWidth, screenHeight, WHITE);
}

// World system implementation
namespace fs = std::filesystem;

static std::string GetWorldsPath()
{
    return (fs::path(GetApplicationDirectory()) / "worlds").string();
}

// Older builds stored worlds relative to the process working directory. Import
// those saves the first time the world list is opened, so the new fixed path
// does not hide existing player data.
static void ImportLegacyWorlds()
{
    const fs::path saveDirectory = GetWorldsPath();
    const fs::path legacyDirectory = fs::current_path() / "worlds";
    if (legacyDirectory == saveDirectory || !fs::exists(legacyDirectory))
        return;

    std::error_code error;
    fs::create_directories(saveDirectory, error);
    if (error)
        return;

    for (const auto& entry : fs::directory_iterator(legacyDirectory, error))
    {
        if (error)
            return;
        if (!entry.is_regular_file() || entry.path().extension() != ".wld")
            continue;

        const fs::path destination = saveDirectory / entry.path().filename();
        fs::copy_file(entry.path(), destination, fs::copy_options::skip_existing, error);
        error.clear();
    }
}

static std::string GetWorldFilePath(const std::string& worldName)
{
    return GetWorldsPath() + "/" + worldName + ".wld";
}

bool WorldExists(const std::string& worldName)
{
    if (!IsValidWorldName(worldName))
        return false;
    std::string path = GetWorldFilePath(worldName);
    return fs::exists(path);
}

bool IsValidWorldName(const std::string& worldName)
{
    if (worldName.empty() || worldName.size() > 16 || worldName == "." || worldName == "..")
        return false;

    return worldName.find_first_of("\\/:*?\"<>|") == std::string::npos;
}

std::vector<WorldData> GetWorldList()
{
    std::vector<WorldData> worlds;
    ImportLegacyWorlds();
    std::string worldsPath = GetWorldsPath();

    if (!fs::exists(worldsPath))
    {
        fs::create_directory(worldsPath);
        return worlds;
    }

    for (const auto& entry : fs::directory_iterator(worldsPath))
    {
        if (entry.path().extension() == ".wld")
        {
            std::string filename = entry.path().stem().string();
            WorldData world;
            world.name = filename;

            // Read friends allowed from world file
            std::string filepath = GetWorldFilePath(filename);
            std::ifstream file(filepath);
            if (file.is_open())
            {
                std::string line;
                while (std::getline(file, line))
                {
                    std::istringstream iss(line);
                    std::string type;
                    iss >> type;
                    if (type == "friends")
                    {
                        int friendsValue;
                        iss >> friendsValue;
                        world.friendsAllowed = (friendsValue != 0);
                        break;
                    }
                }
                file.close();
            }

            worlds.push_back(world);
        }
    }

    return worlds;
}

bool SaveWorld(const Game& game, const std::string& worldName)
{
    if (!IsValidWorldName(worldName))
        return false;

    ImportLegacyWorlds();
    std::string worldsPath = GetWorldsPath();
    if (!fs::exists(worldsPath))
    {
        fs::create_directory(worldsPath);
    }

    std::string filepath = GetWorldFilePath(worldName);
    std::ofstream file(filepath);
    if (!file.is_open())
        return false;

    // Write player position
    file << "player " << game.player.position.x << " " << game.player.position.y << " " << game.player.position.z << "\n";

    // Write friends allowed
    file << "friends " << (game.friendsAllowed ? 1 : 0) << "\n";

    // Write inventory
    file << "inventory\n";
    for (int i = 0; i < Inventory::SLOT_COUNT; i++)
    {
        const ItemStack& slot = game.inventory.slots[i];
        file << "  slot " << i << " " << (int)slot.type << " " << slot.count << "\n";
    }
    file << "selectedHotbar " << game.inventory.selectedHotbar << "\n";

    // Write rocks
    file << "rocks " << game.rocks.size() << "\n";
    for (const auto& rock : game.rocks)
    {
        file << "  rock " << rock.position.x << " " << rock.position.y << " " << rock.position.z << "\n";
    }

    // Write sticks
    file << "sticks " << game.sticks.size() << "\n";
    for (const auto& stick : game.sticks)
    {
        file << "  stick " << stick.position.x << " " << stick.position.y << " " << stick.position.z << "\n";
    }

    // Write plants
    file << "plants " << game.plants.size() << "\n";
    for (const auto& plant : game.plants)
    {
        file << "  plant " << plant.position.x << " " << plant.position.y << " " << plant.position.z << "\n";
    }

    file.close();
    return true;
}

bool LoadWorld(Game& game, const std::string& worldName)
{
    if (!IsValidWorldName(worldName))
        return false;
    std::string filepath = GetWorldFilePath(worldName);
    std::ifstream file(filepath);
    if (!file.is_open())
        return false;

    ResetWorld(game);

    // Clear default items to prevent duplication.
    // Boulders are static authored world geometry (from ResetWorld) and are kept.
    game.rocks.clear();
    game.sticks.clear();
    game.plants.clear();

    std::string line;
    while (std::getline(file, line))
    {
        if (line.empty() || line[0] == '#')
            continue;

        std::istringstream iss(line);
        std::string type;
        iss >> type;

        if (type == "player")
        {
            iss >> game.player.position.x >> game.player.position.y >> game.player.position.z;
        }
        else if (type == "friends")
        {
            int friendsValue;
            iss >> friendsValue;
            game.friendsAllowed = (friendsValue != 0);
        }
        else if (type == "inventory")
        {
            // Inventory items follow
        }
        else if (type == "slot")
        {
            int index, typeInt, count;
            iss >> index >> typeInt >> count;
            if (index >= 0 && index < Inventory::SLOT_COUNT && typeInt >= (int)ItemType::Empty && typeInt <= (int)ItemType::Plant && count >= 0)
            {
                game.inventory.slots[index].type = (ItemType)typeInt;
                game.inventory.slots[index].count = typeInt == (int)ItemType::Empty ? 0 : count;
            }
        }
        else if (type == "selectedHotbar")
        {
            iss >> game.inventory.selectedHotbar;
            if (game.inventory.selectedHotbar < 0 || game.inventory.selectedHotbar >= Inventory::HOTBAR_COUNT)
                game.inventory.selectedHotbar = 0;
        }
        else if (type == "rocks")
        {
            int count;
            iss >> count;
            for (int i = 0; i < count; i++)
            {
                std::getline(file, line);
                std::istringstream rockIss(line);
                std::string rockType;
                float x, y, z;
                rockIss >> rockType >> x >> y >> z;
                Item rock;
                rock.type = ItemType::Rock;
                rock.position = { x, y, z };
                rock.velocity = { 0, 0, 0 };
                rock.mass = 2.0f;
                rock.onGround = true;
                game.rocks.push_back(rock);
            }
        }
        else if (type == "sticks")
        {
            int count;
            iss >> count;
            for (int i = 0; i < count; i++)
            {
                std::getline(file, line);
                std::istringstream stickIss(line);
                std::string stickType;
                float x, y, z;
                stickIss >> stickType >> x >> y >> z;
                Item stick;
                stick.type = ItemType::Stick;
                stick.position = { x, y, z };
                stick.velocity = { 0, 0, 0 };
                stick.mass = 0.5f;
                stick.onGround = true;
                game.sticks.push_back(stick);
            }
        }
        else if (type == "plants")
        {
            int count;
            iss >> count;
            for (int i = 0; i < count; i++)
            {
                std::getline(file, line);
                std::istringstream plantIss(line);
                std::string plantType;
                float x, y, z;
                plantIss >> plantType >> x >> y >> z;
                Item plant;
                plant.type = ItemType::Plant;
                plant.position = { x, y, z };
                plant.velocity = { 0, 0, 0 };
                plant.mass = 1.0f;
                plant.onGround = true;
                game.plants.push_back(plant);
            }
        }
    }

    file.close();
    game.currentWorldName = worldName;
    return true;
}

void GenerateWorld(Game& game)
{
    ResetWorld(game);
}

bool DeleteWorld(const std::string& worldName)
{
    if (!IsValidWorldName(worldName))
        return false;
    std::string filepath = GetWorldFilePath(worldName);
    return fs::remove(filepath);
}

bool RenameWorld(const std::string& oldName, const std::string& newName)
{
    if (!IsValidWorldName(oldName) || !IsValidWorldName(newName) || WorldExists(newName))
        return false;
    std::string oldPath = GetWorldFilePath(oldName);
    std::string newPath = GetWorldFilePath(newName);
    try
    {
        fs::rename(oldPath, newPath);
        return true;
    }
    catch (...)
    {
        return false;
    }
}
